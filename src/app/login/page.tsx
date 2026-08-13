import type { Metadata } from 'next';
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
          {/**
            * 眉标、标题、导语和页脚那两段都跟着表单当前这一步走，所以整块交给 LoginForm。
            *
            * 放在这里写死过：验证码填对、发现这个邮箱还没注册之后，表单换成
            * 「选轻登记还是完整注册」，可页面上方仍写着「登录到你的节点」
            * （人家还没有节点）、「输入注册时填写的邮箱」（早填完了），
            * 下方还写着「登录用于已加入的成员」（不是成员）和
            * 「还没有节点？先填一张节点卡」（右边就是那颗按钮）。
            * 四句话同时和眼前的界面对不上。
            *
            * 只有 ?err= 那条是服务端算出来的，所以从外面传进去。
            */}
          <LoginForm locale={locale} linkError={errMsg} />
        </div>
      </main>
    </>
  );
}
