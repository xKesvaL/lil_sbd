import { and, eq } from "drizzle-orm";
import { CAMPAIGN_ROLLOUT_BLUEPRINTS } from "#/lib/social-blueprints";
import { songs } from "#/lib/songs";
import { db, ensureSchemaInitialized } from "./index";
import {
  artistCatalogItems,
  artistProfiles,
  type ContentPillar,
  hashtagPresets,
  type IdeaCategory,
  type IdeaDifficulty,
  ideaTemplates,
  type SocialPlatform,
  socialPosts,
} from "./schema";

export { CAMPAIGN_ROLLOUT_BLUEPRINTS };

export interface SystemIdeaSeed {
  id: string;
  category: IdeaCategory;
  pillar: ContentPillar;
  title: string;
  description: string;
  difficulty: IdeaDifficulty;
  recommendedPlatforms: SocialPlatform[];
  hookFormulaEn: string;
  hookFormulaFr: string;
  hookVariantsEn: {
    curiosity: string;
    contrarian: string;
    tutorial: string;
    pov: string;
    showcase: string;
  };
  hookVariantsFr: {
    curiosity: string;
    contrarian: string;
    tutorial: string;
    pov: string;
    showcase: string;
  };
  captionTemplateEn: string;
  captionTemplateFr: string;
  defaultCtaEn: string;
  defaultCtaFr: string;
  defaultShotList: string[];
  suggestedHashtags: string[];
  whyItWorks: string;
}

