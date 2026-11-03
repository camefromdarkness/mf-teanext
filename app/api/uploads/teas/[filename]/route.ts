import { getUploadedTeaImage } from "@/lib/uploaded-tea-image";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  return getUploadedTeaImage(filename);
}
