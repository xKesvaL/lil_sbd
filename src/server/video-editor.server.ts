import { spawn } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type {
  EditPreset,
  EditRecipeFxEvent,
  EditRecipeSegment,
  PostEditRecipe,
  TrackAudioAnalysis,
} from "#/db/schema";
import {
  buildStorageKey,
  ensureLocalMediaFile,
  getScratchDir,
  putMediaObject,
} from "./media-storage.server";

export interface SingleTakePlanInput {
  clipId: string;
  clipDurationSec: number;
  detectedOffsetSec: number;
  trackAnalysis: TrackAudioAnalysis;
  preset: EditPreset;
  audioHeadroomDb: number;
  burnHookOverlay?: boolean;
  hookOverlayText?: string;
  /** Optional user override from Quick Tweak */
  overrideMasterStartSec?: number;
  overrideDurationSec?: number;
}

const PRESET_FX_CONFIG: Record<
  EditPreset,
  {
    zoomAmp: number;
    dropZoomBoost: number;
    shakePx: number;
    flashBrightness: number;
    contrast: number;
    saturation: number;
    beatStrideInDrop: number; // trigger punch-zoom every N beats during drop
  }
> = {
  subtle: {
    zoomAmp: 0.055,
    dropZoomBoost: 0.03,
    shakePx: 6,
    flashBrightness: 0.06,
    contrast: 1.05,
    saturation: 1.05,
    beatStrideInDrop: 4, // every bar
  },
  punchy: {
    zoomAmp: 0.095,
    dropZoomBoost: 0.045,
    shakePx: 14,
    flashBrightness: 0.1,
    contrast: 1.08,
    saturation: 1.09,
    beatStrideInDrop: 4, // every bar (strong punch)
  },
  hard: {
    zoomAmp: 0.135,
    dropZoomBoost: 0.06,
    shakePx: 22,
    flashBrightness: 0.14,
    contrast: 1.11,
    saturation: 1.12,
    beatStrideInDrop: 2, // every half-bar on hard zaag sections
  },
};

/**
 * Deterministically plans the optimal buildup -> drop trim window and beat-synced
 * FX event timeline for a single-take vertical video.
 */
