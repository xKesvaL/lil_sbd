import { spawn } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type { TrackAudioAnalysis, TrackDropSection } from "#/db/schema";
import { ensureLocalMediaFile } from "./media-storage.server";

const ANALYSIS_SAMPLE_RATE = 8000;
const HOP_SAMPLES = 160; // 20ms per frame (50 Hz)
const FRAME_RATE = ANALYSIS_SAMPLE_RATE / HOP_SAMPLES; // 50 fps

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
 * Decodes an audio/video file to 8kHz mono 32-bit float PCM via FFmpeg.
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

/**
 * Computes normalized onset envelope and RMS energy envelope at 50 Hz (20ms hop).
 * Splits low-end kick energy (<240 Hz) and upper crunch/zaag energy (>240 Hz)
 * so uptempo hardcore kick transients are sharp even in dense distorted mixes.
 */
export function computeOnsetAndEnergyEnvelopes(
  samples: Float32Array,
  sampleRate = ANALYSIS_SAMPLE_RATE,
): {
  rms: Float32Array;
  onset: Float32Array;
  frameRate: number;
} {
  const hop = Math.max(1, Math.round(sampleRate / FRAME_RATE));
  const win = hop * 2;
  const frameCount = Math.max(0, Math.floor((samples.length - win) / hop) + 1);
  const rms = new Float32Array(frameCount);
  const lowE = new Float32Array(frameCount);
  const highE = new Float32Array(frameCount);
  const onset = new Float32Array(frameCount);

  if (frameCount === 0) {
    return { rms, onset, frameRate: sampleRate / hop };
  }

  // 1-pole low-pass filter at ~240 Hz to separate kick punch from upper zaag harmonics
  const cutoffHz = 240;
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / sampleRate;
  const alpha = dt / (rc + dt);

  let lpState = 0;
  const lowSignal = new Float32Array(samples.length);
  const highSignal = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i]!;
    lpState = lpState + alpha * (x - lpState);
    lowSignal[i] = lpState;
    highSignal[i] = x - lpState;
  }

  for (let f = 0; f < frameCount; f++) {
    const start = f * hop;
    let sumSq = 0;
    let sumLow = 0;
    let sumHigh = 0;
    for (let j = 0; j < win; j++) {
      const idx = start + j;
      const s = samples[idx]!;
      const l = lowSignal[idx]!;
      const h = highSignal[idx]!;
      sumSq += s * s;
      sumLow += l * l;
      sumHigh += h * h;
    }
    rms[f] = Math.sqrt(sumSq / win);
    lowE[f] = Math.log1p(25 * Math.sqrt(sumLow / win));
    highE[f] = Math.log1p(25 * Math.sqrt(sumHigh / win));
  }

  // Positive log-energy flux (weighted toward kick punch + zaag attack)
  let maxOnset = 1e-6;
  for (let f = 1; f < frameCount; f++) {
    const dLow = Math.max(0, lowE[f]! - lowE[f - 1]!);
    const dHigh = Math.max(0, highE[f]! - highE[f - 1]!);
    const val = dLow * 1.35 + dHigh * 0.85;
    onset[f] = val;
    if (val > maxOnset) maxOnset = val;
  }

  // Normalize onset & subtract local median-like moving average for crisp peaks
  const smoothHalf = 6;
  for (let f = 0; f < frameCount; f++) {
    onset[f] = onset[f]! / maxOnset;
  }
  const sharpened = new Float32Array(frameCount);
  let maxSharp = 1e-6;
  for (let f = 0; f < frameCount; f++) {
    const lo = Math.max(0, f - smoothHalf);
    const hi = Math.min(frameCount - 1, f + smoothHalf);
    let mean = 0;
    for (let k = lo; k <= hi; k++) mean += onset[k]!;
    mean /= hi - lo + 1;
    const v = Math.max(0, onset[f]! - mean * 0.75);
    sharpened[f] = v;
    if (v > maxSharp) maxSharp = v;
  }
  for (let f = 0; f < frameCount; f++) {
    sharpened[f] = sharpened[f]! / maxSharp;
  }

  return { rms, onset: sharpened, frameRate: sampleRate / hop };
}

