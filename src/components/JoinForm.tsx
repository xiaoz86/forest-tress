'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import MatchedNodes from './MatchedNodes';
import { dict } from '@/i18n';
import type { Locale } from '@/lib/locale';
import type { MatchedNode } from '@/lib/match';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_MIME_LIST = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

/**
 * 12 片预设土壤 — 让访客一键认领，不必自己想标签。
 *
 * 这里只留 id。标签文字在字典里（home.join.wizard.topics），
 * 但**入库的值一律取中文那份**：topics 会原样显示在 /creators 的卡片上，
 * 和成员自己填的城市、简介混在一起。英文用户选了 Health / Body-mind，
 * 存进去的仍然是「健康 / 身心」，中文访客看到的还是中文。
 */
const TOPIC_IDS = [
  'health', 'lifeEd', 'aesthetics', 'mindfulness', 'psychology', 'content',
  'business', 'community', 'family', 'tech', 'craft', 'reading',
] as const;
type TopicId = (typeof TOPIC_IDS)[number];

/** 入库用的中文值。不要改成按当前语言取——那会把英文标签写进数据库。 */
const topicValue = (id: TopicId): string => dict('zh').home.join.wizard.topics[id];

const BEAUTY_CARD_IDS = ['taste', 'scene', 'moment', 'feeling'] as const;
const BEAUTY_WORD_IDS = ['w1', 'w2', 'w3', 'w4', 'w5'] as const;

type WorkDraft = {
  title: string;
  desc: string;
  url: string;
  /** 用户挑的封面图，提交节点后两阶段上传 */
  file: File | null;
  /** ObjectURL 预览，离开页面要 revoke */
  preview: string | null;
};
const emptyWork = (): WorkDraft => ({
  title: '',
  desc: '',
  url: '',
  file: null,
  preview: null,
});
const MAX_WORKS = 8;
const WORK_IMAGE_MIME = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
const WORK_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

type FormState = {
  name: string;
  city: string;
  doing: string;
  topics: string[];
  offer: string;
  seeking: string;
  experience: string;
  interests: string;
  beautyMoment: string;
  beautyCreate: string;
  seed: string;
  works: WorkDraft[];
  email: string;
  wechat: string;
};

const empty: FormState = {
  name: '',
  city: '',
  doing: '',
  topics: [],
  offer: '',
  seeking: '',
  experience: '',
  interests: '',
  beautyMoment: '',
  beautyCreate: '',
  seed: '',
  works: [],
  email: '',
  wechat: '',
};

const STEP_COUNT = 7;

/**
 * 文案在客户端自己取。字典里有函数（progress、workNo 这些），函数跨不过
 * server → client 那道序列化边界，整片切片当 props 传会让页面直接崩。
 * 只传 locale——它仍是服务端算好的，这边不读 cookie，不会闪一下中文。
 */
