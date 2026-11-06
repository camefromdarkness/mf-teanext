import { randomUUID } from "node:crypto";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_REQUEST_SIZE = MAX_FILE_SIZE + 64 * 1024;
const MAX_PIXELS = 36_000_000;

export async function GET() {
  const access = await authorizeStaff();
  if (!access.authorized) return access.response;

  try {
    const directory = path.join(process.cwd(), "public", "uploads", "teas");
    const [registeredImages, files] = await Promise.all([
      prisma.teaImage.findMany({
        distinct: ["url"],
        select: { url: true, alt: true },
        orderBy: { url: "asc" },
      }),
      mkdir(directory, { recursive: true }).then(() => readdir(directory, {
        withFileTypes: true,
      })),
    ]);
    const images = new Map(registeredImages.map((image) => [image.url, image]));
    for (const file of files) {
      if (file.isFile() && /^[0-9a-f-]{36}\.webp$/i.test(file.name)) {
        const url = `/api/uploads/teas/${file.name}`;
        if (!images.has(url)) images.set(url, { url, alt: "" });
      }
    }
    return NextResponse.json([...images.values()]);
  } catch (error) {
    console.error("Не удалось прочитать каталог изображений.", error);
    return NextResponse.json(
      { error: "Не удалось загрузить каталог изображений." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const access = await authorizeStaff();
  if (!access.authorized) return access.response;

  const rawContentLength = request.headers.get("content-length");
  if (rawContentLength && !/^\d+$/.test(rawContentLength)) {
    return NextResponse.json(
      { error: "Некорректный размер загружаемого запроса." },
      { status: 400 },
    );
  }
  if (rawContentLength && Number(rawContentLength) > MAX_REQUEST_SIZE) {
    return NextResponse.json({ error: "Размер файла превышает 8 МБ." }, { status: 413 });
  }

  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data;")) {
    return NextResponse.json(
      { error: "Запрос должен содержать файл изображения." },
      { status: 400 },
    );
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return NextResponse.json({ error: "Файл не получен." }, { status: 400 });
  }

  const chunks: Uint8Array[] = [];
  let requestSize = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      requestSize += value.byteLength;
      if (requestSize > MAX_REQUEST_SIZE) {
        await reader.cancel();
        return NextResponse.json(
          { error: "Размер файла превышает 8 МБ." },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    console.error("Не удалось прочитать загружаемый файл.", error);
    return NextResponse.json(
      { error: "Не удалось прочитать файл." },
      { status: 400 },
    );
  }

  let form: FormData;
  try {
    const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    const uploadRequest = new Request(request.url, {
      method: "POST",
      headers: { "content-type": contentType },
      body,
    });
    form = await uploadRequest.formData();
  } catch {
    return NextResponse.json({ error: "Не удалось прочитать файл." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "Выберите изображение размером не более 8 МБ." },
      { status: 400 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const image = sharp(buffer, { limitInputPixels: MAX_PIXELS });
    const metadata = await image.metadata();
    if (
      !metadata.format ||
      !["jpeg", "png", "webp"].includes(metadata.format) ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > MAX_PIXELS
    ) {
      return NextResponse.json(
        { error: "Поддерживаются только корректные JPG, PNG и WebP." },
        { status: 400 },
      );
    }

    const directory = path.join(process.cwd(), "public", "uploads", "teas");
    const filename = `${randomUUID()}.webp`;
    await mkdir(directory, { recursive: true });
    await image.rotate().webp({ quality: 86 }).toFile(path.join(directory, filename));
    return NextResponse.json({ url: `/api/uploads/teas/${filename}` });
  } catch (error) {
    console.error("Не удалось сохранить изображение чая.", error);
    return NextResponse.json(
      { error: "Не удалось обработать изображение." },
      { status: 500 },
    );
  }
}
