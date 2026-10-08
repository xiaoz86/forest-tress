import type { Metadata, Viewport } from 'next';
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

// 手机浏览器顶栏的颜色接上页面顶上那抹淡紫
export const viewport: Viewport = { themeColor: '#b9b3d6' };

type T = Dictionary['philCoach'];

const link = 'text-pc-plum underline decoration-pc-plum/40 underline-offset-4 transition-colors hover:decoration-pc-plum';

/** 「关于这段对话」里的一条：收起来，点开才看 */
function Fold({ id, summary, children }: { id?: string; summary: string; children: ReactNode }) {
  return (
    <details id={id} className="group scroll-mt-24">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-6 py-4 font-book text-[17px] text-pc-ink [&::-webkit-details-marker]:hidden">
        <span>{summary}</span>
        <span aria-hidden="true" className="text-[22px] font-light leading-none text-pc-plum transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none">
          +
        </span>
      </summary>
      <div className="pb-7 text-[14px] leading-[1.95] text-pc-ink-2">{children}</div>
    </details>
  );
}

function faqItems(t: T): { question: string; answer: ReactNode }[] {
  return [
    { question: t.faq.privacy.question, answer: <p className="m-0">{t.faq.privacy.answer}</p> },
    {
      question: t.faq.memory.question,
      answer: (
        <>
          <p className="m-0">{t.faq.memory.p1}</p>
          <p className="m-0 mt-3">
            {t.faq.memory.p2Before}
            <span className="text-pc-ink">{t.faq.memory.p2Keep}</span>
            {t.faq.memory.p2Middle}
            <span className="text-pc-ink">{t.faq.memory.p2NotSaved}</span>
            {t.faq.memory.p2After}
          </p>
          <p className="m-0 mt-3">
            {t.faq.memory.p3Before}
            <Link href="/#join" className={`mx-1 ${link}`}>{t.faq.memory.p3Link}</Link>
            {t.faq.memory.p3After}
          </p>
        </>
      ),
    },
    { question: t.faq.therapy.question, answer: <p className="m-0">{t.faq.therapy.answer}</p> },
  ];
}

/**
 * 向内对话（/phil-coach）。
 *
 * 像《好的自己》的书封：顶上一抹淡紫化进米色，竖排的书名，一句问话，问话下面就是输入框——
 * 进来就能说，手机上也不用往下翻。其余的（它是什么、四种靠近你的方式、FAQ、反馈）
 * 都收在下面「关于这段对话」里，想看再点开。
 */
export default async function PhilCoachPage() {
  const locale = await getLocale();
  const t = dict(locale).philCoach;
  const faqs = faqItems(t);

  return (
    <>
      <Nav />
      <main className="pc-cover min-h-[100svh] px-5 pb-24 pt-[92px] text-pc-ink md:px-8 md:pt-[112px] lg:pt-[200px]">
        <div className="relative mx-auto max-w-[680px]">
          <PhilCoachExperience locale={locale} />

          <section id="about" aria-labelledby="pc-about" className="mt-24 scroll-mt-24 border-t border-pc-ink/10 pt-10 max-md:mt-20">
            <h2 id="pc-about" className="m-0 font-book text-[20px] font-normal text-pc-ink">
              {t.page.aboutTitle}
            </h2>
            <div className="mt-4 divide-y divide-pc-ink/10 border-y border-pc-ink/10">
              <Fold summary={t.intro.title}>
                <p className="m-0">{t.intro.origin}</p>
                <p className="m-0 mt-3">
                  {t.intro.listenBefore}
                  <span className="text-pc-ink">{t.intro.listenAccent}</span>
                  {t.intro.listenAfter}
                </p>
                <p className="m-0 mt-3">
                  {t.intro.howBefore}
                  <span className="text-pc-ink">{t.intro.howAccent}</span>
                  {t.intro.howAfter}
                </p>
                <p className="m-0 mt-3">{t.intro.disclaimer}</p>
              </Fold>

              <Fold summary={t.roles.title}>
                <p className="m-0">{t.roles.note}</p>
                <dl className="m-0 mt-4 space-y-4">
                  {PHIL_ROLES.map(role => {
                    // 中文就是 PHIL_ROLES 本身（那个文件同时喂给对话）；英文在字典里按 id 覆盖
                    const copy = t.roles.byId[role.id] || role;
                    return (
                      <div key={role.id}>
                        <dt className="font-medium text-pc-ink">{copy.name}</dt>
                        <dd className="m-0 mt-1">
                          {copy.when}{t.roles.sentenceEnd}{copy.how}{t.roles.sentenceEnd}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
                <p className="m-0 mt-5">
                  <span className="text-pc-ink">{t.roles.boundaryLabel}</span>
                  {t.roles.boundaryBody}
                </p>
                <p className="m-0 mt-3">
                  {t.roles.inviteBefore}
                  <Link href="/creators" className={`mx-1 ${link}`}>{t.roles.inviteLink}</Link>
                  {t.roles.inviteAfter}
                </p>
              </Fold>

              {faqs.map((item, i) => (
                <Fold key={item.question} id={i === 0 ? 'faq' : undefined} summary={item.question}>
                  {item.answer}
                </Fold>
              ))}

              <Fold summary={t.page.feedbackSummary}>
                <PhilFeedback locale={locale} />
              </Fold>
            </div>
          </section>

          <p className="m-0 mt-12 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-pc-ink-2">
            <Link href="/#join" className={link}>{t.outro.ctaJoin}</Link>
            <Link href="/meditations" className={link}>{t.outro.ctaListen}</Link>
          </p>
        </div>
      </main>
    </>
  );
}
