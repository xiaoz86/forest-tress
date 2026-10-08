/**
 * 个人空间互动功能的数据形状：发布与可见性、活动与报名、服务预约、打个招呼。
 *
 * 客户端、服务端都会用，不能引入服务端依赖。
 * 字段按将来的 Supabase 表来设计（见 supabase-space.sql）：v1 先存在本地 JSON（lib/space/db.ts），
 * 换成数据库时只换存储层，这里的形状不变。
 */

/**
 * 谁能看到（v2 §7.4 可见性：公开 / 森林成员 / 扫我名片的人 / 仅自己）。
 * - public：所有人
 * - card：森林成员，以及扫过我名片二维码的人（名片是我亲手递出去的，可以比公开页多给一点）
 * - members：仅森林成员（登录过附近森林的人）
 * - self：仅自己（和管理员）
 */
export type Audience = 'public' | 'card' | 'members' | 'self';

export const AUDIENCES: { value: Audience; label: string; hint: string }[] = [
  { value: 'public', label: '所有人', hint: '任何打开链接的人' },
  { value: 'card', label: '森林成员和扫过我名片的人', hint: '你当面递出去的名片，扫码的人也能看到' },
  { value: 'members', label: '仅森林成员', hint: '登录过附近森林的人' },
  { value: 'self', label: '仅自己', hint: '只在你自己的预览里出现' },
];

/** 可以逐项设置可见性的东西：四个板块 + 两项联系方式 */
export type VisibilityKey = 'knowing' | 'path' | 'offer' | 'seed' | 'wechat' | 'email';

export const VISIBILITY_ITEMS: { key: VisibilityKey; label: string; group: 'section' | 'contact' }[] = [
  { key: 'knowing', label: '我这个人（兴趣、美的时刻、在意的事）', group: 'section' },
  { key: 'path', label: '走过的路（经历、作品、在别处）', group: 'section' },
  { key: 'offer', label: '一起做点什么（服务、活动）', group: 'section' },
  { key: 'seed', label: '心里的种子', group: 'section' },
  { key: 'wechat', label: '微信', group: 'contact' },
  { key: 'email', label: '邮箱', group: 'contact' },
];

/**
 * 默认值。联系方式保持站上现有的「只给森林成员」（v2 §7.4：隐私的默认值站在更谨慎的一边）；
 * 种子是「还没长出来的」，默认也只给森林成员（v2 洞察 6：先写给自己，再给森林成员，最后才公开）。
 */
export const DEFAULT_VISIBILITY: Record<VisibilityKey, Audience> = {
  knowing: 'public',
  path: 'public',
  offer: 'public',
  seed: 'members',
  wechat: 'members',
  email: 'members',
};

export type SpaceSettings = {
  /** = 成员 id */
  id: string;
  /**
   * 发布 = 本人确认了这一版（含 AI 起稿）：之后访客才看得到。
   * 没发布时，AI 起好的默认版本只有本人和管理员能打开（预览、修改、确认）。
   */
  published: boolean;
  publishedAt: string | null;
  /** 短链 /@slug。小写字母、数字、连字符，2–24 位，全站唯一 */
  slug: string | null;
  /**
   * 以前用过的短链。改短链之后旧的继续指向这个人（跳到新地址），也不许别人再占用——
   * 已经印出去、发出去的链接不能一改就失效，更不能跳到别人的空间。
   */
  previousSlugs?: string[];
  visibility: Record<VisibilityKey, Audience>;
  /** 名片二维码里带的口令：扫码的人拿到它，就算「扫过我名片的人」。本人可以随时换掉 */
  cardToken: string;
  greetingsOpen: boolean;
  bookingsOpen: boolean;
  /** 收款码（私有存储里的文件名）。只在付款那一步给看（见 api/space/pay-qr） */
  payQr: string | null;
  /** 屏蔽的来源：联系方式或来源的哈希 */
  blocked: string[];
  updatedAt: string;
};

export type EventMode = 'online' | 'offline' | 'both';
export type EventStatus = 'draft' | 'open' | 'closed' | 'cancelled';

