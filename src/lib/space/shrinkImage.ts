/**
 * 上传前在浏览器里把照片缩一缩：最长边 1600px，JPEG 质量 0.85。
 *
 * 线上的接口跑在 Vercel 上，请求体超过 4.5MB 会在进到我们的代码之前就被拒掉（413）；
 * 手机拍的照片动辄 3–8MB，直接传就怎么也传不上。缩完一般几百 KB：传得快、存得小、别人打开活动页也快。
 *
 * - 已经够小的（不超过 1.5MB、最长边不超过 maxEdge）原样上传
 * - 浏览器解不开的格式（比如有些浏览器上的 HEIC）也原样交给服务端，由它说「不支持这种格式」
 * - keepPng：收款码这种要锐利的图保留 PNG（二维码压成 JPEG 边缘会糊）
 */
export const UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;

export async function shrinkImage(
  file: File,
  opts: { maxEdge?: number; quality?: number; keepPng?: boolean } = {},
): Promise<File> {
  const maxEdge = opts.maxEdge ?? 1600;
  const quality = opts.quality ?? 0.85;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap !== 'function') return file;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size <= 1.5 * 1024 * 1024) {
    bmp.close();
    return file;
  }
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bmp.close();
    return file;
  }
  const type = opts.keepPng && file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  // 透明的 PNG 转 JPEG 会变黑底：先铺一层白
  if (type === 'image/jpeg') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.[A-Za-z0-9]+$/, '') + (type === 'image/png' ? '.png' : '.jpg'), { type });
}
