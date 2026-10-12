const MAX_EDGE = 1800;
const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Shrinks large photos and converts other formats (HEIC from phones, etc.) to WebP,
 * so every upload fits the bucket's 5 MB, JPG/PNG/WebP rules.
 */
export async function prepareForUpload(file: File): Promise<{ blob: Blob; ext: string; type: string }> {
  const fits = UPLOAD_TYPES.includes(file.type) && file.size <= 1_500_000;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`“${file.name}” isn’t a photo this browser can read. Try a JPG or PNG.`);
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  if (fits && scale === 1) {
    bitmap.close();
    return { blob: file, ext: file.type.split("/")[1].replace("jpeg", "jpg"), type: file.type };
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
  if (!blob) throw new Error(`We couldn’t prepare “${file.name}”. Try another photo.`);
  return { blob, ext: "webp", type: "image/webp" };
}
