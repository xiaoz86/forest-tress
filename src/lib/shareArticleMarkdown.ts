import type { Nodes } from 'mdast';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkHtml from 'remark-html';

// remark-html drops raw HTML and sanitizes the generated elements and URLs.
// Footnote anchors already receive a user-content prefix from the Markdown parser.
const markdown = remark().use(remarkGfm).use(remarkHtml, { sanitize: { clobberPrefix: '' } });

export function renderShareArticle(source: string): string {
  return String(markdown.processSync(source));
}

function readableText(node: Nodes): string {
  switch (node.type) {
    case 'text':
    case 'inlineCode':
    case 'code':
      return node.value;
    case 'image':
    case 'imageReference':
      return node.alt ?? '';
    case 'break':
      return ' ';
    case 'paragraph':
    case 'heading':
    case 'strong':
    case 'emphasis':
    case 'delete':
    case 'link':
    case 'linkReference':
    case 'tableCell':
      return node.children.map(readableText).join('');
    case 'footnoteDefinition':
      return '';
    default:
      return 'children' in node ? node.children.map(readableText).join(' ') : '';
  }
}

export function articleExcerpt(source: string): string {
  const chars = Array.from(readableText(markdown.parse(source)).replace(/\s+/g, ' ').trim());
  return chars.length > 160 ? chars.slice(0, 159).join('') + '…' : chars.join('');
}
