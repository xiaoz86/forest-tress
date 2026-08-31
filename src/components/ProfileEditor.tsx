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
  /** 进不进「遇见星空」。缺失当 true——老行没有这个值，判 false 会让人凭空消失 */
  inSky: boolean;
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
    inSky: node.in_sky !== false,
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
  /**
   * 表单基线。**不能直接读 node prop**：保存后只调 router.refresh()，
   * 那是异步的；在它回来之前重新打开表单，pickInitial 会读到旧值。
   * 对普通文本字段只是显示一下旧内容，对「进入星空」这个开关是**静默丢意图**——
   * 「没改就不发」的比较会拿旧基线去比，用户刚打开的那一下就被判成「没改」。
   * 所以保存成功后立刻用接口返回的整行覆盖它。
   */
  const [base, setBase] = useState<NodeCard>(node);
  const [form, setForm] = useState<Form>(() => pickInitial(node));
  const [topicInput, setTopicInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const formAnchor = useRef<HTMLDivElement>(null);

  const startEdit = () => {
    setForm(pickInitial(base));
    setErr(null);
    setOpen(true);
    // 滚动让用户看到表单
    setTimeout(() => formAnchor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const cancel = () => {
    setOpen(false);
    setErr(null);
    setForm(pickInitial(base));
  };

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/profile?id=${encodeURIComponent(node.id || '')}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        /**
         * 后端字段名是 in_sky，表单里叫 inSky，这里显式映射——
         * 直接把 form 整个丢过去的话，inSky 会被后端当未知字段忽略，
         * 表现是「开关点了没反应」而且不报错。
         *
         * 而且**只在它真的被改过时才发**：in_sky 这一列要迁移才有，
         * 每次保存都带上，会让还没跑迁移的库上**所有**资料编辑都失败。
         * 只有真正动了这个开关的人才该撞上「这一列还不存在」。
         */
        body: JSON.stringify(
          form.inSky === (base.in_sky !== false)
            ? { ...form, inSky: undefined }
            : { ...form, inSky: undefined, in_sky: form.inSky },
        ),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(errorText(json.error, t));
      } else {
        // 接口回的是更新后的整行，拿它当新基线——比等 router.refresh() 可靠
        if (json.node) setBase(json.node as NodeCard);
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
        <div className="min-w-0">
          <p className="text-[12px] text-text-light">
            {mode === 'admin' ? t.adminMode : t.ownerOnly}
          </p>
          {/* 关掉之后要能**看见**它关着。这个开关的全部价值就是
              「我能确认我不在那儿」，只在展开的表单里显示等于没有确认。 */}
          {base.in_sky === false && (
            <p className="mt-1 text-[11.5px] text-text-light">· {t.skyOff}</p>
          )}
        </div>
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

        {/* 进不进星空。放在最后：它不是资料，是一个关于「被怎么看见」的选择。 */}
        <label className="flex gap-3 items-start rounded-xl border border-black/[0.07] bg-[#fafaf7] p-3.5 cursor-pointer">
          <input
            type="checkbox"
            checked={form.inSky}
            onChange={e => setForm(p => ({ ...p, inSky: e.target.checked }))}
            className="mt-0.5 size-4 shrink-0 accent-[#2f513d]"
          />
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-forest-deep">
              {t.skyTitle}
              {!form.inSky && (
                <span className="ml-2 text-[11px] font-normal text-text-light">{t.skyOff}</span>
              )}
            </span>
            <span className="mt-1 block text-[11.5px] leading-[1.75] text-text-light">
              {t.skyHint}
            </span>
          </span>
        </label>

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
