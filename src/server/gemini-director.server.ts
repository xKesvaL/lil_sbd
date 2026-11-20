import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { EditPreset, TrackAudioAnalysis } from "#/db/schema";
import { ensureLocalMediaFile, getScratchDir } from "./media-storage.server";

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export const geminiDirectionOutputSchema = z.object({
  activeDancingStartSec: z.number().min(0),
  activeDancingEndSec: z.number().min(0),
  recommendedMasterStartSec: z.number().min(0),
  recommendedDurationSec: z.number().min(4).max(30),
  recommendedPreset: z.enum(["subtle", "punchy", "hard"]),
  preferredTakeOrder: z.array(z.number().int().min(0)).optional(),
  sceneSummary: z.string().min(1).max(180),
  directorNotes: z.string().min(1).max(260),
  title: z.string().min(1).max(100),
  caption: z.string().min(1).max(600),
  hookOverlayText: z.string().max(90),
  hashtags: z.array(z.string().min(1)).min(1).max(8),
});

export type GeminiDirectionOutput = z.infer<typeof geminiDirectionOutputSchema>;

export const geminiCopyOutputSchema = z.object({
  title: z.string().min(1).max(100),
  caption: z.string().min(1).max(600),
  hookOverlayText: z.string().max(90),
  hashtags: z.array(z.string().min(1)).min(1).max(8),
});

export type GeminiCopyOutput = z.infer<typeof geminiCopyOutputSchema>;

export interface DirectorTrackContext {
  title: string;
  bpm: number;
  albumOrChapter?: string | null;
  releaseDate?: Date | string | null;
  stageName: string;
  defaultBioLink: string;
  streamingUrl?: string | null;
}

export interface DirectClipResult {
  direction: GeminiDirectionOutput;
  source: "gemini" | "deterministic_fallback";
  model: string;
  fallbackReason?: string;
}

export function resolveGeminiConfig(profileModelOverride?: string | null): {
  apiKey: string | null;
  model: string;
} {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || null;
  const model =
    profileModelOverride?.trim() || process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  return { apiKey, model };
}

function normalizeHashtags(tags: string[]): string[] {
  const cleaned = tags
    .map((t) => t.trim().replace(/\s+/g, ""))
    .filter(Boolean)
    .map((t) => (t.startsWith("#") ? t.toLowerCase() : `#${t.toLowerCase()}`));
  return Array.from(new Set(cleaned)).slice(0, 6);
}

function runFfmpegProxy(args: string[]): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const proc = spawn("ffmpeg", args, { windowsHide: true });
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 12_000) stderr += chunk.toString("utf8");
    });
    proc.on("error", (err) => rejectPromise(new Error(`FFmpeg proxy error: ${err.message}`)));
    proc.on("close", (code) => {
      if (code !== 0) {
        rejectPromise(new Error(`FFmpeg proxy exited (${code}): ${stderr.slice(-400).trim()}`));
        return;
      }
      resolvePromise();
    });
  });
}

/**
 * Generates a tiny, token-efficient 360p @ 2fps muted H.264 proxy (typically 200KB–1MB)
 * in local NVMe scratch so Gemini can inspect visual energy & camera walk-up without burning tokens.
 */
export async function createGeminiVideoProxy(
  rawClipLocalPath: string,
  maxDurationSec = 75,
): Promise<{ proxyPath: string; sizeBytes: number }> {
  const scratch = getScratchDir();
  const proxyPath = join(
    scratch,
    `gemini-proxy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp4`,
  );

  await runFfmpegProxy([
    "-y",
    "-v",
    "error",
    "-t",
    String(maxDurationSec),
    "-i",
    rawClipLocalPath,
    "-an",
    "-vf",
    "fps=2,scale=360:-2:flags=fast_bilinear,format=yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    "34",
    "-movflags",
    "+faststart",
    proxyPath,
  ]);

  const sizeBytes = statSync(proxyPath).size;
  return { proxyPath, sizeBytes };
}

