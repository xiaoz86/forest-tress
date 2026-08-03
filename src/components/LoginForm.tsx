'use client';

import { useState } from 'react';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const submit = async () => {
    const e = email.trim();
    if (!/^.+@.+\..+$/.test(e)) {
      setStatus('error');
      return;
    }
    setStatus('sending');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: e }),
      });
      if (res.ok) setStatus('sent');
      else setStatus('error');
    } catch {
      setStatus('error');
    }
  };

  if (status === 'sent') {
    return (
      <div className="rounded-xl border border-leaf/30 bg-leaf/8 p-4 text-[13px] leading-relaxed text-forest-deep">
        登录请求已处理。如果该邮箱属于已注册成员，请留意收件箱和垃圾邮件夹。
        <br />
        若暂未收到，请等待一分钟后再试。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') submit();
        }}
        placeholder="注册时填的邮箱"
        autoComplete="email"
        className="w-full px-4 py-3 border-[1.5px] border-mist rounded-lg font-sans text-[14px] text-text-primary bg-warm-cream outline-none transition-all focus:border-coral-soft focus:bg-white"
      />
      <button
        type="button"
        onClick={submit}
        disabled={status === 'sending'}
        className="w-full py-3 rounded-full bg-forest-deep text-white text-[14px] font-medium hover:bg-forest-mid disabled:opacity-60 transition-colors"
      >
        {status === 'sending' ? '发送中…' : '发送登录链接'}
      </button>
      {status === 'error' && (
        <p className="text-[12px] text-coral">邮箱格式不对，或服务暂时不可用，请稍后再试。</p>
      )}
    </div>
  );
}
