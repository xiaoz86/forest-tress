import NavClient from '@/components/NavClient';
import { dict } from '@/i18n';
import { getLocale } from '@/lib/locale';

/**
 * 导航的服务端外壳：只负责判语言、把文案交给客户端那层。
 *
 * 拆成两层是为了不动那 12 个引用它的页面——它们照旧写 <Nav />，
 * 也为了让语言在首帧就定下来：客户端自己去问语言的话，
 * 英文用户会先看见一排中文再闪成英文。
 */
export default async function Nav() {
  const locale = await getLocale();
  return <NavClient locale={locale} t={dict(locale).nav} />;
}
