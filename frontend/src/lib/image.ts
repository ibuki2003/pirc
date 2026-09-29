import type { ImageContent } from "@pirc/api";

export async function resizeImage(file: File): Promise<ImageContent> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1568 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const mimeType = "image/jpeg";
    const data = canvas.toDataURL(mimeType, 0.85).split(",")[1];
    return { type: "image", mimeType, data };
  } finally { bitmap.close(); }
}
