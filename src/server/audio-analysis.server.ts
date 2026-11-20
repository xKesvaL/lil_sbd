import { spawn } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type { TrackAudioAnalysis, TrackDropSection } from "#/db/schema";
import { ensureLocalMediaFile } from "./media-storage.server";

const ANALYSIS_SAMPLE_RATE = 11025;
const ANALYSIS_FRAME_RATE = 100; // 10ms hop for crisp sub-10ms beat & kickroll resolution

export interface MediaProbeResult {
  durationSec: number;
  width?: number;
  height?: number;
  fps?: number;
  hasAudio: boolean;
  hasVideo: boolean;
}

function runProcessCapture(
  command: string,
  args: string[],
  maxBytes = 128 * 1024 * 1024,
): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const proc = spawn(command, args, { windowsHide: true });
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      totalBytes += chunk.byteLength;
      if (totalBytes <= maxBytes) {
        chunks.push(chunk);
      }
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 16_000) {
        stderr += chunk.toString("utf8");
      }
    });

    proc.on("error", (err) => {
      rejectPromise(new Error(`Failed to spawn ${command}: ${err.message}`));
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        rejectPromise(
          new Error(`${command} exited with code ${code}: ${stderr.slice(-400).trim()}`),
        );
        return;
      }
      resolvePromise({ stdout: Buffer.concat(chunks), stderr });
    });
  });
}

export async function probeMediaFile(filePath: string): Promise<MediaProbeResult> {
  const { stdout } = await runProcessCapture("ffprobe", [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);

  const parsed = JSON.parse(stdout.toString("utf8")) as {
    format?: { duration?: string };
    streams?: Array<{
      codec_type?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
      avg_frame_rate?: string;
      duration?: string;
    }>;
  };

  const streams = parsed.streams ?? [];
  const videoStream = streams.find((s) => s.codec_type === "video");
  const audioStream = streams.find((s) => s.codec_type === "audio");

  let fps: number | undefined;
  const rawFps = videoStream?.avg_frame_rate || videoStream?.r_frame_rate;
  if (rawFps && rawFps.includes("/")) {
    const [num, den] = rawFps.split("/").map(Number);
    if (num && den && den > 0) {
      fps = Number((num / den).toFixed(2));
    }
  }

  const durationSec = Number(
    parsed.format?.duration || videoStream?.duration || audioStream?.duration || 0,
  );

  return {
    durationSec: Number.isFinite(durationSec) ? durationSec : 0,
    width: videoStream?.width,
    height: videoStream?.height,
    fps,
    hasAudio: Boolean(audioStream),
    hasVideo: Boolean(videoStream),
  };
}

/**
 * Decodes an audio/video file to mono 32-bit float PCM via FFmpeg.
 */
export async function decodeAudioToMonoPcm(
  filePath: string,
  sampleRate = ANALYSIS_SAMPLE_RATE,
): Promise<Float32Array> {
  const { stdout } = await runProcessCapture("ffmpeg", [
    "-v",
    "error",
    "-i",
    filePath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    String(sampleRate),
    "-f",
    "f32le",
    "pipe:1",
  ]);

  const sampleCount = Math.floor(stdout.byteLength / 4);
  const floats = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    floats[i] = stdout.readFloatLE(i * 4);
  }
  return floats;
}

export interface MultiBandEnvelopes {
  rms: Float32Array;
  onset: Float32Array;
  lowOnset: Float32Array;
  /** 4 frequency bands per frame: sub (<110Hz), punch (110-350Hz), mid (350-1400Hz), high (>1400Hz) */
  bandSub: Float32Array;
  bandPunch: Float32Array;
  bandMid: Float32Array;
  bandHigh: Float32Array;
  frameRate: number;
}

/**
 * Computes 4-band energy & onset envelopes (default 100 Hz / 10ms hop).
 * Also exported for acoustic auto-sync (at 50 Hz when sampleRate=8000).
 */