/**
 * Deterministic direct/non-corny fallback when GEMINI_API_KEY is unset or rate-limited.
 */
export function buildDeterministicDirectionFallback(params: {
  clipDurationSec: number;
  detectedOffsetSec: number;
  trackAnalysis: TrackAudioAnalysis;
  trackContext: DirectorTrackContext;
  preferredPreset?: EditPreset;
  variationIndex?: number;
}): GeminiDirectionOutput {
  const {
    clipDurationSec,
    detectedOffsetSec,
    trackAnalysis,
    trackContext,
    preferredPreset = "punchy",
    variationIndex = 0,
  } = params;

  const validMin = Math.max(0, detectedOffsetSec);
  const validMax = Math.min(trackAnalysis.durationSec, detectedOffsetSec + clipDurationSec);
  const overlap = Math.max(1, validMax - validMin);
  const durationSec = Math.min(overlap, Math.max(4, Math.min(20, overlap > 20 ? 17 : overlap)));

  const overlappingDrops = trackAnalysis.drops.filter(
    (d) => d.dropImpactSec >= validMin + 1 && d.dropImpactSec <= validMax - 2.5,
  );
  const chosenDrop =
    overlappingDrops.length > 0
      ? overlappingDrops[variationIndex % overlappingDrops.length]
      : undefined;

  let masterStartSec = validMin;
  if (chosenDrop) {
    masterStartSec = Math.max(
      validMin,
      Math.min(validMax - durationSec, chosenDrop.dropImpactSec - 3.5),
    );
  } else if (overlap > durationSec + 1.2) {
    masterStartSec = validMin + Math.min(1.5, (overlap - durationSec) * 0.4);
  }

  const rawStart = Math.max(0, Number((masterStartSec - detectedOffsetSec).toFixed(2)));
  const rawEnd = Math.min(clipDurationSec, Number((rawStart + durationSec).toFixed(2)));

  const isUnreleased =
    trackContext.releaseDate && new Date(trackContext.releaseDate).getTime() > Date.now();
  const link = trackContext.streamingUrl || trackContext.defaultBioLink || "https://lilsbd.com";

  const copyVariations: GeminiCopyOutput[] = [
    {
      title: `${trackContext.title} (${trackContext.bpm} BPM) — ${trackContext.stageName}`,
      caption: isUnreleased
        ? `Testing ${trackContext.title} (${trackContext.bpm} BPM) before release. Zaag pressure with a real melodic backbone.`
        : `${trackContext.title} (${trackContext.bpm} BPM). Out everywhere — ${link}`,
      hookOverlayText: `${trackContext.title} · ${trackContext.bpm} BPM`,
      hashtags: ["#uptempohardcore", "#zaagkick", "#harddance", "#lilsbd"],
    },
    {
      title: `${trackContext.title} — Drop Check (${trackContext.bpm} BPM)`,
      caption: isUnreleased
        ? `Unreleased ${trackContext.bpm} BPM cut: ${trackContext.title}. Still dialing in the final kick balance.`
        : `Main drop from ${trackContext.title}. Full track on all streaming platforms — ${link}`,
      hookOverlayText: `Wait for the switch — ${trackContext.title}`,
      hashtags: ["#uptempo", "#zaagkicks", "#hardcore", "#lilsbd"],
    },
    {
      title: `${trackContext.stageName} — ${trackContext.title} (${trackContext.bpm} BPM)`,
      caption: isUnreleased
        ? `Studio preview of ${trackContext.title}. Dropping soon.`
        : `${trackContext.title} — sharp zaag kicks, zero filler. Listen at ${link}`,
      hookOverlayText: `${trackContext.bpm} BPM zaag pressure`,
      hashtags: ["#uptempohardcore", "#harddance", "#rawtempo", "#lilsbd"],
    },
  ];

  const chosenCopy = copyVariations[Math.abs(variationIndex) % copyVariations.length]!;

  return {
    activeDancingStartSec: rawStart,
    activeDancingEndSec: rawEnd,
    recommendedMasterStartSec: Number(masterStartSec.toFixed(2)),
    recommendedDurationSec: Number(durationSec.toFixed(2)),
    recommendedPreset: preferredPreset,
    sceneSummary: "Vertical performance take synced to track drop.",
    directorNotes: chosenDrop
      ? `DSP framed ${chosenDrop.label} (${chosenDrop.dropImpactSec.toFixed(1)}s) with buildup lead-in.`
      : "DSP trimmed start/end buffer and aligned beat grid.",
    ...chosenCopy,
  };
}

