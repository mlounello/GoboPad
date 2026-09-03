import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 30 * 1024 * 1024;

function validateGoogleUploadUrl(rawUrl: FormDataEntryValue | null): string {
  if (typeof rawUrl !== "string") {
    throw new Error("Missing Drive upload URL.");
  }

  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.hostname !== "www.googleapis.com" || url.pathname !== "/upload/drive/v3/files") {
    throw new Error("Invalid Drive upload URL.");
  }

  return url.toString();
}

function parseDriveError(raw: string, fallback: string): string {
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } | string };
    if (typeof parsed.error === "string") {
      return `${fallback}: ${parsed.error}`;
    }
    if (parsed.error?.message) {
      return `${fallback}: ${parsed.error.message}`;
    }
  } catch {
    return `${fallback}: ${raw.slice(0, 240)}`;
  }

  return fallback;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const uploadUrl = validateGoogleUploadUrl(formData.get("uploadUrl"));
    const fileName = String(formData.get("fileName") || "generated image");
    const file = formData.get("file");

    if (!(file instanceof Blob)) {
      throw new Error("Missing generated JPEG file.");
    }
    if (file.type !== "image/jpeg") {
      throw new Error("Only generated JPEG files can be uploaded.");
    }
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      throw new Error("Generated JPEG is too large to upload.");
    }

    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(file.size)
      },
      body: file
    });

    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      throw new Error(parseDriveError(raw, `Drive upload failed for ${fileName}`));
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Drive upload failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