export function computeOnsetAndEnergyEnvelopes(
  samples: Float32Array,
  sampleRate = ANALYSIS_SAMPLE_RATE,
  targetFrameRate?: number,
): MultiBandEnvelopes {
  const desiredRate = targetFrameRate ?? (sampleRate <= 8500 ? 50 : ANALYSIS_FRAME_RATE);
  const hop = Math.max(1, Math.round(sampleRate / desiredRate));
  const win = hop * 2;
  const frameRate = sampleRate / hop;
  const frameCount = Math.max(0, Math.floor((samples.length - win) / hop) + 1);

  const rms = new Float32Array(frameCount);
  const bandSub = new Float32Array(frameCount);
  const bandPunch = new Float32Array(frameCount);
  const bandMid = new Float32Array(frameCount);
  const bandHigh = new Float32Array(frameCount);
  const onset = new Float32Array(frameCount);
  const lowOnset = new Float32Array(frameCount);

  if (frameCount === 0) {
    return { rms, onset, lowOnset, bandSub, bandPunch, bandMid, bandHigh, frameRate };
  }

  // 3 cascaded 1-pole low-pass cutoffs -> 4 clean bands: <110Hz, 110-350Hz, 350-1400Hz, >1400Hz
  const alphaFor = (hz: number) => {
    const rc = 1 / (2 * Math.PI * hz);
    const dt = 1 / sampleRate;
    return dt / (rc + dt);
  };
  const a1 = alphaFor(110);
  const a2 = alphaFor(350);
  const a3 = alphaFor(1400);

  let lp1 = 0;
  let lp2 = 0;
  let lp3 = 0;

  const sSub = new Float32Array(samples.length);
  const sPunch = new Float32Array(samples.length);
  const sMid = new Float32Array(samples.length);
  const sHigh = new Float32Array(samples.length);

  for (let i = 0; i < samples.length; i++) {
    const x = samples[i]!;
    lp1 += a1 * (x - lp1);
    lp2 += a2 * (x - lp2);
    lp3 += a3 * (x - lp3);
    sSub[i] = lp1;
    sPunch[i] = lp2 - lp1;
    sMid[i] = lp3 - lp2;
    sHigh[i] = x - lp3;
  }

  const logSub = new Float32Array(frameCount);
  const logPunch = new Float32Array(frameCount);
  const logMid = new Float32Array(frameCount);
  const logHigh = new Float32Array(frameCount);

  for (let f = 0; f < frameCount; f++) {
    const start = f * hop;
    let sumSq = 0;
    let qSub = 0;
    let qPunch = 0;
    let qMid = 0;
    let qHigh = 0;
    for (let j = 0; j < win; j++) {
      const idx = start + j;
      const x = samples[idx]!;
      const b0 = sSub[idx]!;
      const b1 = sPunch[idx]!;
      const b2 = sMid[idx]!;
      const b3 = sHigh[idx]!;
      sumSq += x * x;
      qSub += b0 * b0;
      qPunch += b1 * b1;
      qMid += b2 * b2;
      qHigh += b3 * b3;
    }
    const rAll = Math.sqrt(sumSq / win);
    const r0 = Math.sqrt(qSub / win);
    const r1 = Math.sqrt(qPunch / win);
    const r2 = Math.sqrt(qMid / win);
    const r3 = Math.sqrt(qHigh / win);

    rms[f] = rAll;
    bandSub[f] = r0;
    bandPunch[f] = r1;
    bandMid[f] = r2;
    bandHigh[f] = r3;

    logSub[f] = Math.log1p(30 * r0);
    logPunch[f] = Math.log1p(30 * r1);
    logMid[f] = Math.log1p(30 * r2);
    logHigh[f] = Math.log1p(30 * r3);
  }

  // Positive multi-band log-flux (kick punch + sub transient + zaag attack)
  let maxOn = 1e-6;
  let maxLowOn = 1e-6;
  for (let f = 1; f < frameCount; f++) {
    const d0 = Math.max(0, logSub[f]! - logSub[f - 1]!);
    const d1 = Math.max(0, logPunch[f]! - logPunch[f - 1]!);
    const d2 = Math.max(0, logMid[f]! - logMid[f - 1]!);
    const d3 = Math.max(0, logHigh[f]! - logHigh[f - 1]!);

    const low = d0 * 1.1 + d1 * 1.5;
    const all = d0 * 1.0 + d1 * 1.45 + d2 * 0.8 + d3 * 0.6;
    lowOnset[f] = low;
    onset[f] = all;
    if (all > maxOn) maxOn = all;
    if (low > maxLowOn) maxLowOn = low;
  }

  const sharpen = (arr: Float32Array, peak: number): Float32Array => {
    const half = Math.max(3, Math.round(frameRate * 0.12));
    const out = new Float32Array(frameCount);
    let maxOut = 1e-6;
    for (let f = 0; f < frameCount; f++) {
      const lo = Math.max(0, f - half);
      const hi = Math.min(frameCount - 1, f + half);
      let mean = 0;
      for (let k = lo; k <= hi; k++) mean += arr[k]! / peak;
      mean /= hi - lo + 1;
      const v = Math.max(0, arr[f]! / peak - mean * 0.72);
      out[f] = v;
      if (v > maxOut) maxOut = v;
    }
    for (let f = 0; f < frameCount; f++) out[f] = out[f]! / maxOut;
    return out;
  };

  return {
    rms,
    onset: sharpen(onset, maxOn),
    lowOnset: sharpen(lowOnset, maxLowOn),
    bandSub,
    bandPunch,
    bandMid,
    bandHigh,
    frameRate,
  };
}

interface ActiveRegion {
  startFrame: number;
  endFrame: number;
  impactFrame: number;
  peakEnergy: number;
}

/**
 * Finds ALL sustained high-energy regions (drops) across the entire track with NO artificial cap.
 * Separates real breakdowns (>= 2.0s valley) while bridging brief fakeout pauses (< 1.8s).
 */
