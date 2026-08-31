import type { SupabaseClient } from '@supabase/supabase-js';
import { isProfileComplete } from '@/lib/memberTrust';
import type { NodeCard } from '@/lib/supabase';

/**
 * 「谁在森林里」的唯一答案。
 *
 * 这件事**存在库里，不靠算**。以前列表是拉全表不过滤的，空卡会直接上榜；
 * 想用 isProfileComplete 顶替也不行——那个函数回答的是「这张卡信息够不够」，
 * 不是「这个人该不该出现」。两个问题今天答案碰巧一样，但会分开：
 * 有人填完了却想安静一阵，有人想离开但不该被从库里抹掉，测试数据可能填得很完整。
 *
 * 还有一条更要紧的：判定一旦是算出来的，哪天 isProfileComplete 的口径一改
 * （比如「简介」也变成必填），全站可见性当场重算，一批老成员会毫无征兆地消失。
 * 存下来的 status 不会——他们当初进来了，就还在。
 */
export type NodeStatus =
  /** 建了，但还没准备好露面。轻登记落在这里；将来「先审后放」也落这里 */
  | 'draft'
  /** 在森林里。走完七步注册的人默认就是这个 */
  | 'listed'
  /** 自己选择暂时收起来。数据和权限全留着，随时能回来 */
  | 'hidden'
  /** 离开了。不展示、不参与撮合，但数据保留——离开森林不该等于被抹掉 */
  | 'archived';

export const NODE_LISTED: NodeStatus = 'listed';
export const NODE_DRAFT: NodeStatus = 'draft';

/**
 * 老数据没有 status（迁移前建的行）一律当成 listed：
 * 它们本来就在森林里，不能因为加了个字段就集体消失。
 */
export function isListed(node: Pick<NodeCard, 'status'> | null | undefined): boolean {
  if (!node) return false;
  return (node.status ?? NODE_LISTED) === NODE_LISTED;
}

/**
 * 公开森林的成员。创造者列表、首页展示、树的计数、AI 撮合池——全部走这里，
 * 不要在各处自己拼 filter。这个仓库有过「同一个 bug 只修了一边」的前科，
 * 三处分头写迟早漂。
 *
 * 注意撮合池还要再叠一层 isProfileComplete：在森林里 ≠ 卡上有足够信息可配对。
 * 那是质量闸，和意愿无关，所以不并进这里。
 */
export async function fetchListedNodes(sb: SupabaseClient): Promise<NodeCard[]> {
  const { data, error } = await sb
    .from('node_cards')
    .select('*')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as NodeCard[]).filter(isListed);
}

/**
 * 可以拿来做撮合的人。
 *
 * 三个调用点（注册那一刻、draft→listed 那一刻、本人手动重新生成）**必须同口径**，
 * 所以池子的构造也收进这个文件——上面 fetchListedNodes 那句「不要在各处自己拼
 * filter」不只是说 status。这三处曾经就漂过：/api/join 是 `select('*')` 全表
 * 只排除自己，既没过 isListed 也没过 isProfileComplete，另外两处是对的。
 *
 * 那次漂的后果不是「少推荐几个人」：
 *   · 候选人的姓名、城市、在做、作品、擅长、可以提供、在寻找、议题会被
 *     **发给第三方大模型**（见 lib/match.ts 的 callLLMMatch）；
 *   · 结果会回到新成员的浏览器，并写进他卡上的 ai_recommendations 长期展示。
 * 也就是说，一个把自己设成 hidden 的人——已经明确表示不想露面——
 * 他的整段自述会被发出去，并挂在别人的页面上。
 *
 * 两道闸性质不同，缺一不可：
 *   · isListed 是**意愿**：他愿不愿意出现在这个森林里；
 *   · isProfileComplete 是**质量**：这张卡上的信息够不够拿来配对。
 * 所以它们没有被并进 isListed，而是在这里一起施加。
 *
 * @param excludeId 通常是「我」自己——没人需要被推荐给自己
 */
export async function fetchMatchPool(
  sb: SupabaseClient,
  excludeId?: string,
): Promise<NodeCard[]> {
  return (await fetchListedNodes(sb)).filter(
    n => n.id !== excludeId && isProfileComplete(n),
  );
}

/**
 * 存节点卡时该不该把人放进森林。
 *
 * 只做 draft → listed 这一个方向：填完卡本身就是「加入森林」这个动作，
 * 不再多要一次「发布」点击——那只会让一批填完了却没注意到开关的人卡在外面。
 *
 * 反向不动。已经在森林里的人，就算把「正在做什么」清空了也不会被悄悄下架；
 * 想收起来得他自己选 hidden，那是意愿，不该由一次编辑失误代劳。
 * hidden / archived 同理，不会被一次保存翻回 listed。
 */
export function shouldPromoteToListed(
  /** 库里存的原值。收 string 而不是 NodeStatus——库里可能有任何字符串，装作它一定合法没意义 */
  current: string | undefined | null,
  nextCard: NodeCard,
): boolean {
  return (current ?? NODE_LISTED) === NODE_DRAFT && isProfileComplete(nextCard);
}

/**
 * 这个人愿不愿意出现在「遇见星空」里。
 *
 * 为什么不复用 status='hidden'：那个会把人从**创造者森林里一起**摘掉，
 * 等于「我想在星空里低调一点」只能用「我整个消失」来表达。两件事，两个开关。
 *
 * 星空为什么需要自己这道闸——它比森林多做了两件事：
 *
 *   一、**聚合**。森林是一次看一个人，星空把所有人的名字、城市、正在做的事
 *       放进同一屏。每一条单看都已经是公开的，但聚合本身就改变了暴露程度。
 *
 *   二、**AI 的推断会被公开**。「正在形成的星座」把成员的「优势与独特性」
 *       「可以提供」「在寻找」喂给大模型，再把模型的结论连人名一起发布出来
 *       （「A 有场地、B 正在找场地 → 可以一起做 X」）。
 *       这和「列一张资料卡」是性质不同的一件事，理应能被单独拒绝。
 *
 * 缺失一律当 true，理由和 isListed 相同：迁移前建的老行没有这个值，
 * 判成 false 会让整片天空在加字段的那一刻空掉。
 */
export function isInSky(node: Pick<NodeCard, 'in_sky'> | null | undefined): boolean {
  if (!node) return false;
  return (node.in_sky ?? true) !== false;
}

