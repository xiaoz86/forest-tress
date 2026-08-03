'use client';

import { useState } from 'react';
import TrackNotes from '@/components/TrackNotes';

type Props = {
  trackId: string;
  hasAudio: boolean;
  loggedIn: boolean;
  noteCount: number;
};

/**
 * 引导冥想卡片下面那一块：播放器 + 感悟。
 *
 * 单独拆成客户端组件，是因为 MeditationTrackCard 是服务端组件——
 * 那里挂不了 onContextMenu，也存不住「感悟展开没展开」这个状态。
 */
export default function TrackAudioPanel({ trackId, hasAudio, loggedIn, noteCount }: Props) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(noteCount);

  return (
    <div className="mt-4">
      {hasAudio ? (
        <audio
          controls
          preload="none"
          // 去掉原生控件里的「下载」，并挡掉右键菜单。
          // 这只是抬高门槛：地址在网络面板里仍然看得见，
          // 真正的边界是付费门 + 签名链接一小时过期。
          controlsList="nodownload noplaybackrate"
          onContextMenu={e => e.preventDefault()}
          src={`/api/meditations/stream?track=${encodeURIComponent(trackId)}`}
          className="w-full"
        />
      ) : (
        <div className="rounded-lg border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white/42">
          音频正在整理中
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`mt-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] tabular-nums transition-colors ${
          open ? 'bg-white/12 text-white' : 'text-white/38 hover:bg-white/[0.06] hover:text-white/70'
        }`}
      >
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-3 w-3" aria-hidden="true">
          <path d="M1.8 2.4h8.4v5.4H5.4L2.8 9.9V7.8H1.8z" strokeLinejoin="round" />
        </svg>
        {count > 0 ? `${count} 条感悟` : '写下感悟'}
      </button>

      {open && (
        <div className="mt-2 overflow-hidden rounded-lg border border-white/10">
          <TrackNotes
            trackId={trackId}
            loggedIn={loggedIn}
            onCountChange={(_, delta) => setCount(c => Math.max(0, c + delta))}
          />
        </div>
      )}
    </div>
  );
}