export function buildSingleTakeEditRecipe(input: SingleTakePlanInput): PostEditRecipe {
  const {
    clipId,
    clipDurationSec,
    detectedOffsetSec,
    trackAnalysis,
    preset,
    audioHeadroomDb,
    burnHookOverlay = false,
    hookOverlayText,
  } = input;

  // Overlap window in master track coordinates where BOTH raw clip and master track exist
  const validMasterMin = Math.max(0, detectedOffsetSec);
  const validMasterMax = Math.min(
    trackAnalysis.durationSec,
    detectedOffsetSec + Math.max(0.5, clipDurationSec),
  );
  const availableOverlap = Math.max(0.5, validMasterMax - validMasterMin);

  // Choose target clip length (ideal 14–22s for high-retention Reels/Shorts/TikTok)
  const desiredDuration = Math.min(
    availableOverlap,
    Math.max(4, Math.min(24, input.overrideDurationSec ?? (availableOverlap > 22 ? 18 : availableOverlap))),
  );

  const structuralDrops = trackAnalysis.drops.filter(
    (d) => (d.kind ?? "drop") === "drop",
  );
  const highlights = trackAnalysis.drops.filter((d) => (d.kind ?? "drop") !== "drop");

  let masterStartSec: number;
  if (
    input.overrideMasterStartSec !== undefined &&
    Number.isFinite(input.overrideMasterStartSec)
  ) {
    masterStartSec = Math.max(
      validMasterMin,
      Math.min(validMasterMax - desiredDuration, input.overrideMasterStartSec),
    );
  } else {
    // Prefer a true Drop, then any Highlight inside the available overlap window
    const overlappingDrop =
      structuralDrops.find(
        (d) =>
          d.dropImpactSec >= validMasterMin + 1.0 &&
          d.dropImpactSec <= validMasterMax - 3.0,
      ) ??
      highlights.find(
        (d) =>
          d.dropImpactSec >= validMasterMin + 1.0 &&
          d.dropImpactSec <= validMasterMax - 3.0,
      );

    if (overlappingDrop) {
      // Start ~3.5s before the drop impact (trimmed cleanly away from camera walk-up)
      const idealStart = overlappingDrop.dropImpactSec - 3.5;
      masterStartSec = Math.max(
        validMasterMin + Math.min(0.6, Math.max(0, availableOverlap - desiredDuration)),
        Math.min(validMasterMax - desiredDuration, idealStart),
      );
    } else if (availableOverlap > desiredDuration + 1.5) {
      // Trim ~1s walk-to-camera buffer at the start and center around highest energy
      const leadTrim = Math.min(1.5, (availableOverlap - desiredDuration) * 0.4);
      masterStartSec = validMasterMin + leadTrim;
    } else {
      masterStartSec = validMasterMin;
    }
  }

  const masterEndSec = Number(Math.min(validMasterMax, masterStartSec + desiredDuration).toFixed(3));
  const finalDuration = Math.max(0.5, masterEndSec - masterStartSec);
  const sourceStartSec = Number(Math.max(0, masterStartSec - detectedOffsetSec).toFixed(3));
  const sourceEndSec = Number(Math.min(clipDurationSec, sourceStartSec + finalDuration).toFixed(3));

  // Build beat-synced FX events in rendered output time (0 .. finalDuration)
  const fxCfg = PRESET_FX_CONFIG[preset] ?? PRESET_FX_CONFIG.punchy;
  const fxEvents: EditRecipeFxEvent[] = [];

  // 1a. Full Drop impacts: maximum flash + punch-zoom + shake
  for (const d of structuralDrops) {
    if (d.dropImpactSec < masterStartSec + 0.3 || d.dropImpactSec > masterEndSec - 0.5) continue;
    const rel = Number((d.dropImpactSec - masterStartSec).toFixed(3));
    fxEvents.push(
      { timeSec: rel, type: "drop_flash", intensity: 1.0 },
      { timeSec: rel, type: "punch_zoom", intensity: 1.0 },
      { timeSec: rel, type: "micro_shake", intensity: 1.0 },
    );
  }

  // 1b. Highlight moments (kick switches / kickrolls): crisp flash + strong punch-zoom + shake
  for (const hl of highlights) {
    if (hl.dropImpactSec < masterStartSec + 0.3 || hl.dropImpactSec > masterEndSec - 0.5) continue;
    const rel = Number((hl.dropImpactSec - masterStartSec).toFixed(3));
    const nearExisting = fxEvents.some((e) => Math.abs(e.timeSec - rel) < 0.25);
    if (nearExisting) continue;
    fxEvents.push(
      { timeSec: rel, type: "drop_flash", intensity: 0.78 },
      { timeSec: rel, type: "punch_zoom", intensity: 0.92 },
      { timeSec: rel, type: "micro_shake", intensity: 0.88 },
    );
  }

  // 2. Beat / bar-synced punch zooms & micro-shakes (capped at <= 26 events so FFmpeg expr stays compact & fast)
  const barsInWindow = trackAnalysis.barsSec.filter(
    (b) => b >= masterStartSec + 0.25 && b <= masterEndSec - 0.35,
  );
  const beatsInWindow = trackAnalysis.beatsSec.filter(
    (b) => b >= masterStartSec + 0.25 && b <= masterEndSec - 0.35,
  );

  const inDrop = (masterT: number) =>
    trackAnalysis.drops.some((d) => masterT >= d.dropImpactSec - 0.15 && masterT <= d.endSec + 0.2);

  const chosenTriggers: number[] = [];
  if (fxCfg.beatStrideInDrop <= 2 && beatsInWindow.length > 0) {
    for (let i = 0; i < beatsInWindow.length; i += 2) {
      const bt = beatsInWindow[i]!;
      if (inDrop(bt) || i % 4 === 0) {
        chosenTriggers.push(bt);
      }
    }
  } else {
    chosenTriggers.push(...barsInWindow);
  }

  // Filter out triggers too close to an already-added drop impact and cap total count
  const maxBeatFx = 22;
  let added = 0;
  for (const masterT of chosenTriggers) {
    if (added >= maxBeatFx) break;
    const rel = Number((masterT - masterStartSec).toFixed(3));
    const nearExisting = fxEvents.some((e) => Math.abs(e.timeSec - rel) < 0.18);
    if (nearExisting) continue;

    const strong = inDrop(masterT);
    fxEvents.push({
      timeSec: rel,
      type: "punch_zoom",
      intensity: strong ? 0.85 : 0.45,
    });
    if (strong) {
      fxEvents.push({
        timeSec: rel,
        type: "micro_shake",
        intensity: 0.72,
      });
    }
    added++;
  }

  fxEvents.sort((a, b) => a.timeSec - b.timeSec);

  return {
    mode: "single_take",
    preset,
    masterStartSec: Number(masterStartSec.toFixed(3)),
    masterEndSec,
    audioHeadroomDb: Number(Math.max(-6, Math.min(0, audioHeadroomDb)).toFixed(2)),
    burnHookOverlay,
    hookOverlayText: hookOverlayText?.trim() || undefined,
    segments: [
      {
        clipId,
        sourceStartSec,
        sourceEndSec,
        masterStartSec: Number(masterStartSec.toFixed(3)),
      },
    ],
    fxEvents,
  };
}

