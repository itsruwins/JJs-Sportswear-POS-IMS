import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse, type Font } from "opentype.js";
import sharp from "sharp";
import { garmentColor } from "./colors";
import { sampleFileFor, type DesignPicks } from "./design-studio";

// Preview designs, used until the shop's FLUX key is added: the shop's sample garment
// illustration in the chosen colors, front and back side by side, with the team name,
// player name, and number set in Archivo. Clearly marked as a preview in the image itself.
// Lettering is drawn as outlines from the bundled font files (lib/customer/fonts, SIL OFL),
// so it looks the same on any server, whatever fonts it has installed.

const W = 1536;
const H = 1024;

// The sample art's palettes: body colors become the main color, trims the second.
const BODY = ["#1f2321", "#0f5d3e", "#f3f4f2", "#2c65c4", "#d4ee3b"];
const TRIM = ["#6d706e", "#639581", "#aeafae", "#8f9591", "#1f488d", "#98ab2a"];
const SHADE = ["#e4e6e3"];

let fonts: Promise<{ board: Font; label: Font }> | null = null;
function loadFonts() {
  const load = async (file: string) => {
    const buf = await readFile(path.join(process.cwd(), "lib", "customer", "fonts", file));
    return parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  };
  fonts ??= Promise.all([load("archivo-extracondensed-800.ttf"), load("archivo-semicondensed-650.ttf")]).then(([board, label]) => ({ board, label }));
  return fonts;
}

/**
 * Lays text out glyph by glyph (advance widths plus kerning). Caps lettering needs no
 * shaping, and opentype.js can't read every lookup in Archivo's shaping tables.
 */
function layout(font: Font, text: string, size: number, spacing: number) {
  const scale = size / font.unitsPerEm;
  const glyphs = [...text].map((c) => font.charToGlyph(c));
  const xs: number[] = [];
  let x = 0;
  glyphs.forEach((g, i) => {
    xs.push(x);
    x += (g.advanceWidth ?? 0) * scale + spacing * size;
    if (glyphs[i + 1]) x += font.getKerningValue(g, glyphs[i + 1]) * scale;
  });
  return { glyphs, xs, width: x - (glyphs.length ? spacing * size : 0) };
}

/** Text as an SVG path centered on cx, shrunk until it fits maxWidth (measured from the font's real widths). */
function lettering(font: Font, text: string, cx: number, baseline: number, size: number, maxWidth: number, fill: string, spacing = 0) {
  if (!text) return "";
  let fs = size;
  while (fs > 8 && layout(font, text, fs, spacing).width > maxWidth) fs -= 1;
  const { glyphs, xs, width } = layout(font, text, fs, spacing);
  const left = cx - width / 2;
  const d = glyphs.map((g, i) => g.getPath(left + xs[i], baseline, fs).toPathData(1)).join("");
  return `<path d="${d}" fill="${fill}"/>`;
}

/** A team name: one line if it reads at a decent size, otherwise two lines split near the middle. */
function teamLettering(font: Font, text: string, cx: number, baseline: number, size: number, maxWidth: number, fill: string) {
  const words = text.split(" ");
  if (words.length < 2 || layout(font, text, size * 0.6, 0).width <= maxWidth) return lettering(font, text, cx, baseline, size, maxWidth, fill);
  let best = 1;
  for (let k = 1; k < words.length; k++) {
    const gap = (n: number) => Math.abs(words.slice(0, n).join(" ").length - words.slice(n).join(" ").length);
    if (gap(k) < gap(best)) best = k;
  }
  const lines = [words.slice(0, best).join(" "), words.slice(best).join(" ")];
  // Both lines at one size, the size the longer line fits at.
  let line = size * 0.72;
  while (line > 8 && lines.some((l) => layout(font, l, line, 0).width > maxWidth)) line -= 1;
  return (
    lettering(font, lines[0], cx, baseline - line * 0.55, line, maxWidth, fill) +
    lettering(font, lines[1], cx, baseline + line * 0.45, line, maxWidth, fill)
  );
}


function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

async function garmentMarkup(p: DesignPicks, body: string, trim: string) {
  const raw = await readFile(path.join(process.cwd(), "public", "samples", sampleFileFor(p)), "utf8");
  const inner = raw
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .replace(/<title>[\s\S]*?<\/title>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  return inner.replace(/(fill|stroke)="(#[0-9a-f]{6})"/gi, (m, attr: string, hex: string) => {
    const h = hex.toLowerCase();
    if (BODY.includes(h)) return `${attr}="${body}"`;
    if (TRIM.includes(h)) return `${attr}="${trim}"`;
    if (SHADE.includes(h)) return `${attr}="${body}"`;
    return m;
  });
}

/** A 1536×1024 WebP preview of the picks. */
export async function renderPreview(p: DesignPicks): Promise<Buffer> {
  const body = garmentColor(p.colors[0]).body;
  // The second color trims the garment; with one color, its own darker or lighter trim does.
  const trim = p.colors[1] ? garmentColor(p.colors[1]).body : garmentColor(p.colors[0]).trim;
  // Lettering: the accent color when there is one, otherwise ink or white against the body.
  const letter = p.colors[2] ? garmentColor(p.colors[2]).body : luminance(body) > 0.6 ? "#18211c" : "#fbfcfb";
  const art = await garmentMarkup(p, body, trim);

  const size = 620;
  const top = 200;
  const frontX = 120;
  const backX = W - 120 - size;
  const { board, label } = await loadFonts();
  const team = p.team.toUpperCase();
  const name = p.playerName.toUpperCase();
  const number = p.number;
  // The narrowest chest is a tee's, between the sleeves: about a third of the drawing.
  const chest = size * 0.32;
  const muted = "#57625c";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#edf1ee"/>
  ${lettering(label, "PREVIEW · SAMPLE ART", W / 2, 92, 26, W, muted, 0.12)}
  ${lettering(label, "FRONT", frontX + size / 2, H - 70, 24, size, muted, 0.12)}
  ${lettering(label, "BACK", backX + size / 2, H - 70, 24, size, muted, 0.12)}
  <svg x="${frontX}" y="${top}" width="${size}" height="${size}" viewBox="0 0 240 240">${art}</svg>
  <svg x="${backX}" y="${top}" width="${size}" height="${size}" viewBox="0 0 240 240">${art}</svg>
  ${teamLettering(board, team, frontX + size / 2, top + size * 0.46, 60, chest, letter)}
  ${lettering(board, number, frontX + size / 2, top + size * 0.66, 104, chest * 0.7, letter)}
  ${lettering(board, name, backX + size / 2, top + size * 0.38, 52, chest, letter)}
  ${lettering(board, number, backX + size / 2, top + size * 0.68, 200, chest * 1.1, letter)}
</svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 88 }).toBuffer();
}
