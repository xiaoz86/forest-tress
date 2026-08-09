import type { NodeCard } from '@/lib/supabase';

/**
 * 把节点卡上的联系方式剥掉。
 *
 * 为什么必须有这一步：/creators/[id] 上「联系方式只对社区成员可见」原来
 * 只是**显示层**的判断——服务端照样把整张 NodeCard（含 wechat、email）
 * 传给客户端组件，于是它被序列化进 RSC payload。结果是未登录访客
 * 打开网页源码就能读到全站成员的微信号和邮箱，那道「墙」形同虚设。
 *
 * 这和音频付费墙当初那个问题是同一类：**权限判断必须发生在数据出服务端
 * 之前，不是发出去之后再决定显不显示。**
 *
 * 规矩：任何 NodeCard 要跨到客户端组件（或进任何会被序列化的地方），
 * 先过这里。联系方式只在服务端组件里、确认有权限之后才渲染出来。
 */
export type PublicNode = Omit<NodeCard, 'wechat' | 'email' | 'email_verified_at'>;

export function toPublicNode<T extends NodeCard>(node: T): Omit<T, 'wechat' | 'email' | 'email_verified_at'> {
  // 用解构而不是 delete：漏掉一个字段时类型会报错，delete 不会。
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { wechat, email, email_verified_at, ...rest } = node;
  return rest;
}

export function toPublicNodes<T extends NodeCard>(
  nodes: T[],
): Omit<T, 'wechat' | 'email' | 'email_verified_at'>[] {
  return nodes.map(toPublicNode);
}

/**
 * 关系网整张图的公开版。
 *
 * 图里装的是完整的 NodeCard（中心 + 最多 8 个邻居），整个传给客户端组件
 * 就等于把这 9 个人的联系方式一起发出去。而 RelationNetwork 只用到
 * id / name / city / avatar_url / strength——一个联系方式字段都不需要。
 */
export function toPublicGraph<
  G extends { center: NodeCard; neighbors: NodeCard[]; edges: unknown[] },
>(graph: G) {
  return {
    ...graph,
    center: toPublicNode(graph.center),
    neighbors: graph.neighbors.map(toPublicNode),
  };
}