function escapeDrawtext(text: string): string {
  return text
    .replaceAll("\\", "\\\\")
    .replaceAll(":", "\\:")
    .replaceAll("'", "\\'")
    .replaceAll("%", "\\%")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

function findDrawtextFontFile(): string | null {
  const candidates = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return null;
}

/**
 * Builds the FFmpeg filtergraph expression for smooth beat-synced punch-zoom,
 * damped kick micro-shakes, drop flash, clean contrast grade, and optional safe-zone hook text.
 */
export function buildSingleTakeFiltergraph(
  recipe: PostEditRecipe,
  options?: { width?: number; height?: number; fps?: number },
): {
  videoFilter: string;
  audioFilter: string;
  durationSec: number;
} {
  const width = options?.width ?? 1080;
  const height = options?.height ?? 1920;
  const fps = options?.fps ?? 30;
  const cfg = PRESET_FX_CONFIG[recipe.preset] ?? PRESET_FX_CONFIG.punchy;
  const durationSec = Math.max(0.5, Number((recipe.masterEndSec - recipe.masterStartSec).toFixed(3)));

  // Build summed damped exponential expressions for zoom, shake, and flash
  const zoomEvents = recipe.fxEvents.filter((e) => e.type === "punch_zoom").slice(0, 24);
  const shakeEvents = recipe.fxEvents.filter((e) => e.type === "micro_shake").slice(0, 16);
  const flashEvents = recipe.fxEvents.filter((e) => e.type === "drop_flash").slice(0, 4);

  const zoomTerms = zoomEvents.map((e) => {
    const t0 = e.timeSec.toFixed(3);
    const t1 = (e.timeSec + 0.34).toFixed(3);
    const amp = ((cfg.zoomAmp + (e.intensity >= 0.99 ? cfg.dropZoomBoost : 0)) * e.intensity).toFixed(
      4,
    );
    return `between(t,${t0},${t1})*${amp}*exp(-11*(t-${t0}))`;
  });

  // Always keep a tiny base overscan (0.025) whenever shake events exist so crop never hits edge
  const baseOverscan = shakeEvents.length > 0 ? 0.03 : 0.0;
  const zoomExpr =
    zoomTerms.length > 0
      ? `min(0.24,${baseOverscan.toFixed(3)}+${zoomTerms.join("+")})`
      : baseOverscan.toFixed(3);

  const shakeXTerms = shakeEvents.map((e, idx) => {
    const t0 = e.timeSec.toFixed(3);
    const t1 = (e.timeSec + 0.24).toFixed(3);
    const amp = (cfg.shakePx * e.intensity).toFixed(2);
    const sign = idx % 2 === 0 ? "" : "-";
    return `between(t,${t0},${t1})*${sign}${amp}*sin(78*(t-${t0}))*exp(-14*(t-${t0}))`;
  });

  const shakeYTerms = shakeEvents.map((e, idx) => {
    const t0 = e.timeSec.toFixed(3);
    const t1 = (e.timeSec + 0.24).toFixed(3);
    const amp = (cfg.shakePx * 0.65 * e.intensity).toFixed(2);
    const sign = idx % 2 === 0 ? "-" : "";
    return `between(t,${t0},${t1})*${sign}${amp}*cos(64*(t-${t0}))*exp(-14*(t-${t0}))`;
  });

  const shakeXExpr = shakeXTerms.length > 0 ? shakeXTerms.join("+") : "0";
  const shakeYExpr = shakeYTerms.length > 0 ? shakeYTerms.join("+") : "0";

  const flashTerms = flashEvents.map((e) => {
    const t0 = e.timeSec.toFixed(3);
    const t1 = (e.timeSec + 0.22).toFixed(3);
    const amp = (cfg.flashBrightness * e.intensity).toFixed(4);
    return `between(t,${t0},${t1})*${amp}*exp(-14*(t-${t0}))`;
  });

  const brightnessExpr = flashTerms.length > 0 ? flashTerms.join("+") : "0";

  const chain: string[] = [
    // Normalize vertical 9:16 canvas at constant fps
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
    `fps=${fps}`,
    `setsar=1`,
    // Beat-synced dynamic punch-zoom + damped micro-shake
    `scale=w='trunc(${width}*(1+${zoomExpr})/2)*2':h='trunc(${height}*(1+${zoomExpr})/2)*2':eval=frame:flags=fast_bilinear`,
    `crop=${width}:${height}:x='max(0,min(iw-${width},(iw-${width})/2+(${shakeXExpr})))':y='max(0,min(ih-${height},(ih-${height})/2+(${shakeYExpr})))'`,
    // Clean hard-dance contrast/color grade + subtle drop flash
    `eq=contrast=${cfg.contrast}:saturation=${cfg.saturation}:brightness='${brightnessExpr}':eval=frame`,
  ];

  // Optional burned-in hook text positioned strictly inside IG/TikTok/Shorts top safe zone
  if (recipe.burnHookOverlay && recipe.hookOverlayText) {
    const escaped = escapeDrawtext(recipe.hookOverlayText).slice(0, 72);
    const fontFile = findDrawtextFontFile();
    const fontArg = fontFile ? `fontfile='${fontFile.replaceAll(":", "\\:")}':` : "";
    const fontSize = Math.max(28, Math.round(width * 0.046));
    chain.push(
      `drawtext=${fontArg}text='${escaped}':fontcolor=white:fontsize=${fontSize}:box=1:boxcolor=black@0.48:boxborderw=18:x=(w-text_w)/2:y=h*0.16`,
    );
  }

  chain.push("format=yuv420p");

  const fadeInSec = Math.min(0.12, durationSec * 0.1);
  const fadeOutSec = Math.min(0.35, durationSec * 0.18);
  const fadeOutStart = Math.max(0, Number((durationSec - fadeOutSec).toFixed(3)));

  // Master audio used directly at full uptempo loudness with light headroom trim (no -14 LUFS flattening!)
  const audioFilter = `volume=${recipe.audioHeadroomDb.toFixed(2)}dB,afade=t=in:st=0:d=${fadeInSec.toFixed(3)},afade=t=out:st=${fadeOutStart}:d=${fadeOutSec.toFixed(3)}`;

  return {
    videoFilter: chain.join(","),
    audioFilter,
    durationSec,
  };
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const proc = spawn("ffmpeg", args, { windowsHide: true });
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 24_000) {
        stderr += chunk.toString("utf8");
      }
    });
    proc.on("error", (err) => rejectPromise(new Error(`FFmpeg spawn failed: ${err.message}`)));
    proc.on("close", (code) => {
      if (code !== 0) {
        rejectPromise(new Error(`FFmpeg exited (${code}): ${stderr.slice(-500).trim()}`));
        return;
      }
      resolvePromise();
    });
  });
}