function estimateBpmAndGrid(
  onset: Float32Array,
  frameRate: number,
  durationSec: number,
  hintBpm?: number | null,
): {
  bpm: number;
  beatConfidence: number;
  firstBeatSec: number;
  beatsSec: number[];
  barsSec: number[];
} {
  const minBpm = 140;
  const maxBpm = 235;
  const minLag = Math.max(2, Math.floor((60 * frameRate) / maxBpm));
  const maxLag = Math.min(Math.floor(onset.length / 4), Math.ceil((60 * frameRate) / minBpm));

  if (onset.length < 40 || maxLag <= minLag) {
    const fallbackBpm = hintBpm && hintBpm >= 100 && hintBpm <= 260 ? hintBpm : 200;
    const period = 60 / fallbackBpm;
    const beatsSec: number[] = [];
    for (let t = 0; t < durationSec; t += period) beatsSec.push(Number(t.toFixed(3)));
    const barsSec = beatsSec.filter((_, idx) => idx % 4 === 0);
    return { bpm: fallbackBpm, beatConfidence: 0.2, firstBeatSec: 0, beatsSec, barsSec };
  }

  // Evaluate autocorrelation + multi-harmonic comb score across candidate integer BPMs (0.5 BPM steps)
  const effectiveHint = hintBpm && hintBpm >= minBpm && hintBpm <= maxBpm ? hintBpm : 200;
  let bestBpm = effectiveHint;
  let bestScore = -1;
  let totalScore = 0;
  let scoreCount = 0;

  // Precompute autocorrelation for lags up to 4 * maxLag
  const maxHarmonicLag = Math.min(onset.length - 1, maxLag * 4 + 2);
  const acf = new Float32Array(maxHarmonicLag + 1);
  for (let lag = minLag; lag <= maxHarmonicLag; lag++) {
    let sum = 0;
    const n = onset.length - lag;
    for (let i = 0; i < n; i++) {
      sum += onset[i]! * onset[i + lag]!;
    }
    acf[lag] = n > 0 ? sum / n : 0;
  }

  const sampleAcf = (lagFloat: number): number => {
    const idx = Math.floor(lagFloat);
    if (idx < 0 || idx + 1 >= acf.length) return 0;
    const frac = lagFloat - idx;
    return acf[idx]! * (1 - frac) + acf[idx + 1]! * frac;
  };

  for (let bpm = minBpm; bpm <= maxBpm; bpm += 0.5) {
    const lag = (60 * frameRate) / bpm;
    // Comb over 1 beat, 2 beats, and 4 beats (1 bar) strongly locks onto true tempo
    const s1 = sampleAcf(lag);
    const s2 = sampleAcf(lag * 2);
    const s4 = sampleAcf(lag * 4);
    const rawScore = s1 * 0.5 + s2 * 0.3 + s4 * 0.2;

    // Gentle Gaussian prior around hintBpm so ambiguous tracks don't jump to 3/2 subharmonics
    const dist = (bpm - effectiveHint) / 28;
    const prior = 1 + 0.14 * Math.exp(-0.5 * dist * dist);
    const score = rawScore * prior;

    totalScore += rawScore;
    scoreCount++;
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }

  // Snap near-integer BPMs (electronic tracks are almost always whole-number BPMs!)
  const roundedBpm = Math.round(bestBpm);
  if (Math.abs(bestBpm - roundedBpm) <= 0.6) {
    bestBpm = roundedBpm;
  }

  const avgScore = scoreCount > 0 ? totalScore / scoreCount : 1e-6;
  const beatConfidence = Number(
    Math.max(0.1, Math.min(0.99, (bestScore / Math.max(avgScore * 3.5, 1e-6)))).toFixed(3),
  );

  // Sweep phase within 1 beat period (5ms resolution) to lock beats onto kick peaks
  const beatPeriodSec = 60 / bestBpm;
  const phaseStepSec = 0.005;
  let bestPhaseSec = 0;
  let bestPhaseScore = -1;

  for (let phase = 0; phase < beatPeriodSec; phase += phaseStepSec) {
    let score = 0;
    let count = 0;
    for (let t = phase; t < durationSec; t += beatPeriodSec) {
      const f = Math.round(t * frameRate);
      if (f >= 0 && f < onset.length) {
        const localMax = Math.max(
          onset[f]!,
          f > 0 ? onset[f - 1]! : 0,
          f + 1 < onset.length ? onset[f + 1]! : 0,
        );
        score += localMax;
        count++;
      }
    }
    const avg = count > 0 ? score / count : 0;
    if (avg > bestPhaseScore) {
      bestPhaseScore = avg;
      bestPhaseSec = phase;
    }
  }

  const beatsSec: number[] = [];
  for (let t = bestPhaseSec; t < durationSec - 0.05; t += beatPeriodSec) {
    beatsSec.push(Number(t.toFixed(3)));
  }

  // Pick strongest bar phase (0..3) so bar boundaries land on Beat 1
  let bestBarOffset = 0;
  let bestBarScore = -1;
  for (let offset = 0; offset < 4; offset++) {
    let score = 0;
    for (let i = offset; i < beatsSec.length; i += 4) {
      const f = Math.round(beatsSec[i]! * frameRate);
      if (f >= 0 && f < onset.length) score += onset[f]!;
    }
    if (score > bestBarScore) {
      bestBarScore = score;
      bestBarOffset = offset;
    }
  }

  const barsSec: number[] = [];
  for (let i = bestBarOffset; i < beatsSec.length; i += 4) {
    barsSec.push(beatsSec[i]!);
  }

  return {
    bpm: bestBpm,
    beatConfidence,
    firstBeatSec: Number(bestPhaseSec.toFixed(3)),
    beatsSec,
    barsSec,
  };
}

