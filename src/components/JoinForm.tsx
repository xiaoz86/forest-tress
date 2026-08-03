'use client';

import { useRef, useState, ChangeEvent } from 'react';
import MatchedNodes from './MatchedNodes';
import type { MatchedNode } from '@/lib/match';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_MIME_LIST = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

// 12 片预设土壤 — 让访客一键认领，不必自己想标签
const TOPIC_CHIPS = [
  '健康 / 身心',
  '生命教育',
  '美学 / 设计',
  '正念 / 冥想',
  '心理 / 教练',
  '内容创作',
  '向善商业',
  '社区运营',
  '亲子 / 家庭',
  'AI / 技术',
  '手作 / 花艺',
  '阅读 / 写作',
];

// 美 · 灵感卡（仅展示，不入库）
const BEAUTY_CARDS = [
  { label: '一个味道', body: '清晨第一口茶的甘甜' },
  { label: '一个画面', body: '黄昏时路边摊冒出的热气' },
  { label: '一个瞬间', body: '陌生城市里一次偶遇的对话' },
  { label: '一种感受', body: '做完一件事后的安静满足' },
];

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

export default function JoinForm() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormState>(empty);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [matches, setMatches] = useState<MatchedNode[]>([]);
  const [welcomeEmailSent, setWelcomeEmailSent] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setData(p => ({ ...p, [k]: v }));

  const toggleTopic = (t: string) => {
    setData(p =>
      p.topics.includes(t)
        ? { ...p, topics: p.topics.filter(x => x !== t) }
        : p.topics.length >= 6
          ? p
          : { ...p, topics: [...p.topics, t] },
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
        setWorkErr(prev => ({ ...prev, [i]: '请上传 JPG / PNG / WebP / HEIC 图片' }));
        return p;
      }
      if (f.size > WORK_IMAGE_MAX_BYTES) {
        setWorkErr(prev => ({ ...prev, [i]: '图片过大，请压缩到 5MB 以内' }));
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
      setPhotoError('请上传 JPG / PNG / WebP / HEIC 图片');
      return;
    }
    if (f.size > MAX_AVATAR_BYTES) {
      setPhotoError('图片过大，请压缩到 5MB 以内');
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

  const submit = async () => {
    if (!canNext) return;
    setStatus('submitting');
    setErrorMsg(null);

    // beautyMoment + beautyCreate 合并进 beauty 列；空段自动跳过
    const beauty = [
      data.beautyMoment.trim() ? `「时刻」${data.beautyMoment.trim()}` : '',
      data.beautyCreate.trim() ? `「想创造或守护」${data.beautyCreate.trim()}` : '',
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
        if (err === 'email-taken') {
          setErrorMsg('这个邮箱已经在森林里了。直接到 /login 输入它就能找回你的节点。');
        } else if (err === 'email-required' || err === 'email-invalid') {
          setErrorMsg('请填一个有效的邮箱。');
        } else {
          setErrorMsg('提交失败，请稍后重试');
        }
        setStatus('error');
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
      setErrorMsg('网络异常，请稍后再试');
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className="max-w-[680px] mx-auto">
        <div className="bg-white rounded-3xl p-10 max-md:p-6 shadow-[0_8px_40px_rgba(26,46,26,0.06)] border border-moss/10">
          <div className="text-center mb-2">
            <div className="text-5xl mb-3">🌱</div>
            <h3 className="font-serif text-2xl font-bold text-forest-deep mb-2">
              你的种子已经种下了
            </h3>
            <p className="text-sm text-text-secondary leading-relaxed">
              {welcomeEmailSent ? (
                <>
                  欢迎邮件 + 登录链接正在发往 {data.email}。
                  <br />
                  请留意收件箱和垃圾邮件夹，点开链接即可继续编辑。
                </>
              ) : (
                <>
                  节点已经建立，但欢迎邮件暂时未能送出。
                  <br />
                  请稍后到登录页输入 {data.email}，重新获取登录链接。
                </>
              )}
            </p>
          </div>
          <MatchedNodes matches={matches} />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[760px] mx-auto">
      {/* 进度提示 + 圆点 */}
      <div className="text-center mb-6">
        <p className="text-[14px] text-text-light mb-4">
          {STEP_COUNT} 步完成你的节点卡，让森林看见你
        </p>
        <div className="flex justify-center items-center gap-2">
          {Array.from({ length: STEP_COUNT }).map((_, i) => {
            const n = i + 1;
            const active = n === step;
            const done = n < step;
            return (
              <span
                key={n}
                aria-label={`第 ${n} 步`}
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
          <StepBody title="你是谁?" subtitle="让森林里的人认识你">
            <Field label="你的名字 / 昵称">
              <Input
                placeholder="怎么称呼你"
                value={data.name}
                onChange={v => set('name', v)}
              />
            </Field>
            <Field label="你在哪座城市">
              <Input
                placeholder="例如:沈阳、北京、成都"
                value={data.city}
                onChange={v => set('city', v)}
              />
            </Field>
            <Field label="用一句话介绍自己">
              <Textarea
                rows={3}
                placeholder="你可以说说你现在在做什么、你关心什么、或者你是一个怎样的人"
                value={data.doing}
                onChange={v => set('doing', v)}
              />
            </Field>
          </StepBody>
        )}

        {step === 2 && (
          <StepBody
            title="你的种子属于哪片土壤?"
            subtitle="选择你关注的领域，可多选（最多 6 个）"
          >
            <div className="flex flex-wrap gap-2.5">
              {TOPIC_CHIPS.map(t => {
                const on = data.topics.includes(t);
                return (
                  <button
                    type="button"
                    key={t}
                    onClick={() => toggleTopic(t)}
                    className={`px-4 py-2 rounded-full border text-[13.5px] transition-all cursor-pointer ${
                      on
                        ? 'bg-leaf/15 border-leaf/40 text-forest-mid font-medium'
                        : 'bg-white border-mist text-text-secondary hover:border-leaf/40 hover:bg-leaf/5'
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            {data.topics.length === 0 && (
              <p className="mt-4 text-[12px] text-text-light">至少选 1 个，最多 6 个</p>
            )}
          </StepBody>
        )}

        {step === 3 && (
          <StepBody title="你想在森林里……" subtitle="你的经验，你能提供的，你在寻找的">
            <Field label="你的经验、优势与独特性">
              <Textarea
                rows={3}
                placeholder="你在哪些领域有经验?你的独特优势是什么?"
                value={data.experience}
                onChange={v => set('experience', v)}
              />
            </Field>
            <Field label="你可以为别人提供什么?">
              <Textarea
                rows={3}
                placeholder="例如:我可以分享正念冥想的经验、提供品牌设计咨询、组织读书会……"
                value={data.offer}
                onChange={v => set('offer', v)}
              />
            </Field>
            <Field label="你正在寻找什么样的连接?">
              <Textarea
                rows={3}
                placeholder="例如:想找一起共创线下活动的伙伴、想认识做生命教育的人、想被更多人看见我的手作产品……"
                value={data.seeking}
                onChange={v => set('seeking', v)}
              />
            </Field>
          </StepBody>
        )}

        {step === 4 && (
          <StepBody
            title="你生命里的「美」是什么?"
            subtitle="在附近森林，美不是标准答案，而是你真切的体验"
          >
            <div className="border-l-[3px] border-leaf/40 pl-5 mb-6 py-1">
              <p className="text-[14px] text-text-secondary leading-[1.95]">
                美是甘甜的味道，是喝茶喝美了的那一刻。<br />
                美是见识的多元，是走过不同的地方之后眼睛里装下的东西。<br />
                美来自直觉、来自于心，脱离同质化，是你生命里那些无法被复制的真切体验。
              </p>
              <div className="flex flex-wrap gap-3 mt-3 text-[12px] text-text-light">
                {['甘甜', '多元', '直觉', '真切', '不可复制'].map(t => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1 mb-6">
              {BEAUTY_CARDS.map(c => (
                <div
                  key={c.label}
                  className="rounded-xl bg-[#fafaf7] p-4 border border-moss/10"
                >
                  <div className="text-[12.5px] font-semibold text-forest-deep mb-1">{c.label}</div>
                  <div className="text-[12.5px] text-text-secondary italic leading-relaxed">
                    {c.body}
                  </div>
                </div>
              ))}
            </div>

            <Field label="你生命中一个「美」的时刻——">
              <Textarea
                rows={3}
                placeholder="一杯茶、一段路、一个人、一件事……什么让你觉得，这就是美?"
                value={data.beautyMoment}
                onChange={v => set('beautyMoment', v)}
              />
            </Field>
            <Field label="你想创造或守护的「美」是什么?">
              <Textarea
                rows={3}
                placeholder="也许是一个产品、一种体验、一个空间、一种生活方式……"
                value={data.beautyCreate}
                onChange={v => set('beautyCreate', v)}
              />
            </Field>
            <Field label="兴趣爱好">
              <Textarea
                rows={2}
                placeholder="工作之外让你心动的事，如:徒步、烘焙、爵士乐、独立电影……"
                value={data.interests}
                onChange={v => set('interests', v)}
              />
            </Field>
          </StepBody>
        )}

        {step === 5 && (
          <StepBody
            title="你心里的那颗种子是什么?"
            subtitle="一个梦想、一个念头、一个还没开始的计划——都可以"
          >
            <Field>
              <Textarea
                rows={6}
                placeholder="例如:我想做一个关于生命教育的播客 / 我想开一间社区花店 / 我想把十年的瑜伽经验做成一门课 / 我还不确定，但我想找到方向……"
                value={data.seed}
                onChange={v => set('seed', v)}
              />
            </Field>
          </StepBody>
        )}

        {step === 6 && (
          <StepBody
            title="你的作品 / 项目集（可选）"
            subtitle="公众号、播客、产品、服务都可以 · 加入后会显示在你的个人页书架上"
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
                        作品 #{i + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeWork(i)}
                        aria-label={`删除作品 ${i + 1}`}
                        className="w-7 h-7 rounded-full inline-flex items-center justify-center text-text-light hover:text-coral hover:bg-coral/10 bg-transparent border-none cursor-pointer text-base leading-none"
                      >
                        ×
                      </button>
                    </div>

                    {/* 封面图 picker — 大缩略图，加入后会在书架上显示 */}
                    <WorkCoverPicker
                      index={i}
                      preview={w.preview}
                      onPick={f => pickWorkCover(i, f)}
                      onClear={() => pickWorkCover(i, null)}
                      error={workErr[i]}
                    />

                    <div className="grid gap-2.5 mt-3">
                      <Input
                        placeholder="标题（如:1on1 教练服务 / 播客《随机漫步的进化》）"
                        value={w.title}
                        onChange={v => updateWork(i, { title: v })}
                      />
                      <Textarea
                        rows={2}
                        placeholder="一句话描述（可选）"
                        value={w.desc}
                        onChange={v => updateWork(i, { desc: v })}
                      />
                      <Input
                        placeholder="跳转链接（可选，https://...）"
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
                {data.works.length === 0 ? '+ 添加你的第一个作品' : '+ 再加一条'}
              </button>
            ) : (
              <p className="text-[12px] text-text-light text-center py-2">
                最多 {MAX_WORKS} 条 · 加入后还能在个人页继续添加
              </p>
            )}

            <p className="text-[12px] text-text-light text-center mt-2 leading-relaxed">
              不知道写什么也可以直接跳过 —— 加入后随时可以在个人页添加和换封面。
            </p>
          </StepBody>
        )}

        {step === 7 && (
          <StepBody title="怎么联系你?" subtitle="森林会用邮箱给你寄欢迎信和登录链接">
            <Field label="形象照（可选）">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => photoRef.current?.click()}
                  className="relative w-20 h-20 rounded-full overflow-hidden border-[1.5px] border-dashed border-mist hover:border-coral-soft bg-warm-cream flex items-center justify-center text-text-light hover:text-coral transition-colors cursor-pointer shrink-0"
                  aria-label={photoPreview ? '更换形象照' : '上传形象照'}
                >
                  {photoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoPreview} alt="预览" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl leading-none">＋</span>
                  )}
                </button>
                <div className="text-[12.5px] text-text-light leading-relaxed">
                  上传一张你愿意被看见的照片<br />
                  JPG / PNG / WebP / HEIC · ≤ 5MB
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
                  邮箱 <span className="text-coral">*</span>
                </span>
              }
            >
              <Input
                type="email"
                placeholder="登录链接 / 通知会发到这里"
                value={data.email}
                onChange={v => set('email', v)}
              />
              <p className="mt-1 text-[12px] text-text-light">必填 · 你之后用它找回个人页</p>
            </Field>

            <Field label="微信号（可选）">
              <Input
                placeholder="方便森林里的人加你"
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
              ← 上一步
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
              {step === 6 ? '最后一步 · 留下联系方式 →' : '下一步 →'}
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!canNext || status === 'submitting'}
              className={`px-7 py-3 rounded-full font-bold text-[14px] transition-all cursor-pointer ${
                canNext && status !== 'submitting'
                  ? 'bg-gradient-to-br from-coral-soft to-warmth text-forest-deep hover:-translate-y-0.5 shadow-[0_4px_20px_rgba(212,160,160,0.3)]'
                  : 'bg-mist text-text-light/60 cursor-not-allowed'
              }`}
            >
              {status === 'submitting' ? '正在种下…' : '🌱 种下我的种子'}
            </button>
          )}
        </div>
      </div>

      <p className="text-center text-[11.5px] text-text-light/80 mt-5 leading-relaxed">
        提交即表示同意森林收下你的信息，用来撮合同频的人。
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
      <h3 className="font-serif text-[1.45rem] max-md:text-[1.25rem] font-bold text-forest-deep mb-2 leading-snug">
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
}: {
  index: number;
  preview: string | null;
  onPick: (f: File) => void;
  onClear: () => void;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative w-full aspect-[16/9] rounded-lg overflow-hidden border-[1.5px] border-dashed border-mist hover:border-leaf/50 bg-white transition-colors cursor-pointer"
        aria-label={preview ? `更换作品 ${index + 1} 的封面` : `上传作品 ${index + 1} 的封面`}
      >
        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt={`作品 ${index + 1} 封面预览`}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center text-white text-[12px] font-medium opacity-0 group-hover:opacity-100">
              点击更换
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-text-light group-hover:text-forest-deep transition-colors">
            <span className="text-2xl leading-none">＋</span>
            <span className="text-[12px]">添加封面图（可选）</span>
            <span className="text-[10.5px] text-text-light/70">建议横版 16:9 · ≤ 5MB</span>
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
            移除封面
          </button>
        </div>
      )}
      {error && <p className="mt-1.5 text-[11.5px] text-coral text-center">{error}</p>}
    </div>
  );
}
