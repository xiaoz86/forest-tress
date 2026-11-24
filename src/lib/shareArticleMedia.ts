export const ARTICLE_MEDIA_BUCKET = 'shares';
export const ARTICLE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const ARTICLE_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

const imageTypes = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const videoTypes = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

export const ARTICLE_IMAGE_ACCEPT = Object.keys(imageTypes).join(',');
export const ARTICLE_VIDEO_ACCEPT = Object.keys(videoTypes).join(',');
const extensions = new Map(Object.entries({ ...imageTypes, ...videoTypes }));

export function articleMediaExtension(type: string) {
  return extensions.get(type);
}

export function articleMediaError({ type, size }: { type: string; size: number }) {
  if (!extensions.has(type)) return 'bad-file-type';
  if (!Number.isSafeInteger(size) || size <= 0) return 'empty-file';
  const limit = type.startsWith('video/') ? ARTICLE_VIDEO_MAX_BYTES : ARTICLE_IMAGE_MAX_BYTES;
  return size > limit ? 'file-too-large' : null;
}
