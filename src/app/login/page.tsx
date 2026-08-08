import type { Metadata } from 'next';
import Link from 'next/link';
import Nav from '@/components/Nav';
import LoginForm from '@/components/LoginForm';
import { dict } from '@/i18n';
import { getLocale } from '@/lib/locale';

type Props = {
  searchParams: Promise<{ err?: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = dict(await getLocale()).login;
  return { title: t.metaTitle, description: t.metaDescription };
}

/**
 * ?err= 里那几个短码来自登录链接的校验环节（见 /api/login 那条回调）。
 * 认不出的值一律回落到 unknown，不要把原始短码显示给人——
 * 「bad-sig」对着屏幕的人来说不是信息。
 */
function errorText(err: string | undefined, t: ReturnType<typeof dict>['login']): string | null {
  if (!err) return null;
  const map: Record<string, string> = {
    'no-secret': t.linkError.noSecret,
    malformed: t.linkError.malformed,
    'bad-sig': t.linkError.badSig,
    expired: t.linkError.expired,
  };
  return map[err] || t.linkError.unknown;
}

export default async function LoginPage({ searchParams }: Props) {
  const [{ err }, locale] = await Promise.all([searchParams, getLocale()]);
  const t = dict(locale).login;
  const errMsg = errorText(err, t);

  return (
    <>
      <Nav />
      <main className="min-h-screen pt-32 pb-20 px-6 bg-gradient-to-b from-[#fafaf7] via-[#f5f5f0] to-[#faf8f2]">
        <div className="max-w-[440px] mx-auto bg-white rounded-3xl border border-black/[0.06] shadow-[0_2px_24px_rgba(0,0,0,0.04)] p-8 max-md:p-6">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-moss uppercase mb-2">
            {t.eyebrow}
          </div>
          <h1
            className="text-[26px] font-semibold tracking-[-0.01em] text-forest-deep mb-3"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {t.title}
          </h1>
          <p className="text-[14px] leading-relaxed text-text-secondary mb-6">
            {t.lede1}
            <br />
            {t.lede2}
          </p>

          {errMsg && (
            <div className="mb-4 p-3 rounded-lg bg-coral/10 border border-coral/30 text-[13px] text-coral">
              {errMsg}
            </div>
          )}

          <LoginForm locale={locale} />

          <p className="mt-6 text-[12px] text-text-light leading-relaxed">
            {t.benefits}
          </p>
          <p className="mt-2 text-[12px] text-text-light leading-relaxed">
            {t.noAccount.before}
            <Link href="/#join" className="text-forest-deep underline underline-offset-2 ml-1">
              {t.noAccount.link}
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
