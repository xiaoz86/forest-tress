import assert from 'node:assert/strict';
import test from 'node:test';
import { articleExcerpt, renderShareArticle } from '../src/lib/shareArticleMarkdown.ts';

test('pasted Markdown keeps its structure and drops raw HTML and unsafe links', () => {
  const html = renderShareArticle(
    '## 林间笔记\n\n- **树**\n- [日记](/shares)\n\n| 地点 | 天气 |\n| --- | --- |\n| 林间 | 雨 |\n\n' +
    '```html\n<div>代码</div>\n```\n\n<style>body { color: red }</style>\n\n[附件](data:text/plain,hi)',
  );
  assert.match(html, /<h2>林间笔记<\/h2>/);
  assert.match(html, /<li><strong>树<\/strong><\/li>/);
  assert.match(html, /<a href="\/shares">日记<\/a>/);
  assert.match(html, /<td>林间<\/td>/);
  assert.match(html, /<pre><code[^>]*>[^<]*代码/);
  assert.doesNotMatch(html, /<style|href="data:/);
});

test('card excerpts keep readable text, link labels, and whole Unicode characters', () => {
  assert.equal(articleExcerpt('## 树\n\n用**树**连接[朋友](https://example.org)\n\n![青松](tree.jpg)'), '树 用树连接朋友 青松');
  assert.equal(articleExcerpt('🌿'.repeat(161)), '🌿'.repeat(159) + '…');
});

test('uploaded images and standalone video links render inside the article', t => {
  const original = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://forest.example/';
  t.after(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = original;
  });
  const dir = 'https://forest.example/storage/v1/object/public/shares/article-media/member-id/';
  assert.ok(renderShareArticle(`![林间](${dir}image.jpg)`).includes(`<img src="${dir}image.jpg" alt="林间">`));
  for (const ext of ['mp4', 'webm']) {
    const src = dir + 'test.' + ext;
    const html = renderShareArticle(`[林间录影](${src})`);
    assert.ok(html.includes(`<video src="${src}" controls playsinline preload="metadata">`));
    assert.ok(html.includes(`<a href="${src}">林间录影</a>`));
    for (const source of [
      `观看 [林间录影](${src})`,
      `[其他平台](${src.replace('forest.example', 'other.example')})`,
      `[其他目录](${src.replace('article-media/', '')})`,
      `\`[代码](${src})\``,
      `<video src="${src}" autoplay></video>`,
    ]) {
      assert.doesNotMatch(renderShareArticle(source), /<video\b/);
    }
  }
});