export default function JoinForm({ locale }: { locale: Locale }) {
  const t = useMemo(() => dict(locale).home.join.wizard, [locale]);
  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormState>(empty);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'verify' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /**
   * 第八步：邮箱验证码。
   *
   * 七步填完先发码、不建号；码验过了才真的插入。原来插入成功就当场发
   * 会话 cookie 且从不验证邮箱——那正是「编个邮箱就能看到全站通讯录」
   * 的根因。这一步是把「这个邮箱确实是本人的」钉死的最轻办法。
   */
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyCooldown, setVerifyCooldown] = useState(0);
  const [matches, setMatches] = useState<MatchedNode[]>([]);
  const [welcomeEmailSent, setWelcomeEmailSent] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setData(p => ({ ...p, [k]: v }));

  /** 收进 data.topics 的一律是中文值，见 topicValue 的说明 */
  const toggleTopic = (value: string) => {
    setData(p =>
      p.topics.includes(value)
        ? { ...p, topics: p.topics.filter(x => x !== value) }
        : p.topics.length >= 6
          ? p
          : { ...p, topics: [...p.topics, value] },
    );
  };

  const addWork = () => {
    setData(p =>
      p.works.length >= MAX_WORKS ? p : { ...p, works: [...p.works, emptyWork()] },
    );
  };
  const updateWork = (i: number, patch: Partial<WorkDraft>) => {
    setData(p => ({
      ...p,
      works: p.works.map((w, idx) => (idx === i ? { ...w, ...patch } : w)),
    }));
  };
  const removeWork = (i: number) => {
    setData(p => {
      const target = p.works[i];
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return { ...p, works: p.works.filter((_, idx) => idx !== i) };
    });
  };
  const [workErr, setWorkErr] = useState<Record<number, string>>({});
  const pickWorkCover = (i: number, f: File | null) => {
    setWorkErr(p => ({ ...p, [i]: '' }));
    setData(p => {
      const next = [...p.works];
      const cur = next[i];
      if (!cur) return p;
      if (cur.preview) URL.revokeObjectURL(cur.preview);
      if (!f) {
        next[i] = { ...cur, file: null, preview: null };
        return { ...p, works: next };
      }
      if (!WORK_IMAGE_MIME.split(',').includes(f.type)) {
        setWorkErr(prev => ({ ...prev, [i]: t.error.badImage }));
        return p;
      }
      if (f.size > WORK_IMAGE_MAX_BYTES) {
        setWorkErr(prev => ({ ...prev, [i]: t.error.imageTooLarge }));
        return p;
      }
      next[i] = { ...cur, file: f, preview: URL.createObjectURL(f) };
      return { ...p, works: next };
    });
  };

  const handlePhotoPick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setPhotoError(null);
    if (!f) {
      setPhotoFile(null);
      if (photoPreview) URL.revokeObjectURL(photoPreview);
      setPhotoPreview(null);
      return;
    }
    if (!AVATAR_MIME_LIST.split(',').includes(f.type)) {
      setPhotoError(t.error.badImage);
      return;
    }
    if (f.size > MAX_AVATAR_BYTES) {
      setPhotoError(t.error.imageTooLarge);
      return;
    }
    setPhotoFile(f);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(URL.createObjectURL(f));
  };

  // 每步校验
  const canNext = (() => {
    if (step === 1) return data.name.trim().length > 0 && data.doing.trim().length > 0;
    if (step === 2) return data.topics.length > 0;
    if (step === 3 || step === 4 || step === 5 || step === 6) return true;
    if (step === 7) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim());
    return false;
  })();

  useEffect(() => {
    if (verifyCooldown <= 0) return;
    const id = setTimeout(() => setVerifyCooldown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [verifyCooldown]);

  useEffect(() => {
    const verifiedEmail = window.sessionStorage.getItem('nf_verified_join_email')?.trim() || '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(verifiedEmail)) return;
    const id = window.setTimeout(() => {
      setData(current => current.email ? current : { ...current, email: verifiedEmail });
      window.sessionStorage.removeItem('nf_verified_join_email');
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const submit = async () => {
    if (!canNext) return;
    setStatus('submitting');
    setErrorMsg(null);

    // beautyMoment + beautyCreate 合并进 beauty 列；空段自动跳过
    const beauty = [
      data.beautyMoment.trim() ? `${t.step4.momentPrefix}${data.beautyMoment.trim()}` : '',
      data.beautyCreate.trim() ? `${t.step4.createPrefix}${data.beautyCreate.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    // 保留有 title 的作品；同时记录每条对应的封面文件（按入库后顺序索引）
    const worksForJson: { title: string; desc: string; url: string }[] = [];
    const coverFiles: (File | null)[] = [];
    for (const w of data.works) {
      const title = w.title.trim();
      if (!title) continue;
      worksForJson.push({
        title,
        desc: w.desc.trim(),
        url: w.url.trim(),
      });
      coverFiles.push(w.file);
    }

    const payload = {
      name: data.name.trim(),
      city: data.city.trim(),
      doing: data.doing.trim(),
      topics: data.topics,
      offer: data.offer.trim(),
      seeking: data.seeking.trim(),
      experience: data.experience.trim(),
      interests: data.interests.trim(),
      beauty,
      seed: data.seed.trim(),
      works: worksForJson,
      email: data.email.trim(),
      wechat: data.wechat.trim(),
      /**
       * 第八步填的验证码必须跟着这一次提交走。
       *
       * 漏掉它的后果不是「验证失败」，是**注册永远走不完**：服务端看到没有 code
       * 就再发一封信、回一个 needCode，界面又回到填码那步——填几次都一样。
       * 第一次提交时它是空串，服务端照旧只发码，不受影响。
       */
      code: verifyCode.replace(/\s+/g, ''),
    };

    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({} as Record<string, unknown>));

      if (!res.ok) {
        const err = String(json.error || '');
        if (err === 'code-invalid') {
          setErrorMsg(t.verify.error.code);
          setStatus('verify');
          return;
        }
        if (err === 'email-taken') {
          setErrorMsg(t.error.emailTaken);
        } else if (err === 'email-required' || err === 'email-invalid') {
          setErrorMsg(t.error.emailInvalid);
        } else {
          setErrorMsg(t.error.submitFailed);
        }
        setStatus('error');
        return;
      }

      // 第一次提交没带码，服务端只发码不建号——展开验证那一步
      if (json.needCode === true) {
        setStatus('verify');
        setVerifyCode('');
        setVerifyCooldown(60);
        return;
      }

      setMatches(Array.isArray(json.matches) ? (json.matches as MatchedNode[]) : []);
      setWelcomeEmailSent(json.welcomeEmailSent === true);
      setStatus('success');

      if (photoFile && typeof json.memberId === 'string') {
        try {
          const fd = new FormData();
          fd.set('id', json.memberId);
          fd.set('file', photoFile);
          await fetch('/api/avatar', { method: 'POST', body: fd });
        } catch {
          /* ignore */
        }
      }

      // 第二阶段：把每条带封面图的作品上传。memberId + cookie 都已就绪，
      // 利用 /api/works PATCH 给已生成的 work id 挂图。
      const memberId = typeof json.memberId === 'string' ? json.memberId : '';
      const insertedWorks =
        Array.isArray(json.data) && json.data[0] && Array.isArray(json.data[0].works)
          ? (json.data[0].works as { id: string }[])
          : [];
      if (memberId && insertedWorks.length > 0 && coverFiles.some(Boolean)) {
        // 服务器返回的 works 顺序与我们 payload 的顺序一致；按 index 配对
        await Promise.all(
          coverFiles.map(async (file, i) => {
            if (!file) return;
            const w = insertedWorks[i];
            if (!w?.id) return;
            try {
              const fd = new FormData();
              fd.set('file', file);
              await fetch(
                `/api/works?nodeId=${encodeURIComponent(memberId)}&workId=${encodeURIComponent(w.id)}`,
                { method: 'PATCH', body: fd },
              );
            } catch {
              /* 失败不阻塞，用户进个人页可以重新换图 */
            }
          }),
        );
      }
    } catch {
      setErrorMsg(t.error.network);
      setStatus('error');
    }
  };

  // 第八步：邮箱验证码。七步的内容都还在 state 里，验过码再一起提交。
  if (status === 'verify') {
    const code = verifyCode.replace(/\s+/g, '');
    return (
      <div className="max-w-[680px] mx-auto">
        <div className="bg-white rounded-3xl p-10 max-md:p-6 shadow-[0_8px_40px_rgba(26,46,26,0.06)] border border-moss/10">
          <h3 className="text-2xl font-medium text-forest-deep mb-2">{t.verify.title}</h3>
          <p className="text-sm text-text-secondary leading-relaxed mb-1">
            {t.verify.sentTo(data.email.trim())}
          </p>
          <p className="text-[13px] text-text-light leading-relaxed mb-6">{t.verify.hint}</p>

          <input
            value={verifyCode}
            onChange={e => setVerifyCode(e.target.value.replace(/[^\d\s]/g, '').slice(0, 8))}
            onKeyDown={e => {
              if (e.key === 'Enter') void submit();
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            autoFocus
            placeholder={t.verify.placeholder}
            className="w-full rounded-lg border border-forest-deep/10 bg-white/75 px-4 py-3 text-center font-mono text-[20px] tracking-[0.4em] text-forest-deep outline-none transition-colors focus:border-coral-soft/70"
          />

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={submit}
              disabled={code.length !== 6}
              className="rounded-full bg-forest-deep px-6 py-3 text-sm font-medium text-white transition-opacity disabled:opacity-50"
            >
              {t.verify.cta}
            </button>
            {errorMsg && <span className="text-sm leading-relaxed text-coral">{errorMsg}</span>}
          </div>

          <div className="mt-6 flex items-center justify-between text-[12px] text-text-light">
            <button
              type="button"
              onClick={() => {
                setStatus('idle');
                setStep(7);
                setVerifyCode('');
                setErrorMsg(null);
              }}
              className="underline-offset-2 hover:text-forest-deep hover:underline"
            >
              {t.verify.back}
            </button>
            <button
              type="button"
              onClick={() => {
                setVerifyCode('');
                setErrorMsg(null);
                void submit();
              }}
              disabled={verifyCooldown > 0}
              className="underline-offset-2 hover:text-forest-deep hover:underline disabled:no-underline disabled:hover:text-text-light"
            >
              {verifyCooldown > 0 ? t.verify.resendIn(verifyCooldown) : t.verify.resend}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="max-w-[680px] mx-auto">
        <div className="bg-white rounded-3xl p-10 max-md:p-6 shadow-[0_8px_40px_rgba(26,46,26,0.06)] border border-moss/10">
          <div className="text-center mb-2">
            <div className="text-5xl mb-3">🌱</div>
            <h3 className="text-2xl font-medium text-forest-deep mb-2">
              {t.done.title}
            </h3>
            <p className="text-sm text-text-secondary leading-relaxed">
              {welcomeEmailSent ? (
                <>
                  {t.done.sent(data.email)}
                  <br />
                  {t.done.sentHint}
                </>
              ) : (
                <>
                  {t.done.mailFailed}
                  <br />
                  {t.done.mailFailedHint(data.email)}
                </>
              )}
            </p>
          </div>
          <MatchedNodes matches={matches} locale={locale} />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[760px] mx-auto">
      {/* 进度提示 + 圆点 */}
      <div className="text-center mb-6">
        <p className="text-[14px] text-text-light mb-4">
          {t.progress(STEP_COUNT)}
        </p>
        <div className="flex justify-center items-center gap-2">
          {Array.from({ length: STEP_COUNT }).map((_, i) => {
            const n = i + 1;
            const active = n === step;
            const done = n < step;
            return (
              <span
                key={n}
                aria-label={t.stepAria(n)}
                className={`transition-all rounded-full ${
                  active
                    ? 'w-7 h-2 bg-leaf'
                    : done
                      ? 'w-2 h-2 bg-leaf/60'
                      : 'w-2 h-2 bg-mist'
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* 卡片主体 */}
      <div className="bg-white rounded-3xl p-10 max-md:p-6 shadow-[0_8px_40px_rgba(26,46,26,0.04)] border border-moss/10">
        {step === 1 && (
          <StepBody title={t.step1.title} subtitle={t.step1.subtitle}>
            <Field label={t.step1.name}>
              <Input
                placeholder={t.step1.namePlaceholder}
                value={data.name}
                onChange={v => set('name', v)}
              />
            </Field>
            <Field label={t.step1.city}>
              <Input
                placeholder={t.step1.cityPlaceholder}
                value={data.city}
                onChange={v => set('city', v)}
              />
            </Field>
            <Field label={t.step1.intro}>
              <Textarea
                rows={3}
                placeholder={t.step1.introPlaceholder}
                value={data.doing}
                onChange={v => set('doing', v)}
              />
            </Field>
          </StepBody>
        )}

        {step === 2 && (
          <StepBody
            title={t.step2.title}
            subtitle={t.step2.subtitle}
          >
            <div className="flex flex-wrap gap-2.5">
              {TOPIC_IDS.map(id => {
                // 显示按语言，选中判断和入库都用中文值
                const value = topicValue(id);
                const on = data.topics.includes(value);
                return (
                  <button
                    type="button"
                    key={id}
                    onClick={() => toggleTopic(value)}
                    className={`px-4 py-2 rounded-full border text-[13.5px] transition-all cursor-pointer ${
                      on
                        ? 'bg-leaf/15 border-leaf/40 text-forest-mid font-medium'
                        : 'bg-white border-mist text-text-secondary hover:border-leaf/40 hover:bg-leaf/5'
                    }`}
                  >
                    {t.topics[id]}
                  </button>
                );
              })}
            </div>
            {data.topics.length === 0 && (
              <p className="mt-4 text-[12px] text-text-light">{t.step2.hint}</p>
            )}
          </StepBody>
        )}

        {step === 3 && (
          <StepBody title={t.step3.title} subtitle={t.step3.subtitle}>
            <Field label={t.step3.experience}>
              <Textarea
                rows={3}
                placeholder={t.step3.experiencePlaceholder}
                value={data.experience}
                onChange={v => set('experience', v)}
              />
            </Field>
            <Field label={t.step3.offer}>
              <Textarea
                rows={3}
                placeholder={t.step3.offerPlaceholder}
                value={data.offer}
                onChange={v => set('offer', v)}
              />
            </Field>
            <Field label={t.step3.seek}>
              <Textarea
                rows={3}
                placeholder={t.step3.seekPlaceholder}
                value={data.seeking}
                onChange={v => set('seeking', v)}
              />
            </Field>
          </StepBody>
        )}

        {step === 4 && (
          <StepBody
            title={t.step4.title}
            subtitle={t.step4.subtitle}
          >
            <div className="border-l-[3px] border-leaf/40 pl-5 mb-6 py-1">
              <p className="text-[14px] text-text-secondary leading-[1.95]">
                {t.step4.prose1}<br />
                {t.step4.prose2}<br />
                {t.step4.prose3}
              </p>
              <div className="flex flex-wrap gap-3 mt-3 text-[12px] text-text-light">
                {BEAUTY_WORD_IDS.map(id => (
                  <span key={id}>{t.step4.words[id]}</span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1 mb-6">
              {BEAUTY_CARD_IDS.map(id => (
                <div
                  key={id}
                  className="rounded-xl bg-[#fafaf7] p-4 border border-moss/10"
                >
                  <div className="text-[12.5px] font-semibold text-forest-deep mb-1">
                    {t.step4.cards[id].label}
                  </div>
                  <div className="text-[12.5px] text-text-secondary italic leading-relaxed">
                    {t.step4.cards[id].body}
                  </div>
                </div>
              ))}
            </div>

            <Field label={t.step4.moment}>
              <Textarea
                rows={3}
                placeholder={t.step4.momentPlaceholder}
                value={data.beautyMoment}
                onChange={v => set('beautyMoment', v)}
              />
            </Field>
            <Field label={t.step4.create}>
              <Textarea
                rows={3}
                placeholder={t.step4.createPlaceholder}
                value={data.beautyCreate}
                onChange={v => set('beautyCreate', v)}
              />
            </Field>
            <Field label={t.step4.hobby}>
              <Textarea
                rows={2}
                placeholder={t.step4.hobbyPlaceholder}
                value={data.interests}
                onChange={v => set('interests', v)}
              />
            </Field>
          </StepBody>
        )}

        {step === 5 && (
          <StepBody
            title={t.step5.title}
            subtitle={t.step5.subtitle}
          >
            <Field>
              <Textarea
                rows={6}
                placeholder={t.step5.placeholder}
                value={data.seed}
                onChange={v => set('seed', v)}
              />
            </Field>
          </StepBody>
        )}

        {step === 6 && (
          <StepBody
            title={t.step6.title}
            subtitle={t.step6.subtitle}
          >
            {data.works.length > 0 && (
              <ul className="space-y-3">
                {data.works.map((w, i) => (
                  <li
                    key={i}
                    className="rounded-xl border border-mist bg-[#fafaf7] p-4 max-md:p-3"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <span className="text-[11px] font-semibold tracking-wider text-text-light uppercase pt-2">
                        {t.step6.workNo(i + 1)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeWork(i)}
                        aria-label={t.step6.removeWork(i + 1)}
                        className="w-7 h-7 rounded-full inline-flex items-center justify-center text-text-light hover:text-coral hover:bg-coral/10 bg-transparent border-none cursor-pointer text-base leading-none"
                      >
                        ×
                      </button>
                    </div>

                    {/* 封面图 picker — 大缩略图，加入后会在书架上显示 */}
                    <WorkCoverPicker
                      t={t.step6.cover}
                      index={i}
                      preview={w.preview}
                      onPick={f => pickWorkCover(i, f)}
                      onClear={() => pickWorkCover(i, null)}
                      error={workErr[i]}
                    />

                    <div className="grid gap-2.5 mt-3">
                      <Input
                        placeholder={t.step6.titlePlaceholder}
                        value={w.title}
                        onChange={v => updateWork(i, { title: v })}
                      />
                      <Textarea
                        rows={2}
                        placeholder={t.step6.descPlaceholder}
                        value={w.desc}
                        onChange={v => updateWork(i, { desc: v })}
                      />
                      <Input
                        placeholder={t.step6.urlPlaceholder}
                        value={w.url}
                        onChange={v => updateWork(i, { url: v })}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {data.works.length < MAX_WORKS ? (
              <button
                type="button"
                onClick={addWork}
                className="w-full py-3 rounded-xl border-[1.5px] border-dashed border-mist text-[13.5px] text-text-light hover:text-forest-deep hover:border-leaf/40 hover:bg-leaf/5 transition-colors bg-transparent cursor-pointer"
              >
                {data.works.length === 0 ? t.step6.addFirst : t.step6.addMore}
              </button>
            ) : (
              <p className="text-[12px] text-text-light text-center py-2">
                {t.step6.max(MAX_WORKS)}
              </p>
            )}

            <p className="text-[12px] text-text-light text-center mt-2 leading-relaxed">
              {t.step6.skip}
            </p>
          </StepBody>
        )}

        {step === 7 && (
          <StepBody title={t.step7.title} subtitle={t.step7.subtitle}>
            <Field label={t.step7.photo}>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => photoRef.current?.click()}
                  className="relative w-20 h-20 rounded-full overflow-hidden border-[1.5px] border-dashed border-mist hover:border-coral-soft bg-warm-cream flex items-center justify-center text-text-light hover:text-coral transition-colors cursor-pointer shrink-0"
                  aria-label={photoPreview ? t.step7.photoChangeAria : t.step7.photoUploadAria}
                >
                  {photoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoPreview} alt={t.step7.photoAlt} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl leading-none">＋</span>
                  )}
                </button>
                <div className="text-[12.5px] text-text-light leading-relaxed">
                  {t.step7.photoHint}<br />
                  {t.step7.photoSpec}
                </div>
                <input
                  ref={photoRef}
                  type="file"
                  accept={AVATAR_MIME_LIST}
                  className="hidden"
                  onChange={handlePhotoPick}
                />
              </div>
              {photoError && <p className="mt-2 text-xs text-coral">{photoError}</p>}
            </Field>

            <Field
              label={
                <span>
                  {t.step7.email} <span className="text-coral">*</span>
                </span>
              }
            >
              <Input
                type="email"
                placeholder={t.step7.emailPlaceholder}
                value={data.email}
                onChange={v => set('email', v)}
              />
              <p className="mt-1 text-[12px] text-text-light">{t.step7.emailHint}</p>
            </Field>

            <Field label={t.step7.wechat}>
              <Input
                placeholder={t.step7.wechatPlaceholder}
                value={data.wechat}
                onChange={v => set('wechat', v)}
              />
            </Field>

            {errorMsg && (
              <p className="text-[13px] text-coral mt-2 text-center">{errorMsg}</p>
            )}
          </StepBody>
        )}

        {/* 底部导航 */}
        <div className="mt-9 flex items-center justify-between gap-3 flex-wrap">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              className="px-5 py-2.5 rounded-full border border-mist text-[13.5px] text-text-secondary hover:border-leaf/40 hover:text-forest-mid hover:bg-leaf/5 transition-all bg-white cursor-pointer"
            >
              {t.prev}
            </button>
          ) : (
            <span />
          )}

          {step < STEP_COUNT ? (
            <button
              type="button"
              onClick={() => canNext && setStep(s => s + 1)}
              disabled={!canNext}
              className={`px-6 py-2.5 rounded-full text-[13.5px] transition-all cursor-pointer ${
                canNext
                  ? 'border border-forest-deep text-forest-deep hover:bg-forest-deep hover:text-white'
                  : 'border border-mist text-text-light/60 cursor-not-allowed'
              } bg-white`}
            >
              {step === 6 ? t.lastStep : t.next}
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!canNext || status === 'submitting'}
              className={`px-7 py-3 rounded-full font-medium text-[14px] transition-all cursor-pointer ${
                canNext && status !== 'submitting'
                  ? 'bg-gradient-to-br from-coral-soft to-warmth text-forest-deep hover:-translate-y-0.5 shadow-[0_4px_20px_rgba(212,160,160,0.3)]'
                  : 'bg-mist text-text-light/60 cursor-not-allowed'
              }`}
            >
              {status === 'submitting' ? t.submitting : t.submit}
            </button>
          )}
        </div>
      </div>

      <p className="text-center text-[11.5px] text-text-light/80 mt-5 leading-relaxed">
        {t.consent}
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// 小组件：步骤头 + 字段 + 输入控件
// ──────────────────────────────────────────────────────────────────

function StepBody({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-[1.45rem] max-md:text-[1.25rem] font-medium text-forest-deep mb-2 leading-snug">
        {title}
      </h3>
      {subtitle && (
        <p className="text-[13.5px] text-text-light mb-7 leading-relaxed">{subtitle}</p>
      )}
      <div className="space-y-5">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      {label && (
        <div className="text-[13px] font-medium text-text-secondary mb-2">{label}</div>
      )}
      {children}
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-4 py-3 border border-mist rounded-xl bg-white text-[14px] text-forest-deep placeholder:text-text-light/70 outline-none transition-all focus:border-leaf/50 focus:shadow-[0_0_0_3px_rgba(143,181,115,0.08)]"
    />
  );
}

function Textarea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      rows={rows}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-4 py-3 border border-mist rounded-xl bg-white text-[14px] text-forest-deep placeholder:text-text-light/70 outline-none transition-all focus:border-leaf/50 focus:shadow-[0_0_0_3px_rgba(143,181,115,0.08)] resize-y leading-relaxed"
    />
  );
}

function WorkCoverPicker({
  index,
  preview,
  onPick,
  onClear,
  error,
  t,
}: {
  index: number;
  preview: string | null;
  onPick: (f: File) => void;
  onClear: () => void;
  error?: string;
  /** 封面那一小片文案。同在客户端，函数当 props 传没有序列化问题 */
  t: ReturnType<typeof dict>['home']['join']['wizard']['step6']['cover'];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative w-full aspect-[16/9] rounded-lg overflow-hidden border-[1.5px] border-dashed border-mist hover:border-leaf/50 bg-white transition-colors cursor-pointer"
        aria-label={preview ? t.changeAria(index + 1) : t.uploadAria(index + 1)}
      >
        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt={t.previewAlt(index + 1)}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center text-white text-[12px] font-medium opacity-0 group-hover:opacity-100">
              {t.replace}
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-text-light group-hover:text-forest-deep transition-colors">
            <span className="text-2xl leading-none">＋</span>
            <span className="text-[12px]">{t.add}</span>
            <span className="text-[10.5px] text-text-light/70">{t.hint}</span>
          </div>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = '';
        }}
      />
      {preview && (
        <div className="mt-1.5 text-center">
          <button
            type="button"
            onClick={onClear}
            className="text-[11.5px] text-text-light hover:text-coral underline-offset-2 hover:underline bg-transparent border-none cursor-pointer"
          >
            {t.remove}
          </button>
        </div>
      )}
      {error && <p className="mt-1.5 text-[11.5px] text-coral text-center">{error}</p>}
    </div>
  );
}
