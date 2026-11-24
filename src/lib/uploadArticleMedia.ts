import { ARTICLE_MEDIA_BUCKET, articleMediaError } from './shareArticleMedia';

export async function uploadArticleMedia(file: File): Promise<string> {
  const error = articleMediaError(file);
  if (error) throw new Error(error);

  const endpoint = '/api/shares/article-media';
  const headers = { 'Content-Type': 'application/json' };
  const prepare = await fetch(endpoint, {
    method: 'POST', headers, body: JSON.stringify({ fileType: file.type, fileSize: file.size }),
  });
  const upload = await prepare.json();
  if (!prepare.ok || !upload.path || !upload.token) throw new Error(upload.error || 'upload-failed');

  const { supabase } = await import('./supabase');
  const { error: transferError } = await supabase.storage.from(ARTICLE_MEDIA_BUCKET)
    .uploadToSignedUrl(upload.path, upload.token, file);
  if (transferError) throw new Error('upload-failed');

  const finish = await fetch(endpoint, {
    method: 'PATCH', headers, body: JSON.stringify({ path: upload.path }),
  });
  const result = await finish.json();
  if (!finish.ok || !result.url) throw new Error(result.error || 'upload-failed');
  return result.url;
}
