import NavClient from '@/components/NavClient';
import { dict } from '@/i18n';
import { getLocale } from '@/lib/locale';

/**
 * 导航的服务端外壳：只负责判语言、把文案交给客户端那层。
 *
 * night：深色页面用的反相版本。米白胶囊压在夜空上会成为全页最亮的元素，
 * 比任何一颗星都抢眼，而星空页的视觉权重顺序是「星空第一」。
 * 只有 /sky 传 true，其余 12 个页面照旧写 <Nav />。
 *
 * 拆成两层是为了不动那 12 个引用它的页面——它们照旧写 <Nav />，
 * 也为了让语言在首帧就定下来：客户端自己去问语言的话，
 * 英文用户会先看见一排中文再闪成英文。
 */
export default async function Nav({ night = false }: { night?: boolean } = {}) {
  const locale = await getLocale();
  return <NavClient locale={locale} t={dict(locale).nav} night={night} />;
}
