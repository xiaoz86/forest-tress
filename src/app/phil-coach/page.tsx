import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import PhilCoachExperience from '@/components/PhilCoachExperience';
import PhilFeedback from '@/components/PhilFeedback';
import { dict, type Dictionary } from '@/i18n';
import { getLocale } from '@/lib/locale';
import { PHIL_ROLES } from '@/lib/philCoach';

export async function generateMetadata(): Promise<Metadata> {
  const t = dict(await getLocale()).philCoach;
  return { title: t.metaTitle, description: t.metaDescription };
}

/** 这一页的介绍文案。对话界面和下面的反馈区还没进字典，那两块仍是中文。 */
type T = Dictionary['philCoach'];

function buildFaqItems(t: T): { question: string; answer: ReactNode }[] {
  return [
    {
      question: t.faq.privacy.question,
      answer: t.faq.privacy.answer,
    },
    {
      question: t.faq.memory.question,
      answer: (
        <>
          <p>{t.faq.memory.p1}</p>
          <p className="mt-3">
            {t.faq.memory.p2Before}
            <span className="text-white/70">{t.faq.memory.p2Keep}</span>
            {t.faq.memory.p2Middle}
            <span className="text-white/70">{t.faq.memory.p2NotSaved}</span>
            {t.faq.memory.p2After}
          </p>
          <p className="mt-3">
            {t.faq.memory.p3Before}
            <Link
              href="/#join"
              className="mx-1 text-coral-soft underline decoration-coral-soft/40 underline-offset-4 transition-colors hover:text-white"
            >
              {t.faq.memory.p3Link}
            </Link>
            {t.faq.memory.p3After}
          </p>
        </>
      ),
    },
    {
      question: t.faq.therapy.question,
      answer: t.faq.therapy.answer,
    },
  ];
}

