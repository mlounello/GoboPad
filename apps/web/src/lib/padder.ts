export const DEFAULT_SIZES = "100,75,50,33,25,10";
export const MAX_FILES = 25;
export const MAX_DIMENSION = 8000;
export const MAX_TOTAL_PIXELS = 120_000_000;
export const MAX_TOTAL_OUTPUTS = 250;

export type GeneratedVariant = {
  blob: Blob;
  fileName: string;
  zipPath: string;
  percent: number;
  width: number;
  height: number;
  sourceFileName: string;
};

export function parseSizes(input: string): number[] {
  const parts = input
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    throw new Error("Sizes list is empty.");
  }

  const output: number[] = [];
  const seen = new Set<number>();

  for (const part of parts) {
    const value = Number.parseInt(part, 10);
    if (Number.isNaN(value) || value < 1 || value > 100) {
      throw new Error(`Invalid size "${part}". Sizes must be integers from 1 to 100.`);
    }
    if (!seen.has(value)) {
      output.push(value);
      seen.add(value);
    }
  }

  return output;
}

export function inferPrefixFromFilename(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  const stem = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const prefix = stem.replace(/\d+$/, "");
  return prefix || stem;
}

export function newCanvasSize(origWidth: number, origHeight: number, percent: number): { width: number; height: number } {
  const scale = percent / 100;
  return {
    width: Math.round(origWidth / scale),
    height: Math.round(origHeight / scale)
  };
}

function sanitizeStem(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  const stem = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  return stem.replace(/[^a-zA-Z0-9_-]/g, "_");
}

async function loadImage(file: File): Promise<{ bitmap: ImageBitmap; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  return {
    bitmap,
    width: bitmap.width,
    height: bitmap.height
  };
}

async function renderVariantToBlob(
  bitmap: ImageBitmap,
  targetWidth: number,
  targetHeight: number,
  quality: number
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to initialize canvas rendering context.");
  }

  context.fillStyle = "#000000";
  context.fillRect(0, 0, targetWidth, targetHeight);

  const x = Math.floor((targetWidth - bitmap.width) / 2);
  const y = Math.floor((targetHeight - bitmap.height) / 2);
  context.drawImage(bitmap, x, y);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality / 100));
  if (!blob) {
    throw new Error("Failed to encode JPEG output.");
  }

  return blob;
}

export function validateFileCount(files: File[]): void {
  if (files.length === 0) {
    throw new Error("Add at least one image.");
  }
  if (files.length > MAX_FILES) {
    throw new Error(`You selected ${files.length} files. Maximum allowed is ${MAX_FILES}.`);
  }
}

export function getOutputEstimate(fileCount: number, sizeCount: number): number {
  return fileCount * sizeCount;
}

export async function checkImageGuardrails(files: File[]): Promise<void> {
  validateFileCount(files);

  let totalPixels = 0;
  for (const file of files) {
    const { bitmap, width, height } = await loadImage(file);
    bitmap.close();

    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      throw new Error(`"${file.name}" is ${width}x${height}. Maximum allowed dimension is ${MAX_DIMENSION}px.`);
    }

    totalPixels += width * height;
    if (totalPixels > MAX_TOTAL_PIXELS) {
      throw new Error(
        `Total source image pixels exceed limit (${MAX_TOTAL_PIXELS.toLocaleString()}). Reduce batch size or resolution.`
      );
    }
  }
}

export async function generateVariantsForFile(
  file: File,
  sizes: number[],
  quality: number,
  prefixOverride: string,
  shouldCancel: () => boolean,
  onVariantGenerated?: () => void
): Promise<GeneratedVariant[]> {
  if (shouldCancel()) {
    return [];
  }

  const { bitmap, width: origWidth, height: origHeight } = await loadImage(file);
  const sourceStem = sanitizeStem(file.name);
  const prefix = prefixOverride.trim() ? prefixOverride.trim() : inferPrefixFromFilename(file.name);
  const generated: GeneratedVariant[] = [];

  try {
    for (const percent of sizes) {
      if (shouldCancel()) {
        break;
      }
      const target = newCanvasSize(origWidth, origHeight, percent);
      const blob = await renderVariantToBlob(bitmap, target.width, target.height, quality);
      const fileName = `${prefix}${percent}.jpg`;
      generated.push({
        blob,
        fileName,
        zipPath: `${sourceStem}/${fileName}`,
        percent,
        width: target.width,
        height: target.height,
        sourceFileName: file.name
      });
      onVariantGenerated?.();
    }
  } finally {
    bitmap.close();
  }

  return generated;
}
