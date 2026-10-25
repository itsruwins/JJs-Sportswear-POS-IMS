// The AI design studio's picks and the prompt they become. Safe for client components;
// the generator itself (FLUX.2) runs on the server.

export const DESIGNS_PER_DAY = 3;

export const STUDIO_GARMENTS = ["Jersey", "Reversible jersey", "Sublimated jersey", "Dri-fit shirt", "Polo", "Jacket", "Hoodie"] as const;
export const STUDIO_SPORTS = ["Basketball", "Volleyball", "Football", "Esports", "Running", "School PE"] as const;
export const STUDIO_STYLES = [
  { id: "classic", label: "Classic", prompt: "classic solid-color design with clean trim" },
  { id: "stripes", label: "Sublimated stripes", prompt: "bold sublimated diagonal stripes" },
  { id: "gradient", label: "Gradient fade", prompt: "smooth gradient fade between the team colors" },
  { id: "pattern", label: "Geometric pattern", prompt: "sharp geometric sublimated pattern" },
  { id: "minimal", label: "Minimal", prompt: "minimal modern design with lots of solid space" },
] as const;
export type StyleId = (typeof STUDIO_STYLES)[number]["id"];

export const MAX_COLORS = 3;
export const MAX_EXTRA = 300;

export type DesignPicks = {
  garment: string;
  sport: string;
  /** 1 to 3 color names, main color first. */
  colors: string[];
  style: StyleId;
  /** Across the front. */
  team: string;
  /** On the back, above the number. */
  playerName: string;
  number: string;
  /** Anything else, in the customer's words. */
  extra: string;
  /** A logo the customer uploaded to ai-designs/{uid}/logos/, used as a reference image. */
  logoPath: string | null;
};

export const blankPicks = (): DesignPicks => ({
  garment: "Jersey",
  sport: "Basketball",
  colors: ["Royal", "White"],
  style: "stripes",
  team: "",
  playerName: "",
  number: "",
  extra: "",
  logoPath: null,
});

/** Picks with every field trimmed and bounded, whatever the client sent. */
export function cleanPicks(raw: Partial<DesignPicks> | null | undefined, uid: string): DesignPicks | null {
  if (!raw || typeof raw !== "object") return null;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const garment = (STUDIO_GARMENTS as readonly string[]).includes(raw.garment as string) ? (raw.garment as string) : null;
  const sport = (STUDIO_SPORTS as readonly string[]).includes(raw.sport as string) ? (raw.sport as string) : null;
  const style = STUDIO_STYLES.find((s) => s.id === raw.style)?.id ?? null;
  const colors = Array.isArray(raw.colors) ? raw.colors.map((c) => text(c, 30)).filter(Boolean).slice(0, MAX_COLORS) : [];
  if (!garment || !sport || !style || colors.length === 0) return null;
  const logo = typeof raw.logoPath === "string" && new RegExp(`^${uid}/logos/[0-9a-f-]{36}\\.(webp|jpe?g|png)$`, "i").test(raw.logoPath) ? raw.logoPath : null;
  return {
    garment,
    sport,
    colors,
    style,
    team: text(raw.team, 24),
    playerName: text(raw.playerName, 16),
    number: text(raw.number, 3).replace(/\D/g, ""),
    extra: text(raw.extra, MAX_EXTRA),
    logoPath: logo,
  };
}

const quote = (s: string) => `"${s.replace(/"/g, "'")}"`;

/**
 * The FLUX prompt for a new design. The app frames every request the same way (front and
 * back, flat, studio background, exact lettering), so customers only describe the team.
 */
export function buildPrompt(p: DesignPicks, withLogo: boolean) {
  const style = STUDIO_STYLES.find((s) => s.id === p.style)!.prompt;
  const [main, second, accent] = p.colors;
  const colorText = [`main color ${main}`, second && `secondary color ${second}`, accent && `accent color ${accent}`].filter(Boolean).join(", ");
  const front = [
    p.team ? `the team name ${quote(p.team.toUpperCase())} across the chest` : null,
    withLogo ? "the team logo from the reference image on the chest" : null,
  ].filter(Boolean);
  const back = [
    p.playerName ? `the player name ${quote(p.playerName.toUpperCase())} across the upper back` : null,
    p.number ? `the number ${quote(p.number)} large in the middle of the back` : null,
  ].filter(Boolean);
  return [
    `Sportswear product design mockup of a ${p.sport.toLowerCase()} ${p.garment.toLowerCase()} with a ${style}, ${colorText}.`,
    "Show the front view and the back view side by side, flat lay, on a plain light grey studio background, no people, no mannequin.",
    front.length ? `Front: ${front.join(" and ")}.` : null,
    back.length ? `Back: ${back.join(", ")}.` : null,
    p.extra ? `Also: ${p.extra}.` : null,
    "Spell every word and number exactly as given. Crisp, readable lettering, realistic fabric, print-ready design.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** The FLUX prompt for refining a design: change only what was asked, keep the rest. */
export function buildRefinePrompt(change: string) {
  return [
    `Edit this jersey design: ${change}.`,
    "Keep the same garment, front and back views side by side, lettering, numbers, and plain light grey background unless the change says otherwise.",
    "Spell every word and number exactly as before.",
  ].join(" ");
}

/** A short, human summary of the picks for cards and the order page. */
export function picksSummary(p: Partial<DesignPicks> | null) {
  if (!p) return null;
  return [p.sport, p.garment?.toLowerCase(), p.colors?.length ? p.colors.join(" / ") : null].filter(Boolean).join(" · ");
}