function detectDropSections(
  rms: Float32Array,
  frameRate: number,
  durationSec: number,
  barsSec: number[],
): TrackDropSection[] {
  if (rms.length < Math.round(frameRate * 4)) {
    return durationSec > 2
      ? [
          {
            label: "Main Section",
            startSec: 0,
            endSec: Number(Math.min(durationSec, 18).toFixed(2)),
            dropImpactSec: Number(Math.min(durationSec * 0.25, 4).toFixed(2)),
            peakEnergy: 1,
          },
        ]
      : [];
  }

  // Smooth RMS energy with a 1.2s moving average to find sustained high-energy drops
  const smoothWin = Math.max(3, Math.round(frameRate * 1.2));
  const half = Math.floor(smoothWin / 2);
  const smooth = new Float32Array(rms.length);
  let maxSmooth = 1e-6;

  let runningSum = 0;
  for (let i = 0; i < Math.min(smoothWin, rms.length); i++) runningSum += rms[i]!;
  for (let i = 0; i < rms.length; i++) {
    if (i > half && i + half < rms.length) {
      runningSum += rms[i + half]! - rms[i - half - 1]!;
    }
    smooth[i] = runningSum / smoothWin;
    if (smooth[i]! > maxSmooth) maxSmooth = smooth[i]!;
  }

  for (let i = 0; i < smooth.length; i++) {
    smooth[i] = smooth[i]! / maxSmooth;
  }

  // Determine high-energy threshold from sorted percentiles
  const sorted = Array.from(smooth).sort((a, b) => a - b);
  const p68 = sorted[Math.floor(sorted.length * 0.68)] ?? 0.65;
  const threshold = Math.max(0.58, Math.min(0.84, p68));

  // Find contiguous high-energy regions
  const rawRegions: Array<{ startFrame: number; endFrame: number; peakEnergy: number }> = [];
  let inRegion = false;
  let regionStart = 0;
  let regionPeak = 0;

  for (let i = 0; i < smooth.length; i++) {
    const e = smooth[i]!;
    if (!inRegion && e >= threshold) {
      inRegion = true;
      regionStart = i;
      regionPeak = e;
    } else if (inRegion) {
      if (e > regionPeak) regionPeak = e;
      if (e < threshold * 0.85 || i === smooth.length - 1) {
        inRegion = false;
        rawRegions.push({ startFrame: regionStart, endFrame: i, peakEnergy: regionPeak });
      }
    }
  }

  // Merge regions separated by short fakeout pauses (< 2.5s)
  const merged: typeof rawRegions = [];
  const mergeGapFrames = Math.round(frameRate * 2.5);
  for (const r of rawRegions) {
    const prev = merged[merged.length - 1];
    if (prev && r.startFrame - prev.endFrame <= mergeGapFrames) {
      prev.endFrame = r.endFrame;
      prev.peakEnergy = Math.max(prev.peakEnergy, r.peakEnergy);
    } else {
      merged.push({ ...r });
    }
  }

  // Filter for meaningful drop sections (>= 5s), snap dropImpactSec to nearest bar
  const snapToBar = (sec: number): number => {
    if (barsSec.length === 0) return Number(sec.toFixed(2));
    let closest = barsSec[0]!;
    let minDiff = Math.abs(closest - sec);
    for (const b of barsSec) {
      const diff = Math.abs(b - sec);
      if (diff < minDiff) {
        minDiff = diff;
        closest = b;
      }
    }
    return Number((minDiff <= 1.2 ? closest : sec).toFixed(2));
  };

  const minDropFrames = Math.round(frameRate * 5);
  const drops: TrackDropSection[] = merged
    .filter((r) => r.endFrame - r.startFrame >= minDropFrames)
    .slice(0, 4)
    .map((r, idx) => {
      const impactRawSec = r.startFrame / frameRate;
      const dropImpactSec = snapToBar(impactRawSec);
      // Include ~4 seconds of buildup before the drop impact for compelling Reels/Shorts arcs
      const clipStartSec = Number(Math.max(0, dropImpactSec - 4).toFixed(2));
      const regionEndSec = r.endFrame / frameRate;
      const clipEndSec = Number(
        Math.min(durationSec, Math.max(dropImpactSec + 12, Math.min(regionEndSec, dropImpactSec + 20))).toFixed(2),
      );
      const label =
        idx === 0
          ? "1st Drop"
          : idx === 1
            ? "2nd Drop / Kick Switch"
            : idx === 2
              ? "3rd Drop / Climax"
              : `Drop ${idx + 1}`;
      return {
        label,
        startSec: clipStartSec,
        endSec: clipEndSec,
        dropImpactSec,
        peakEnergy: Number(r.peakEnergy.toFixed(3)),
      };
    });

  if (drops.length === 0 && durationSec > 4) {
    const midImpact = snapToBar(durationSec * 0.35);
    drops.push({
      label: "Main Drop",
      startSec: Number(Math.max(0, midImpact - 4).toFixed(2)),
      endSec: Number(Math.min(durationSec, midImpact + 14).toFixed(2)),
      dropImpactSec: midImpact,
      peakEnergy: 1,
    });
  }

  return drops;
}

