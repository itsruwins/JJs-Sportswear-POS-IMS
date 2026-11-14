// The AI design studio's picks and the prompt they become. Safe for client components;
// the generator itself (FLUX.2) runs on the server.

import { garmentColor } from "@/features/shared/catalog/colors";
import { COLOR_SUGGESTIONS } from "@/features/customer/orders/model";

export const DESIGNS_PER_DAY = 3;

export const STUDIO_GARMENTS = ["Jersey", "Reversible jersey", "Sublimated jersey", "Dri-fit shirt", "Polo", "Jacket", "Hoodie"] as const;
export const STUDIO_SPORTS = ["Basketball", "Volleyball", "Football", "Esports", "Running", "School PE"] as const;
/** Each style's prompt is written from the FLUX.2 jersey samples the shop collected. */
export const STUDIO_STYLES = [
  { id: "shards", label: "Angular shards", prompt: "dynamic angular shards: layered sharp triangular slashes bursting up from the hem and the sides, overlapping like broken glass, with a clean open chest" },
  { id: "brush", label: "Brush strokes", prompt: "bold sublimated brush strokes and grunge paint streaks in overlapping diagonal bands framing the chest" },
  { id: "fade", label: "Paint fade", prompt: "a wavy paint fade: the pattern color melts into the body color in uneven flowing waves across the chest and lower body" },
  { id: "split", label: "Half and half", prompt: "a half-and-half split: the left half in the body color and the right half in the pattern color, divided by one straight vertical line down the center" },
  { id: "stripes", label: "Sublimated stripes", prompt: "bold sublimated diagonal stripes sweeping across the body" },
  { id: "gradient", label: "Gradient fade", prompt: "a smooth vertical gradient from the body color at the shoulders to the pattern color at the hem" },
  { id: "pattern", label: "Geometric pattern", prompt: "a sharp geometric sublimated pattern of interlocking triangles and hexagons on the sides and lower body" },
  { id: "classic", label: "Classic", prompt: "a classic solid body with clean contrast trim and simple piping, no all-over pattern" },
  { id: "minimal", label: "Minimal", prompt: "a minimal modern design: a mostly solid body with one thin accent band across the chest" },
] as const;
export type StyleId = (typeof STUDIO_STYLES)[number]["id"];

export const MAX_COLORS = 3;
export const MAX_EXTRA = 300;

export type Cut = "nba" | "regular";
export const CUTS: { id: Cut; label: string }[] = [
  { id: "nba", label: "NBA cut" },
  { id: "regular", label: "Regular cut" },
];

export type DesignPicks = {
  garment: string;
  sport: string;
  /** Basketball jerseys only: NBA cut (side panels) or regular. */
  cut: Cut;
  /** 1 to 3 colors, main first: a swatch name from the shop's list or an exact "#rrggbb". */
  colors: string[];
  style: StyleId;
  /** Across the front. */
  team: string;
  /** On the back, above the number. */
  playerName: string;
  number: string;
  /** The number also goes on the front, under the team name. */
  frontNumber: boolean;
  /** Anything else, in the customer's words. */
  extra: string;
  /** A logo the customer uploaded to ai-designs/{uid}/logos/, used as a reference image. */
  logoPath: string | null;
};

export const blankPicks = (): DesignPicks => ({
  garment: "Jersey",
  sport: "Basketball",
  cut: "nba",
  colors: ["Royal", "White"],
  style: "shards",
  team: "",
  playerName: "",
  number: "",
  frontNumber: true,
  extra: "",
  logoPath: null,
});

// ---------------------------------------------------------------------------
// Garment shapes: each has a blank white base in public/design-blanks/ (made once with
// FLUX.2), sent as image 1 so every design keeps the same cut.
// ---------------------------------------------------------------------------

export type ShapeId = "tank-nba" | "tank-regular" | "tee-v" | "shirt" | "polo" | "jacket" | "hoodie";

const SHAPES: Record<ShapeId, { text: string; trim: string }> = {
  "tank-nba": { text: "sleeveless basketball jersey, NBA cut with side panels and a V-neck", trim: "collar, armhole binding, and side panels" },
  "tank-regular": { text: "sleeveless jersey, regular cut with a round neck and plain side seams", trim: "collar and armhole binding" },
  "tee-v": { text: "short-sleeve V-neck sports jersey with raglan sleeves", trim: "collar and sleeve cuffs" },
  shirt: { text: "short-sleeve round-neck dri-fit shirt", trim: "collar and sleeve cuffs" },
  polo: { text: "short-sleeve sports polo shirt with a knit collar and button placket", trim: "collar, placket, and sleeve cuffs" },
  jacket: { text: "full-zip sports track jacket with a stand-up collar", trim: "collar, zipper line, cuffs, and waistband" },
  hoodie: { text: "pullover hoodie with a front pocket", trim: "hood edge, pocket edge, cuffs, and waistband" },
};

