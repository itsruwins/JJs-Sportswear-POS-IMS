// The white base garments FLUX.2 prints each new design onto, read from public/design-blanks/
// on the server. FLUX can't reach the app on localhost, so the image goes inline as base64.
// next.config's outputFileTracingIncludes ships the folder with the /design route.

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ShapeId } from "./model";

/** The blank for a shape as base64, or null if the file is missing (the prompt then describes the shape instead). */
export async function blankImage(shape: ShapeId): Promise<string | null> {
  try {
    const bytes = await readFile(path.join(process.cwd(), "public", "design-blanks", `${shape}.jpg`));
    return bytes.toString("base64");
  } catch {
    return null;
  }
}
