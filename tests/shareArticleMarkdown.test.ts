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
