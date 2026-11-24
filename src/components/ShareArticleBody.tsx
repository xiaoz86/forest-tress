import { renderShareArticle } from '@/lib/shareArticleMarkdown';
import styles from './ShareArticleBody.module.css';

export default function ShareArticleBody({ source }: { source: string }) {
  return <div className={styles.prose} dangerouslySetInnerHTML={{ __html: renderShareArticle(source) }} />;
}
