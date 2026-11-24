import { defaultSchema } from 'hast-util-sanitize';
import type { Nodes, Paragraph } from 'mdast';
import { defaultHandlers } from 'mdast-util-to-hast';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkHtml from 'remark-html';

function isArticleVideo(url: string): boolean {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !/^https?:\/\//i.test(base)) return false;
  const prefix = base.replace(/\/$/, '') + '/storage/v1/object/public/shares/article-media/';
  return url.startsWith(prefix) && /^[\w-]+\/[\w-]+\.(mp4|webm)$/i.test(url.slice(prefix.length));
}

const markdown = remark().use(remarkGfm).use(remarkHtml, {
  handlers: {
    paragraph(state, node: Paragraph) {
      const [link] = node.children;
      if (node.children.length !== 1 || link.type !== 'link' || !isArticleVideo(link.url)) {
        return defaultHandlers.paragraph(state, node);
      }
      return {
        type: 'element', tagName: 'video',
        properties: { src: link.url, controls: true, playsInline: true, preload: 'metadata' },
        children: [defaultHandlers.link(state, link)],
      };
    },
  },
  sanitize: {
    // Footnote anchors already receive a user-content prefix from the Markdown parser.
    clobberPrefix: '',
    tagNames: [...(defaultSchema.tagNames ?? []), 'video'],
    attributes: { ...defaultSchema.attributes, video: ['src', 'controls', 'playsInline', ['preload', 'metadata']] },
  },
});

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