function findActiveDropRegions(
  rms: Float32Array,
  onset: Float32Array,
  frameRate: number,
): ActiveRegion[] {
  if (rms.length < Math.round(frameRate * 3)) return [];

  // Smooth RMS with a 0.8s moving window
  const win = Math.max(3, Math.round(frameRate * 0.8));
  const half = Math.floor(win / 2);
  const smooth = new Float32Array(rms.length);
  let maxS = 1e-6;

  let running = 0;
  for (let i = 0; i < Math.min(win, rms.length); i++) running += rms[i]!;
  for (let i = 0; i < rms.length; i++) {
    if (i > half && i + half < rms.length) {
      running += rms[i + half]! - rms[i - half - 1]!;
    }
    smooth[i] = running / win;
    if (smooth[i]! > maxS) maxS = smooth[i]!;
  }
  for (let i = 0; i < smooth.length; i++) smooth[i] = smooth[i]! / maxS;

  // Threshold from active non-silent frames (ignore pure silence < 0.05)
  const activeVals = Array.from(smooth).filter((v) => v > 0.05).sort((a, b) => a - b);
  if (activeVals.length < 10) return [];
  const p62 = activeVals[Math.floor(activeVals.length * 0.62)] ?? 0.62;
  const enterThresh = Math.max(0.56, Math.min(0.82, p62));
  const exitThresh = enterThresh * 0.82;

  const raw: Array<{ startFrame: number; endFrame: number; peakEnergy: number }> = [];
  let inReg = false;
  let regStart = 0;
  let regPeak = 0;

  for (let i = 0; i < smooth.length; i++) {
    const v = smooth[i]!;
    if (!inReg && v >= enterThresh) {
      inReg = true;
      regStart = i;
      regPeak = v;
    } else if (inReg) {
      if (v > regPeak) regPeak = v;
      if (v < exitThresh || i === smooth.length - 1) {
        inReg = false;
        raw.push({ startFrame: regStart, endFrame: i, peakEnergy: regPeak });
      }
    }
  }

  // Merge regions separated only by short fakeout pauses (< 1.8s)
  const merged: typeof raw = [];
  const fakeoutBridgeFrames = Math.round(frameRate * 1.8);
  for (const r of raw) {
    const prev = merged[merged.length - 1];
    if (prev && r.startFrame - prev.endFrame <= fakeoutBridgeFrames) {
      prev.endFrame = r.endFrame;
      prev.peakEnergy = Math.max(prev.peakEnergy, r.peakEnergy);
    } else {
      merged.push({ ...r });
    }
  }

  // Filter out tiny blips (< 4.0s) and refine each drop's exact impact frame to the strongest onset
  const minDropFrames = Math.round(frameRate * 4.0);
  const refined: ActiveRegion[] = [];

  for (const r of merged) {
    if (r.endFrame - r.startFrame < minDropFrames) continue;

    // Look in a small window around region entry [-0.6s, +0.9s] for the sharpest onset/RMS jump
    const searchLo = Math.max(1, r.startFrame - Math.round(frameRate * 0.6));
    const searchHi = Math.min(rms.length - 2, r.startFrame + Math.round(frameRate * 0.9));
    let bestFrame = r.startFrame;
    let bestJump = -1;

    const shortWin = Math.max(2, Math.round(frameRate * 0.25));
    for (let f = searchLo; f <= searchHi; f++) {
      let before = 0;
      let after = 0;
      for (let k = 1; k <= shortWin; k++) {
        before += rms[Math.max(0, f - k)]!;
        after += rms[Math.min(rms.length - 1, f + k)]!;
      }
      const rmsJump = Math.max(0, (after - before) / shortWin);
      const score = rmsJump * 1.8 + (onset[f] ?? 0) * 0.45;
      if (score > bestJump) {
        bestJump = score;
        bestFrame = f;
      }
    }

    refined.push({
      startFrame: r.startFrame,
      endFrame: r.endFrame,
      impactFrame: bestFrame,
      peakEnergy: Number(r.peakEnergy.toFixed(3)),
    });
  }

  return refined;
}

interface SectionTempoEstimate {
  bpm: number;
  confidence: number;
  phaseSec: number;
  rawScore: number;
}

const RATIONAL_TEMPO_RATIOS = [
  3 / 4,
  4 / 3,
  2 / 3,
  3 / 2,
  4 / 5,
  5 / 4,
  3 / 5,
  5 / 3,
  5 / 8,
  8 / 5,
  7 / 8,
  8 / 7,
];

function isRationalTempoAlias(bpmA: number, bpmB: number): boolean {
  if (bpmA <= 0 || bpmB <= 0) return false;
  const ratio = bpmA / bpmB;
  return RATIONAL_TEMPO_RATIOS.some((r) => Math.abs(ratio - r) / r <= 0.028);
}

function evaluateBpmCandidateOnSlice(
  onset: Float32Array,
  lowOnset: Float32Array,
  startFrame: number,
  endFrame: number,
  frameRate: number,
  bpm: number,
): { score: number; phaseSec: number; evenOddRatio: number } {
  const periodFrames = (60 * frameRate) / bpm;
  // Use 48 phase bins across 1 beat (~6–9ms per bin!) for high-precision alignment
  const numBins = 48;
  const hist = new Float32Array(numBins);
  const lowHistEven = new Float32Array(numBins);
  const lowHistOdd = new Float32Array(numBins);
  let totalOnset = 0;

  for (let f = startFrame; f < endFrame; f++) {
    const val = onset[f]!;
    const lowVal = lowOnset[f]!;
    if (val <= 0.001 && lowVal <= 0.001) continue;
    const beatIdxFloat = f / periodFrames;
    const beatInt = Math.floor(beatIdxFloat);
    const frac = beatIdxFloat - beatInt;
    const bin = Math.min(numBins - 1, Math.floor(frac * numBins));
    hist[bin]! += val;
    totalOnset += val;
    if (beatInt % 2 === 0) lowHistEven[bin]! += lowVal;
    else lowHistOdd[bin]! += lowVal;
  }

  if (totalOnset <= 1e-6) {
    return { score: 0, phaseSec: 0, evenOddRatio: 1 };
  }

  // Circular 3-bin window sum (tolerates ±10ms micro-jitter) to find peak beat phase
  let bestBin = 0;
  let bestWindow = -1;
  for (let b = 0; b < numBins; b++) {
    const prev = hist[(b - 1 + numBins) % numBins]!;
    const cur = hist[b]!;
    const next = hist[(b + 1) % numBins]!;
    const w = prev * 0.6 + cur + next * 0.6;
    if (w > bestWindow) {
      bestWindow = w;
      bestBin = b;
    }
  }

  // Check low-end kick symmetry between even & odd beats at bestBin to reject 2x double-time ghosts
  const sumAround = (arr: Float32Array, b: number) =>
    arr[(b - 1 + numBins) % numBins]! + arr[b]! + arr[(b + 1) % numBins]!;
  const eSum = sumAround(lowHistEven, bestBin);
  const oSum = sumAround(lowHistOdd, bestBin);
  const maxEO = Math.max(eSum, oSum, 1e-6);
  const minEO = Math.min(eSum, oSum);
  const evenOddRatio = minEO / maxEO; // ~1.0 for real 4/4 kicks, ~0.0-0.3 for double-time harmonics!

  // Peak-to-average concentration score
  const meanBin = totalOnset / numBins;
  const concentration = bestWindow / Math.max(meanBin * 2.2, 1e-6);

  // Penalize candidates whose odd/even beats are heavily lopsided (double-time ghosting)
  const symmetryFactor = evenOddRatio < 0.45 ? 0.55 + evenOddRatio : 1.0;

  // Also check half-beat (off-beat) energy: true 4/4 kick tempo has strong beat peak vs weaker mid-beat
  const halfBin = (bestBin + Math.floor(numBins / 2)) % numBins;
  const offBeatVal =
    hist[(halfBin - 1 + numBins) % numBins]! * 0.6 +
    hist[halfBin]! +
    hist[(halfBin + 1) % numBins]! * 0.6;
  const beatDominance = bestWindow / Math.max(bestWindow + offBeatVal * 0.55, 1e-6);

  const score = concentration * symmetryFactor * (0.65 + 0.35 * beatDominance);
  const phaseSec = ((bestBin + 0.5) / numBins) * (60 / bpm);

  return { score, phaseSec, evenOddRatio };
}