const JERSEYS: readonly string[] = ["Jersey", "Reversible jersey", "Sublimated jersey"];

/** Basketball jerseys come in two cuts; everything else has one shape. */
export const hasCutChoice = (p: Pick<DesignPicks, "garment" | "sport">) => JERSEYS.includes(p.garment) && p.sport === "Basketball";

export function garmentShape(p: Pick<DesignPicks, "garment" | "sport" | "cut">): ShapeId {
  if (p.garment === "Dri-fit shirt") return "shirt";
  if (p.garment === "Polo") return "polo";
  if (p.garment === "Jacket") return "jacket";
  if (p.garment === "Hoodie") return "hoodie";
  if (p.sport === "Basketball") return p.cut === "regular" ? "tank-regular" : "tank-nba";
  if (p.sport === "Running") return "tank-regular";
  return "tee-v";
}

/** The blank base, served from public/ and read by the server for FLUX. */
export const blankSrc = (shape: ShapeId) => `/design-blanks/${shape}.jpg`;

// ---------------------------------------------------------------------------
// Colors: FLUX.2 matches hex codes closely, so every color reaches it as one.
// ---------------------------------------------------------------------------

const HEX = /^#[0-9a-f]{6}$/i;
export const isHexColor = (c: string) => HEX.test(c);

/** A picked "#rrggbb" as is; a swatch name through the shop's palette. */
export const colorHex = (c: string) => (HEX.test(c) ? c : garmentColor(c).body).toUpperCase();

/** How FLUX reads a color: the swatch name helps, the hex decides. */
const colorText = (c: string) => (HEX.test(c) ? `color ${colorHex(c)}` : `${c.toLowerCase()} (color ${colorHex(c)})`);

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(colorHex(a)), luminance(colorHex(b))].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

/** Lettering reads on the body: the first of the team's other colors that stands out, else white or black. */
function letteringColors(colors: string[]) {
  const [main, ...rest] = colors;
  const fill = [...rest, "White", "Black"].find((c) => contrast(c, main) >= 3) ?? "White";
  const outline = [...rest, "White", "Black"].find((c) => c !== fill && colorHex(c) !== colorHex(main) && contrast(c, fill) >= 2) ?? null;
  return { fill, outline };
}

/** Picks with every field trimmed and bounded, whatever the client sent. */
export function cleanPicks(raw: Partial<DesignPicks> | null | undefined, uid: string): DesignPicks | null {
  if (!raw || typeof raw !== "object") return null;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const garment = (STUDIO_GARMENTS as readonly string[]).includes(raw.garment as string) ? (raw.garment as string) : null;
  const sport = (STUDIO_SPORTS as readonly string[]).includes(raw.sport as string) ? (raw.sport as string) : null;
  const style = STUDIO_STYLES.find((s) => s.id === raw.style)?.id ?? null;
  const named = new Map(COLOR_SUGGESTIONS.map((c) => [c.toLowerCase(), c]));
  const colors = Array.isArray(raw.colors)
    ? raw.colors
        .map((c) => text(c, 30))
        .map((c) => (HEX.test(c) ? c.toUpperCase() : named.get(c.toLowerCase()) ?? ""))
        .filter((c, i, all) => c && all.indexOf(c) === i)
        .slice(0, MAX_COLORS)
    : [];
  if (!garment || !sport || !style || colors.length === 0) return null;
  const logo = typeof raw.logoPath === "string" && new RegExp(`^${uid}/logos/[0-9a-f-]{36}\\.(webp|jpe?g|png)$`, "i").test(raw.logoPath) ? raw.logoPath : null;
  return {
    garment,
    sport,
    cut: raw.cut === "regular" ? "regular" : "nba",
    colors,
    style,
    team: text(raw.team, 24),
    playerName: text(raw.playerName, 16),
    number: text(raw.number, 3).replace(/\D/g, ""),
    frontNumber: raw.frontNumber !== false,
    extra: text(raw.extra, MAX_EXTRA),
    logoPath: logo,
  };
}

const quote = (s: string) => `"${s.replace(/"/g, "'")}"`;
/** "MAYON BLAZERS" → "M-A-Y-O-N B-L-A-Z-E-R-S". */
const spellOut = (s: string) => s.split(" ").filter(Boolean).map((w) => [...w].join("-")).join(" ");

