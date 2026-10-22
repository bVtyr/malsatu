/** Обработка изображений: сжатие для слабого интернета, водяной знак, перцептивный хеш для поиска дубликатов. */
import sharp from "sharp";

export async function processImage(input: Buffer, opts: { maxWidth?: number; watermarkText?: string } = {}) {
  const maxWidth = opts.maxWidth ?? 1600;
  const img = sharp(input).rotate().resize({ width: maxWidth, withoutEnlargement: true });
  const meta = await img.metadata();
  const w = Math.min(meta.width ?? maxWidth, maxWidth);
  const svg = Buffer.from(`<svg width="${w}" height="40"><text x="${w - 12}" y="28" font-size="22" font-family="sans-serif" text-anchor="end" fill="white" fill-opacity="0.7" stroke="black" stroke-opacity="0.3">${opts.watermarkText ?? "MalSatu"}</text></svg>`);
  const full = await img.composite([{ input: svg, gravity: "southeast" }]).webp({ quality: 78 }).toBuffer();
  const thumb = await sharp(input).rotate().resize({ width: 400 }).webp({ quality: 70 }).toBuffer();
  const phash = await perceptualHash(input);
  const info = await sharp(full).metadata();
  return { full, thumb, phash, width: info.width ?? null, height: info.height ?? null };
}

/** Простой aHash 8x8 (64 бита, hex). Достаточен для поиска точных и почти точных дубликатов фото. */
export async function perceptualHash(input: Buffer): Promise<string> {
  const { data } = await sharp(input).grayscale().resize(8, 8, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const avg = data.reduce((a, b) => a + b, 0) / data.length;
  let bits = "";
  for (const px of data) bits += px > avg ? "1" : "0";
  return BigInt("0b" + bits).toString(16).padStart(16, "0");
}

export function hammingDistance(a: string, b: string): number {
  const x = BigInt("0x" + a) ^ BigInt("0x" + b);
  return x.toString(2).split("").filter((c) => c === "1").length;
}
