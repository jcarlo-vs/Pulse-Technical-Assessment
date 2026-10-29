// Photos are sent peer-to-peer over the chat data channel, never uploaded.
// Before sending, every photo is decoded and re-encoded as a JPEG: that
// shrinks it and, crucially, strips EXIF metadata - a phone photo's GPS tag
// would otherwise reveal the exact location the 1-3 km dot offset hides.

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_SIDE = 1600;
const QUALITY = 0.85;

export async function preparePhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("That's not an image.");
  if (file.size > MAX_PHOTO_BYTES) throw new Error("Photos must be under 5 MB.");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file); // honours EXIF orientation
  } catch {
    throw new Error("Couldn't read that image.");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY),
  );
  if (!blob) throw new Error("Couldn't process that image.");
  return blob;
}

// JPEG files start with FF D8 FF. Received bytes are only ever rendered as
// image/jpeg, and only if they really are one.
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}
