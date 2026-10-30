'use client';

/**
 * 语音调试日志：网址带 ?voiceDebug=1 时才记，页面上的小面板（VoiceDebugPanel）实时显示。
 *
 * 为什么要显示在页面上：语音的问题几乎都只在真机上出现——iPhone 的静音拨片、
 * 微信内置浏览器的音频会话、麦克风被另一个音频通道饿死——而手机上看不到控制台。
 * 让用户截一张图，就能看出这一轮走的是哪条线、卡在哪一步。
 *
 * 只记状态和耗时：不记录音频、文字内容、令牌和任何密钥。
 */

const MAX_LINES = 80;
let lines: string[] = [];
const listeners = new Set<() => void>();
let enabledCache: boolean | null = null;
const startedAt = typeof performance !== 'undefined' ? performance.now() : 0;

export function voiceDebugOn(): boolean {
  if (enabledCache !== null) return enabledCache;
  try {
    enabledCache = new URLSearchParams(window.location.search).get('voiceDebug') === '1';
  } catch {
    enabledCache = false;
  }
  return enabledCache;
}

/** 记一行：scope 是哪一块（mic / speak / sink / asr / env），msg 只放状态和数字 */
export function vdebug(scope: string, msg: string): void {
  if (!voiceDebugOn()) return;
  const t = typeof performance !== 'undefined' ? ((performance.now() - startedAt) / 1000).toFixed(1) : '?';
  const line = `${t}s ${scope} ${msg}`;
  lines = [...lines.slice(-(MAX_LINES - 1)), line];
  try {
    console.info('[phil-voice]', line);
  } catch {
    /* ignore */
  }
  listeners.forEach(fn => fn());
}

export function clearVoiceDebug(): void {
  lines = [];
  listeners.forEach(fn => fn());
}

export function subscribeVoiceDebug(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getVoiceDebugLines(): string[] {
  return lines;
}