export const SYSTEM_IDEA_TEMPLATES: SystemIdeaSeed[] = [
  {
    id: "sys-idea-zaag-anatomy",
    category: "kick_sound_design",
    pillar: "sound_design_tutorial",
    title: "Zaag Kick Anatomy: Muddy vs. Surgical",
    description:
      "Show the exact EQ & distortion chain decision that turns an uncontrolled wall of noise into a sharp zaag kick that still hits in a mix.",
    difficulty: "daw_capture",
    recommendedPlatforms: ["instagram_reels", "tiktok", "youtube_shorts"],
    hookFormulaEn: "Why 90% of zaag kicks sound like muddy noise (and how I fixed mine on {track_title})",
    hookFormulaFr:
      "Pourquoi 90% des zaag kicks sonnent brouillons (et comment j'ai réglé ça sur {track_title})",
    hookVariantsEn: {
      curiosity: "The 1 EQ move that saved the zaag kick in {track_title}",
      contrarian: "Pushing distortion harder is actually making your kick weaker.",
      tutorial: "How to build a {bpm} BPM zaag kick that doesn't swallow the whole mix:",
      pov: "POV: You finally tame the resonant peak on a 200 BPM zaag kick",
      showcase: "Before vs. After cleaning up the low-mid pressure on {track_title}",
    },
    hookVariantsFr: {
      curiosity: "Le seul réglage d'EQ qui a sauvé le zaag kick de {track_title}",
      contrarian: "Pousser la distorsion plus fort rend en fait ton kick plus faible.",
      tutorial: "Comment créer un zaag kick à {bpm} BPM sans noyer tout le mix :",
      pov: "POV : Tu maîtrises enfin la résonance sur un zaag kick à 200 BPM",
      showcase: "Avant / Après nettoyage de la pression bas-médium sur {track_title}",
    },
    captionTemplateEn:
      "Making a loud zaag kick takes 30 seconds. Making one that actually serves the track without turning the drop into flat white noise is where the real work happens.\n\nOn {track_title} ({bpm} BPM), the trick wasn't adding another distortion stage—it was carving the 250–400Hz mud before the clipper so the fundamental and the crunch both breathe.\n\n1. Pitch envelope locked to the sub tail\n2. Pre-distortion surgical notch\n3. Controlled stereo width above 600Hz only",
    captionTemplateFr:
      "Faire un zaag kick fort prend 30 secondes. En faire un qui sert vraiment le morceau sans transformer le drop en bruit blanc plat, c'est là que tout se joue.\n\nSur {track_title} ({bpm} BPM), le secret n'était pas de rajouter une distorsion de plus, mais de creuser la boue entre 250 et 400Hz avant le clipper.\n\n1. Pitch envelope calé sur le sub\n2. Notch chirurgical pré-distorsion\n3. Largeur stéréo contrôlée uniquement au-dessus de 600Hz",
    defaultCtaEn: "I break down the full kick chain step-by-step in my free HDM course — link in bio.",
    defaultCtaFr: "Je détaille toute la chaîne de kick étape par étape dans mon cours HDM gratuit — lien en bio.",
    defaultShotList: [
      "0-2s: Play the muddy/uncontrolled version of the kick with red warning text overlay",
      "2-5s: Bypass/enable the pre-distortion EQ & clipper so the viewer hears the instant clarity jump",
      "5-12s: Zoom in on the spectrum analyzer and distortion plugin curve",
      "12-18s: Drop into the full context of the track for 4 bars so they hear how it sits",
    ],
    suggestedHashtags: [
      "#uptempohardcore",
      "#zaagkick",
      "#harddanceproducer",
      "#musicproductiontips",
      "#sounddesign",
    ],
    whyItWorks:
      "Immediate sonic contrast in the first 2.5 seconds triggers high retention and saves from fellow producers while showcasing your track's drop.",
  },
  {
    id: "sys-idea-fakeout-switch",
    category: "drop_reaction",
    pillar: "drop_showcase",
    title: "The Fakeout-to-Second-Kick Switch Test",
    description:
      "Let the melody or tension build, hit the fakeout, and capture the exact moment the heavier kick switch lands.",
    difficulty: "quick_5min",
    recommendedPlatforms: ["tiktok", "instagram_reels", "youtube_shorts"],
    hookFormulaEn: "Wait for the 2nd kick switch on {track_title} ({bpm} BPM)...",
    hookFormulaFr: "Attends le 2ème switch de kick sur {track_title} ({bpm} BPM)...",
    hookVariantsEn: {
      curiosity: "Did I go too far with the second kick in {track_title}?",
      contrarian: "Uptempo doesn't have to be brainless noise. Listen to how the melody sets up this drop:",
      tutorial: "How tension + 1 beat of silence makes a {bpm} BPM drop hit 10x harder",
      pov: "POV: It's 4AM at the festival and the DJ drops this kick switch",
      showcase: "{track_title} — {bpm} BPM Zaag & Melody contrast",
    },
    hookVariantsFr: {
      curiosity: "Je suis allé trop loin sur le 2ème kick de {track_title} ?",
      contrarian: "L'uptempo n'a pas besoin d'être du bruit sans âme. Écoute comment la mélodie prépare ce drop :",
      tutorial: "Comment la tension + 1 temps de silence fait taper un drop à {bpm} BPM 10x plus fort",
      pov: "POV : Il est 4h du mat en festival et le DJ lâche ce switch de kick",
      showcase: "{track_title} — Contraste Mélodie & Zaag à {bpm} BPM",
    },
    captionTemplateEn:
      "Heavy enough for a late set, structured enough that you still remember the track after it ends.\n\n{track_title} is built around that contrast: a real melodic buildup that pulls you in, followed by a {bpm} BPM zaag switch that doesn't hold back.",
    captionTemplateFr:
      "Assez lourd pour une fin de set, assez construit pour qu'on retienne vraiment le morceau après.\n\n{track_title} repose sur ce contraste : une vraie montée mélodique qui installe la tension, suivie d'un switch zaag à {bpm} BPM sans compromis.",
    defaultCtaEn: "Stream {track_title} on Spotify, SoundCloud & Apple Music — link in bio.",
    defaultCtaFr: "Écoute {track_title} sur Spotify, SoundCloud & Apple Music — lien en bio.",
    defaultShotList: [
      "0-4s: Start 2 bars before the drop (hand on studio monitor or DAW playhead rushing toward the marker)",
      "4-7s: The fakeout hits — cut camera angle or zoom on the waveform gap",
      "7-15s: Main zaag kick lands — let the audio speak without talking over it",
    ],
    suggestedHashtags: [
      "#uptempo",
      "#hardcoremusic",
      "#zaag",
      "#hardstylefamily",
      "#newmusic",
    ],
    whyItWorks:
      "Open loops ('Wait for the 2nd switch') push average watch time past 100%, which is the #1 signal for TikTok and Reels distribution.",
  },
  {
    id: "sys-idea-gym-pr-soundtrack",
    category: "gym_hard_edit",
    pillar: "drop_showcase",
    title: "Heavy Lift / Squat Day PR Tempo Check",
    description:
      "Pair your hardest drop with heavy gym/powerlifting energy (SBD = Squat Bench Deadlift crossover appeal).",
    difficulty: "quick_5min",
    recommendedPlatforms: ["tiktok", "instagram_reels", "youtube_shorts"],
    hookFormulaEn: "If this {bpm} BPM drop doesn't add +10kg to your squat, nothing will.",
    hookFormulaFr: "Si ce drop à {bpm} BPM ne rajoute pas +10kg à ton squat, rien ne le fera.",
    hookVariantsEn: {
      curiosity: "Rate this {bpm} BPM drop for a heavy top set (1-10)",
      contrarian: "Commercial gym playlists are putting you to sleep. Put this on for your next PR:",
      tutorial: "Why {bpm} BPM uptempo is scientifically undefeated for heavy attempts",
      pov: "POV: Smelling salts + {track_title} before the heaviest set of the week",
      showcase: "Music built for 3 white lights: {track_title} ({bpm} BPM)",
    },
    hookVariantsFr: {
      curiosity: "Note ce drop à {bpm} BPM pour un top set lourd (1 à 10)",
      contrarian: "Les playlists de salle classiques endorment. Mets ça pour ton prochain PR :",
      tutorial: "Pourquoi l'uptempo à {bpm} BPM est imbattable pour les barres lourdes",
      pov: "POV : Ammoniac + {track_title} avant la barre la plus lourde de la semaine",
      showcase: "De la musique calibrée pour le lourd : {track_title} ({bpm} BPM)",
    },
    captionTemplateEn:
      "There's a reason the project is called LIL SBD. Music built for heavy sets, PR attempts, and pure forward pressure.\n\nTrack: {track_title} ({bpm} BPM)",
    captionTemplateFr:
      "Ce n'est pas un hasard si le projet s'appelle LIL SBD. De la musique taillée pour les séries lourdes, les PR et la pression pure.\n\nSon : {track_title} ({bpm} BPM)",
    defaultCtaEn: "Add {track_title} to your gym playlist — Spotify & SoundCloud links in bio.",
    defaultCtaFr: "Ajoute {track_title} à ta playlist salle — liens Spotify & SoundCloud en bio.",
    defaultShotList: [
      "0-3s: Tight shot of loading plates, chalking hands, or studio meters redlining",
      "3-6s: Sync the drop impact with the exact moment the bar leaves the rack or the waveform explodes",
      "6-14s: High-energy cut with track title + Spotify badge on screen",
    ],
    suggestedHashtags: [
      "#gymhardstyle",
      "#uptempogym",
      "#powerliftingmusic",
      "#squatday",
      "#harddance",
    ],
    whyItWorks:
      "Cross-pollinates Hard Dance with the massive Gym/Powerlifting niche on TikTok & Reels, driving high playlist adds on Spotify.",
  },
  {
    id: "sys-idea-unpopular-opinion",
    category: "producer_hot_take",
    pillar: "meme_relatable",
    title: "Producer Hot Take: Loudness Without Tension Is Empty",
    description:
      "Share a direct, honest philosophy on why hard music still needs musical structure and tension instead of 2 minutes of clipping.",
    difficulty: "quick_5min",
    recommendedPlatforms: ["instagram_reels", "tiktok", "instagram_carousel"],
    hookFormulaEn: "Unpopular opinion: Clipping your master by +12dB doesn't make a track hard.",
    hookFormulaFr: "Opinion impopulaire : Clipper son master à +12dB ne rend pas un son violent.",
    hookVariantsEn: {
      curiosity: "The biggest trap beginner uptempo producers fall into:",
      contrarian: "Loudness without tension is just disposable noise after 10 seconds.",
      tutorial: "How to make hard music that still feels like actual music:",
      pov: "POV: Listening to a demo that's 0 LUFS of pure mud with zero arrangement",
      showcase: "Why I spend as much time on the melody and arrangement as on the zaag kicks",
    },
    hookVariantsFr: {
      curiosity: "Le plus gros piège dans lequel tombent les producteurs uptempo :",
      contrarian: "Le volume sans tension, c'est juste du bruit jetable au bout de 10 secondes.",
      tutorial: "Comment faire de la musique violente qui reste vraiment musicale :",
      pov: "POV : Quand t'écoutes une démo à 0 LUFS de boue sans aucun arrangement",
      showcase: "Pourquoi je passe autant de temps sur la mélodie que sur mes zaag kicks",
    },
    captionTemplateEn:
      "If everything in your track is at 100% aggression with zero contrast, nothing hits.\n\nImpact comes from tension, space before the transient, and a musical backbone that gives the kick a reason to exist. That's the whole philosophy behind {stage_name}—and why I built the free production course.",
    captionTemplateFr:
      "Si tout dans ton morceau est à 100% d'agressivité sans aucun contraste, plus rien n'a d'impact.\n\nLa violence vient de la tension, du silence juste avant l'attaque, et d'une vraie colonne vertébrale musicale. C'est toute la philosophie derrière {stage_name} — et la raison pour laquelle j'ai créé le cours gratuit.",
    defaultCtaEn: "Agree or disagree? Drop your take below. Free HDM production course in bio.",
    defaultCtaFr: "D'accord ou pas ? Dis-moi en commentaire. Cours de prod HDM gratuit en bio.",
    defaultShotList: [
      "0-3s: Direct-to-camera or DAW screen showing a brickwalled sausage waveform vs. a dynamic arrangement",
      "3-8s: Play 4 bars of tension/melody leading into a clean, devastating drop from {track_title}",
      "8-14s: Show the arrangement markers in the DAW",
    ],
    suggestedHashtags: [
      "#musicproducer",
      "#harddance",
      "#mixingtips",
      "#uptempohardcore",
      "#edmproducer",
    ],
    whyItWorks:
      "Polarizing, well-reasoned craft takes spark comment debates among producers and DJs, boosting algorithmic reach.",
  },
  {
    id: "sys-idea-course-carousel",
    category: "course_teaser",
    pillar: "course_funnel",
    title: "5-Slide Carousel: Kick & Mix Checklist for Hard Music",
    description:
      "Educational Instagram Carousel distilled from your free course that gets bookmarked/saved by producers.",
    difficulty: "daw_capture",
    recommendedPlatforms: ["instagram_carousel", "instagram_story"],
    hookFormulaEn: "5 mixing decisions that make {bpm} BPM kicks hit instead of just clipping harder (Swipe ->)",
    hookFormulaFr: "5 décisions de mix qui font vraiment cogner un kick à {bpm} BPM (Swipe ->)",
    hookVariantsEn: {
      curiosity: "Why your kick sounds massive in solo but disappears in the drop (Swipe ->)",
      contrarian: "Stop sidechaining everything to -30dB. Do this instead (Swipe ->)",
      tutorial: "The exact kick-to-lead balance checklist from my free HDM course:",
      pov: "Save this checklist for your next hard dance mixdown session",
      showcase: "How I mixed the low-end on {track_title} — 5-slide breakdown",
    },
    hookVariantsFr: {
      curiosity: "Pourquoi ton kick sonne énorme en solo mais disparaît dans le drop (Swipe ->)",
      contrarian: "Arrête de sidechainer tout ton mix à -30dB. Fais plutôt ça (Swipe ->)",
      tutorial: "La checklist exacte d'équilibre kick/lead tirée de mon cours HDM gratuit :",
      pov: "Enregistre cette checklist pour ta prochaine session de mix hard dance",
      showcase: "Comment j'ai mixé le bas du spectre sur {track_title} en 5 slides",
    },
    captionTemplateEn:
      "Bookmark this for your next session.\n\nMost hard dance mix issues come down to phase alignment between the punch and tail, and mid-range masking between the distortion harmonics and your screech/lead.\n\nI put together a 100% free course on my site covering kicks, sound design, arrangement, and mixing—no paywall, no upsell.",
    captionTemplateFr:
      "Enregistre ce post pour ta prochaine session.\n\nLa majorité des problèmes de mix en hard music viennent de l'alignement de phase entre le punch et la tail, et du masquage dans les médiums avec les leads.\n\nJ'ai mis en ligne un cours 100% gratuit sur mon site qui couvre les kicks, le sound design et le mix — zéro paywall.",
    defaultCtaEn: "Full free course is live on my site — link in bio.",
    defaultCtaFr: "Le cours complet et 100% gratuit est dispo sur mon site — lien en bio.",
    defaultShotList: [
      "Slide 1: Bold cover slide with title + screenshot of {track_title} DAW project",
      "Slide 2: Punch vs. Tail phase lock diagram / screenshot",
      "Slide 3: Pre-clipper EQ curve removing 300Hz boxiness",
      "Slide 4: Lead & Screech high-pass + mid/side separation",
      "Slide 5: Audio preview video slide + CTA to the free course in bio",
    ],
    suggestedHashtags: [
      "#musicproduction",
      "#hardstyleproducer",
      "#flstudiotips",
      "#abletontips",
      "#sounddesigntutorial",
    ],
    whyItWorks:
      "Carousels with actionable screenshots generate the highest Save-to-View ratio on Instagram, feeding long-term profile discovery and course traffic.",
  },
  {
    id: "sys-idea-layer-by-layer",
    category: "kick_sound_design",
    pillar: "behind_the_scenes",
    title: "Layer-by-Layer Drop Deconstruction (Solo to Full Mix)",
    description:
      "Build the drop of your track one stem at a time every 2 bars: Kick -> Bass/Tail -> Screech/Lead -> Vocal -> Full Drop.",
    difficulty: "daw_capture",
    recommendedPlatforms: ["tiktok", "instagram_reels", "youtube_shorts"],
    hookFormulaEn: "Building a {bpm} BPM uptempo drop layer by layer ({track_title})",
    hookFormulaFr: "Construction d'un drop uptempo à {bpm} BPM couche par couche ({track_title})",
    hookVariantsEn: {
      curiosity: "How 5 simple layers turn into a wall of pressure on {track_title}",
      contrarian: "You don't need 120 mixer tracks for a massive drop. Here are the 5 that matter:",
      tutorial: "Anatomy of {track_title}: Kick + Screech + Vocal + Atmosphere",
      pov: "POV: Soloing each stem of {track_title} until the full drop hits",
      showcase: "Inside the session of {track_title} ({bpm} BPM)",
    },
    hookVariantsFr: {
      curiosity: "Comment 5 couches simples deviennent un mur de pression sur {track_title}",
      contrarian: "Pas besoin de 120 pistes pour un drop massif. Voici les 5 qui comptent :",
      tutorial: "Anatomie de {track_title} : Kick + Screech + Vocal + Atmosphère",
      pov: "POV : J'active chaque piste de {track_title} jusqu'au drop complet",
      showcase: "Au cœur de la session de {track_title} ({bpm} BPM)",
    },
    captionTemplateEn:
      "Every element in {track_title} has a specific job. Because the zaag kick takes up so much harmonic space, the vocal chop, screech, and lead are carved to sit right around its pockets instead of fighting it.",
    captionTemplateFr:
      "Chaque élément dans {track_title} a un rôle précis. Comme le zaag kick occupe énormément d'espace harmonique, le vocal, le screech et le lead sont sculptés pour s'imbriquer autour sans se battre.",
    defaultCtaEn: "Which layer makes the drop for you? Full track in bio.",
    defaultCtaFr: "Quelle couche fait toute la différence selon toi ? Son complet en bio.",
    defaultShotList: [
      "0-2s: Solo the raw punch & zaag tail (Text: '1. The Zaag Foundation')",
      "2-4s: Unmute the screech / rhythmic synth (Text: '2. Mid-Range Tension')",
      "4-6s: Unmute the pre-drop vocal hook (Text: '3. The Call')",
      "6-12s: Unmute everything + master chain on the main drop (Text: '4. Full Drop — {track_title}')",
    ],
    suggestedHashtags: [
      "#trackbreakdown",
      "#uptempohardcore",
      "#producerlife",
      "#harddance",
      "#studioflow",
    ],
    whyItWorks:
      "Stepwise progression keeps viewers watching until the final layer unmutes, guaranteeing 80%+ completion rates.",
  },
  {
    id: "sys-idea-release-story",
    category: "release_story",
    pillar: "release_promo",
    title: "The Story & Sound Behind the Track (Direct-to-Fan)",
    description:
      "Introduce a release with zero corny hype—just what inspired the atmosphere, what you wanted the drop to feel like, and where to listen.",
    difficulty: "quick_5min",
    recommendedPlatforms: ["instagram_reels", "tiktok", "instagram_story"],
    hookFormulaEn: "{track_title} is out. Here is what I wanted this track to do.",
    hookFormulaFr: "{track_title} est disponible. Voici ce que je voulais transmettre avec ce son.",
    hookVariantsEn: {
      curiosity: "The idea that started {track_title} at 2AM in the studio:",
      contrarian: "I almost scrapped {track_title} three times before finding this drop:",
      tutorial: "How {track_title} went from a rough kick test to my favorite release:",
      pov: "Out now on all platforms: {track_title} ({bpm} BPM)",
      showcase: "{track_title} — Out everywhere now.",
    },
    hookVariantsFr: {
      curiosity: "L'idée qui a lancé {track_title} à 2h du matin au studio :",
      contrarian: "J'ai failli supprimer {track_title} trois fois avant de trouver ce drop :",
      tutorial: "Comment {track_title} est passé d'un simple test de kick à ma sortie préférée :",
      pov: "Dispo sur toutes les plateformes : {track_title} ({bpm} BPM)",
      showcase: "{track_title} — Disponible partout maintenant.",
    },
    captionTemplateEn:
      "{track_title} is live everywhere.\n\nThe goal on this one was simple: relentless forward pressure with a real melodic identity underneath. Loud enough for a late set, clean enough that every kick switch lands with intent.",
    captionTemplateFr:
      "{track_title} est dispo partout.\n\nL'objectif sur celui-ci était simple : une pression constante vers l'avant avec une vraie identité mélodique en dessous. Taillé pour la fin de set, mais avec chaque switch de kick maîtrisé.",
    defaultCtaEn: "Stream {track_title} on Spotify, SoundCloud, Apple Music & YouTube — link in bio.",
    defaultCtaFr: "Écoute {track_title} sur Spotify, SoundCloud, Apple Music & YouTube — lien en bio.",
    defaultShotList: [
      "0-3s: Show the cover art of {track_title} + vinyl/border animation or studio monitor shot",
      "3-10s: Cut to the hardest 8 bars of the main drop",
      "10-15s: Show streaming platform icons (Spotify, SoundCloud, Apple Music) + link in bio callout",
    ],
    suggestedHashtags: [
      "#newrelease",
      "#uptempohardcore",
      "#hardcoremusic",
      "#lilsbd",
      "#spotifyrelease",
    ],
    whyItWorks:
      "Authentic, direct artist framing builds real fan loyalty without sounding like a generic marketing ad.",
  },
  {
    id: "sys-idea-blind-ab-test",
    category: "kick_sound_design",
    pillar: "meme_relatable",
    title: "Kick A vs. Kick B — Fan & Producer Poll",
    description:
      "Play two variations of a drop or zaag kick back-to-back and ask the audience to vote A or B in the comments.",
    difficulty: "quick_5min",
    recommendedPlatforms: ["tiktok", "instagram_reels", "youtube_shorts", "instagram_story"],
    hookFormulaEn: "Kick A or Kick B for the final drop of {track_title}? You decide.",
    hookFormulaFr: "Kick A ou Kick B pour le drop final de {track_title} ? À vous de choisir.",
    hookVariantsEn: {
      curiosity: "I can't decide which kick belongs in the 2nd drop of {track_title}: A or B?",
      contrarian: "Half my producer friends said A, the other half said B. Which one hits harder?",
      tutorial: "Pitched Zaag (A) vs. Gated Raw Crunch (B) on {track_title}:",
      pov: "POV: You have 24 hours before mastering to pick between Kick A and Kick B",
      showcase: "A/B Test on {track_title} ({bpm} BPM) — Vote in the comments",
    },
    hookVariantsFr: {
      curiosity: "Impossible de choisir quel kick garder pour le 2ème drop de {track_title} : A ou B ?",
      contrarian: "La moitié de mes potes producteurs préfère le A, l'autre le B. Lequel cogne le plus ?",
      tutorial: "Zaag tonal (A) vs. Crunch saturé (B) sur {track_title} :",
      pov: "POV : Il te reste 24h avant le mastering pour trancher entre le Kick A et le Kick B",
      showcase: "Test A/B sur {track_title} ({bpm} BPM) — Vote en commentaire",
    },
    captionTemplateEn:
      "Version A leans into the sustained tonal zaag pressure. Version B cuts the tail shorter for a more aggressive punch.\n\nDrop an 'A' or 'B' in the comments—whichever wins goes into the VIP.",
    captionTemplateFr:
      "La version A mise tout sur la pression tonale du zaag. La version B coupe la tail plus court pour un punch plus sec.\n\nMets 'A' ou 'B' en commentaire — la version gagnante finira dans l'edit VIP.",
    defaultCtaEn: "Comment A or B below!",
    defaultCtaFr: "Commente A ou B ci-dessous !",
    defaultShotList: [
      "0-4s: Play 4 bars with Kick A highlighted in green",
      "4-8s: Immediately switch to 4 bars with Kick B highlighted in purple",
      "8-10s: Loop back seamlessly so viewers replay to compare",
    ],
    suggestedHashtags: [
      "#zaagkick",
      "#uptempohardcore",
      "#musicproducer",
      "#hardstyle",
      "#abtest",
    ],
    whyItWorks:
      "A/B polls are the single easiest way to 5x your comment count while making fans feel invested in the release.",
  },
];