export interface SyncedTakeInput {
  clipId: string;
  durationSec: number;
  detectedOffsetSec: number;
  syncConfidence?: number;
}

export interface MultiTakePlanInput {
  takes: SyncedTakeInput[];
  trackAnalysis: TrackAudioAnalysis;
  preset: EditPreset;
  audioHeadroomDb: number;
  burnHookOverlay?: boolean;
  hookOverlayText?: string;
  overrideMasterStartSec?: number;
  overrideDurationSec?: number;
  preferredTakeOrder?: number[];
  variationSeed?: number;
}

/**
 * Plans a frame-accurate multi-take beat-cut mashup across 2–5 synced takes:
 * - Finds the strongest buildup -> drop window with maximum take overlap
 * - Slices along exact bar boundaries & drop impact moments (slower cuts in buildup,
 *   tighter 1-bar / half-bar cuts during peak zaag drops)
 * - Alternates cleanly across takes covering each segment (never repeating the same take twice in a row)
 */
export function buildMultiTakeEditRecipe(input: MultiTakePlanInput): PostEditRecipe {
  const {
    takes,
    trackAnalysis,
    preset,
    audioHeadroomDb,
    burnHookOverlay = false,
    hookOverlayText,
    variationSeed = 0,
  } = input;

  if (takes.length <= 1) {
    const only = takes[0];
    if (!only) {
      throw new Error("Multi-take planner requires at least one take.");
    }
    return buildSingleTakeEditRecipe({
      clipId: only.clipId,
      clipDurationSec: only.durationSec,
      detectedOffsetSec: only.detectedOffsetSec,
      trackAnalysis,
      preset,
      audioHeadroomDb,
      burnHookOverlay,
      hookOverlayText,
      overrideMasterStartSec: input.overrideMasterStartSec,
      overrideDurationSec: input.overrideDurationSec,
    });
  }

  // Compute valid master coverage for each take
  const ranges = takes.map((t, idx) => ({
    ...t,
    takeIndex: idx,
    masterMin: Math.max(0, t.detectedOffsetSec),
    masterMax: Math.min(trackAnalysis.durationSec, t.detectedOffsetSec + Math.max(0.5, t.durationSec)),
  }));

  const unionMin = Math.min(...ranges.map((r) => r.masterMin));
  const unionMax = Math.max(...ranges.map((r) => r.masterMax));

  // Prefer the intersection window where >= 2 takes overlap, falling back to union if disjoint
  const sortedStarts = [...ranges].map((r) => r.masterMin).sort((a, b) => a - b);
  const sortedEnds = [...ranges].map((r) => r.masterMax).sort((a, b) => a - b);
  const overlapMin = sortedStarts[Math.min(1, sortedStarts.length - 1)] ?? unionMin;
  const overlapMax = sortedEnds[Math.max(0, sortedEnds.length - 2)] ?? unionMax;
  const hasMultiOverlap = overlapMax - overlapMin >= 5;

  const windowMin = hasMultiOverlap ? overlapMin : unionMin;
  const windowMax = hasMultiOverlap ? overlapMax : unionMax;
  const availableSpan = Math.max(1, windowMax - windowMin);

  const desiredDuration = Math.min(
    availableSpan,
    Math.max(4, Math.min(24, input.overrideDurationSec ?? (availableSpan > 20 ? 18 : availableSpan))),
  );

  const structuralDrops = trackAnalysis.drops.filter((d) => (d.kind ?? "drop") === "drop");

  let masterStartSec: number;
  if (
    input.overrideMasterStartSec !== undefined &&
    Number.isFinite(input.overrideMasterStartSec)
  ) {
    masterStartSec = Math.max(
      windowMin,
      Math.min(windowMax - desiredDuration, input.overrideMasterStartSec),
    );
  } else {
    const overlappingDrop =
      structuralDrops.find(
        (d) => d.dropImpactSec >= windowMin + 1.0 && d.dropImpactSec <= windowMax - 3.0,
      ) ??
      trackAnalysis.drops.find(
        (d) => d.dropImpactSec >= windowMin + 1.0 && d.dropImpactSec <= windowMax - 3.0,
      );
    if (overlappingDrop) {
      const idealStart = overlappingDrop.dropImpactSec - 3.5;
      masterStartSec = Math.max(windowMin, Math.min(windowMax - desiredDuration, idealStart));
    } else {
      masterStartSec = windowMin;
    }
  }

  const masterEndSec = Number(Math.min(windowMax, masterStartSec + desiredDuration).toFixed(3));
  const finalDuration = Math.max(0.5, masterEndSec - masterStartSec);

  const isInDrop = (t: number) =>
    trackAnalysis.drops.some((d) => t >= d.dropImpactSec - 0.12 && t <= d.endSec + 0.15);

  // Build cut boundary timestamps inside [masterStartSec, masterEndSec]
  const rawBoundaries: number[] = [masterStartSec];

  // Always force a hard angle cut right on any Drop OR Highlight inside the window
  const impactTimes = trackAnalysis.drops
    .map((d) => d.dropImpactSec)
    .filter((t) => t > masterStartSec + 0.6 && t < masterEndSec - 0.6);

  const barsInWindow = trackAnalysis.barsSec.filter(
    (b) => b > masterStartSec + 0.5 && b < masterEndSec - 0.5,
  );
  const beatsInWindow = trackAnalysis.beatsSec.filter(
    (b) => b > masterStartSec + 0.4 && b < masterEndSec - 0.4,
  );

  // Target cut spacing based on preset & musical energy:
  // buildup = 2 bars (~2.4s at 200 BPM); drop = 1 bar (~1.2s) for punchy, 2 beats (~0.6s) for hard, 2 bars for subtle
  const minCutGapBuildup = preset === "hard" ? 1.8 : 2.2;
  const minCutGapDrop = preset === "hard" ? 0.58 : preset === "punchy" ? 1.05 : 1.9;

  const candidates =
    preset === "hard" && beatsInWindow.length > 0
      ? [...impactTimes, ...barsInWindow, ...beatsInWindow.filter((_, idx) => idx % 2 === 0)]
      : [...impactTimes, ...barsInWindow];

  // Fallback rhythmic cuts every ~1.8s if a track has sparse bars
  if (candidates.length === 0) {
    const step = preset === "hard" ? 1.2 : preset === "punchy" ? 1.8 : 2.4;
    for (let t = masterStartSec + step; t < masterEndSec - 0.8; t += step) {
      candidates.push(Number(t.toFixed(3)));
    }
  }

  const sortedCandidates = Array.from(new Set(candidates)).sort((a, b) => a - b);
  const maxCuts = 14; // keep FFmpeg graph clean, fast & rhythmic (max 14 segments)

  for (const cand of sortedCandidates) {
    if (rawBoundaries.length >= maxCuts) break;
    const prev = rawBoundaries[rawBoundaries.length - 1]!;
    const isImpact = impactTimes.some((imp) => Math.abs(imp - cand) < 0.15);
    const minGap = isImpact ? 0.55 : isInDrop(cand) ? minCutGapDrop : minCutGapBuildup;
    if (cand - prev >= minGap && masterEndSec - cand >= 0.55) {
      rawBoundaries.push(Number(cand.toFixed(3)));
    }
  }
  rawBoundaries.push(masterEndSec);

  // Establish take rotation order (optionally guided by Gemini preferredTakeOrder & variationSeed)
  const baseOrder =
    input.preferredTakeOrder && input.preferredTakeOrder.length > 0
      ? input.preferredTakeOrder.filter((idx) => idx >= 0 && idx < ranges.length)
      : ranges.map((_, idx) => idx);
  for (let i = 0; i < ranges.length; i++) {
    if (!baseOrder.includes(i)) baseOrder.push(i);
  }
  const rotatedOrder = baseOrder.map(
    (_, i) => baseOrder[(i + Math.abs(variationSeed)) % baseOrder.length]!,
  );

  // Assign each cut segment to a take that actually covers [segStart, segEnd]
  const segments: EditRecipeSegment[] = [];
  let prevClipId: string | null = null;
  let cursor = 0;

  for (let i = 0; i < rawBoundaries.length - 1; i++) {
    const segStart = rawBoundaries[i]!;
    const segEnd = rawBoundaries[i + 1]!;
    const segDur = segEnd - segStart;
    if (segDur < 0.25) continue;

    // Eligible takes covering this exact master segment (with 0.08s tolerance)
    const covering = rotatedOrder
      .map((idx) => ranges[idx]!)
      .filter((r) => r.masterMin <= segStart + 0.08 && r.masterMax >= segEnd - 0.08);

    const pool = covering.length > 0 ? covering : ranges;
    // Rotate cleanly & avoid picking the exact same take back-to-back if another covers it
    let chosen = pool[cursor % pool.length]!;
    if (pool.length > 1 && chosen.clipId === prevClipId) {
      chosen = pool[(cursor + 1) % pool.length]!;
    }
    cursor++;

    // Merge consecutive segments if only 1 take covered both
    const prevSeg = segments[segments.length - 1];
    if (prevSeg && prevSeg.clipId === chosen.clipId) {
      const clampedEnd = Math.min(
        chosen.durationSec,
        Number((segEnd - chosen.detectedOffsetSec).toFixed(3)),
      );
      prevSeg.sourceEndSec = Math.max(prevSeg.sourceStartSec + 0.25, clampedEnd);
      continue;
    }

    const sourceStartSec = Number(
      Math.max(0, Math.min(chosen.durationSec - 0.3, segStart - chosen.detectedOffsetSec)).toFixed(3),
    );
    const sourceEndSec = Number(
      Math.max(
        sourceStartSec + 0.25,
        Math.min(chosen.durationSec, sourceStartSec + segDur),
      ).toFixed(3),
    );

    segments.push({
      clipId: chosen.clipId,
      sourceStartSec,
      sourceEndSec,
      masterStartSec: Number(segStart.toFixed(3)),
    });
    prevClipId = chosen.clipId;
  }

  // Reuse our beat-synced FX planner for punch-zooms, shakes & drop flash aligned to cuts + beats
  const fxReference = buildSingleTakeEditRecipe({
    clipId: ranges[0]!.clipId,
    clipDurationSec: finalDuration,
    detectedOffsetSec: masterStartSec,
    trackAnalysis,
    preset,
    audioHeadroomDb,
    burnHookOverlay,
    hookOverlayText,
    overrideMasterStartSec: masterStartSec,
    overrideDurationSec: finalDuration,
  });

  // Emphasize angle cut transitions inside drops with subtle punch-zooms
  const fxEvents = [...fxReference.fxEvents];
  for (let i = 1; i < segments.length; i++) {
    const cutRelSec = Number((segments[i]!.masterStartSec - masterStartSec).toFixed(3));
    if (cutRelSec > 0.2 && cutRelSec < finalDuration - 0.2) {
      const hasNearbyZoom = fxEvents.some(
        (e) => e.type === "punch_zoom" && Math.abs(e.timeSec - cutRelSec) < 0.22,
      );
      if (!hasNearbyZoom) {
        fxEvents.push({
          timeSec: cutRelSec,
          type: "punch_zoom",
          intensity: isInDrop(segments[i]!.masterStartSec) ? 0.78 : 0.45,
        });
      }
    }
  }
  fxEvents.sort((a, b) => a.timeSec - b.timeSec);

  return {
    mode: "multi_take",
    preset,
    masterStartSec: Number(masterStartSec.toFixed(3)),
    masterEndSec,
    audioHeadroomDb: Number(Math.max(-6, Math.min(0, audioHeadroomDb)).toFixed(2)),
    burnHookOverlay,
    hookOverlayText: hookOverlayText?.trim() || undefined,
    segments,
    fxEvents,
  };
}