/**
 * High-precision modulo-period phase-folding BPM estimator for a contiguous onset slice.
 * Evaluates every integer BPM in [minBpm, maxBpm] (ZERO 200 BPM bias!) by folding
 * all onset frames modulo (60 / bpm): only the true exact integer BPM stacks 40–100+
 * kicks into a single razor-sharp phase bin!
 */
function estimateTempoForSlice(
  onset: Float32Array,
  lowOnset: Float32Array,
  startFrame: number,
  endFrame: number,
  frameRate: number,
  minBpm = 135,
  maxBpm = 270,
  lockedBpm?: number | null,
): SectionTempoEstimate {
  const sliceLen = Math.max(0, endFrame - startFrame);
  if (sliceLen < Math.round(frameRate * 3)) {
    const fallback = lockedBpm ?? 180;
    return { bpm: fallback, confidence: 0.2, phaseSec: startFrame / frameRate, rawScore: 0 };
  }

  const evaluateCandidate = (bpm: number) =>
    evaluateBpmCandidateOnSlice(onset, lowOnset, startFrame, endFrame, frameRate, bpm);

  if (lockedBpm && lockedBpm >= 60 && lockedBpm <= 320) {
    const res = evaluateCandidate(lockedBpm);
    return {
      bpm: Math.round(lockedBpm),
      confidence: 0.99,
      phaseSec: Number(res.phaseSec.toFixed(4)),
      rawScore: res.score,
    };
  }

  let bestBpm = 180;
  let bestScore = -1;
  let bestPhaseSec = 0;
  let scoreSum = 0;
  let scoreCount = 0;

  const scoresByBpm = new Map<number, { score: number; phaseSec: number; evenOddRatio: number }>();

  for (let bpm = minBpm; bpm <= maxBpm; bpm++) {
    const res = evaluateCandidate(bpm);
    scoresByBpm.set(bpm, res);
    scoreSum += res.score;
    scoreCount++;
    if (res.score > bestScore) {
      bestScore = res.score;
      bestBpm = bpm;
      bestPhaseSec = res.phaseSec;
    }
  }

  // Guard against sub-harmonic / half-time: if 2*bestBpm is in [minBpm, maxBpm] and scores nearly as high with good symmetry, prefer true tempo
  const doubleBpm = bestBpm * 2;
  if (doubleBpm <= maxBpm) {
    const dbl = scoresByBpm.get(doubleBpm);
    if (dbl && dbl.evenOddRatio >= 0.72 && dbl.score >= bestScore * 0.88) {
      bestBpm = doubleBpm;
      bestScore = dbl.score;
      bestPhaseSec = dbl.phaseSec;
    }
  }
  // Guard against double-time: if bestBpm/2 is in [minBpm, maxBpm] and bestBpm had low symmetry
  const halfBpm = Math.round(bestBpm / 2);
  const bestMeta = scoresByBpm.get(bestBpm);
  if (halfBpm >= minBpm && bestMeta && bestMeta.evenOddRatio < 0.55) {
    const half = scoresByBpm.get(halfBpm);
    if (half && half.score >= bestScore * 0.72) {
      bestBpm = halfBpm;
      bestScore = half.score;
      bestPhaseSec = half.phaseSec;
    }
  }

  const avgScore = scoreCount > 0 ? scoreSum / scoreCount : 1e-6;
  const confidence = Number(
    Math.max(0.15, Math.min(0.99, bestScore / Math.max(avgScore * 2.2, 1e-6))).toFixed(3),
  );

  return {
    bpm: bestBpm,
    confidence,
    phaseSec: Number(bestPhaseSec.toFixed(4)),
    rawScore: Number(bestScore.toFixed(3)),
  };
}

/**
 * Detects mid-drop Kick Switches via 4-band spectral novelty across bar boundaries.
 * Zero AI credits — catches distinct kick changes (raw -> zaag -> piep) inside long drops!
 */