export const SYSTEM_HASHTAG_PRESETS = [
  {
    id: "sys-tags-uptempo-core",
    name: "Uptempo & Zaag Core",
    platform: "all" as const,
    tags: [
      "#uptempohardcore",
      "#zaagkick",
      "#hardcoremusic",
      "#harddance",
      "#frenchhardcore",
      "#uptempo",
      "#lilsbd",
    ],
  },
  {
    id: "sys-tags-producer-edutainment",
    name: "Hard Dance Producer & Course",
    platform: "instagram" as const,
    tags: [
      "#musicproductiontips",
      "#hardstyleproducer",
      "#sounddesign",
      "#mixingtips",
      "#edmproducer",
      "#flstudioproducer",
      "#abletonproducer",
    ],
  },
  {
    id: "sys-tags-gym-crossover",
    name: "Gym & PR Heavy Energy (SBD)",
    platform: "tiktok" as const,
    tags: [
      "#gymhardstyle",
      "#powerlifting",
      "#squatday",
      "#heavyweights",
      "#uptempogym",
      "#prmusic",
    ],
  },
  {
    id: "sys-tags-shorts-discovery",
    name: "YouTube Shorts High-Discovery",
    platform: "youtube_shorts" as const,
    tags: ["#shorts", "#uptempo", "#hardcore", "#musicproducer", "#bassboosted", "#zaag"],
  },
];

