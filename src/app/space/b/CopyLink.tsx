'use client';

import { useState } from 'react';

type Props = {
  /** 站内路径（/space/b/…），复制时补上当前域名 */
  path: string;
  className?: string;
  label?: string;
};

/**
 * 「复制链接」：预约人查看自己预约的链接只有这一条，微信里加不了书签，复制下来发给自己最稳。
 * 浏览器不让自动复制（微信内置浏览器常见）时，把链接放进一个选中的输入框，长按手动复制。
 */
export default function CopyLink({ path, className, label = '复制链接' }: Props) {
  const [state, setState] = useState<'idle' | 'ok' | 'manual'>('idle');
  const [url, setUrl] = useState('');

  async function copy() {
    const full = `${window.location.origin}${path}`;
    setUrl(full);
    try {
      await navigator.clipboard.writeText(full);
      setState('ok');
      window.setTimeout(() => setState(s => (s === 'ok' ? 'idle' : s)), 2000);
    } catch {
      setState('manual');
    }
  }

  return (
    <span className={className}>
      <button type="button" className="cl-btn" onClick={() => void copy()}>
        {state === 'ok' ? '已复制 ✓' : label}
      </button>
      {state === 'manual' && (
        <span className="cl-manual">
          <span className="cl-say">这个浏览器不让自动复制，长按下面的链接手动复制：</span>
          <input className="cl-in" readOnly value={url} aria-label="我的预约链接"
            ref={el => { el?.select(); }} onFocus={e => e.currentTarget.select()} />
        </span>
      )}
      <span className="cl-sr" aria-live="polite">{state === 'ok' ? '链接已复制' : ''}</span>
    </span>
  );
}