function detectKickSwitchesInRegion(
  region: ActiveRegion,
  sectionBpm: number,
  sectionBarsSec: number[],
  env: MultiBandEnvelopes,
  dropIndex: number,
): TrackDropSection[] {
  const { bandSub, bandPunch, bandMid, bandHigh, rms, frameRate } = env;
  const regionStartSec = region.impactFrame / frameRate;
  const regionEndSec = region.endFrame / frameRate;

  // Bars strictly inside this drop
  const bars = sectionBarsSec.filter(
    (b) => b >= regionStartSec - 0.15 && b <= regionEndSec - 0.5,
  );
  if (bars.length < 5) return [];

  // Compute normalized 4-band spectral profile + energy per bar
  const barProfiles: Array<{
    barSec: number;
    vec: [number, number, number, number];
    rms: number;
  }> = [];

  for (let i = 0; i < bars.length - 1; i++) {
    const f0 = Math.max(0, Math.round(bars[i]! * frameRate));
    const f1 = Math.min(rms.length - 1, Math.round(bars[i + 1]! * frameRate));
    if (f1 <= f0) continue;

    let s0 = 0;
    let s1 = 0;
    let s2 = 0;
    let s3 = 0;
    let sR = 0;
    const n = f1 - f0;
    for (let f = f0; f < f1; f++) {
      s0 += bandSub[f]!;
      s1 += bandPunch[f]!;
      s2 += bandMid[f]!;
      s3 += bandHigh[f]!;
      sR += rms[f]!;
    }
    const total = s0 + s1 + s2 + s3 + 1e-6;
    barProfiles.push({
      barSec: bars[i]!,
      vec: [s0 / total, s1 / total, s2 / total, s3 / total],
      rms: sR / n,
    });
  }

  if (barProfiles.length < 5) return [];

  // Mean RMS across this drop so we only mark switches where BOTH sides are actively slamming
  const meanDropRms =
    barProfiles.reduce((acc, b) => acc + b.rms, 0) / Math.max(1, barProfiles.length);

  // Compute 2-bar-before vs 2-bar-after spectral novelty (L1 distance across 4 kick bands)
  const novelties: Array<{ barIdx: number; barSec: number; novelty: number }> = [];
  for (let i = 2; i <= barProfiles.length - 2; i++) {
    const bBefore1 = barProfiles[i - 2]!;
    const bBefore2 = barProfiles[i - 1]!;
    const bAfter1 = barProfiles[i]!;
    const bAfter2 = barProfiles[i + 1]!;

    // Both sides must have active drop energy (not a breakdown)
    const beforeRms = (bBefore1.rms + bBefore2.rms) / 2;
    const afterRms = (bAfter1.rms + bAfter2.rms) / 2;
    if (beforeRms < meanDropRms * 0.55 || afterRms < meanDropRms * 0.55) continue;

    let l1 = 0;
    for (let band = 0; band < 4; band++) {
      const avgBefore = (bBefore1.vec[band]! + bBefore2.vec[band]!) / 2;
      const avgAfter = (bAfter1.vec[band]! + bAfter2.vec[band]!) / 2;
      l1 += Math.abs(avgAfter - avgBefore);
    }
    // Also factor in noticeable high-end / zaag shift or RMS step
    const rmsJump = Math.abs(afterRms - beforeRms) / Math.max(meanDropRms, 1e-6);
    const novelty = l1 + rmsJump * 0.25;
    novelties.push({ barIdx: i, barSec: barProfiles[i]!.barSec, novelty });
  }

  if (novelties.length === 0) return [];

  // Adaptive threshold: catch true timbral kick changes (typical L1 >= 0.145 & local peak)
  const sortedNov = novelties.map((n) => n.novelty).sort((a, b) => a - b);
  const medianNov = sortedNov[Math.floor(sortedNov.length * 0.5)] ?? 0.08;
  const switchThreshold = Math.max(0.145, medianNov * 1.95);

  const peaks: typeof novelties = [];
  for (let k = 0; k < novelties.length; k++) {
    const cur = novelties[k]!;
    if (cur.novelty < switchThreshold) continue;
    const prev = k > 0 ? novelties[k - 1]!.novelty : 0;
    const next = k + 1 < novelties.length ? novelties[k + 1]!.novelty : 0;
    if (cur.novelty >= prev && cur.novelty >= next) {
      peaks.push(cur);
    }
  }

  // Enforce at least 3 bars separation between consecutive kick switches (and >= 2 bars from drop start)
  const chosen: typeof novelties = [];
  peaks.sort((a, b) => b.novelty - a.novelty);
  for (const p of peaks) {
    if (p.barIdx < 2) continue;
    if (chosen.every((c) => Math.abs(c.barIdx - p.barIdx) >= 3)) {
      chosen.push(p);
    }
  }
  chosen.sort((a, b) => a.barSec - b.barSec);

  return chosen.map((c, idx) => ({
    id: `hl-sw-${dropIndex + 1}-${idx + 1}-${Math.round(c.barSec * 10)}`,
    kind: "highlight",
    label: "Highlight",
    startSec: Number(Math.max(0, c.barSec - 2.5).toFixed(2)),
    endSec: Number(Math.min(regionEndSec, c.barSec + 12).toFixed(2)),
    dropImpactSec: Number(c.barSec.toFixed(2)),
    peakEnergy: Number(Math.min(1, 0.75 + c.novelty).toFixed(3)),
    bpm: sectionBpm,
  }));
}

/**
 * Detects rapid uptempo Kickrolls (1/8th or 1/16th rapid kick bursts: >= 1.8x local beat rate)
 * inside active sections or right before drops/switches. Zero AI credits.
 */
function detectKickrolls(
  env: MultiBandEnvelopes,
  durationSec: number,
  primaryBpm: number,
  dropImpactSecs: number[],
): TrackDropSection[] {
  const { lowOnset, rms, frameRate } = env;
  if (lowOnset.length < frameRate * 4) return [];

  // Find sharp low-end onset peaks (min separation = 40ms -> supports up to 1/16th at 240 BPM)
  const minPeakSep = Math.max(2, Math.round(frameRate * 0.045));
  const peakTimes: number[] = [];
  let maxRms = 1e-6;
  for (let i = 0; i < rms.length; i++) if (rms[i]! > maxRms) maxRms = rms[i]!;

  let lastPeak = -minPeakSep;
  for (let f = 2; f < lowOnset.length - 2; f++) {
    if (f - lastPeak < minPeakSep) continue;
    const v = lowOnset[f]!;
    if (
      v >= 0.32 &&
      rms[f]! >= maxRms * 0.28 &&
      v >= lowOnset[f - 1]! &&
      v >= lowOnset[f + 1]!
    ) {
      peakTimes.push(f / frameRate);
      lastPeak = f;
    }
  }

  // A kickroll has rapid consecutive inter-onset intervals <= 0.62 * beatPeriodSec (at least 4 rapid hits in a row)
  const beatPeriod = 60 / Math.max(130, primaryBpm);
  const maxRollIoi = beatPeriod * 0.62;
  const rolls: Array<{ startSec: number; endSec: number; count: number; nearImpact: boolean }> = [];

  let runStart = 0;
  let runCount = 1;
  for (let i = 1; i < peakTimes.length; i++) {
    const ioi = peakTimes[i]! - peakTimes[i - 1]!;
    if (ioi <= maxRollIoi && ioi >= 0.04) {
      if (runCount === 1) runStart = peakTimes[i - 1]!;
      runCount++;
    } else {
      if (runCount >= 4) {
        const endSec = peakTimes[i - 1]!;
        const dur = endSec - runStart;
        if (dur >= 0.3 && dur <= 2.6) {
          const nearImpact = dropImpactSecs.some(
            (imp) => imp >= runStart - 0.5 && imp <= endSec + 2.5,
          );
          rolls.push({ startSec: runStart, endSec, count: runCount, nearImpact });
        }
      }
      runCount = 1;
    }
  }

  // Deduplicate rolls within 6s of each other, prioritizing rolls leading into drops/switches or highest hit count
  rolls.sort((a, b) => Number(b.nearImpact) - Number(a.nearImpact) || b.count - a.count);
  const selected: typeof rolls = [];
  for (const r of rolls) {
    if (selected.every((s) => Math.abs(s.startSec - r.startSec) >= 6.0)) {
      selected.push(r);
    }
    if (selected.length >= 6) break;
  }
  selected.sort((a, b) => a.startSec - b.startSec);

  return selected.map((r, idx) => ({
    id: `hl-kr-${idx + 1}-${Math.round(r.startSec * 10)}`,
    kind: "highlight",
    label: "Highlight",
    startSec: Number(Math.max(0, r.startSec - 1.5).toFixed(2)),
    endSec: Number(Math.min(durationSec, r.endSec + 10).toFixed(2)),
    dropImpactSec: Number(r.startSec.toFixed(2)),
    peakEnergy: Number(Math.min(1, 0.65 + r.count * 0.04).toFixed(3)),
    bpm: primaryBpm,
  }));
}