export async function ensureSystemVaultSeeded(): Promise<void> {
  await ensureSchemaInitialized();

  for (const tpl of SYSTEM_IDEA_TEMPLATES) {
    const existing = await db
      .select({ id: ideaTemplates.id })
      .from(ideaTemplates)
      .where(eq(ideaTemplates.id, tpl.id))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(ideaTemplates).values({
        id: tpl.id,
        userId: null,
        isSystem: true,
        category: tpl.category,
        pillar: tpl.pillar,
        title: tpl.title,
        description: tpl.description,
        difficulty: tpl.difficulty,
        recommendedPlatforms: tpl.recommendedPlatforms,
        hookFormulaEn: tpl.hookFormulaEn,
        hookFormulaFr: tpl.hookFormulaFr,
        hookVariantsEn: tpl.hookVariantsEn,
        hookVariantsFr: tpl.hookVariantsFr,
        captionTemplateEn: tpl.captionTemplateEn,
        captionTemplateFr: tpl.captionTemplateFr,
        defaultCtaEn: tpl.defaultCtaEn,
        defaultCtaFr: tpl.defaultCtaFr,
        defaultShotList: tpl.defaultShotList,
        suggestedHashtags: tpl.suggestedHashtags,
        whyItWorks: tpl.whyItWorks,
      });
    }
  }

  for (const preset of SYSTEM_HASHTAG_PRESETS) {
    const existing = await db
      .select({ id: hashtagPresets.id })
      .from(hashtagPresets)
      .where(eq(hashtagPresets.id, preset.id))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(hashtagPresets).values({
        id: preset.id,
        userId: null,
        isSystem: true,
        name: preset.name,
        platform: preset.platform,
        tags: preset.tags,
      });
    }
  }
}