/**
 * Pure-DSP track analyzer (exported for fast deterministic unit testing).
 */
export function analyzePcmSamples(
  samples: Float32Array,
  options?: { sampleRate?: number; hintBpm?: number | null },
): TrackAudioAnalysis {
  const sampleRate = options?.sampleRate ?? ANALYSIS_SAMPLE_RATE;
  const durationSec = Number((samples.length / sampleRate).toFixed(3));
  const { rms, onset, frameRate } = computeOnsetAndEnergyEnvelopes(samples, sampleRate);
  const grid = estimateBpmAndGrid(onset, frameRate, durationSec, options?.hintBpm);
  const drops = detectDropSections(rms, frameRate, durationSec, grid.barsSec);

  // Build compact 120-point energy envelope for UI mini-waveform & drop visualization
  const bucketCount = Math.min(120, Math.max(16, rms.length));
  const energyEnvelope: number[] = [];
  let maxRms = 1e-6;
  for (let i = 0; i < rms.length; i++) {
    if (rms[i]! > maxRms) maxRms = rms[i]!;
  }
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
    version: 1,
    durationSec,
    sampleRate,
    bpm: grid.bpm,
    beatConfidence: grid.beatConfidence,
    firstBeatSec: grid.firstBeatSec,
    beatsSec: grid.beatsSec,
    barsSec: grid.barsSec,
    drops,
    energyEnvelope,
    envelopeStepSec: Number((durationSec / Math.max(1, bucketCount)).toFixed(3)),
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Resolves a catalog item's audio source to a readable local file path.
 * Supports uploaded demos (MediaStorage keys under masters/...), public/songs/* paths, or absolute paths.
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

    // 1. Public folder asset (e.g. "/songs/induzaag.mp3")
    if (trimmed.startsWith("/songs/") || trimmed.startsWith("songs/")) {
      const rel = trimmed.replace(/^\/+/, "");
      const pubPath = resolve(process.cwd(), "public", rel);
      if (existsSync(pubPath)) {
        return { localPath: pubPath, isTemporary: false };
      }
      // Nitro built public assets fallback
      const builtPubPath = resolve(process.cwd(), ".output", "public", rel);
      if (existsSync(builtPubPath)) {
        return { localPath: builtPubPath, isTemporary: false };
      }
    }

    // 2. Direct absolute path on disk
    if (isAbsolute(trimmed) && existsSync(trimmed)) {
      return { localPath: trimmed, isTemporary: false };
    }

    // 3. MediaStorage key or /api/socials/media/... URL
    if (
      trimmed.startsWith("/api/socials/media/") ||
      trimmed.startsWith("masters/") ||
      trimmed.startsWith("socials/")
    ) {
      return ensureLocalMediaFile(trimmed);
    }

    // 4. Relative path inside project
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
 * Full end-to-end FFmpeg + DSP analysis for an audio file on disk or in MediaStorage.
 */
export async function analyzeAudioFile(
  filePath: string,
  hintBpm?: number | null,
): Promise<TrackAudioAnalysis> {
  const samples = await decodeAudioToMonoPcm(filePath, ANALYSIS_SAMPLE_RATE);
  if (samples.length === 0) {
    throw new Error("Decoded audio is empty — file may be corrupted or contain no audio stream.");
  }
  return analyzePcmSamples(samples, { sampleRate: ANALYSIS_SAMPLE_RATE, hintBpm });
}

export async function analyzeCatalogItemAudio(item: {
  masterAudioPath?: string | null;
  audioPreviewUrl?: string | null;
  bpm?: number | null;
}): Promise<TrackAudioAnalysis> {
  const { localPath, isTemporary } = await resolveCatalogAudioFile(item);
  try {
    return await analyzeAudioFile(localPath, item.bpm);
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
