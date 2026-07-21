import Link from 'next/link';
import Nav from '@/components/Nav';
import LoginForm from '@/components/LoginForm';

export const metadata = {
  title: '登录 · 附近森林',
  description: '用注册邮箱接收登录链接',
};

type Props = {
  searchParams: Promise<{ err?: string }>;
};

const ERR_TEXT: Record<string, string> = {
  'no-secret': '服务尚未配置登录密钥，请联系主理人',
  malformed: '登录链接格式不对，请重新申请',
  'bad-sig': '登录链接无效，请重新申请',
  expired: '登录链接已过期，请重新申请',
};

export default async function LoginPage({ searchParams }: Props) {
  const { err } = await searchParams;
  const errMsg = err ? ERR_TEXT[err] || '登录链接无效，请重新申请' : null;

  return (
    <>
      <Nav />
      <main className="min-h-screen pt-32 pb-20 px-6 bg-gradient-to-b from-[#fafaf7] via-[#f5f5f0] to-[#faf8f2]">
        <div className="max-w-[440px] mx-auto bg-white rounded-3xl border border-black/[0.06] shadow-[0_2px_24px_rgba(0,0,0,0.04)] p-8 max-md:p-6">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-moss uppercase mb-2">
            Login · 登录
          </div>
          <h1
            className="text-[26px] font-semibold tracking-[-0.01em] text-forest-deep mb-3"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            登录到你的节点
          </h1>
          <p className="text-[14px] leading-relaxed text-text-secondary mb-6">
            输入注册时填写的邮箱，我们会把登录链接发到你邮箱。
            <br />
            点击链接即可回到你的个人页。
          </p>

          {errMsg && (
            <div className="mb-4 p-3 rounded-lg bg-coral/10 border border-coral/30 text-[13px] text-coral">
              {errMsg}
            </div>
          )}

          <LoginForm />

          <p className="mt-6 text-[12px] text-text-light leading-relaxed">
            还没有节点？
            <Link href="/#join" className="text-forest-deep underline underline-offset-2 ml-1">
              先填一张节点卡
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