export default async function PhilCoachPage() {
  const locale = await getLocale();
  const t = dict(locale).philCoach;
  const faqItems = buildFaqItems(t);

  return (
    <>
      <Nav />
      <main className="relative min-h-screen overflow-hidden bg-[#0f1411] px-8 pb-24 pt-32 text-white max-md:px-7 max-md:pt-28">
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(160deg,rgba(255,255,255,0.055),transparent_44%,rgba(232,201,160,0.05))]" />

        <div className="relative mx-auto max-w-[1120px]">
          <div className="mb-12">
            <Link
              href="/"
              className="text-sm text-white/42 underline-offset-4 transition-colors hover:text-white"
            >
              {t.backHome}
            </Link>
          </div>

          {/* Hero */}
          <section className="max-w-[720px]">
            <div className="mb-8 h-px w-20 bg-coral-soft/70" />
            <div className="mb-5 text-[11px] font-medium uppercase tracking-[3px] text-coral-soft">
              {t.hero.eyebrow}
            </div>
            <h1
              className="text-[clamp(2.35rem,5.2vw,4rem)] font-semibold leading-[1.18]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {t.hero.title}
            </h1>
            <p className="mt-7 text-[15px] leading-[2] text-white/56">{t.hero.lede}</p>
            <div className="mt-8 flex items-center gap-4 text-[12px] text-white/36">
              <span className="h-px w-10 bg-white/20" />
              <span>{t.hero.footnote}</span>
            </div>
          </section>

          {/* 初次见面：它是什么、怎么用 */}
          <section className="mt-16">
            <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.2em] text-white/32">
              {t.intro.eyebrow}
            </div>
            <h2 className="text-2xl font-semibold">{t.intro.title}</h2>
            <div className="mt-7 grid grid-cols-2 gap-10 max-md:grid-cols-1">
              <div className="text-[14px] leading-[2.05] text-white/56">
                <p>{t.intro.origin}</p>
                <p className="mt-4">
                  {t.intro.listenBefore}
                  <span className="text-white/80">{t.intro.listenAccent}</span>
                  {t.intro.listenAfter}
                </p>
              </div>
              <div className="text-[14px] leading-[2.05] text-white/56">
                <p>
                  {t.intro.howBefore}
                  <span className="text-white/80">{t.intro.howAccent}</span>
                  {t.intro.howAfter}
                </p>
                <p className="mt-4 text-[13px] text-white/40">{t.intro.disclaimer}</p>
              </div>
            </div>
          </section>

          {/* 四重身份 */}
          <section className="mt-16 border-y border-white/10 py-10">
            <div className="mb-8 flex items-end justify-between gap-6 max-md:block">
              <h2 className="text-2xl font-semibold">{t.roles.title}</h2>
              <p className="max-w-[440px] text-sm leading-relaxed text-white/42 max-md:mt-3">
                {t.roles.note}
              </p>
            </div>
            <div className="grid grid-cols-4 gap-5 max-lg:grid-cols-2 max-md:grid-cols-1">
              {PHIL_ROLES.map(role => {
                // 中文就是 PHIL_ROLES 本身（那个文件同时喂给对话，这轮不动）；
                // 英文在字典里按 id 覆盖。
                const copy = t.roles.byId[role.id] || role;
                return (
                  <div
                    key={role.id}
                    className="rounded-lg border border-white/10 bg-white/[0.035] p-6 transition-colors hover:bg-white/[0.06]"
                  >
                    <h3 className="text-lg font-semibold text-white">{copy.name}</h3>
                    <p className="mt-4 text-[13px] leading-[1.95] text-white/62">
                      {copy.when}
                      {t.roles.sentenceEnd}
                    </p>
                    <p className="mt-3 text-[13px] leading-[1.95] text-white/45">
                      {copy.how}
                      {t.roles.sentenceEnd}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 rounded-xl border border-white/8 bg-black/10 px-6 py-5 text-[13px] leading-[1.9] text-white/56">
              <p>
                <span className="font-medium text-white/72">{t.roles.boundaryLabel}</span>
                {t.roles.boundaryBody}
              </p>
              <p className="mt-3">
                {t.roles.inviteBefore}
                <Link
                  href="/creators"
                  className="mx-1 text-coral-soft underline decoration-coral-soft/40 underline-offset-4 transition-colors hover:text-white"
                >
                  {t.roles.inviteLink}
                </Link>
                {t.roles.inviteAfter}
              </p>
            </div>
          </section>

          {/* FAQ：开口之前，把重要的事说清楚 */}
          <section id="faq" className="mt-16 scroll-mt-24">
            <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.2em] text-white/32">
              {t.faq.eyebrow}
            </div>
            <div className="flex items-end justify-between gap-8 max-md:block">
              <h2 className="text-2xl font-semibold">{t.faq.title}</h2>
              <p className="max-w-[420px] text-[13px] leading-[1.8] text-white/52 max-md:mt-3">
                {t.faq.note}
              </p>
            </div>
            <div className="mt-7 divide-y divide-white/10 border-y border-white/10">
              {faqItems.map(item => (
                <details key={item.question} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[15px] font-medium text-white/82 transition-colors hover:text-white [&::-webkit-details-marker]:hidden">
                    <span>{item.question}</span>
                    <span
                      aria-hidden="true"
                      className="text-xl font-light text-coral-soft transition-transform duration-200 group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <div className="max-w-[860px] pb-6 pr-12 text-[13px] leading-[1.95] text-white/52 max-md:pr-4">
                    {item.answer}
                  </div>
                </details>
              ))}
            </div>
          </section>

          {/* 引导式体验 */}
          <section className="mt-16">
            <div className="mb-8">
              <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.2em] text-white/32">
                {t.experience.eyebrow}
              </div>
              <h2 className="text-2xl font-semibold">{t.experience.title}</h2>
            </div>

            <PhilCoachExperience locale={locale} />
          </section>

          {/* 反馈 / 咨询真人教练 */}
          <PhilFeedback locale={locale} />

          {/* 尾部 */}
          <section className="mt-20 rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center max-md:p-6">
            <h2
              className="text-[clamp(1.6rem,3.4vw,2.2rem)] font-semibold"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {t.outro.title}
            </h2>
            <p className="mx-auto mt-5 max-w-[520px] text-[14px] leading-[2] text-white/52">
              {t.outro.body}
            </p>
            <div className="mt-8 flex justify-center gap-4 max-md:flex-col max-md:items-stretch">
              <Link
                href="/#join"
                className="rounded-full bg-coral-soft px-7 py-3 text-[15px] font-medium text-[#20140f] no-underline transition-opacity hover:opacity-90"
              >
                {t.outro.ctaJoin}
              </Link>
              <Link
                href="/meditations"
                className="rounded-full border border-white/16 bg-white/[0.05] px-7 py-3 text-[15px] text-white/78 no-underline transition-colors hover:bg-white/12 hover:text-white"
              >
                {t.outro.ctaListen}
              </Link>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
