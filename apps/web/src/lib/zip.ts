import JSZip from "jszip";
import type { GeneratedVariant } from "@/lib/padder";

function sanitizeFolderName(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/[\x00-\x1f\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .replace(/_+/g, "_")
    .trim();

  return cleaned || "gobopad-output";
}

export function makeZipFileName(folderName: string): string {
  return `${sanitizeFolderName(folderName)}.zip`;
}

export async function buildZipBlob(variants: GeneratedVariant[], folderName: string): Promise<Blob> {
  const zip = new JSZip();
  const root = sanitizeFolderName(folderName);
  const usedNames = new Map<string, number>();

  for (const variant of variants) {
    const normalizedName = variant.fileName.replace(/[\x00-\x1f\\/:*?"<>|]+/g, "_");
    const priorCount = usedNames.get(normalizedName) ?? 0;
    usedNames.set(normalizedName, priorCount + 1);

    const finalName =
      priorCount === 0
        ? normalizedName
        : normalizedName.replace(/\.jpg$/i, `-${priorCount + 1}.jpg`);

    zip.file(`${root}/${finalName}`, variant.blob);
  }

  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
