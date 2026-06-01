// Single source of truth for the Polla Mundialera UI asset system.
//
// Style tiers (see plan "Sistema visual coherente de assets WebP por sección"):
//   INLINE   — matte solid-circle family. The DEFAULT inline icon language. Use everywhere small.
//   AWARD    — metallic 3D. ONLY for ranking / podium / positions / achievements.
//   STATUS   — glossy shields/orbs. ONLY for states: live / finished / blocked / alert.
//   MOVEMENT — flat trend triptych (documented exception). ONLY as its own up/down/neutral group.
//   HERO     — big 3D render. ONE focal, isolated asset per section.
//
// Rule that governs everything: never mix two tiers inside the same visual icon group
// (row / strip / list / panel header). Width/height are the asset's REAL intrinsic pixels
// (anti-CLS). All assets already live under the shared UI folder below.

const BASE = "/assets/polla-mundialera/00_shared/ui";

export interface UiAsset {
  readonly src: string;
  readonly width: number;
  readonly height: number;
}

const a = (file: string, width: number, height: number): UiAsset => ({
  src: `${BASE}/${file}`,
  width,
  height,
});

/** TIER 1 — Inline default. Matte solid-circle icons. */
export const INLINE = {
  player: a("icon-circle-player-profile-blue.webp", 275, 279),
  podium: a("icon-circle-ranking-podium-blue.webp", 277, 280),
  trophy: a("icon-circle-trophy-yellow.webp", 272, 280),
  calendar: a("icon-circle-calendar-blue.webp", 264, 274),
  checklist: a("icon-circle-checklist-purple.webp", 257, 267),
  star: a("icon-circle-star-yellow.webp", 252, 264),
  fire: a("icon-circle-fire-streak-green.webp", 269, 275),
  trendUp: a("icon-circle-trend-up-green.webp", 269, 275),
  live: a("icon-circle-live-signal-red.webp", 254, 265),
  refresh: a("icon-circle-refresh-blue.webp", 259, 265),
} as const;

/** TIER 2 — Awards / ranking. Metallic 3D. */
export const AWARD = {
  rank1: a("badge-rank-01-gold.webp", 510, 558),
  rank2: a("badge-rank-02-silver.webp", 500, 558),
  rank3: a("badge-rank-03-bronze.webp", 500, 560),
  medal1: a("medal-position-01-gold.webp", 267, 353),
  medal2: a("medal-position-02-silver.webp", 261, 344),
  medal3: a("medal-position-03-bronze.webp", 260, 339),
  top10: a("badge-top-10-blue-gold.webp", 508, 558),
  shieldStar: a("badge-shield-star-gold.webp", 334, 408),
} as const;

/** TIER 3 — States. Glossy shields / orbs. */
export const STATUS = {
  live: a("badge-shield-live-alert-red.webp", 344, 407),
  finished: a("badge-shield-finish-flag-silver.webp", 345, 417),
  calendar: a("badge-shield-calendar-blue.webp", 345, 427),
  orbCalendar: a("08-badge-calendar-blue-circle.webp", 390, 389),
  orbCommunity: a("09-badge-community-green-circle.webp", 382, 387),
  orbChecklist: a("10-badge-checklist-purple-circle.webp", 385, 387),
  orbAlert: a("11-badge-alert-orange-circle.webp", 355, 357),
  orbBlocked: a("12-badge-blocked-red-circle.webp", 364, 365),
} as const;

/** Movement triptych — flat trend set. Use ONLY together as up/down/neutral. */
export const MOVEMENT = {
  up: a("icon-trend-up-green.webp", 456, 460),
  down: a("icon-trend-down-red.webp", 454, 460),
  neutral: a("icon-trend-neutral-gray.webp", 452, 460),
} as const;

/** TIER 4 — Section heroes. One big 3D render per section, focal & isolated. */
export const HERO = {
  trophy: a("trophy-secplan-worldcup-gold.webp", 1086, 1448),
  trophyLaurel: a("trophy-cup-laurel-gold.webp", 1254, 1254),
  ball: a("asset-ball-energy-swoosh.webp", 1254, 1254),
  stopwatch: a("01-stopwatch-countdown-gold-blue.webp", 1254, 1254),
  chart: a("13-chart-growth-bars-gold-blue.webp", 1254, 1254),
  shieldHandshake: a("14-shield-handshake-secplan-blue-gold.webp", 1254, 1254),
  lock: a("15-lock-data-center-purple.webp", 1254, 1254),
  whistle: a("16-whistle-referee-silver.webp", 1448, 1086),
  cards: a("17-cards-yellow-red-football.webp", 1448, 1086),
  success: a("18-success-check-gold-energy.webp", 1254, 1254),
  shieldSecplan: a("19-shield-secplan-blue-gold-star.webp", 1254, 1254),
  emblem: a("emblem-laurel-star-gold.webp", 1254, 1254),
  mascotWolf: a("mascot-wolf-purple.webp", 413, 479),
} as const;
