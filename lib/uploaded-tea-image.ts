import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

const IMAGE_FILENAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i;

export async function getUploadedTeaImage(filename: string) {
  if (!IMAGE_FILENAME.test(filename)) {
    return new Response("Not found", { status: 404 });
  }

  const imagePath = path.join(
    process.cwd(),
    "public",
    "uploads",
    "teas",
    filename,
  );
  try {
    const image = await readFile(imagePath);
    return new Response(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return new Response("Not found", { status: 404 });
    }

    console.error("Не удалось прочитать фотографию чая.", error);
    return new Response("Unable to read image", { status: 500 });
  }
}
