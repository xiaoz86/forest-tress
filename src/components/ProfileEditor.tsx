'use client';

import { dict } from '@/i18n';
import type { Locale } from '@/lib/locale';
import { KeyboardEvent, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { NodeCard } from '@/lib/supabase';

type Props = {
  node: NodeCard;
  mode: 'owner' | 'admin';
  /**
   * 文案在客户端自己取。字典里有函数（adminUploadAria 这些），
   * 函数跨不过 server → client 那道序列化边界，整片切片当 props
   * 传会让页面直接崩。只传 locale。
   */
  locale: Locale;
};

/** 接口回的错误码 → 人话。文案随语言变，所以放在组件里现取。 */
function errorText(code: string, t: ReturnType<typeof dict>['creatorDetail']['editor']): string {
  const map: Record<string, string> = {
    'name-required': t.error.nameRequired,
    'email-invalid': t.error.emailInvalid,
    'email-taken': t.error.emailTaken,
    forbidden: t.error.forbidden,
    'column-missing': t.error.columnMissing,
    'nothing-to-update': t.error.nothingToUpdate,
    'db-update-failed': t.error.saveFailed,
  };
  return map[code] || t.error.saveFailed;
}

type Form = {
  name: string;
  city: string;
  doing: string;
  experience: string;
  offer: string;
  seeking: string;
  product: string;
  interests: string;
  wechat: string;
  email: string;
  topics: string[];
};

function pickInitial(node: NodeCard): Form {
  return {
    name: node.name || '',
    city: node.city || '',
    doing: node.doing || '',
    experience: node.experience || '',
    offer: node.offer || '',
    seeking: node.seeking || '',
    product: node.product || '',
    interests: node.interests || '',
    wechat: node.wechat || '',
    email: node.email || '',
    topics: Array.isArray(node.topics) ? [...node.topics] : [],
  };
}

/**
 * 文案在客户端自己取。字典里有函数（英文单复数用的），函数跨不过
 * server → client 那道序列化边界，整片切片当 props 传会让页面直接崩。
 * 只传 locale——它仍是服务端算好的，这边不读 cookie。
 */
export default function ProfileEditor({ node, mode, locale }: Props) {
  const t = useMemo(() => dict(locale).creatorDetail.editor, [locale]);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(() => pickInitial(node));
  const [topicInput, setTopicInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const formAnchor = useRef<HTMLDivElement>(null);

  const startEdit = () => {
    setForm(pickInitial(node));
    setErr(null);
    setOpen(true);
    // 滚动让用户看到表单
    setTimeout(() => formAnchor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const cancel = () => {
    setOpen(false);
    setErr(null);
    setForm(pickInitial(node));
  };

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/profile?id=${encodeURIComponent(node.id || '')}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(errorText(json.error, t));
      } else {
        setOpen(false);
        setSavedAt(Date.now());
        router.refresh();
      }
    } catch {
      setErr(t.error.saveFailed);
    } finally {
      setBusy(false);
    }
  };

  const addTopic = () => {
    const t = topicInput.trim();
    if (!t) return;
    if (form.topics.includes(t)) {
      setTopicInput('');
      return;
    }
    setForm(p => ({ ...p, topics: [...p.topics, t].slice(0, 12) }));
    setTopicInput('');
  };

  const handleTopicKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTopic();
    }
  };

  const removeTopic = (t: string) => {
    setForm(p => ({ ...p, topics: p.topics.filter(x => x !== t) }));
  };

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-text-light">
          {mode === 'admin'
            ? t.adminMode
            : t.ownerOnly}
        </p>
        <div className="flex items-center gap-2">
          {savedAt && (
            <span className="text-[11px] text-leaf">{t.saved}</span>
          )}
          <button
            type="button"
            onClick={startEdit}
            className="text-[13px] font-medium px-4 py-2 rounded-full bg-forest-deep text-white hover:bg-forest-mid transition-colors"
          >
            {t.open}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={formAnchor} className="rounded-2xl border border-black/[0.08] bg-white p-5 max-md:p-4 shadow-[0_2px_18px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[16px] font-medium text-forest-deep">{t.title}</h3>
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className="text-[12px] text-text-light hover:text-forest-deep"
        >
          {t.cancel}
        </button>
      </div>

      <div className="grid gap-3.5">
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <Field label={t.field.name}>
            <Text value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} maxLength={60} />
          </Field>
          <Field label={t.field.city}>
            <Text value={form.city} onChange={v => setForm(p => ({ ...p, city: v }))} maxLength={60} />
          </Field>
        </div>

        <Field label={t.field.doing}>
          <Textarea value={form.doing} onChange={v => setForm(p => ({ ...p, doing: v }))} rows={3} maxLength={600} />
        </Field>

        <Field label={t.field.topics}>
          <div className="flex flex-wrap gap-2 p-2 border-[1.5px] border-mist rounded-lg bg-[#fafaf7] focus-within:border-coral-soft min-h-[44px] items-center">
            {form.topics.map(t => (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-love-pink/8 border border-love-pink/15 rounded-full text-[11px] text-coral"
              >
                {t}
                <span
                  className="cursor-pointer opacity-50 hover:opacity-100"
                  onClick={() => removeTopic(t)}
                >
                  &times;
                </span>
              </span>
            ))}
            <input
              type="text"
              value={topicInput}
              onChange={e => setTopicInput(e.target.value)}
              onKeyDown={handleTopicKey}
              onBlur={addTopic}
              placeholder={t.field.topicsPlaceholder}
              className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-[13px]"
            />
          </div>
        </Field>

        <Field label={t.field.interests}>
          <Textarea value={form.interests} onChange={v => setForm(p => ({ ...p, interests: v }))} rows={2} maxLength={240} />
        </Field>

        <Field label={t.field.experience}>
          <Textarea value={form.experience} onChange={v => setForm(p => ({ ...p, experience: v }))} rows={3} maxLength={600} />
        </Field>

        <Field label={t.field.offer}>
          <Textarea value={form.offer} onChange={v => setForm(p => ({ ...p, offer: v }))} rows={2} maxLength={600} />
        </Field>

        <Field label={t.field.seeking}>
          <Textarea value={form.seeking} onChange={v => setForm(p => ({ ...p, seeking: v }))} rows={2} maxLength={600} />
        </Field>

        <Field label={t.field.product}>
          <Textarea value={form.product} onChange={v => setForm(p => ({ ...p, product: v }))} rows={2} maxLength={600} />
        </Field>

        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <Field label={t.field.wechat}>
            <Text value={form.wechat} onChange={v => setForm(p => ({ ...p, wechat: v }))} maxLength={80} />
          </Field>
          <Field label={t.field.email}>
            <Text type="email" value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} maxLength={200} />
          </Field>
        </div>

        {err && <p className="text-[12px] text-coral">{err}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            className="text-[13px] px-4 py-2 rounded-full text-text-light hover:text-forest-deep"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="text-[13px] font-medium px-5 py-2 rounded-full bg-forest-deep text-white hover:bg-forest-mid disabled:opacity-50 transition-colors"
          >
            {busy ? t.saving : t.save}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-text-light mb-1.5">
        {label}
      </div>
      {children}
    </label>
  );
}

function Text({
  value,
  onChange,
  maxLength,
  type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      maxLength={maxLength}
      className="w-full rounded-md border border-black/[0.1] bg-[#fafaf7] px-3 py-2 text-[14px] focus:outline-none focus:border-forest-mid"
    />
  );
}

function Textarea({
  value,
  onChange,
  rows,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  maxLength?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={rows}
      maxLength={maxLength}
      className="w-full rounded-md border border-black/[0.1] bg-[#fafaf7] px-3 py-2 text-[14px] resize-y focus:outline-none focus:border-forest-mid"
    />
  );
}
