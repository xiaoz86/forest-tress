import type { RelationEdge, RelationGraph } from '@/lib/network';
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
 * 关系网里一个节点的公开形态。**白名单，不是「NodeCard 减掉几个」。**
 *
 * 这个区别不是洁癖。上一版走的是黑名单——整张 NodeCard 传下去，只剥掉
 * wechat / email / email_verified_at。当时修的是联系方式那次事故，剥三个就够。
 * 但黑名单**只挡得住写它那天已经存在的字段**：后来新增的 ai_recommendations
 * 自动就跟着漏了出去。
 *
 * 实测过（未登录访问 / 与 /creators/[id]）：payload 里带着最多 10 个人的
 * ai_recommendations——「谁被 AI 推荐给了谁」以及模型写的理由，而那一列的
 * 注释写着「仅本人 + 管理员可见」。页面确实用 canSeeRecommendations 控制了
 * **渲染**，但数据早就发出去了，打开网页源码就能读。
 * 一起漏的还有 notify_matches / in_sky / locale / status 这些设置项。
 *
 * 所以改成白名单：RelationNetwork 只用 id / name / city / avatar_url，
 * layoutGraph 只用 id / strength。以后 NodeCard 加什么字段都不会自动流出去——
 * 要多给一个，得有人**明确写进这里**。
 */
export type PublicGraphNode = {
  id?: string;
  name: string;
  city: string;
  avatar_url?: string;
};

/** 邻居比中心多两个纯展示用的量：它们不来自 NodeCard，是算出来的 */
type RelationNodeView = {
  weightToCenter: number;
  strength: RelationEdge['strength'];
};

export type PublicGraph = {
  center: PublicGraphNode;
  neighbors: (PublicGraphNode & RelationNodeView)[];
  edges: RelationEdge[];
};

function toPublicGraphNode(n: NodeCard): PublicGraphNode {
  // 逐个列出来，不用 rest 展开——新增字段时这里不会自动跟着放行
  return { id: n.id, name: n.name, city: n.city, avatar_url: n.avatar_url };
}

/**
 * 关系网整张图的公开版。图里装的是完整的 NodeCard（中心 + 最多 8 个邻居），
 * 整个传给客户端组件就等于把这 9 个人的整张卡发出去。而这张图只需要四个字段。
 */
export function toPublicGraph(graph: RelationGraph): PublicGraph {
  return {
    edges: graph.edges,
    center: toPublicGraphNode(graph.center),
    neighbors: graph.neighbors.map(n => ({
      ...toPublicGraphNode(n),
      weightToCenter: n.weightToCenter,
      strength: n.strength,
    })),
  };
}