export async function ensureUserWorkspaceSeeded(userId: string, userName?: string): Promise<void> {
  await ensureSystemVaultSeeded();

  // 1. Ensure Artist Profile exists for this user
  const existingProfile = await db
    .select()
    .from(artistProfiles)
    .where(eq(artistProfiles.userId, userId))
    .limit(1);

  if (existingProfile.length === 0) {
    await db.insert(artistProfiles).values({
      id: `profile-${userId}`,
      userId,
      stageName: userName?.trim() || "LIL SBD",
      genre: "Uptempo Hardcore / Hard Dance",
      tagline: "Zaag-driven uptempo hardcore that still feels like music.",
      primaryLanguage: "bilingual",
      defaultBioLink: "https://lilsbd.com",
      weeklyPostTarget: 5,
      targetPlatforms: [
        "instagram_reels",
        "tiktok",
        "youtube_shorts",
        "instagram_carousel",
        "instagram_story",
      ],
    });
  }

  // 2. Check if user has any catalog items; if not, auto-sync LIL SBD catalog + course modules
  const existingCatalog = await db
    .select({ id: artistCatalogItems.id })
    .from(artistCatalogItems)
    .where(eq(artistCatalogItems.userId, userId))
    .limit(1);

  if (existingCatalog.length === 0) {
    await syncLilSbdCatalogForUser(userId);
  }

  // 3. Check if user has any social posts; if not, seed a starter pipeline across statuses
  const existingPosts = await db
    .select({ id: socialPosts.id })
    .from(socialPosts)
    .where(eq(socialPosts.userId, userId))
    .limit(1);

  if (existingPosts.length === 0) {
    const catalog = await db
      .select()
      .from(artistCatalogItems)
      .where(eq(artistCatalogItems.userId, userId));

    const kino = catalog.find((c) => c.slug === "kino") ?? catalog[0];
    const ascension = catalog.find((c) => c.slug === "ascension") ?? catalog[0];
    const squatDay = catalog.find((c) => c.slug === "squat-day") ?? catalog[0];
    const courseItem = catalog.find((c) => c.type === "course_lesson") ?? catalog[0];

    const now = new Date();
    const dayMs = 86_400_000;

    const starterPosts = [
      {
        id: `post-starter-1-${userId}`,
        userId,
        catalogItemId: kino?.id ?? null,
        templateId: "sys-idea-zaag-anatomy",
        title: "KINO — Zaag Kick EQ & Clipper Breakdown",
        status: "ready" as const,
        platforms: ["instagram_reels", "tiktok", "youtube_shorts"] as SocialPlatform[],
        pillar: "sound_design_tutorial" as ContentPillar,
        scheduledFor: new Date(now.getTime() + 1 * dayMs),
        sortOrder: 1,
        onScreenHookEn: "Why 90% of zaag kicks sound like muddy noise (and how I fixed mine on KINO)",
        onScreenHookFr:
          "Pourquoi 90% des zaag kicks sonnent brouillons (et comment j'ai réglé ça sur KINO)",
        hookVariantsEn: SYSTEM_IDEA_TEMPLATES[0].hookVariantsEn,
        hookVariantsFr: SYSTEM_IDEA_TEMPLATES[0].hookVariantsFr,
        shotList: [
          {
            id: "s1",
            text: "Play muddy pre-EQ kick for 2 seconds with red warning label",
            completed: true,
          },
          {
            id: "s2",
            text: "Toggle surgical 320Hz notch + soft clipper on KINO kick channel",
            completed: true,
          },
          {
            id: "s3",
            text: "Drop into full 4 bars of KINO main drop",
            completed: true,
          },
        ],
        audioTimestamp: "0:42 - 0:58 (1st Drop)",
        captionEn:
          "Making a loud zaag kick takes 30 seconds. Making one that actually serves the track without turning the drop into flat white noise is where the real work happens.\n\nOn KINO (200 BPM), the key was carving the 280–380Hz boxiness before hitting the distortion stage so the sub tail and high crunch both breathe.",
        captionFr:
          "Faire un zaag kick fort prend 30 secondes. En faire un qui sert vraiment le morceau sans transformer le drop en bruit blanc plat, c'est là que tout se joue.\n\nSur KINO (200 BPM), la clé a été de creuser la zone 280–380Hz avant la distorsion pour laisser respirer le sub et le crunch.",
        ctaEn: "Stream KINO & check out my free HDM production course — link in bio.",
        ctaFr: "Écoute KINO & découvre mon cours de prod HDM gratuit — lien en bio.",
        hashtags: [
          "#uptempohardcore",
          "#zaagkick",
          "#harddanceproducer",
          "#sounddesign",
          "#lilsbd",
        ],
        preFlightChecklist: {
          highResExport: true,
          coverFrameSelected: true,
          audioSynced: true,
          linkInBioUpdated: false,
        },
        views: 0,
        likes: 0,
        saves: 0,
        shares: 0,
        comments: 0,
      },
      {
        id: `post-starter-2-${userId}`,
        userId,
        catalogItemId: ascension?.id ?? null,
        templateId: "sys-idea-fakeout-switch",
        title: "ASCENSION — Wait for the 2nd Kick Switch Teaser",
        status: "editing" as const,
        platforms: ["tiktok", "instagram_reels", "youtube_shorts"] as SocialPlatform[],
        pillar: "drop_showcase" as ContentPillar,
        scheduledFor: new Date(now.getTime() + 2 * dayMs),
        sortOrder: 2,
        onScreenHookEn: "Wait for the 2nd kick switch on ASCENSION (205 BPM)...",
        onScreenHookFr: "Attends le 2ème switch de kick sur ASCENSION (205 BPM)...",
        hookVariantsEn: SYSTEM_IDEA_TEMPLATES[1].hookVariantsEn,
        hookVariantsFr: SYSTEM_IDEA_TEMPLATES[1].hookVariantsFr,
        shotList: [
          {
            id: "s1",
            text: "Screen record DAW arrangement approaching the fakeout marker",
            completed: true,
          },
          {
            id: "s2",
            text: "Add punch-in zoom on the 1-beat silence before the zaag switch",
            completed: false,
          },
        ],
        audioTimestamp: "1:08 - 1:24 (2nd Drop Switch)",
        captionEn:
          "Heavy enough for a late set, structured enough that you still remember the melody after it ends. ASCENSION from the DEAD OPS EP.",
        captionFr:
          "Assez lourd pour une fin de set, assez construit pour qu'on retienne la mélodie après. ASCENSION extrait de DEAD OPS EP.",
        ctaEn: "Listen to ASCENSION right now — player & platform links in bio.",
        ctaFr: "Écoute ASCENSION dès maintenant — lecteur & liens en bio.",
        hashtags: ["#uptempo", "#hardcoremusic", "#zaag", "#newmusic", "#lilsbd"],
        preFlightChecklist: {
          highResExport: false,
          coverFrameSelected: false,
          audioSynced: true,
          linkInBioUpdated: false,
        },
        views: 0,
        likes: 0,
        saves: 0,
        shares: 0,
        comments: 0,
      },
      {
        id: `post-starter-3-${userId}`,
        userId,
        catalogItemId: courseItem?.id ?? null,
        templateId: "sys-idea-course-carousel",
        title: "Course Carousel: 5 Kick & Mix Decisions That Actually Matter",
        status: "filming" as const,
        platforms: ["instagram_carousel", "instagram_story"] as SocialPlatform[],
        pillar: "course_funnel" as ContentPillar,
        scheduledFor: new Date(now.getTime() + 4 * dayMs),
        sortOrder: 3,
        onScreenHookEn:
          "5 mixing decisions that make 200 BPM kicks hit instead of just clipping harder (Swipe ->)",
        onScreenHookFr:
          "5 décisions de mix qui font vraiment cogner un kick à 200 BPM (Swipe ->)",
        hookVariantsEn: SYSTEM_IDEA_TEMPLATES[4].hookVariantsEn,
        hookVariantsFr: SYSTEM_IDEA_TEMPLATES[4].hookVariantsFr,
        shotList: [
          {
            id: "s1",
            text: "Take clean screenshots of the kick phase alignment and EQ notch",
            completed: false,
          },
          {
            id: "s2",
            text: "Export 10-second before/after video for Slide 5",
            completed: false,
          },
        ],
        audioTimestamp: "Slide 5 Audio Demo",
        captionEn:
          "Bookmark this for your next mixdown session. I put together a 100% free hard dance production course on my site covering kicks, sound design, and mixing—zero paywall.",
        captionFr:
          "Enregistre ce post pour ta prochaine session. J'ai mis en ligne un cours de prod hard dance 100% gratuit sur mon site — zéro paywall.",
        ctaEn: "Start the free HDM course — link in bio.",
        ctaFr: "Commence le cours HDM gratuit — lien en bio.",
        hashtags: ["#musicproduction", "#hardstyleproducer", "#mixingtips", "#sounddesign"],
        preFlightChecklist: {
          highResExport: false,
          coverFrameSelected: false,
          audioSynced: false,
          linkInBioUpdated: false,
        },
        views: 0,
        likes: 0,
        saves: 0,
        shares: 0,
        comments: 0,
      },
      {
        id: `post-starter-4-${userId}`,
        userId,
        catalogItemId: squatDay?.id ?? null,
        templateId: "sys-idea-gym-pr-soundtrack",
        title: "SQUAT DAY — Heavy Top Set PR Soundtrack Check",
        status: "posted" as const,
        platforms: ["tiktok", "instagram_reels", "youtube_shorts"] as SocialPlatform[],
        pillar: "drop_showcase" as ContentPillar,
        scheduledFor: new Date(now.getTime() - 2 * dayMs),
        postedAt: new Date(now.getTime() - 2 * dayMs),
        sortOrder: 4,
        onScreenHookEn: "If this 200 BPM drop doesn't add +10kg to your squat, nothing will.",
        onScreenHookFr: "Si ce drop à 200 BPM ne rajoute pas +10kg à ton squat, rien ne le fera.",
        hookVariantsEn: SYSTEM_IDEA_TEMPLATES[2].hookVariantsEn,
        hookVariantsFr: SYSTEM_IDEA_TEMPLATES[2].hookVariantsFr,
        shotList: [
          {
            id: "s1",
            text: "Sync the drop with heavy squat walkout / studio meters peaking",
            completed: true,
          },
        ],
        audioTimestamp: "0:38 - 0:54 (Main Drop)",
        captionEn:
          "There's a reason the project is called LIL SBD. SQUAT DAY (from HEAVY SINGLES) is streaming everywhere.",
        captionFr:
          "Ce n'est pas un hasard si le projet s'appelle LIL SBD. SQUAT DAY (extrait de HEAVY SINGLES) est dispo partout.",
        ctaEn: "Add SQUAT DAY to your gym playlist — Spotify link in bio.",
        ctaFr: "Ajoute SQUAT DAY à ta playlist salle — lien Spotify en bio.",
        hashtags: ["#gymhardstyle", "#uptempogym", "#squatday", "#powerlifting", "#lilsbd"],
        preFlightChecklist: {
          highResExport: true,
          coverFrameSelected: true,
          audioSynced: true,
          linkInBioUpdated: true,
        },
        views: 14800,
        likes: 1620,
        saves: 490,
        shares: 215,
        comments: 68,
        performanceRating: "viral" as const,
        retrospectiveNotes:
          "Gym + Uptempo SBD angle drove huge save rate (3.3% saves/views). Follow up with '3 ATTEMPTS' and 'OPENER'.",
      },
      {
        id: `post-starter-5-${userId}`,
        userId,
        catalogItemId: kino?.id ?? null,
        templateId: "sys-idea-layer-by-layer",
        title: "KINO — 5 Layers That Build the Main Drop",
        status: "posted" as const,
        platforms: ["instagram_reels", "tiktok"] as SocialPlatform[],
        pillar: "behind_the_scenes" as ContentPillar,
        scheduledFor: new Date(now.getTime() - 5 * dayMs),
        postedAt: new Date(now.getTime() - 5 * dayMs),
        sortOrder: 5,
        onScreenHookEn: "Building a 200 BPM uptempo drop layer by layer (KINO)",
        onScreenHookFr: "Construction d'un drop uptempo à 200 BPM couche par couche (KINO)",
        hookVariantsEn: SYSTEM_IDEA_TEMPLATES[5].hookVariantsEn,
        hookVariantsFr: SYSTEM_IDEA_TEMPLATES[5].hookVariantsFr,
        shotList: [
          {
            id: "s1",
            text: "Solo each stem every 2 bars until the full drop explodes",
            completed: true,
          },
        ],
        audioTimestamp: "0:40 - 0:58",
        captionEn:
          "Every layer in KINO has a job. Because the zaag kick takes up so much harmonic space, the screech and lead sit right in its pockets.",
        captionFr:
          "Chaque couche dans KINO a un rôle précis. Comme le zaag kick prend énormément de place, le screech et le lead s'imbriquent autour.",
        ctaEn: "Full track & free HDM course in bio.",
        ctaFr: "Son complet & cours HDM gratuit en bio.",
        hashtags: ["#trackbreakdown", "#uptempohardcore", "#producerlife", "#lilsbd"],
        preFlightChecklist: {
          highResExport: true,
          coverFrameSelected: true,
          audioSynced: true,
          linkInBioUpdated: true,
        },
        views: 8400,
        likes: 910,
        saves: 340,
        shares: 95,
        comments: 42,
        performanceRating: "above_average" as const,
        retrospectiveNotes: "Producers loved the solo-to-full-mix transition at bar 5.",
      },
    ];

    for (const post of starterPosts) {
      await db.insert(socialPosts).values(post);
    }
  }
}

