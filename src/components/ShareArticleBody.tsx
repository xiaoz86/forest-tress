import type { ReactNode } from 'react';
import type { ShareArticleTheme } from '@/lib/shareArticle';
import { renderShareArticle } from '@/lib/shareArticleMarkdown';
import styles from './ShareArticleBody.module.css';

export default function ShareArticleBody({ source, theme = 'default', children }: {
  source: string;
  theme?: ShareArticleTheme;
  children?: ReactNode;
}) {
  const body = <div className={styles.prose} dangerouslySetInnerHTML={{ __html: renderShareArticle(source) }} />;
  return theme === 'forest'
    ? <div data-article-theme="forest" className={styles.forest}>{children}{body}</div>
    : <>{children}{body}</>;
}
