// FLUX.2 from Black Forest Labs: the AI behind the design studio. Server only; the key
// never reaches the browser. Set BFL_API_KEY in the environment to switch the studio from
// sample-art previews to real generations (BFL_MODEL picks the endpoint, flux-2-pro by default).

const API = "https://api.bfl.ai/v1";
const POLL_EVERY_MS = 1200;
const GIVE_UP_AFTER_MS = 90_000;

export const fluxConfigured = () => Boolean(process.env.BFL_API_KEY?.trim());

export class FluxError extends Error {
  constructor(
    message: string,
    /** "moderated" when FLUX's safety filter refused the prompt or image. */
    readonly kind: "moderated" | "failed" | "timeout" = "failed",
  ) {
    super(message);
  }
}

type Submit = { id?: string; polling_url?: string };
type Poll = { status?: string; result?: { sample?: string } };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Generates one image and returns its bytes. `references` are image URLs FLUX can fetch
 * (a design being refined first, then a logo); FLUX.2 takes up to 8. The result link FLUX
 * returns expires in 10 minutes, so the image is downloaded right away.
 */
export async function fluxGenerate(prompt: string, references: string[] = []): Promise<{ bytes: Buffer; type: string }> {
  const key = process.env.BFL_API_KEY?.trim();
  if (!key) throw new FluxError("The AI service isn't connected yet.");
  const model = process.env.BFL_MODEL?.trim() || "flux-2-pro";

  const body: Record<string, unknown> = {
    prompt,
    // Landscape, so the front and back fit side by side.
    width: 1536,
    height: 1024,
    output_format: "jpeg",
    safety_tolerance: 2,
  };
  references.slice(0, 8).forEach((url, i) => {
    body[i === 0 ? "input_image" : `input_image_${i + 1}`] = url;
  });

  const submit = await fetch(`${API}/${model}`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "x-key": key },
    body: JSON.stringify(body),
  });
  if (!submit.ok) {
    if (submit.status === 402) throw new FluxError("The shop’s AI credits have run out. Please message the shop.");
    if (submit.status === 429) throw new FluxError("The AI is busy right now. Try again in a minute.");
    throw new FluxError("The AI service didn’t accept the request. Try again in a moment.");
  }
  const { polling_url } = (await submit.json()) as Submit;
  if (!polling_url) throw new FluxError("The AI service didn’t accept the request. Try again in a moment.");

  const started = Date.now();
  while (Date.now() - started < GIVE_UP_AFTER_MS) {
    await sleep(POLL_EVERY_MS);
    const res = await fetch(polling_url, { headers: { accept: "application/json", "x-key": key } });
    if (!res.ok) continue;
    const poll = (await res.json()) as Poll;
    switch (poll.status) {
      case "Ready": {
        const url = poll.result?.sample;
        if (!url) throw new FluxError("The AI finished but sent no image. Try again.");
        const img = await fetch(url);
        if (!img.ok) throw new FluxError("The design was made but couldn’t be downloaded. Try again.");
        return { bytes: Buffer.from(await img.arrayBuffer()), type: img.headers.get("content-type") ?? "image/jpeg" };
      }
      case "Content Moderated":
      case "Request Moderated":
        throw new FluxError("The AI’s safety filter refused this design. Try different wording or another logo.", "moderated");
      case "Error":
      case "Failed":
        throw new FluxError("The AI couldn’t make this design. Try again.");
      default:
        // Pending, Queued, Processing: keep waiting.
        break;
    }
  }
  throw new FluxError("The AI took too long. Try again in a moment.", "timeout");
}
