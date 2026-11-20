import { existsSync, unlinkSync } from "node:fs";
import type { TrackAudioAnalysis } from "#/db/schema";
import { computeOnsetAndEnergyEnvelopes, decodeAudioToMonoPcm } from "./audio-analysis.server";
import { ensureLocalMediaFile } from "./media-storage.server";

export interface AudioSyncResult {
  /** Timestamp in the master track (seconds) corresponding to t = 0 of the raw clip. */
  offsetSec: number;
  /** Normalized sync confidence in [0, 1]. Values >= 0.35 indicate a strong acoustic lock. */
  confidence: number;
  /** Whether acoustic matching succeeded or fell back to drop-snap heuristic. */
  method: "acoustic_xcorr" | "drop_snap_fallback";
}

/**
 * Pure-DSP normalized cross-correlation on onset envelopes (50 Hz / 20ms frames).
 * Finds the exact lag `masterFrame = clipFrame + lag` where the phone clip's onset
 * envelope best aligns with the master track's onset envelope.
 */
export function alignOnsetEnvelopes(
  masterOnset: Float32Array,
  clipOnset: Float32Array,
  frameRate = 50,
  masterRms?: Float32Array,
  clipRms?: Float32Array,
): { offsetSec: number; confidence: number; peakCorr: number } {
  const mLen = masterOnset.length;
  const cLen = clipOnset.length;

  if (mLen < 25 || cLen < 25) {
    return { offsetSec: 0, confidence: 0, peakCorr: 0 };
  }

  // Require at least 3 seconds (or 60% of clip if shorter) of overlap between clip and master
  const minOverlap = Math.min(cLen, Math.max(Math.round(frameRate * 3), Math.floor(cLen * 0.6)));
  const minLag = -(cLen - minOverlap);
  const maxLag = mLen - minOverlap;

  if (maxLag < minLag) {
    return { offsetSec: 0, confidence: 0, peakCorr: 0 };
  }

  // Precompute zero-mean envelopes for clean Pearson-like correlation
  const center = (arr: Float32Array): Float32Array => {
    let mean = 0;
    for (let i = 0; i < arr.length; i++) mean += arr[i]!;
    mean /= arr.length;
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) out[i] = arr[i]! - mean;
    return out;
  };

  const mOnsetNorm = center(masterOnset);
  const cOnsetNorm = center(clipOnset);
  const useRms = Boolean(
    masterRms && clipRms && masterRms.length === mLen && clipRms.length === cLen,
  );
  const mRmsNorm = useRms ? center(masterRms!) : null;
  const cRmsNorm = useRms ? center(clipRms!) : null;

  const pearsonAtLag = (mArr: Float32Array, cArr: Float32Array, lag: number): number => {
    const clipStart = Math.max(0, -lag);
    const clipEnd = Math.min(cLen, mLen - lag);
    const overlap = clipEnd - clipStart;
    if (overlap < minOverlap) return -1;

    let dot = 0;
    let sumM = 0;
    let sumC = 0;
    for (let i = clipStart; i < clipEnd; i++) {
      const cv = cArr[i]!;
      const mv = mArr[i + lag]!;
      dot += cv * mv;
      sumC += cv * cv;
      sumM += mv * mv;
    }
    const denom = Math.sqrt(sumC * sumM);
    return denom > 1e-8 ? dot / denom : 0;
  };

  const evalLag = (lag: number): number => {
    const onsetCorr = pearsonAtLag(mOnsetNorm, cOnsetNorm, lag);
    if (!useRms || !mRmsNorm || !cRmsNorm) return onsetCorr;
    const rmsCorr = pearsonAtLag(mRmsNorm, cRmsNorm, lag);
    // Combine sharp kick/zaag onset transients with macro RMS energy contour to prevent ±1 beat slips
    return onsetCorr * 0.65 + rmsCorr * 0.35;
  };

  // Stage 1: Coarse scan every 2 frames (40ms) across entire track
  const coarseStep = 2;
  const scores: Array<{ lag: number; score: number }> = [];
  let sumScore = 0;
  let sumScoreSq = 0;

  for (let lag = minLag; lag <= maxLag; lag += coarseStep) {
    const s = evalLag(lag);
    scores.push({ lag, score: s });
    sumScore += s;
    sumScoreSq += s * s;
  }

  if (scores.length === 0) {
    return { offsetSec: 0, confidence: 0, peakCorr: 0 };
  }

  const mean = sumScore / scores.length;
  const variance = Math.max(1e-8, sumScoreSq / scores.length - mean * mean);
  const stdDev = Math.sqrt(variance);

  // Pick top 8 distinct coarse candidates (separated by >= 0.8s) and refine across ±14 frames (±280ms)
  scores.sort((a, b) => b.score - a.score);
  const topCandidates: number[] = [];
  for (const item of scores) {
    if (topCandidates.every((c) => Math.abs(c - item.lag) >= Math.round(frameRate * 0.8))) {
      topCandidates.push(item.lag);
      if (topCandidates.length >= 8) break;
    }
  }

  let bestLag = topCandidates[0] ?? 0;
  let bestScore = -2;

  for (const cand of topCandidates) {
    const lo = Math.max(minLag, cand - 14);
    const hi = Math.min(maxLag, cand + 14);
    for (let lag = lo; lag <= hi; lag++) {
      const s = evalLag(lag);
      if (s > bestScore) {
        bestScore = s;
        bestLag = lag;
      }
    }
  }

  // Parabolic sub-frame interpolation around bestLag for ~5ms precision
  let refinedLag = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const yL = evalLag(bestLag - 1);
    const y0 = bestScore;
    const yR = evalLag(bestLag + 1);
    const denom = 2 * (yL - 2 * y0 + yR);
    if (Math.abs(denom) > 1e-8) {
      const delta = Math.max(-0.5, Math.min(0.5, (yL - yR) / denom));
      refinedLag = bestLag + delta;
    }
  }

  // Compute z-score sharpness of winning peak over background correlation noise
  const zScore = (bestScore - mean) / stdDev;
  // Combine raw correlation strength & peak prominence into intuitive [0, 1] confidence
  const zConf = Math.max(0, Math.min(1, (zScore - 2.2) / 5.5));
  const rConf = Math.max(0, Math.min(1, (bestScore - 0.08) / 0.45));
  const confidence = Number(Math.max(0, Math.min(0.99, zConf * 0.6 + rConf * 0.4)).toFixed(3));

  return {
    offsetSec: Number((refinedLag / frameRate).toFixed(3)),
    confidence,
    peakCorr: Number(bestScore.toFixed(4)),
  };
}