export async function syncLilSbdCatalogForUser(userId: string): Promise<{ syncedCount: number }> {
  await ensureSchemaInitialized();
  let syncedCount = 0;

  // 1. Sync all songs from src/lib/songs.ts
  for (const song of songs) {
    const existing = await db
      .select({ id: artistCatalogItems.id })
      .from(artistCatalogItems)
      .where(and(eq(artistCatalogItems.userId, userId), eq(artistCatalogItems.slug, song.slug)))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(artistCatalogItems).values({
        id: `cat-${userId}-${song.slug}`,
        userId,
        type: "track",
        slug: song.slug,
        title: song.title,
        albumOrChapter: song.album ?? "Single",
        releaseDate: song.releaseDate,
        artworkUrl: song.artworkUrl ?? "/covers/DEAD-OPS.png",
        audioPreviewUrl: song.urlMP3,
        bpm: song.slug === "ascension" || song.slug === "lock-the-doors" ? 205 : 200,
        keySignature: "F Minor",
        genreTag: "Uptempo Hardcore",
        description: `${song.title} by ${song.artists.join(" & ")}${song.album ? ` (${song.album})` : ""}`,
        streamingLinks: {
          spotify: song.links.spotify,
          soundcloud: song.links.soundcloud,
          youtubeMusic: song.links.youtubeMusic,
          appleMusic: song.links.appleMusic,
        },
        hookTimestamps: [
          { label: "Fakeout / 1st Drop", startSec: 40, endSec: 56 },
          { label: "2nd Kick Switch", startSec: 72, endSec: 88 },
        ],
      });
      syncedCount++;
    }
  }

  // 2. Sync Core Free HDM Course Pillars so campaigns can promote lessons too
  const courseCatalogSeeds = [
    {
      slug: "course-intro-hdm",
      title: "Free HDM Course — Introduction & Core Philosophy",
      chapter: "Chapter 01: Foundations",
      courseUrl: "/course/introduction",
      description:
        "How to make hard dance music that hits hard without sacrificing musicality and structure.",
    },
    {
      slug: "course-zaag-kick-design",
      title: "Free HDM Course — Zaag & Uptempo Kick Engineering",
      chapter: "Chapter 02: Kicks & Low-End",
      courseUrl: "/course",
      description:
        "Pitch envelopes, pre-distortion EQ notches, phase locking punch to tail, and controlled clipping.",
    },
    {
      slug: "course-aggressive-mixing",
      title: "Free HDM Course — Mixing Aggressive Drops Cleanly",
      chapter: "Chapter 03: Mixing & Loudness",
      courseUrl: "/course",
      description:
        "Carving space for screeches and vocals around a massive kick without losing perceived loudness.",
    },
  ];

  for (const lesson of courseCatalogSeeds) {
    const existing = await db
      .select({ id: artistCatalogItems.id })
      .from(artistCatalogItems)
      .where(and(eq(artistCatalogItems.userId, userId), eq(artistCatalogItems.slug, lesson.slug)))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(artistCatalogItems).values({
        id: `cat-${userId}-${lesson.slug}`,
        userId,
        type: "course_lesson",
        slug: lesson.slug,
        title: lesson.title,
        albumOrChapter: lesson.chapter,
        releaseDate: new Date("2026-01-15"),
        artworkUrl: "/logo192.png",
        bpm: 200,
        keySignature: "N/A",
        genreTag: "HDM Production Course",
        description: lesson.description,
        streamingLinks: {
          courseUrl: lesson.courseUrl,
        },
        hookTimestamps: [],
      });
      syncedCount++;
    }
  }

  return { syncedCount };
}