/**
 * Renders a multi-take beat-cut mashup via native FFmpeg:
 * - Seeks directly into each take segment (fast, low RAM)
 * - Normalizes & frame-accurately concatenates segments on beat/bar boundaries
 * - Applies unified beat-synced punch-zooms, damped kick shakes, drop flash & grade
 * - Swaps continuous master audio directly at full uptempo loudness (-1.5dB trim)
 */
export async function renderMultiTakeVideo(params: {
  clipsById: Map<string, string>; // clipId -> storageKey or local path
  masterAudioLocalPath: string;
  recipe: PostEditRecipe;
  outputTitleSlug: string;
  width?: number;
  height?: number;
  fps?: number;
}): Promise<RenderedVideoResult> {
  if (params.recipe.segments.length === 0) {
    throw new Error("Multi-take edit recipe has no segments to render.");
  }

  // Single segment shortcut
  if (params.recipe.segments.length === 1) {
    const onlySeg = params.recipe.segments[0]!;
    const clipSource = params.clipsById.get(onlySeg.clipId);
    if (!clipSource) throw new Error(`Missing source file for clip ${onlySeg.clipId}`);
    return renderSingleTakeVideo({
      rawClipStorageKeyOrPath: clipSource,
      masterAudioLocalPath: params.masterAudioLocalPath,
      recipe: params.recipe,
      outputTitleSlug: params.outputTitleSlug,
      width: params.width,
      height: params.height,
      fps: params.fps,
    });
  }

  const width = params.width ?? 1080;
  const height = params.height ?? 1920;
  const fps = params.fps ?? 30;

  // Ensure every unique raw clip referenced is locally readable
  const resolvedLocalClips = new Map<string, { localPath: string; isTemporary: boolean }>();
  const scratch = getScratchDir();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const outMp4Path = join(scratch, `mashup-${stamp}.mp4`);
  const outThumbPath = join(scratch, `mashup-thumb-${stamp}.jpg`);

  try {
    for (const seg of params.recipe.segments) {
      if (resolvedLocalClips.has(seg.clipId)) continue;
      const source = params.clipsById.get(seg.clipId);
      if (!source) throw new Error(`Missing clip source for ${seg.clipId}`);
      const loc = existsSync(source)
        ? { localPath: source, isTemporary: false }
        : await ensureLocalMediaFile(source);
      resolvedLocalClips.set(seg.clipId, loc);
    }

    const { videoFilter, audioFilter, durationSec } = buildSingleTakeFiltergraph(params.recipe, {
      width,
      height,
      fps,
    });

    // Build FFmpeg args: one fast-seek input per cut segment + final input for master audio
    const ffmpegArgs: string[] = ["-y", "-v", "error"];
    const filterParts: string[] = [];
    const concatInputs: string[] = [];

    // Strip the leading normalize steps from videoFilter since each segment normalizes before concat
    const normalizePrefix = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps},setsar=1,`;
    const postConcatFx = videoFilter.startsWith(normalizePrefix)
      ? videoFilter.slice(normalizePrefix.length)
      : videoFilter;

    for (let i = 0; i < params.recipe.segments.length; i++) {
      const seg = params.recipe.segments[i]!;
      const segDur = Math.max(0.25, Number((seg.sourceEndSec - seg.sourceStartSec).toFixed(3)));
      const localPath = resolvedLocalClips.get(seg.clipId)!.localPath;

      ffmpegArgs.push("-ss", seg.sourceStartSec.toFixed(3), "-t", segDur.toFixed(3), "-i", localPath);
      filterParts.push(
        `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps},setsar=1,setpts=PTS-STARTPTS[s${i}]`,
      );
      concatInputs.push(`[s${i}]`);
    }

    const audioInputIdx = params.recipe.segments.length;
    ffmpegArgs.push(
      "-ss",
      params.recipe.masterStartSec.toFixed(3),
      "-t",
      durationSec.toFixed(3),
      "-i",
      params.masterAudioLocalPath,
    );

    filterParts.push(
      `${concatInputs.join("")}concat=n=${params.recipe.segments.length}:v=1:a=0,setpts=PTS-STARTPTS[vcat]`,
    );
    filterParts.push(`[vcat]${postConcatFx}[vout]`);
    filterParts.push(`[${audioInputIdx}:a]${audioFilter}[aout]`);

    ffmpegArgs.push(
      "-filter_complex",
      filterParts.join(";"),
      "-map",
      "[vout]",
      "-map",
      "[aout]",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-shortest",
      "-movflags",
      "+faststart",
      outMp4Path,
    );

    await runFfmpeg(ffmpegArgs);

    const firstFlash = params.recipe.fxEvents.find((e) => e.type === "drop_flash");
    const thumbTimeSec = Math.min(
      Math.max(0.1, durationSec - 0.2),
      firstFlash ? firstFlash.timeSec + 0.25 : durationSec * 0.35,
    );

    await runFfmpeg([
      "-y",
      "-v",
      "error",
      "-ss",
      thumbTimeSec.toFixed(3),
      "-i",
      outMp4Path,
      "-vframes",
      "1",
      "-q:v",
      "3",
      outThumbPath,
    ]);

    const cleanSlug =
      params.outputTitleSlug
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 36) || "mashup";

    const videoFileName = `${cleanSlug}-mashup-${params.recipe.preset}.mp4`;
    const videoKey = buildStorageKey("rendered", videoFileName);
    const thumbKey = buildStorageKey("thumbs", `${cleanSlug}-mashup.jpg`);

    const [storedVideo, storedThumb] = await Promise.all([
      putMediaObject(videoKey, outMp4Path, "video/mp4"),
      putMediaObject(thumbKey, outThumbPath, "image/jpeg"),
    ]);

    return {
      videoStorageKey: storedVideo.key,
      videoUrl: storedVideo.publicUrl,
      videoFileName,
      videoSizeBytes: storedVideo.sizeBytes,
      thumbnailStorageKey: storedThumb.key,
      thumbnailUrl: storedThumb.publicUrl,
      durationSec,
    };
  } finally {
    for (const p of [outMp4Path, outThumbPath]) {
      if (existsSync(p)) {
        try {
          unlinkSync(p);
        } catch {
          // Ignore scratch cleanup
        }
      }
    }
    for (const loc of resolvedLocalClips.values()) {
      if (loc.isTemporary && existsSync(loc.localPath)) {
        try {
          unlinkSync(loc.localPath);
        } catch {
          // Ignore scratch cleanup
        }
      }
    }
  }
}

export interface RenderedVideoResult {
  videoStorageKey: string;
  videoUrl: string;
  videoFileName: string;
  videoSizeBytes: number;
  thumbnailStorageKey: string;
  thumbnailUrl: string;
  durationSec: number;
}

/**
 * Renders a single-take beat-synced vertical video + JPEG poster thumbnail via native FFmpeg
 * and uploads both outputs to MediaStorage (Local NVMe or Cloudflare R2 / S3).
 */
export async function renderSingleTakeVideo(params: {
  rawClipStorageKeyOrPath: string;
  masterAudioLocalPath: string;
  recipe: PostEditRecipe;
  outputTitleSlug: string;
  width?: number;
  height?: number;
  fps?: number;
}): Promise<RenderedVideoResult> {
  const seg = params.recipe.segments[0];
  if (!seg) {
    throw new Error("Edit recipe contains no video segment to render.");
  }

  const clipLocal = existsSync(params.rawClipStorageKeyOrPath)
    ? { localPath: params.rawClipStorageKeyOrPath, isTemporary: false }
    : await ensureLocalMediaFile(params.rawClipStorageKeyOrPath);

  const scratch = getScratchDir();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const outMp4Path = join(scratch, `render-${stamp}.mp4`);
  const outThumbPath = join(scratch, `thumb-${stamp}.jpg`);

  try {
    const { videoFilter, audioFilter, durationSec } = buildSingleTakeFiltergraph(params.recipe, {
      width: params.width,
      height: params.height,
      fps: params.fps,
    });

    // 1. Render vertical H.264 + direct master AAC
    await runFfmpeg([
      "-y",
      "-v",
      "error",
      "-ss",
      seg.sourceStartSec.toFixed(3),
      "-t",
      durationSec.toFixed(3),
      "-i",
      clipLocal.localPath,
      "-ss",
      params.recipe.masterStartSec.toFixed(3),
      "-t",
      durationSec.toFixed(3),
      "-i",
      params.masterAudioLocalPath,
      "-filter_complex",
      `[0:v]${videoFilter}[vout];[1:a]${audioFilter}[aout]`,
      "-map",
      "[vout]",
      "-map",
      "[aout]",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-shortest",
      "-movflags",
      "+faststart",
      outMp4Path,
    ]);

    // 2. Extract crisp poster thumbnail near the drop impact (or 35% into clip)
    const firstFlash = params.recipe.fxEvents.find((e) => e.type === "drop_flash");
    const thumbTimeSec = Math.min(
      Math.max(0.1, durationSec - 0.2),
      firstFlash ? firstFlash.timeSec + 0.25 : durationSec * 0.35,
    );

    await runFfmpeg([
      "-y",
      "-v",
      "error",
      "-ss",
      thumbTimeSec.toFixed(3),
      "-i",
      outMp4Path,
      "-vframes",
      "1",
      "-q:v",
      "3",
      outThumbPath,
    ]);

    const cleanSlug =
      params.outputTitleSlug
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 40) || "auto-edit";

    const videoFileName = `${cleanSlug}-${params.recipe.preset}.mp4`;
    const videoKey = buildStorageKey("rendered", videoFileName);
    const thumbKey = buildStorageKey("thumbs", `${cleanSlug}.jpg`);

    const [storedVideo, storedThumb] = await Promise.all([
      putMediaObject(videoKey, outMp4Path, "video/mp4"),
      putMediaObject(thumbKey, outThumbPath, "image/jpeg"),
    ]);

    return {
      videoStorageKey: storedVideo.key,
      videoUrl: storedVideo.publicUrl,
      videoFileName,
      videoSizeBytes: storedVideo.sizeBytes,
      thumbnailStorageKey: storedThumb.key,
      thumbnailUrl: storedThumb.publicUrl,
      durationSec,
    };
  } finally {
    for (const p of [outMp4Path, outThumbPath]) {
      if (existsSync(p)) {
        try {
          unlinkSync(p);
        } catch {
          // Ignore scratch cleanup errors
        }
      }
    }
    if (clipLocal.isTemporary && existsSync(clipLocal.localPath)) {
      try {
        unlinkSync(clipLocal.localPath);
      } catch {
        // Ignore scratch cleanup errors
      }
    }
  }
}