export type SpaceEvent = {
  id: string;
  memberId: string;
  title: string;
  desc: string;
  /** ISO 时间 */
  startsAt: string;
  endsAt: string | null;
  place: string;
  mode: EventMode;
  /** 名额；null = 不限 */
  capacity: number | null;
  /** 0 = 免费。收费活动走收款码 + 截图 + 本人核对（复用冥想营的流程） */
  feeCents: number;
  status: EventStatus;
  /** 封面照片（私有存储里的文件名，经 /api/space/event-image 按活动的公开状态往外给）；老数据没有这个字段 */
  coverImage?: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * 报名状态：
 * - confirmed：已确认（免费活动报名即确认；收费活动本人核对过付款）
 * - pending：收费活动，等付款（还没传截图）
 * - claimed：收费活动，已传付款截图，等本人核对——先占名额（「先开后审」）
 * - waitlist：名额满了，排队
 * - cancelled：报名人自己取消
 * - rejected：本人驳回（比如付款对不上）
 */
export type RegistrationStatus = 'confirmed' | 'pending' | 'claimed' | 'waitlist' | 'cancelled' | 'rejected';

export type Registration = {
  id: string;
  eventId: string;
  /** 活动主人 */
  memberId: string;
  name: string;
  /** 报名人留的联系方式（微信号 / 手机 / 邮箱，自由填写）——只有活动主人和管理员看得到 */
  contact: string;
  note: string;
  /** 报名人如果登录了附近森林 */
  visitorMemberId: string | null;
  status: RegistrationStatus;
  /** 收费活动：付款备注里填的四位口令（同一主人的待付款之间唯一） */
  payCode: string | null;
  feeCents: number;
  proofFile: string | null;
  claimedAt: string | null;
  hostNote: string;
  /** 报名人查看自己报名状态用的口令（链接里带着），不是登录 */
  token: string;
  /** 提交来源的哈希（不存明文 IP），屏蔽时用 */
  sourceKey?: string;
  createdAt: string;
  updatedAt: string;
};

export type BookingStatus = 'new' | 'accepted' | 'declined' | 'done';

export type Booking = {
  id: string;
  memberId: string;
  /** 预约的是服务单里哪一项（标题快照） */
  serviceTitle: string;
  name: string;
  contact: string;
  /** 希望的时间，自由填写（v1 不做日历，§7.4 P1 再做） */
  preferred: string;
  note: string;
  visitorMemberId: string | null;
  status: BookingStatus;
  hostNote: string;
  token: string;
  sourceKey?: string;
  createdAt: string;
  updatedAt: string;
};

export type Greeting = {
  id: string;
  memberId: string;
  name: string;
  contact: string;
  message: string;
  /** 打招呼的人如果登录了附近森林，记下是谁 */
  visitorMemberId: string | null;
  readAt: string | null;
  sourceKey?: string;
  createdAt: string;
};

/** 本地开发时不真的发邮件，写进这里（manage 页可以看到「发件箱」） */
export type OutboxMail = {
  id: string;
  /** 这封信是因为谁的空间发的（收件箱里按人筛） */
  memberId: string;
  to: string[];
  subject: string;
  text: string;
  createdAt: string;
};

/** 访客能看到的活动（不含任何报名人信息） */
export type PublicEvent = Pick<SpaceEvent, 'id' | 'title' | 'desc' | 'startsAt' | 'endsAt' | 'place' | 'mode' | 'capacity' | 'feeCents' | 'status'> & {
  /** 剩余名额；不限名额时为 null */
  left: number | null;
  /** 已经开始了：还挂在「近期活动」里，但不能再报名、付款 */
  started: boolean;
  /** 封面照片的公开地址（/api/space/event-image?e=…）；没有照片时为 null */
  coverUrl: string | null;
};

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,22}[a-z0-9])?$/;
/** 不能用作短链的词：和站内路由、常见保留字撞车 */
export const RESERVED_SLUGS = new Set([
  'admin', 'api', 'app', 'about', 'join', 'login', 'logout', 'space', 'sky', 'creators', 'meditations',
  'shares', 'launch', 'phil-coach', 'profile', 'settings', 'help', 'support', 'www', 'forest', 'nearby',
  'nearby-forest', 'root', 'null', 'undefined', 'me', 'you', 'test',
]);

export function slugProblem(slug: string): string | null {
  if (!SLUG_RE.test(slug)) return '只能用小写字母、数字和连字符，2–24 位，不能以连字符开头或结尾';
  if (RESERVED_SLUGS.has(slug)) return '这个词站内要用，换一个吧';
  return null;
}

export const LIMITS = {
  name: 40,
  contact: 80,
  message: 500,
  note: 300,
  preferred: 120,
  eventTitle: 60,
  eventDesc: 1500,
  place: 120,
} as const;
