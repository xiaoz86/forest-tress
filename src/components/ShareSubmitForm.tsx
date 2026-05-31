'use client';

import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';

type Props = {
  isLoggedIn: boolean;
};

export default function ShareSubmitForm({ isLoggedIn }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  if (!isLoggedIn) {
    return (
      <div className="rounded-lg border border-forest-deep/10 bg-white/72 p-7">
        <div className="mb-3 text-[11px] font-medium tracking-[0.18em] text-coral uppercase">
          带来分享
        </div>
        <h2 className="text-2xl font-semibold text-forest-deep">先登录你的节点</h2>
        <p className="mt-4 text-sm leading-relaxed text-text-secondary">
          登录后，你可以把自己的作品、产品、活动或体验放进林间分享，等待创始人团队审核。
        </p>
        <a
          href="/login"
          className="mt-6 inline-flex rounded-full bg-forest-deep px-5 py-2.5 text-sm font-semibold text-white no-underline"
        >
          去登录
        </a>
      </div>
    );
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setSubmitting(true);
    setMessage('');
    try {
      const res = await fetch('/api/shares/submit', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'submit-failed');
      setMessage('已收到。创始人团队审核后，会出现在林间分享里。');
      form.reset();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-forest-deep/10 bg-white/72 p-7"
    >
      <div className="mb-3 text-[11px] font-medium tracking-[0.18em] text-coral uppercase">
        带来分享
      </div>
      <h2 className="text-2xl font-semibold text-forest-deep">把你的片段放进来</h2>
      <p className="mt-4 text-sm leading-relaxed text-text-secondary">
        可以是作品、产品、活动，也可以是一段体验。它会先进入审核，不会立刻公开。
      </p>

      <div className="mt-7 grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <Field label="标题">
          <input name="title" required maxLength={64} className={inputCls} />
        </Field>
        <Field label="标签（逗号分隔）">
          <input name="tags" maxLength={120} placeholder="作品，体验" className={inputCls} />
        </Field>
        <Field label="从哪个问题开始" className="col-span-2 max-md:col-span-1">
          <input name="question" maxLength={120} className={inputCls} />
        </Field>
        <Field label="简短描述" className="col-span-2 max-md:col-span-1">
          <textarea name="summary" required maxLength={260} className={`${inputCls} min-h-28 resize-y leading-relaxed`} />
        </Field>
        <Field label="补充一句" className="col-span-2 max-md:col-span-1">
          <textarea name="note" maxLength={220} className={`${inputCls} min-h-20 resize-y leading-relaxed`} />
        </Field>
        <Field label="外部链接（可选）" className="col-span-2 max-md:col-span-1">
          <input name="href" type="url" maxLength={900} className={inputCls} />
        </Field>
        <Field label="主媒体">
          <input name="media" type="file" accept="video/mp4,video/quicktime,video/webm,image/*" className={fileInputCls} />
        </Field>
        <Field label="视频海报（可选）">
          <input name="poster" type="file" accept="image/*" className={fileInputCls} />
        </Field>
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-forest-deep px-6 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
        >
          {submitting ? '提交中' : '提交审核'}
        </button>
        {message && (
          <span className="text-sm leading-relaxed text-coral">{message}</span>
        )}
      </div>
    </form>
  );
}

const inputCls =
  'w-full rounded-lg border border-forest-deep/10 bg-white/75 px-4 py-3 text-sm text-forest-deep outline-none transition-colors placeholder:text-text-light/50 focus:border-coral-soft/70';

const fileInputCls =
  'block w-full text-sm text-text-secondary file:mr-4 file:rounded-full file:border-0 file:bg-forest-deep file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white';

function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-[12px] font-medium text-text-light">{label}</span>
      {children}
    </label>
  );
}
