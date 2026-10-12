import { readFile } from "node:fs/promises";
import path from "node:path";

// The sample catalog's illustrations (public/samples/*.svg) are drawn in one color each.
// To show a product in every color it comes in, their colors are swapped for CSS variables
// by role: the garment body, its trim, and a body shade. Real product photos are left alone.

const SAMPLE_URL = /^\/samples\/[a-z0-9-]+\.svg$/;

const ROLES: Record<string, string> = {
  // Body colors of the five palettes the samples were drawn in.
  "#1f2321": "var(--g-body)",
  "#0f5d3e": "var(--g-body)",
  "#f3f4f2": "var(--g-body)",
  "#2c65c4": "var(--g-body)",
  "#d4ee3b": "var(--g-body)",
  // Their trims.
  "#6d706e": "var(--g-trim)",
  "#639581": "var(--g-trim)",
  "#aeafae": "var(--g-trim)",
  "#8f9591": "var(--g-trim)",
  "#1f488d": "var(--g-trim)",
  "#98ab2a": "var(--g-trim)",
  // A shaded body (the back sock of a pair).
  "#e4e6e3": "var(--g-shade)",
};

const BODY_HEXES = ["#1f2321", "#0f5d3e", "#f3f4f2", "#2c65c4", "#d4ee3b"];

const cache = new Map<string, string | null>();

/**
 * The recolorable markup of a sample illustration, or null for anything that isn't one
 * (an uploaded photo). `__ID__` marks the sheen gradient's id; the client fills it in so
 * two copies on one page don't share it.
 */
export async function sampleArt(url: string | null): Promise<string | null> {
  if (!url || !SAMPLE_URL.test(url)) return null;
  if (cache.has(url)) return cache.get(url)!;

  let svg: string | null = null;
  try {
    const raw = await readFile(path.join(process.cwd(), "public", url), "utf8");
    svg = recolor(raw);
  } catch {
    svg = null;
  }
  cache.set(url, svg);
  return svg;
}

function recolor(raw: string) {
  let svg = raw
    .replace(/<title>[\s\S]*?<\/title>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\srole="img"/, ' aria-hidden="true" focusable="false"');

  // A soft sheen over the main body shape, so flat art reads as fabric on large tiles.
  const body = svg.match(new RegExp(`<path[^>]*fill="(${BODY_HEXES.join("|")})"[^>]*/>`));
  if (body) {
    const sheen = body[0].replace(/fill="#[0-9a-f]{6}"/, 'fill="url(#__ID__)"').replace(/stroke="[^"]*"/g, "");
    svg = svg.replace(body[0], `${body[0]}${sheen}`);
    svg = svg.replace(
      /(<svg[^>]*>)/,
      `$1<defs><linearGradient id="__ID__" x1="0" y1="0" x2="1" y2="1">` +
        `<stop offset="0" stop-color="#fff" stop-opacity="0.22"/>` +
        `<stop offset="0.45" stop-color="#fff" stop-opacity="0"/>` +
        `<stop offset="1" stop-color="#000" stop-opacity="0.2"/>` +
        `</linearGradient></defs>`,
    );
  }

  // Presentation attributes can't hold var(), so each recolored element gets a style instead.
  return svg.replace(/<(path|rect|circle|ellipse|line|polyline|polygon|g)\b[^>]*?\/?>/g, (tag) => {
    const decls: string[] = [];
    const out = tag.replace(/\s(fill|stroke)="(#[0-9a-f]{6})"/gi, (match, attr: string, hex: string) => {
      const role = ROLES[hex.toLowerCase()];
      if (!role) return match;
      decls.push(`${attr}:${role}`);
      return "";
    });
    return decls.length ? out.replace(/^<(\w+)/, `<$1 style="${decls.join(";")}"`) : out;
  });
}