/**
 * Pure-DSP Track Audio Analyzer v2:
 * - High-precision modulo-period phase-folding BPM (no 200 BPM bias!)
 * - Supports multi-BPM tracks natively (e.g. CAFFEINE 140 -> 220 -> 260 BPM)
 * - Detects ALL drops (unlimited), mid-drop Kick Switches (4-band spectral novelty), and Kickrolls
 */
export function analyzePcmSamples(
  samples: Float32Array,
  options?: {
    sampleRate?: number;
    hintBpm?: number | null;
    lockedBpm?: number | null;
  },
): TrackAudioAnalysis {
  const sampleRate = options?.sampleRate ?? ANALYSIS_SAMPLE_RATE;
  const durationSec = Number((samples.length / sampleRate).toFixed(3));
  const env = computeOnsetAndEnergyEnvelopes(samples, sampleRate);
  const { rms, onset, lowOnset, frameRate } = env;

  const regions = findActiveDropRegions(rms, onset, frameRate);
  const lockedBpm = options?.lockedBpm && options.lockedBpm >= 60 ? options.lockedBpm : null;

  // First establish the authoritative global tempo across the whole track
  const globalTempo = estimateTempoForSlice(
    onset,
    lowOnset,
    0,
    onset.length,
    frameRate,
    135,
    270,
    lockedBpm,
  );

  // Estimate tempo for each active drop section, rejecting rational aliases (3/4, 4/3, 5/3, etc.)
  // while preserving genuine multi-BPM switches (e.g. CAFFEINE 140 -> 220 -> 260 BPM)
  const sectionTempos = regions.map((r) => {
    const localTempo = estimateTempoForSlice(
      onset,
      lowOnset,
      r.impactFrame,
      r.endFrame,
      frameRate,
      135,
      270,
      lockedBpm,
    );

    if (lockedBpm || Math.abs(localTempo.bpm - globalTempo.bpm) < 6) {
      const alignedGlobal = evaluateBpmCandidateOnSlice(
        onset,
        lowOnset,
        r.impactFrame,
        r.endFrame,
        frameRate,
        globalTempo.bpm,
      );
      return {
        region: r,
        tempo: {
          bpm: globalTempo.bpm,
          confidence: Math.max(globalTempo.confidence, localTempo.confidence),
          phaseSec: Number(alignedGlobal.phaseSec.toFixed(4)),
          rawScore: alignedGlobal.score,
        },
      };
    }

    // Compare how well the global BPM aligns inside this drop vs the local winner
    const globalAtSlice = evaluateBpmCandidateOnSlice(
      onset,
      lowOnset,
      r.impactFrame,
      r.endFrame,
      frameRate,
      globalTempo.bpm,
    );
    const alias = isRationalTempoAlias(localTempo.bpm, globalTempo.bpm);
    const requiredGlobalWeakness = alias ? 0.38 : 0.52;

    const isTrueTempoChange =
      localTempo.rawScore >= 2.35 &&
      localTempo.confidence >= 0.62 &&
      globalAtSlice.score < localTempo.rawScore * requiredGlobalWeakness;

    if (isTrueTempoChange) {
      return { region: r, tempo: localTempo };
    }

    return {
      region: r,
      tempo: {
        bpm: globalTempo.bpm,
        confidence: globalTempo.confidence,
        phaseSec: Number(globalAtSlice.phaseSec.toFixed(4)),
        rawScore: globalAtSlice.score,
      },
    };
  });

  // Decide whether this track is single-BPM or truly multi-BPM (sections differing >= 6 BPM)
  const bpms = sectionTempos.map((s) => s.tempo.bpm);
  const minBpmFound = bpms.length > 0 ? Math.min(...bpms) : globalTempo.bpm;
  const maxBpmFound = bpms.length > 0 ? Math.max(...bpms) : globalTempo.bpm;
  const isMultiBpm = !lockedBpm && bpms.length >= 2 && maxBpmFound - minBpmFound >= 6;

  // Primary display BPM: global BPM for single-BPM tracks; dominant/longest drop BPM for multi-BPM tracks
  let primaryBpm = globalTempo.bpm;
  let primaryPhaseSec = globalTempo.phaseSec;
  let primaryConfidence = globalTempo.confidence;

  if (isMultiBpm && sectionTempos.length > 0) {
    // Weight each distinct BPM by total drop duration
    const durationByBpm = new Map<number, { dur: number; phaseSec: number; conf: number }>();
    for (const s of sectionTempos) {
      const dur = s.region.endFrame - s.region.startFrame;
      const prev = durationByBpm.get(s.tempo.bpm);
      if (!prev) {
        durationByBpm.set(s.tempo.bpm, {
          dur,
          phaseSec: s.tempo.phaseSec,
          conf: s.tempo.confidence,
        });
      } else {
        prev.dur += dur;
        if (s.tempo.confidence > prev.conf) {
          prev.phaseSec = s.tempo.phaseSec;
          prev.conf = s.tempo.confidence;
        }
      }
    }
    const dominant = [...durationByBpm.entries()].sort((a, b) => b[1].dur - a[1].dur)[0];
    if (dominant) {
      primaryBpm = dominant[0];
      primaryPhaseSec = dominant[1].phaseSec;
      primaryConfidence = dominant[1].conf;
    }
  }

  // Helper to build beat & bar grid for a time span at a given BPM & phase
  const buildSpanGrid = (
    spanStartSec: number,
    spanEndSec: number,
    bpm: number,
    phaseSec: number,
    anchorBarSec?: number,
  ): { beats: number[]; bars: number[] } => {
    const period = 60 / Math.max(60, bpm);
    let t = phaseSec;
    while (t < spanStartSec - 0.001) t += period;
    while (t - period >= spanStartSec) t -= period;

    const beats: number[] = [];
    for (; t < spanEndSec - 0.02; t += period) {
      beats.push(Number(t.toFixed(3)));
    }

    // Align bars to anchorBarSec (e.g. drop impact) or strongest onset bar phase 0..3
    let barOffset = 0;
    if (anchorBarSec !== undefined && beats.length > 0) {
      let closestIdx = 0;
      let minDist = Infinity;
      for (let i = 0; i < beats.length; i++) {
        const d = Math.abs(beats[i]! - anchorBarSec);
        if (d < minDist) {
          minDist = d;
          closestIdx = i;
        }
      }
      barOffset = closestIdx % 4;
    } else {
      let bestBarScore = -1;
      for (let off = 0; off < 4; off++) {
        let sc = 0;
        for (let i = off; i < beats.length; i += 4) {
          const f = Math.round(beats[i]! * frameRate);
          if (f >= 0 && f < onset.length) sc += onset[f]!;
        }
        if (sc > bestBarScore) {
          bestBarScore = sc;
          barOffset = off;
        }
      }
    }

    const bars: number[] = [];
    for (let i = barOffset; i < beats.length; i += 4) {
      bars.push(beats[i]!);
    }
    return { beats, bars };
  };

  // Construct global or piecewise multi-BPM beat/bar grid + ALL Drops + ALL Kick Switches
  const beatsSec: number[] = [];
  const barsSec: number[] = [];
  const allMarkers: TrackDropSection[] = [];

  if (!isMultiBpm || sectionTempos.length === 0) {
    const fullGrid = buildSpanGrid(
      0,
      durationSec,
      primaryBpm,
      primaryPhaseSec,
      regions[0] ? regions[0].impactFrame / frameRate : undefined,
    );
    beatsSec.push(...fullGrid.beats);
    barsSec.push(...fullGrid.bars);

    const snapToBeat = (sec: number): number => {
      if (beatsSec.length === 0) return Number(sec.toFixed(2));
      let best = beatsSec[0]!;
      let minD = Math.abs(best - sec);
      for (const b of beatsSec) {
        const d = Math.abs(b - sec);
        if (d < minD) {
          minD = d;
          best = b;
        }
      }
      return Number((minD <= 0.35 ? best : sec).toFixed(2));
    };

    regions.forEach((region, idx) => {
      const impactSec = snapToBeat(region.impactFrame / frameRate);
      const regionEndSec = Number((region.endFrame / frameRate).toFixed(2));
      allMarkers.push({
        id: `drop-${idx + 1}-${Math.round(impactSec * 10)}`,
        kind: "drop",
        label: `Drop ${idx + 1}`,
        startSec: Number(Math.max(0, impactSec - 4).toFixed(2)),
        endSec: regionEndSec,
        dropImpactSec: impactSec,
        peakEnergy: region.peakEnergy,
        bpm: primaryBpm,
      });

      const switches = detectKickSwitchesInRegion(region, primaryBpm, barsSec, env, idx);
      allMarkers.push(...switches);
    });
  } else {
    // Multi-BPM piecewise grid (e.g. CAFFEINE 140 -> 220 -> 260 BPM!)
    let cursorSec = 0;
    sectionTempos.forEach(({ region, tempo }, idx) => {
      const secStart = cursorSec;
      const nextRegionStart =
        idx + 1 < sectionTempos.length
          ? sectionTempos[idx + 1]!.region.impactFrame / frameRate - 2
          : durationSec;
      const secEnd = Math.min(durationSec, Math.max(region.endFrame / frameRate, nextRegionStart));
      const impactRaw = region.impactFrame / frameRate;

      const spanGrid = buildSpanGrid(secStart, secEnd, tempo.bpm, tempo.phaseSec, impactRaw);
      beatsSec.push(...spanGrid.beats);
      barsSec.push(...spanGrid.bars);
      cursorSec = secEnd;

      const impactSec = Number(impactRaw.toFixed(2));
      const regionEndSec = Number((region.endFrame / frameRate).toFixed(2));
      allMarkers.push({
        id: `drop-${idx + 1}-${Math.round(impactSec * 10)}`,
        kind: "drop",
        label: `Drop ${idx + 1}`,
        startSec: Number(Math.max(0, impactSec - 4).toFixed(2)),
        endSec: regionEndSec,
        dropImpactSec: impactSec,
        peakEnergy: region.peakEnergy,
        bpm: tempo.bpm,
      });

      const switches = detectKickSwitchesInRegion(region, tempo.bpm, spanGrid.bars, env, idx);
      allMarkers.push(...switches);
    });
  }

  // Merge kickroll highlights with spectral kick-switch highlights, deduplicating close overlaps
  const existingDropAndHighlights = allMarkers.map((m) => m.dropImpactSec);
  const kickrolls = detectKickrolls(env, durationSec, primaryBpm, existingDropAndHighlights);
  for (const kr of kickrolls) {
    const tooClose = allMarkers.some((m) => {
      const minSep = (m.kind ?? "drop") === "drop" ? 1.5 : 2.5;
      return Math.abs(m.dropImpactSec - kr.dropImpactSec) < minSep;
    });
    if (!tooClose) {
      allMarkers.push(kr);
    }
  }

  // Fallback if track was completely flat/short
  if (allMarkers.length === 0 && durationSec > 4) {
    const mid = Number((durationSec * 0.35).toFixed(2));
    allMarkers.push({
      id: "drop-1-fallback",
      kind: "drop",
      label: "Drop 1",
      startSec: Number(Math.max(0, mid - 4).toFixed(2)),
      endSec: Number(Math.min(durationSec, mid + 14).toFixed(2)),
      dropImpactSec: mid,
      peakEnergy: 1,
      bpm: primaryBpm,
    });
  }

  allMarkers.sort((a, b) => a.dropImpactSec - b.dropImpactSec);

  // Compact 120-point energy envelope for UI waveform display
  const bucketCount = Math.min(120, Math.max(16, rms.length));
  const energyEnvelope: number[] = [];
  let maxRms = 1e-6;
  for (let i = 0; i < rms.length; i++) if (rms[i]! > maxRms) maxRms = rms[i]!;
  for (let b = 0; b < bucketCount; b++) {
    const start = Math.floor((b * rms.length) / bucketCount);
    const end = Math.max(start + 1, Math.floor(((b + 1) * rms.length) / bucketCount));
    let peak = 0;
    for (let i = start; i < end && i < rms.length; i++) {
      if (rms[i]! > peak) peak = rms[i]!;
    }
    energyEnvelope.push(Number((peak / maxRms).toFixed(3)));
  }

  return {
    version: 2,
    durationSec,
    sampleRate,
    bpm: primaryBpm,
    ...(isMultiBpm ? { bpmRange: [minBpmFound, maxBpmFound] as [number, number] } : {}),
    ...(lockedBpm ? { bpmLocked: true } : {}),
    beatConfidence: primaryConfidence,
    firstBeatSec: Number(primaryPhaseSec.toFixed(3)),
    beatsSec,
    barsSec,
    drops: allMarkers,
    energyEnvelope,
    envelopeStepSec: Number((durationSec / Math.max(1, bucketCount)).toFixed(3)),
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Resolves a catalog item's audio source to a readable local file path.
 */
export async function resolveCatalogAudioFile(item: {
  masterAudioPath?: string | null;
  audioPreviewUrl?: string | null;
}): Promise<{ localPath: string; isTemporary: boolean }> {
  const candidates = [item.masterAudioPath, item.audioPreviewUrl].filter(
    (v): v is string => Boolean(v && v.trim()),
  );

  for (const candidate of candidates) {
    const trimmed = candidate.trim();

    if (trimmed.startsWith("/songs/") || trimmed.startsWith("songs/")) {
      const rel = trimmed.replace(/^\/+/, "");
      const pubPath = resolve(process.cwd(), "public", rel);
      if (existsSync(pubPath)) {
        return { localPath: pubPath, isTemporary: false };
      }
      const builtPubPath = resolve(process.cwd(), ".output", "public", rel);
      if (existsSync(builtPubPath)) {
        return { localPath: builtPubPath, isTemporary: false };
      }
    }

    if (isAbsolute(trimmed) && existsSync(trimmed)) {
      return { localPath: trimmed, isTemporary: false };
    }

    if (
      trimmed.startsWith("/api/socials/media/") ||
      trimmed.startsWith("masters/") ||
      trimmed.startsWith("socials/")
    ) {
      return ensureLocalMediaFile(trimmed);
    }

    const relPath = join(process.cwd(), trimmed);
    if (existsSync(relPath)) {
      return { localPath: relPath, isTemporary: false };
    }
  }

  throw new Error(
    "No readable master audio file found for this track. Upload a WAV/MP3 demo or sync site releases first.",
  );
}

/**
 * Full end-to-end FFmpeg + DSP v2 analysis for an audio file on disk.
 */
export async function analyzeAudioFile(
  filePath: string,
  hintBpm?: number | null,
  options?: { lockedBpm?: number | null },
): Promise<TrackAudioAnalysis> {
  const samples = await decodeAudioToMonoPcm(filePath, ANALYSIS_SAMPLE_RATE);
  if (samples.length === 0) {
    throw new Error("Decoded audio is empty — file may be corrupted or contain no audio stream.");
  }
  return analyzePcmSamples(samples, {
    sampleRate: ANALYSIS_SAMPLE_RATE,
    hintBpm,
    lockedBpm: options?.lockedBpm,
  });
}

export async function analyzeCatalogItemAudio(item: {
  masterAudioPath?: string | null;
  audioPreviewUrl?: string | null;
  bpm?: number | null;
  audioAnalysis?: TrackAudioAnalysis | null;
}): Promise<TrackAudioAnalysis> {
  const { localPath, isTemporary } = await resolveCatalogAudioFile(item);
  const lockedBpm = item.audioAnalysis?.bpmLocked && item.bpm ? item.bpm : null;
  try {
    return await analyzeAudioFile(localPath, item.bpm, { lockedBpm });
  } finally {
    if (isTemporary && existsSync(localPath)) {
      try {
        unlinkSync(localPath);
      } catch {
        // Ignore scratch cleanup errors
      }
    }
  }
}
