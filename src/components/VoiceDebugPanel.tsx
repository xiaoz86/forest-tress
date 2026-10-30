'use client';

import { useState, useSyncExternalStore } from 'react';
import {
  clearVoiceDebug,
  getVoiceDebugLines,
  subscribeVoiceDebug,
  voiceDebugOn,
} from '@/lib/voiceDebugLog';

const noLines: string[] = [];
const subscribeNoop = () => () => {};

/**
 * 只在网址带 ?voiceDebug=1 时出现的小面板：把语音链路每一步的状态贴在页面上，
 * 真机上截一张图就能看出问题出在哪（见 lib/voiceDebugLog）。普通用户永远看不到它。
 */
export default function VoiceDebugPanel() {
  const on = useSyncExternalStore(subscribeNoop, voiceDebugOn, () => false);
  const lines = useSyncExternalStore(subscribeVoiceDebug, getVoiceDebugLines, () => noLines);
  const [folded, setFolded] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!on) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用就截图 */
    }
  };

  return (
    <div
      aria-hidden="true"
      className="fixed bottom-2 left-2 z-[300] w-[min(92vw,420px)] rounded-lg bg-black/80 p-2 font-mono text-[10.5px] leading-[1.45] text-green-200 shadow-lg"
    >
      <div className="mb-1 flex items-center gap-2 text-[11px] text-white">
        <span className="font-semibold">voiceDebug</span>
        <button type="button" className="rounded bg-white/15 px-2" onClick={() => setFolded(v => !v)}>
          {folded ? '展开' : '收起'}
        </button>
        <button type="button" className="rounded bg-white/15 px-2" onClick={copy}>
          {copied ? '已复制' : '复制'}
        </button>
        <button type="button" className="rounded bg-white/15 px-2" onClick={clearVoiceDebug}>
          清空
        </button>
      </div>
      {!folded && (
        <div className="max-h-[38vh] overflow-y-auto whitespace-pre-wrap break-all">
          {lines.length ? lines.join('\n') : '（还没有记录：打开语音回复、说一句或发一句试试）'}
        </div>
      )}
    </div>
  );
}
