import type { ChapterKey } from './edits';

export function sameIntroduction(a: string, b: string): boolean {
  const normalize = (s: string) => s.replace(/[\s，。！？、,.!?；;：:]/g, '').toLowerCase();
  return !!a.trim() && normalize(a) === normalize(b);
}

/** 少资料可以合章，但不能改变本人选定的阅读顺序。 */
export function mergeAboutChapters(sparse: boolean, order: ChapterKey[]): boolean {
  return sparse && order.indexOf('path') === order.indexOf('knowing') + 1;
}