function parseJsonFromGeminiResponse(rawJson: unknown): unknown {
  const response = rawJson as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
    error?: { message?: string };
  };

  if (response.error?.message) {
    throw new Error(`Gemini API error: ${response.error.message}`);
  }

  const text = response.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  // Strip optional markdown code fences if present
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(cleaned);
}

/**
 * Calls Gemini with a tiny 360p @ 2fps proxy + DSP beat/drop JSON in one structured call.
 * Automatically falls back to deterministic DSP direction if API key is missing or rate-limited.
 */
export async function directClipWithGemini(params: {
  rawClipStorageKeyOrPath: string;
  clipDurationSec: number;
  detectedOffsetSec: number;
  syncConfidence: number;
  trackAnalysis: TrackAudioAnalysis;
  trackContext: DirectorTrackContext;
  preferredPreset?: EditPreset;
  profileGeminiModel?: string | null;
  variationSeed?: number;
  previousTitle?: string | null;
  takeCount?: number;
}): Promise<DirectClipResult> {
  const { apiKey, model } = resolveGeminiConfig(params.profileGeminiModel);
  const fallback = () =>
    buildDeterministicDirectionFallback({
      clipDurationSec: params.clipDurationSec,
      detectedOffsetSec: params.detectedOffsetSec,
      trackAnalysis: params.trackAnalysis,
      trackContext: params.trackContext,
      preferredPreset: params.preferredPreset,
      variationIndex: params.variationSeed ?? 0,
    });

  if (!apiKey) {
    return {
      direction: fallback(),
      source: "deterministic_fallback",
      model,
      fallbackReason: "GEMINI_API_KEY not configured",
    };
  }

  const clipLocal = existsSync(params.rawClipStorageKeyOrPath)
    ? { localPath: params.rawClipStorageKeyOrPath, isTemporary: false }
    : await ensureLocalMediaFile(params.rawClipStorageKeyOrPath);

  let proxyPath: string | null = null;
  try {
    const proxy = await createGeminiVideoProxy(clipLocal.localPath, 75);
    proxyPath = proxy.proxyPath;

    // Inline upload cap (~14 MB safety ceiling; 360p@2fps is normally < 1.5 MB)
    if (proxy.sizeBytes > 14 * 1024 * 1024) {
      throw new Error("Video proxy exceeds 14MB inline limit");
    }

    const proxyBase64 = readFileSync(proxyPath).toString("base64");
    const validMasterMin = Math.max(0, params.detectedOffsetSec);
    const validMasterMax = Math.min(
      params.trackAnalysis.durationSec,
      params.detectedOffsetSec + params.clipDurationSec,
    );

    const dropsInRange = params.trackAnalysis.drops.map((d) => ({
      label: d.label,
      buildupStartMasterSec: d.startSec,
      dropImpactMasterSec: d.dropImpactSec,
      endMasterSec: d.endSec,
    }));

    const isUnreleased =
      params.trackContext.releaseDate &&
      new Date(params.trackContext.releaseDate).getTime() > Date.now();

    const promptText = [
      `You are the video editor & copywriter for ${params.trackContext.stageName}, an uptempo hardcore / hard dance artist (zaag kicks with a real musical backbone).`,
      `Watch this 2fps low-res proxy of a raw vertical dancing clip and inspect the DSP audio timeline below.`,
      ``,
      `TRACK & SYNC DATA:`,
      `- Track: "${params.trackContext.title}" (${params.trackContext.bpm} BPM)${isUnreleased ? " [UNRELEASED WIP DEMO]" : " [RELEASED]"}`,
      `- Raw clip duration: ${params.clipDurationSec.toFixed(2)}s`,
      `- Acoustic sync mapping: masterTimeSec = rawClipTimeSec + ${params.detectedOffsetSec.toFixed(2)} (confidence ${Math.round(params.syncConfidence * 100)}%)`,
      `- Valid overlap in master track: ${validMasterMin.toFixed(2)}s to ${validMasterMax.toFixed(2)}s`,
      `- Detected drops in track: ${JSON.stringify(dropsInRange)}`,
      `- Bio / streaming link: ${params.trackContext.streamingUrl || params.trackContext.defaultBioLink}`,
      params.takeCount && params.takeCount > 1
        ? `- MULTI-TAKE MASHUP: ${params.takeCount} synced camera angles will be beat-cut together on bars & kick switches. Optionally return preferredTakeOrder (0-based array of take indices) for the cut order.`
        : "",
      params.variationSeed
        ? `- VARIATION REQUEST #${params.variationSeed}: Pick a fresh angle/caption different from "${params.previousTitle || "previous draft"}".`
        : "",
      ``,
      `EDITING & TONE RULES:`,
      `1. Trim out any dead air at the start/end where the artist is setting up the phone, walking back, or walking toward the camera to stop recording.`,
      `2. Choose recommendedMasterStartSec inside [${validMasterMin.toFixed(2)}, ${Math.max(validMasterMin, validMasterMax - 4).toFixed(2)}] and recommendedDurationSec between 10 and 22s (clamped to available overlap) so the edit opens on buildup/energy and hits the main drop cleanly.`,
      `3. Pick recommendedPreset ("subtle" | "punchy" | "hard") matching the clip's energy and lighting.`,
      `4. Write English-only copy in a professional, human, direct, NON-CORNY artist voice.`,
      `   STRICTLY AVOID cringe engagement bait or clichés (no "WAIT TILL THE END", "ARE YOU READY?!", "DROP A 🔥", "THIS SLAPS", or emoji spam).`,
      `5. Return ONLY valid JSON matching this exact shape:`,
      `{"activeDancingStartSec":number,"activeDancingEndSec":number,"recommendedMasterStartSec":number,"recommendedDurationSec":number,"recommendedPreset":"subtle"|"punchy"|"hard","sceneSummary":string,"directorNotes":string,"title":string,"caption":string,"hookOverlayText":string,"hashtags":string[]}`,
    ]
      .filter(Boolean)
      .join("\n");

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                inline_data: {
                  mime_type: "video/mp4",
                  data: proxyBase64,
                },
              },
              { text: promptText },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: params.variationSeed ? 0.85 : 0.45,
        },
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      const msg = (json as { error?: { message?: string } })?.error?.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }

    const parsedRaw = parseJsonFromGeminiResponse(json);
    const validated = geminiDirectionOutputSchema.parse(parsedRaw);

    // Clamp Gemini's timestamps safely within valid overlap bounds
    const maxAllowedDur = Math.max(4, validMasterMax - validMasterMin);
    const clampedDur = Math.min(maxAllowedDur, Math.max(4, Math.min(26, validated.recommendedDurationSec)));
    const clampedMasterStart = Math.max(
      validMasterMin,
      Math.min(validMasterMax - clampedDur, validated.recommendedMasterStartSec),
    );

    return {
      direction: {
        ...validated,
        recommendedMasterStartSec: Number(clampedMasterStart.toFixed(2)),
        recommendedDurationSec: Number(clampedDur.toFixed(2)),
        hashtags: normalizeHashtags(validated.hashtags),
      },
      source: "gemini",
      model,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Gemini direction failed";
    return {
      direction: fallback(),
      source: "deterministic_fallback",
      model,
      fallbackReason: reason.slice(0, 200),
    };
  } finally {
    if (proxyPath && existsSync(proxyPath)) {
      try {
        unlinkSync(proxyPath);
      } catch {
        // Ignore scratch cleanup errors
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

/**
 * Fast text-only copy re-roll (<1s, ~300 tokens) when the user likes the rendered edit
 * and wants fresh non-corny title, caption, hook overlay text, and hashtags.
 */
export async function rerollCopyWithGemini(params: {
  trackContext: DirectorTrackContext;
  sceneSummary?: string | null;
  previousCaption?: string | null;
  profileGeminiModel?: string | null;
  variationSeed?: number;
}): Promise<{
  copy: GeminiCopyOutput;
  source: "gemini" | "deterministic_fallback";
  model: string;
}> {
  const { apiKey, model } = resolveGeminiConfig(params.profileGeminiModel);
  const seed = params.variationSeed ?? Math.floor(Math.random() * 1000) + 1;

  const fallbackCopy = (): GeminiCopyOutput => {
    const link =
      params.trackContext.streamingUrl || params.trackContext.defaultBioLink || "https://lilsbd.com";
    const variations: GeminiCopyOutput[] = [
      {
        title: `${params.trackContext.title} — ${params.trackContext.bpm} BPM`,
        caption: `Full drop energy from ${params.trackContext.title}. Built around crisp zaag pressure and a real melodic backbone. Stream: ${link}`,
        hookOverlayText: `${params.trackContext.title} · ${params.trackContext.bpm} BPM`,
        hashtags: ["#uptempohardcore", "#zaagkick", "#harddance", "#lilsbd"],
      },
      {
        title: `${params.trackContext.stageName} — ${params.trackContext.title} Drop`,
        caption: `Testing ${params.trackContext.title} at ${params.trackContext.bpm} BPM. No filler, straight to impact. ${link}`,
        hookOverlayText: `Wait for the kick switch`,
        hashtags: ["#uptempo", "#zaagkicks", "#hardcore", "#lilsbd"],
      },
      {
        title: `${params.trackContext.title} (${params.trackContext.bpm} BPM Cut)`,
        caption: `${params.trackContext.title} out now on all platforms — link: ${link}`,
        hookOverlayText: `${params.trackContext.bpm} BPM uptempo`,
        hashtags: ["#uptempohardcore", "#harddance", "#lilsbd", "#newmusic"],
      },
    ];
    return variations[seed % variations.length]!;
  };

  if (!apiKey) {
    return { copy: fallbackCopy(), source: "deterministic_fallback", model };
  }

  try {
    const prompt = [
      `Write a fresh short-form video copy pack (YouTube Shorts, Instagram Reels, TikTok) for artist ${params.trackContext.stageName}.`,
      `Track: "${params.trackContext.title}" (${params.trackContext.bpm} BPM).`,
      params.sceneSummary ? `Visual scene: ${params.sceneSummary}.` : "",
      `Bio/track link: ${params.trackContext.streamingUrl || params.trackContext.defaultBioLink}.`,
      params.previousCaption ? `Avoid repeating this previous caption: "${params.previousCaption.slice(0, 180)}"` : "",
      `Tone: English-only, direct, human, professional, zero corny hype clichés or emoji spam.`,
      `Return ONLY valid JSON: {"title":string,"caption":string,"hookOverlayText":string,"hashtags":string[]}`,
    ]
      .filter(Boolean)
      .join("\n");

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.9,
        },
      }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const parsed = geminiCopyOutputSchema.parse(parseJsonFromGeminiResponse(json));
    return {
      copy: {
        ...parsed,
        hashtags: normalizeHashtags(parsed.hashtags),
      },
      source: "gemini",
      model,
    };
  } catch {
    return { copy: fallbackCopy(), source: "deterministic_fallback", model };
  }
}