/**
 * Aligns raw phone clip PCM samples against master track PCM samples.
 * Falls back cleanly to snapping onto the track's 1st drop if the clip has silent/unmatched audio.
 */
export function syncClipPcmToMasterPcm(
  masterSamples: Float32Array,
  clipSamples: Float32Array,
  options?: {
    sampleRate?: number;
    trackAnalysis?: TrackAudioAnalysis | null;
  },
): AudioSyncResult {
  const sampleRate = options?.sampleRate ?? 8000;

  // Check if clip audio has actual energy (not muted/silent)
  let sumSq = 0;
  for (let i = 0; i < clipSamples.length; i++) sumSq += clipSamples[i]! * clipSamples[i]!;
  const clipRms = clipSamples.length > 0 ? Math.sqrt(sumSq / clipSamples.length) : 0;

  if (clipRms > 1e-4) {
    const masterEnv = computeOnsetAndEnergyEnvelopes(masterSamples, sampleRate);
    const clipEnv = computeOnsetAndEnergyEnvelopes(clipSamples, sampleRate);
    const aligned = alignOnsetEnvelopes(
      masterEnv.onset,
      clipEnv.onset,
      masterEnv.frameRate,
      masterEnv.rms,
      clipEnv.rms,
    );

    if (aligned.confidence >= 0.3) {
      return {
        offsetSec: aligned.offsetSec,
        confidence: aligned.confidence,
        method: "acoustic_xcorr",
      };
    }
  }

  // Graceful fallback: snap start of clip slightly before the 1st drop buildup
  const firstDrop = options?.trackAnalysis?.drops?.[0];
  const fallbackOffset = firstDrop ? Math.max(0, Number(firstDrop.startSec.toFixed(2))) : 0;
  return {
    offsetSec: fallbackOffset,
    confidence: 0.15,
    method: "drop_snap_fallback",
  };
}

/**
 * Full file-to-file acoustic auto-sync between a raw uploaded video clip (in MediaStorage or local path)
 * and a resolved master audio file path.
 */
export async function syncRawClipFileToMasterFile(params: {
  rawClipStorageKeyOrPath: string;
  masterAudioLocalPath: string;
  trackAnalysis?: TrackAudioAnalysis | null;
}): Promise<AudioSyncResult> {
  const clipLocal = existsSync(params.rawClipStorageKeyOrPath)
    ? { localPath: params.rawClipStorageKeyOrPath, isTemporary: false }
    : await ensureLocalMediaFile(params.rawClipStorageKeyOrPath);

  try {
    const [masterSamples, clipSamples] = await Promise.all([
      decodeAudioToMonoPcm(params.masterAudioLocalPath, 8000),
      decodeAudioToMonoPcm(clipLocal.localPath, 8000),
    ]);

    return syncClipPcmToMasterPcm(masterSamples, clipSamples, {
      sampleRate: 8000,
      trackAnalysis: params.trackAnalysis,
    });
  } finally {
    if (clipLocal.isTemporary && existsSync(clipLocal.localPath)) {
      try {
        unlinkSync(clipLocal.localPath);
      } catch {
        // Ignore scratch cleanup errors
      }
    }
  }
}
