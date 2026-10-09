/**
 * 把文字放进剪贴板。返回成没成功。
 *
 * 两条路都要留着：clipboard API 要求安全上下文，微信内置浏览器和
 * 某些安卓 webview 里拿不到；老的 execCommand 虽然废弃了，但在那些
 * 地方反而是唯一能用的。两条都失败时由调用方把链接摆出来让人自己复制。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 继续走下面那条
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    // 不能用 display:none——选不中就复制不了
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);  // iOS 只认这个
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
