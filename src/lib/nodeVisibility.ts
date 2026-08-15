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
