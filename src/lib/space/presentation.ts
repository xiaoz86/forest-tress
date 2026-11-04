export function sameIntroduction(a: string, b: string): boolean {
  const normalize = (s: string) => s.replace(/[\s，。！？、,.!?；;：:]/g, '').toLowerCase();
  return !!a.trim() && normalize(a) === normalize(b);
}

/** 中文短介绍最多分成两段；只选语义边界，原文一字不改。 */
export function coverTaglineLines(text: string): string[] {
  const chars = [...text];
  const length = chars.length;
  const chinese = chars.filter(c => /[\u3400-\u9fff]/.test(c)).length;
  if (length < 18 || length > 40 || chinese < length / 2 || /[\r\n]/.test(text)) return [text];

  const min = Math.max(6, Math.ceil(length * 0.3));
  let split = 0;
  let distance = Infinity;
  for (let i = 0; i < length; i++) {
    if (!/[，；。！？]/.test(chars[i])) continue;
    let end = i + 1;
    // 闭引号、连续句末标点和空格留在上一段，不悬在下一行开头。
    while (end < length && /[，；。！？、…\s”’」』）》】〕〉]/.test(chars[end])) end++;
    if (end < min || length - end < min) continue;
    const delta = Math.abs(end - length / 2);
    if (delta < distance) { split = end; distance = delta; }
  }
  return split ? [chars.slice(0, split).join(''), chars.slice(split).join('')] : [text];
}
