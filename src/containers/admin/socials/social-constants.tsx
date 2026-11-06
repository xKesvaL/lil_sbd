import {
  IconBolt,
  IconBooks,
  IconBrandInstagram,
  IconBrandTiktok,
  IconBrandYoutube,
  IconCheck,
  IconDisc,
  IconFlame,
  IconLayoutCards,
  IconMicrophone2,
  IconMovie,
  IconSparkles,
  IconVideo,
  IconWand,
} from "@tabler/icons-react";
import type { ComponentType, SVGProps } from "react";
import type {
  ContentPillar,
  IdeaCategory,
  PerformanceRating,
  PostStatus,
  SocialPlatform,
} from "#/db/schema";

export const PLATFORM_META: Record<
  SocialPlatform,
  {
    label: string;
    shortLabel: string;
    Icon: ComponentType<SVGProps<SVGSVGElement>>;
    badgeClass: string;
    optimalHashtagCount: [number, number];
  }
> = {
  instagram_reels: {
    label: "Instagram Reels",
    shortLabel: "IG Reel",
    Icon: IconBrandInstagram,
    badgeClass: "border-pink-500/40 bg-pink-500/15 text-pink-300",
    optimalHashtagCount: [3, 6],
  },
  instagram_carousel: {
    label: "Instagram Carousel",
    shortLabel: "IG Carousel",
    Icon: IconLayoutCards,
    badgeClass: "border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-300",
    optimalHashtagCount: [3, 8],
  },
  instagram_story: {
    label: "Instagram Story",
    shortLabel: "IG Story",
    Icon: IconBrandInstagram,
    badgeClass: "border-amber-500/40 bg-amber-500/15 text-amber-300",
    optimalHashtagCount: [0, 2],
  },
  tiktok: {
    label: "TikTok",
    shortLabel: "TikTok",
    Icon: IconBrandTiktok,
    badgeClass: "border-cyan-500/40 bg-cyan-500/15 text-cyan-300",
    optimalHashtagCount: [3, 5],
  },
  youtube_shorts: {
    label: "YouTube Shorts",
    shortLabel: "YT Short",
    Icon: IconBrandYoutube,
    badgeClass: "border-red-500/40 bg-red-500/15 text-red-300",
    optimalHashtagCount: [3, 5],
  },
};

export const STATUS_COLUMNS: Array<{
  id: PostStatus;
  label: string;
  description: string;
  dotClass: string;
  badgeClass: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}> = [
  {
    id: "idea",
    label: "Idea Backlog",
    description: "Hooks & concepts ready to record",
    dotClass: "bg-slate-400",
    badgeClass: "border-slate-500/40 bg-slate-500/15 text-slate-300",
    Icon: IconSparkles,
  },
  {
    id: "filming",
    label: "DAW / Filming",
    description: "Screen recording or studio capture",
    dotClass: "bg-amber-400",
    badgeClass: "border-amber-500/40 bg-amber-500/15 text-amber-300",
    Icon: IconVideo,
  },
  {
    id: "editing",
    label: "Editing",
    description: "Cutting clips, text hooks & audio sync",
    dotClass: "bg-violet-400",
    badgeClass: "border-violet-500/40 bg-violet-500/15 text-violet-300",
    Icon: IconMovie,
  },
  {
    id: "ready",
    label: "Ready to Post",
    description: "Exported & caption-ready in buffer",
    dotClass: "bg-emerald-400",
    badgeClass: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
    Icon: IconBolt,
  },
  {
    id: "posted",
    label: "Posted",
    description: "Live on socials & tracking metrics",
    dotClass: "bg-primary",
    badgeClass: "border-primary/40 bg-primary/20 text-primary-foreground",
    Icon: IconCheck,
  },
];

export const PILLAR_META: Record<
  ContentPillar,
  {
    label: string;
    badgeClass: string;
    Icon: ComponentType<SVGProps<SVGSVGElement>>;
  }
> = {
  drop_showcase: {
    label: "Drop Showcase",
    badgeClass: "border-purple-500/40 bg-purple-500/15 text-purple-300",
    Icon: IconFlame,
  },
  sound_design_tutorial: {
    label: "Zaag & Sound Design",
    badgeClass: "border-indigo-500/40 bg-indigo-500/15 text-indigo-300",
    Icon: IconWand,
  },
  behind_the_scenes: {
    label: "Studio & Stem Breakdown",
    badgeClass: "border-sky-500/40 bg-sky-500/15 text-sky-300",
    Icon: IconMicrophone2,
  },
  meme_relatable: {
    label: "Hot Take / A-B Poll",
    badgeClass: "border-orange-500/40 bg-orange-500/15 text-orange-300",
    Icon: IconBolt,
  },
  course_funnel: {
    label: "Free HDM Course Funnel",
    badgeClass: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
    Icon: IconBooks,
  },
  release_promo: {
    label: "Release Promo",
    badgeClass: "border-pink-500/40 bg-pink-500/15 text-pink-300",
    Icon: IconDisc,
  },
};

export const IDEA_CATEGORY_LABELS: Record<IdeaCategory, string> = {
  kick_sound_design: "Zaag & Kick Surgery",
  drop_reaction: "Fakeouts & Drop Switches",
  gym_hard_edit: "Gym / SBD Heavy Edits",
  producer_hot_take: "Producer Hot Takes",
  course_teaser: "Free HDM Course Funnels",
  release_story: "Direct Release Storytelling",
};

export const PERFORMANCE_RATING_META: Record<
  PerformanceRating,
  { label: string; badgeClass: string }
> = {
  viral: {
    label: "Viral Outlier",
    badgeClass: "border-emerald-500/50 bg-emerald-500/20 text-emerald-300",
  },
  above_average: {
    label: "Above Average",
    badgeClass: "border-sky-500/50 bg-sky-500/20 text-sky-300",
  },
  average: {
    label: "Solid Baseline",
    badgeClass: "border-slate-500/50 bg-slate-500/20 text-slate-300",
  },
  underperformed: {
    label: "Underperformed",
    badgeClass: "border-rose-500/50 bg-rose-500/20 text-rose-300",
  },
};
