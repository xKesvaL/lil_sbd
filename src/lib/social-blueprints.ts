import type { CampaignType, ContentPillar, SocialPlatform } from "#/db/schema";

export interface RolloutBlueprintStep {
  dayOffset: number; // relative to releaseDate (e.g. -10 = 10 days before)
  titleSuffix: string;
  pillar: ContentPillar;
  platforms: SocialPlatform[];
  audioTimestamp: string;
  onScreenHookEn: string;
  onScreenHookFr: string;
  captionEn: string;
  captionFr: string;
  ctaEn: string;
  ctaFr: string;
  shotList: string[];
}

export const CAMPAIGN_ROLLOUT_BLUEPRINTS: Record<
  CampaignType,
  {
    label: string;
    description: string;
    steps: RolloutBlueprintStep[];
  }
> = {
  single_release: {
    label: "Full Track Release Blitz (8 High-Impact Posts)",
    description:
      "A 3-week structured rollout from first studio teaser and kick A/B poll to Release Day showcase and post-release production breakdown.",
    steps: [
      {
        dayOffset: -10,
        titleSuffix: "Studio Teaser — First Drop Preview",
        pillar: "behind_the_scenes",
        platforms: ["tiktok", "instagram_reels"],
        audioTimestamp: "0:40 - 0:55 (1st Drop)",
        onScreenHookEn: "Working on something heavy for the next release ({title} — {bpm} BPM)",
        onScreenHookFr: "En train de préparer du très lourd pour la suite ({title} — {bpm} BPM)",
        captionEn:
          "First test of the main drop for {title}. Focused on keeping the melodic tension intact before the zaag kicks take over.",
        captionFr:
          "Premier test du drop principal de {title}. L'idée : garder une vraie tension mélodique avant que les zaag kicks prennent le dessus.",
        ctaEn: "Should I drop this one next? Let me know in the comments.",
        ctaFr: "Je sors celui-ci en prochain ? Dites-moi en commentaire.",
        shotList: [
          "Film DAW screen playing 2 bars of buildup into 4 bars of the drop",
          "Capture studio monitors vibrating / meter hitting 0dB",
        ],
      },
      {
        dayOffset: -7,
        titleSuffix: "Kick A vs. Kick B Poll",
        pillar: "meme_relatable",
        platforms: ["tiktok", "instagram_reels", "instagram_story"],
        audioTimestamp: "0:45 - 0:55 (Kick Switch)",
        onScreenHookEn: "Kick A or Kick B for the 2nd drop of {title}?",
        onScreenHookFr: "Kick A ou Kick B pour le 2ème drop de {title} ?",
        captionEn:
          "Finalizing the master for {title}. Which kick variation hits harder for you—A (deeper tonal zaag) or B (sharper transient crunch)?",
        captionFr:
          "Derniers réglages sur le master de {title}. Quelle version cogne le plus selon toi — A (zaag tonal profond) ou B (attaque plus sèche) ?",
        ctaEn: "Vote A or B in the comments!",
        ctaFr: "Vote A ou B en commentaire !",
        shotList: [
          "Play 4 bars of Kick A with 'A' on screen",
          "Play 4 bars of Kick B with 'B' on screen",
        ],
      },
      {
        dayOffset: -4,
        titleSuffix: "Gym / Heavy Set Tempo Test",
        pillar: "drop_showcase",
        platforms: ["tiktok", "instagram_reels", "youtube_shorts"],
        audioTimestamp: "1:10 - 1:25 (2nd Drop)",
        onScreenHookEn: "Testing {title} ({bpm} BPM) on heavy top sets before it drops",
        onScreenHookFr: "Test de {title} ({bpm} BPM) sous une barre lourde avant sa sortie",
        captionEn:
          "If it doesn't pass the heavy set test, it doesn't get released. {title} drops in 4 days.",
        captionFr:
          "Si le son ne passe pas le test d'une série lourde, il ne sort pas. {title} sort dans 4 jours.",
        ctaEn: "Out this week — follow so you don't miss the drop.",
        ctaFr: "Sortie cette semaine — abonne-toi pour ne pas rater le drop.",
        shotList: [
          "Sync the fakeout pause with setting up the lift / studio buildup",
          "Drop lands right as the weight moves",
        ],
      },
      {
        dayOffset: -1,
        titleSuffix: "24h Countdown & Cover Art Reveal",
        pillar: "release_promo",
        platforms: ["instagram_story", "instagram_carousel"],
        audioTimestamp: "0:35 - 0:55 (Buildup + Drop)",
        onScreenHookEn: "{title} drops tomorrow at midnight.",
        onScreenHookFr: "{title} sort demain à minuit.",
        captionEn:
          "Tomorrow. {title} goes live on Spotify, SoundCloud, Apple Music, and YouTube Music.",
        captionFr:
          "Demain. {title} arrive sur Spotify, SoundCloud, Apple Music et YouTube Music.",
        ctaEn: "Turn on notifications / check the link in bio at midnight.",
        ctaFr: "Active le rappel / lien en bio dès minuit.",
        shotList: [
          "Slide 1: High-res cover artwork of {title}",
          "Slide 2: 15-second audio snippet video with animated border",
        ],
      },
      {
        dayOffset: 0,
        titleSuffix: "RELEASE DAY — Official Drop Showcase",
        pillar: "release_promo",
        platforms: ["instagram_reels", "tiktok", "youtube_shorts", "instagram_story"],
        audioTimestamp: "0:42 - 1:02 (Climax Drop)",
        onScreenHookEn: "{title} IS OUT NOW EVERYWHERE ({bpm} BPM)",
        onScreenHookFr: "{title} EST DISPONIBLE PARTOUT ({bpm} BPM)",
        captionEn:
          "{title} is officially live on all streaming platforms.\n\nBuilt around sharp zaag pressure, a real melodic backbone, and zero filler. Crank it loud.",
        captionFr:
          "{title} est officiellement dispo sur toutes les plateformes.\n\nConstruit autour d'une vraie colonne vertébrale mélodique et de zaag kicks chirurgicaux. Pousse le volume.",
        ctaEn: "Stream {title} now on Spotify, SoundCloud & Apple Music — link in bio.",
        ctaFr: "Écoute {title} maintenant sur Spotify, SoundCloud & Apple Music — lien en bio.",
        shotList: [
          "Open with the cover art + 'OUT NOW' badge for 1.5s",
          "Cut straight into the hardest 12 seconds of the drop",
          "End card with Spotify / SoundCloud / Apple Music badges",
        ],
      },
      {
        dayOffset: 2,
        titleSuffix: "Wait for the 2nd Kick Switch (Hook Clip)",
        pillar: "drop_showcase",
        platforms: ["tiktok", "instagram_reels", "youtube_shorts"],
        audioTimestamp: "1:15 - 1:32 (2nd Drop Switch)",
        onScreenHookEn: "Wait for the 2nd kick switch on {title}...",
        onScreenHookFr: "Attends le 2ème switch de kick sur {title}...",
        captionEn:
          "The first drop sets the pace, the second drop takes the roof off. {title} is out now everywhere.",
        captionFr:
          "Le premier drop installe la cadence, le deuxième retourne tout. {title} est dispo partout.",
        ctaEn: "Full track in bio — add it to your playlist.",
        ctaFr: "Son complet en bio — ajoute-le à ta playlist.",
        shotList: [
          "Start 3 seconds before the 2nd drop switch",
          "Zoom on the playhead crossing the switch marker",
        ],
      },
      {
        dayOffset: 5,
        titleSuffix: "How I Designed the Zaag Kick in {title}",
        pillar: "sound_design_tutorial",
        platforms: ["instagram_reels", "tiktok", "youtube_shorts"],
        audioTimestamp: "0:42 - 0:55 (Solo Kick vs. Mix)",
        onScreenHookEn: "How I made the zaag kick in {title} hit without muddying the mix",
        onScreenHookFr: "Comment j'ai sculpté le zaag kick de {title} sans noyer le mix",
        captionEn:
          "A quick look inside the project file of {title}. Pre-distortion EQ + phase-locked sub is 80% of the battle.\n\nWant the full workflow? My hard dance production course is 100% free on my site.",
        captionFr:
          "Petit tour dans le projet de {title}. L'EQ pré-distorsion et l'alignement de phase du sub font 80% du travail.\n\nTu veux le process complet ? Mon cours de prod hard dance est 100% gratuit sur mon site.",
        ctaEn: "Stream {title} & check out the free HDM course — link in bio.",
        ctaFr: "Écoute {title} & découvre le cours HDM gratuit — lien en bio.",
        shotList: [
          "Solo the kick in the DAW and toggle the processing chain on/off",
          "Play it in full mix context",
          "Show the free course page on lilsbd.com for 2 seconds",
        ],
      },
      {
        dayOffset: 9,
        titleSuffix: "Layer-by-Layer Stem Breakdown",
        pillar: "behind_the_scenes",
        platforms: ["instagram_carousel", "tiktok", "instagram_reels"],
        audioTimestamp: "0:40 - 1:00 (Stems to Full Drop)",
        onScreenHookEn: "5 layers that make up the drop of {title}",
        onScreenHookFr: "Les 5 couches qui composent le drop de {title}",
        captionEn:
          "From raw kick punch to the final lead and atmosphere layers on {title}. Less clutter, heavier impact.",
        captionFr:
          "Du punch brut jusqu'aux couches de lead et d'atmosphère sur {title}. Moins de pistes inutiles, plus d'impact.",
        ctaEn: "Save this breakdown & stream {title} via the link in bio.",
        ctaFr: "Enregistre ce breakdown & écoute {title} via le lien en bio.",
        shotList: [
          "Unmute Kick -> Bass Tail -> Screech -> Vocal -> Full Master every 2 bars",
        ],
      },
    ],
  },
  ep_rollout: {
    label: "EP / Multi-Track Project Rollout (4 Posts)",
    description:
      "Build momentum across an entire EP like DEAD OPS EP or HEAVY SINGLES with tracklist teasers, contrast showcases, and fan polls.",
    steps: [
      {
        dayOffset: -7,
        titleSuffix: "EP Tracklist & Aesthetic Reveal",
        pillar: "release_promo",
        platforms: ["instagram_carousel", "instagram_story", "tiktok"],
        audioTimestamp: "All Tracks — 4s Quick Cuts",
        onScreenHookEn: "{title} — Rapid-fire preview of the new EP",
        onScreenHookFr: "{title} — Aperçu rapide du nouvel EP",
        captionEn:
          "Every track on {title} explores a different angle of uptempo hardcore—from surgical zaag pressure to melodic tension.",
        captionFr:
          "Chaque titre de {title} explore une facette différente de l'uptempo hardcore — de la pression zaag chirurgicale à la tension mélodique.",
        ctaEn: "Which snippet sounds hardest? Comment 1, 2, or 3.",
        ctaFr: "Quel extrait tape le plus fort ? Commente 1, 2 ou 3.",
        shotList: ["Show EP artwork + 4-second drop cut for each track"],
      },
      {
        dayOffset: -3,
        titleSuffix: "The Heaviest Cut vs. The Most Musical Cut",
        pillar: "drop_showcase",
        platforms: ["tiktok", "instagram_reels"],
        audioTimestamp: "0:45 - 1:05",
        onScreenHookEn: "Two sides of my sound on {title}: Pure Zaag vs. Melodic Pressure",
        onScreenHookFr: "Les deux facettes de mon son sur {title} : Pur Zaag vs. Pression Mélodique",
        captionEn: "Hard music doesn't have to be one-dimensional. Here is how {title} balances both.",
        captionFr: "La hard music n'a pas besoin d'être unidimensionnelle. Voici comment {title} équilibre les deux.",
        ctaEn: "Full project drops in 3 days — link in bio.",
        ctaFr: "Le projet complet sort dans 3 jours — lien en bio.",
        shotList: ["Play 6s of the heaviest kick switch, then 6s of the melodic climax"],
      },
      {
        dayOffset: 0,
        titleSuffix: "EP OUT NOW — Full Project Showcase",
        pillar: "release_promo",
        platforms: ["instagram_reels", "tiktok", "youtube_shorts", "instagram_story"],
        audioTimestamp: "0:42 - 1:00",
        onScreenHookEn: "{title} IS LIVE ON ALL PLATFORMS",
        onScreenHookFr: "{title} EST DISPO SUR TOUTES LES PLATEFORMES",
        captionEn: "{title} is out now everywhere. Thank you to everyone blasting these tracks in the gym, in the car, and in your sets.",
        captionFr: "{title} est dispo partout. Merci à tous ceux qui poussent ces sons à la salle, en voiture et dans leurs sets.",
        ctaEn: "Listen to {title} on Spotify, SoundCloud & Apple Music — link in bio.",
        ctaFr: "Écoute {title} sur Spotify, SoundCloud & Apple Music — lien en bio.",
        shotList: ["EP cover showcase + main drop highlight + streaming badges"],
      },
      {
        dayOffset: 4,
        titleSuffix: "Inside the Mastering & Loudness of {title}",
        pillar: "sound_design_tutorial",
        platforms: ["instagram_reels", "tiktok"],
        audioTimestamp: "0:50 - 1:05",
        onScreenHookEn: "How I kept consistency across the drops on {title}",
        onScreenHookFr: "Comment j'ai gardé une cohérence de mix sur tout {title}",
        captionEn: "Getting multiple uptempo tracks to hit at the same perceived loudness without squashing the transients. More in my free course.",
        captionFr: "Obtenir le même impact perçu sur plusieurs titres uptempo sans écraser les transitoires. Plus de détails dans mon cours gratuit.",
        ctaEn: "Free HDM course & full EP in bio.",
        ctaFr: "Cours HDM gratuit & EP complet en bio.",
        shotList: ["Show LUFS/spectrum meter across two drops + master chain"],
      },
    ],
  },
  course_promo: {
    label: "Free HDM Course Funnel (3 High-Save Posts)",
    description:
      "Turn a production topic or course lesson into high-save producer content that drives traffic to /course while building authority.",
    steps: [
      {
        dayOffset: 0,
        titleSuffix: "The #1 Mistake Ruining Your Hard Dance Kicks",
        pillar: "course_funnel",
        platforms: ["instagram_reels", "tiktok", "youtube_shorts"],
        audioTimestamp: "DAW Live Capture",
        onScreenHookEn: "Stop doing this to your kicks if you want them to hit in a real system",
        onScreenHookFr: "Arrête de faire ça à tes kicks si tu veux qu'ils tapent sur un vrai système",
        captionEn:
          "Over-boosting 60Hz before your distortion plugin destroys headroom and smears the punch.\n\nI just published a full breakdown on {title} inside my free Hard Dance Production Course.",
        captionFr:
          "Trop booster les 60Hz avant ta distorsion détruit ton headroom et noie le punch.\n\nJe viens de publier un module complet sur {title} dans mon cours gratuit de production Hard Dance.",
        ctaEn: "100% free course (no email gate, no paywall) — link in bio.",
        ctaFr: "Cours 100% gratuit (zéro paywall) — lien en bio.",
        shotList: [
          "Show the bad EQ curve before distortion (play muddy audio)",
          "Fix the curve and play the clean, punchy result",
          "Show the /course page on screen",
        ],
      },
      {
        dayOffset: 3,
        titleSuffix: "5-Slide Cheat Sheet Carousel",
        pillar: "course_funnel",
        platforms: ["instagram_carousel", "instagram_story"],
        audioTimestamp: "Slide 5 Audio Example",
        onScreenHookEn: "{title} — Producer Cheat Sheet (Save for your next session ->)",
        onScreenHookFr: "{title} — Antisèche Producteur (Enregistre pour ta prochaine session ->)",
        captionEn:
          "Distilled straight from my free HDM production course. Whether you make Uptempo, Rawstyle, or aggressive EDM, these fundamentals don't change.",
        captionFr:
          "Tiré directement de mon cours gratuit de prod HDM. Que tu fasses de l'Uptempo, du Rawstyle ou de l'EDM énervée, ces bases restent les mêmes.",
        ctaEn: "Read & watch the full lesson for free — link in bio.",
        ctaFr: "Lis et regarde la leçon complète gratuitement — lien en bio.",
        shotList: [
          "5 clean dark-purple slides summarizing the key frequencies and routing from {title}",
        ],
      },
      {
        dayOffset: 6,
        titleSuffix: "60-Second DAW Workflow Fix",
        pillar: "sound_design_tutorial",
        platforms: ["tiktok", "instagram_reels", "youtube_shorts"],
        audioTimestamp: "0:00 - 0:45",
        onScreenHookEn: "60-second sound design trick from {title}",
        onScreenHookFr: "Astuce sound design en 60 secondes tirée de {title}",
        captionEn: "Practical technique, zero fluff. Full chapter is live on my website for free.",
        captionFr: "Que de la technique concrète, zéro blabla. Le chapitre complet est dispo gratuitement sur mon site.",
        ctaEn: "Start the free course via the link in bio.",
        ctaFr: "Commence le cours gratuit via le lien en bio.",
        shotList: ["Fast-paced DAW screen recording with zoomed-in plugin tweaks"],
      },
    ],
  },
  evergreen_growth: {
    label: "Weekly Consistency Sprint (4 Balanced Posts)",
    description:
      "A balanced 1-week sprint mixing 2 Drop Showcases, 1 Zaag Sound Design Tutorial, and 1 Course Value Post.",
    steps: [
      {
        dayOffset: 0,
        titleSuffix: "Monday: Zaag Sound Design Breakdown",
        pillar: "sound_design_tutorial",
        platforms: ["instagram_reels", "tiktok", "youtube_shorts"],
        audioTimestamp: "0:42 - 0:55",
        onScreenHookEn: "How I get my zaag kicks to cut through at {bpm} BPM ({title})",
        onScreenHookFr: "Comment je fais percer mes zaag kicks à {bpm} BPM ({title})",
        captionEn: "Quick look inside the kick processing on {title}.",
        captionFr: "Aperçu rapide du traitement de kick sur {title}.",
        ctaEn: "Free HDM course & tracks in bio.",
        ctaFr: "Cours HDM gratuit & sons en bio.",
        shotList: ["DAW kick chain solo vs. full mix"],
      },
      {
        dayOffset: 2,
        titleSuffix: "Wednesday: Heavy Lift / Gym PR Drop Edit",
        pillar: "drop_showcase",
        platforms: ["tiktok", "instagram_reels"],
        audioTimestamp: "1:10 - 1:25",
        onScreenHookEn: "{bpm} BPM built for heavy top sets ({title})",
        onScreenHookFr: "{bpm} BPM calibré pour les séries lourdes ({title})",
        captionEn: "Energy made for late sets and heavy weights. Track: {title}.",
        captionFr: "De l'énergie taillée pour les fins de set et les barres lourdes. Son : {title}.",
        ctaEn: "Stream {title} on Spotify & SoundCloud — link in bio.",
        ctaFr: "Écoute {title} sur Spotify & SoundCloud — lien en bio.",
        shotList: ["Fast cut synced to the main drop"],
      },
      {
        dayOffset: 4,
        titleSuffix: "Friday: Wait for the 2nd Kick Switch",
        pillar: "drop_showcase",
        platforms: ["tiktok", "instagram_reels", "youtube_shorts"],
        audioTimestamp: "0:40 - 0:58",
        onScreenHookEn: "Wait for the kick switch on {title}...",
        onScreenHookFr: "Attends le switch de kick sur {title}...",
        captionEn: "Tension first, impact second. {title} is streaming everywhere.",
        captionFr: "La tension d'abord, l'impact ensuite. {title} est dispo partout.",
        ctaEn: "Full track in bio.",
        ctaFr: "Son complet en bio.",
        shotList: ["Buildup -> Fakeout -> Main Drop"],
      },
      {
        dayOffset: 6,
        titleSuffix: "Sunday: Producer Carousel / Course Value",
        pillar: "course_funnel",
        platforms: ["instagram_carousel", "instagram_story"],
        audioTimestamp: "N/A",
        onScreenHookEn: "3 arrangement choices that make {title} hit harder (Swipe ->)",
        onScreenHookFr: "3 choix d'arrangement qui font cogner {title} plus fort (Swipe ->)",
        captionEn: "Arrangement is the most underrated mixing tool. Learn more in my free HDM course.",
        captionFr: "L'arrangement est l'outil de mixage le plus sous-coté. Plus de détails dans mon cours HDM gratuit.",
        ctaEn: "Free course in bio.",
        ctaFr: "Cours gratuit en bio.",
        shotList: ["3 slides showing arrangement contrast + 1 slide CTA"],
      },
    ],
  },
};
