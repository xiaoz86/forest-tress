'use client';

// phil-coach 模块反馈 / 咨询真人教练陪伴。放在体验区下方，任何人都可提交。

import { useState } from 'react';

type Kind = 'feedback' | 'coach-inquiry';

export default function PhilFeedback() {
  const [kind, setKind] = useState<Kind>('feedback');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  async function submit() {
    if (!message.trim() || state === 'sending') return;
    setState('sending');
    try {
      const res = await fetch('/api/phil-coach/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, message: message.trim(), contact: contact.trim() }),
      });
      if (!res.ok) throw new Error('failed');
      setState('done');
      setMessage('');
      setContact('');
    } catch {
      setState('error');
    }
  }

  if (state === 'done') {
    return (
      <section className="mt-16 rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center max-md:p-6">
        <p className="text-[15px] leading-[1.9] text-white/72">
          收到了，谢谢你愿意说。
          {kind === 'coach-inquiry'
            ? '如果你留了联系方式，我们会尽快联系你，聊聊真人教练陪伴。'
            : '你的每一句反馈，都会让这条小径长得更像它该有的样子。'}
        </p>
        <button
          onClick={() => setState('idle')}
          type="button"
          className="mt-5 text-[13px] text-white/45 underline-offset-4 transition-colors hover:text-white hover:underline"
        >
          再说一点
        </button>
      </section>
    );
  }

  return (
    <section className="mt-16 rounded-2xl border border-white/10 bg-white/[0.03] p-8 max-md:p-6">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-white/32">
        说给我们听
      </div>
      <h2 className="text-2xl font-semibold">留下你的反馈</h2>
      <p className="mt-3 text-[14px] leading-[1.9] text-white/52">
        这条小径还很年轻。你用下来的感受、期待，或想被一个真实的人陪一程的心意，都可以留在这里。
      </p>

      <div className="mt-6 flex gap-2">
        {(
          [
            { id: 'feedback', label: '给点反馈' },
            { id: 'coach-inquiry', label: '想咨询真人教练' },
          ] as { id: Kind; label: string }[]
        ).map(opt => (
          <button
            key={opt.id}
            onClick={() => setKind(opt.id)}
            type="button"
            className={`rounded-full px-4 py-2 text-[13px] transition-colors ${
              kind === opt.id
                ? 'bg-coral-soft text-[#20140f]'
                : 'border border-white/16 bg-white/[0.05] text-white/70 hover:bg-white/12'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        rows={4}
        maxLength={2000}
        placeholder={
          kind === 'coach-inquiry'
            ? '说说你想被怎样陪伴，或此刻在经历什么…'
            : '哪里让你觉得好、哪里还不对味，都可以说…'
        }
        className="mt-5 w-full resize-none rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-[15px] leading-relaxed text-white placeholder:text-white/28 focus:border-coral-soft/60 focus:outline-none"
      />
      <input
        value={contact}
        onChange={e => setContact(e.target.value)}
        maxLength={200}
        placeholder={
          kind === 'coach-inquiry'
            ? '留个联系方式，方便我们找到你（微信 / 邮箱）'
            : '想要回音的话，留个联系方式（选填）'
        }
        className="mt-3 w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-[14px] text-white placeholder:text-white/28 focus:border-coral-soft/60 focus:outline-none"
      />

      <div className="mt-4 flex items-center gap-4">
        <button
          onClick={submit}
          disabled={!message.trim() || state === 'sending'}
          type="button"
          className="rounded-full bg-white px-6 py-2.5 text-[14px] font-medium text-[#141a12] transition-opacity disabled:opacity-35"
        >
          {state === 'sending' ? '正在送出' : '送出'}
        </button>
        {state === 'error' && (
          <span className="text-[13px] text-coral-soft">没送出去，稍后再试一次。</span>
        )}
      </div>
    </section>
  );
}