/**
 * The FLUX.2 prompt for a new design, modelled on the shop's samples: a 3D ghost-mannequin
 * garment, front and back side by side, soft shadow, plain background. With `blank`, image
 * 1 is the shape's white base and FLUX only prints on it; a logo is the image after it.
 * Word order follows BFL's guide: subject first, exact text in quotes, colors as hex.
 */
export function buildPrompt(p: DesignPicks, refs: { blank: boolean; logo: boolean }) {
  const shape = garmentShape(p);
  const { text: shapeText, trim } = SHAPES[shape];
  const style = STUDIO_STYLES.find((s) => s.id === p.style)!.prompt;
  const [main, second, accent] = p.colors;
  const logoImage = refs.blank ? "image 2" : "image 1";
  const team = p.team.toUpperCase();
  const name = p.playerName.toUpperCase();
  const { fill, outline } = letteringColors(p.colors);
  const garment = `${p.sport.toLowerCase()} ${p.garment.toLowerCase()}`;

  const front = [
    team ? `the team name ${quote(team)} in large arched athletic letters across the chest` : null,
    p.number && p.frontNumber ? `the number ${quote(p.number)} in big varsity numerals ${team ? "under the team name" : "in the center of the chest"}` : null,
    refs.logo ? `the team logo from ${logoImage} ${team ? "small on the left chest" : "large in the center of the chest"}, reproduced faithfully` : null,
  ].filter(Boolean);
  const back = [
    name ? `the player name ${quote(name)} in athletic letters across the upper back` : null,
    p.number ? `the number ${quote(p.number)} in big varsity numerals in the middle of the back` : null,
  ].filter(Boolean);
  const words = [team, name, p.number].filter(Boolean).map(quote);
  // FLUX doubles or drops letters in longer words; spelling them out keeps names right.
  const spelled = [team, name].filter((w) => w.replace(/[^A-Z]/g, "").length > 4).map((w) => `${quote(w)} is spelled ${spellOut(w)}`);

  return [
    refs.blank
      ? `Print a custom sublimated ${garment} design onto the blank white garment in image 1, a ${shapeText}. Keep everything else from image 1 exactly: the cut, collar, seams, and 3D ghost-mannequin shape, the front view on the left and the back view on the right, the soft studio lighting, the soft shadows, and the plain off-white background.`
      : `3D ghost-mannequin product mockup of a custom sublimated ${garment}, a ${shapeText}, shown front view on the left and back view on the right, side by side at the same size, floating with soft shadows on a plain off-white background.`,
    `Colors: the body in ${colorText(main)}, the pattern in ${second ? colorText(second) : `lighter and darker shades of ${colorText(main)}`}, and the ${trim} in ${colorText(accent ?? second ?? main)}.`,
    `Design: ${style}, continuing from the front around to the back so both views match.`,
    front.length ? `Front: ${front.join(", ")}.` : null,
    back.length ? `Back: ${back.join(", ")}.` : null,
    words.length ? `All lettering and numbers in ${colorText(fill)}${outline ? ` with a thin ${colorText(outline)} outline` : ""}.` : null,
    p.extra ? `Also: ${p.extra}.` : null,
    words.length
      ? `The only text on the garment is ${words.join(", ")}, spelled exactly as written${spelled.length ? ` (${spelled.join("; ")})` : ""}.`
      : "The garment has no lettering, numbers, or brand logos.",
    "Realistic polyester athletic mesh with a fine knit texture, crisp print edges, high-detail sportswear catalog render.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** The FLUX prompt for refining a design (image 1): change only what was asked, keep the rest. */
export function buildRefinePrompt(change: string) {
  return [
    `Edit the sportswear design in image 1: ${change}.`,
    "Keep everything else exactly the same unless the change says otherwise: the garment and its cut, the front view on the left and the back view on the right, the colors, the pattern, the lettering and numbers, the lighting, the shadows, and the plain background.",
    "Spell every word and number exactly as in image 1.",
  ].join(" ");
}

/** A short, human summary of the picks for cards and the order page. */
export function picksSummary(p: Partial<DesignPicks> | null) {
  if (!p) return null;
  const garment = p.garment ? p.garment.toLowerCase() + (p.cut && p.sport && hasCutChoice({ garment: p.garment, sport: p.sport }) ? `, ${p.cut === "regular" ? "regular" : "NBA"} cut` : "") : null;
  return [p.sport, garment, p.colors?.length ? p.colors.join(" / ") : null].filter(Boolean).join(" · ");
}
