'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Dictionary } from '@/i18n';
import { skyHash, type NearbyResult, type SkyStar } from '@/lib/sky';

/**
 * 创造者星空。
 *
 * 整页共用**一片固定星空**，内容从它上面滚过——这是「同一片星空」
 * 最直接的实现，也是它和「三个 section 各画一片」的根本区别。
 *
 * 两个反直觉的地方，改动前先读：
 *
 * 一、`.sky` 在 z-0，内容层在 z-2，所以内容层的**空白区域必须让点击穿透**，
 *    否则鼠标永远落在内容层上，星星一颗都点不到。
 *    这个 bug 用 `el.click()` 测不出来——那会绕过命中测试。
 *
 * 二、镜头（高亮/连线）只在镜头区可视时生效。星空是固定层，不这样管的话
 *    用户选完镜头往回滚，首屏还带着高亮，而首屏本该是「完整看见所有人」。
 */

type Lens = 'near' | 'const' | 'rising';

type Props = {
  stars: SkyStar[];
  /** 当前登录成员的 id，用于「找到我的星」和靠近理由 */
  meId: string | null;
  nearby: NearbyResult;
  risingIds: string[];
  constellations: { id: string; name: string; note: string; memberIds: string[] }[];
  t: Dictionary['sky'];
};

/** 环境星色温。五个暖白，没有一个偏蓝——禁止让人第一眼感到蓝色宇宙。 */
const AMBIENT_COLORS = ['#F7F0DC', '#ECEFE4', '#FFF2D1', '#E4E9DC', '#F0E5CE'];
const AMBIENT_COUNT = 168;

/**
 * 结尾屏星场的数量。首屏 168 颗铺满一屏，这里只取约三成密度。
 *
 * 稀是论点本身，不是省事：这一屏写的是「这里也可以有你的光」。
 * 如果最后一屏的天和首屏一样满，这句话在画面上就是被否定的——
 * 天已经排满了，哪还有你的位置。留白就是「还有位置」。
 * 窄屏再由 CSS 截到 32 / 20 颗（见 globals.css 的 .sky-closing-field）。
 */
const CLOSING_COUNT = 44;

/**
 * 给「还没被点亮的那一颗」留的空位，section 百分比坐标。
 *
 * 位置正在两个仰望者抬头的方向上，而 CTA「点亮属于我的星」就在它正下方。
 * 结尾那颗流星是**反解**几何、终点固定落在这里的——一道光划过来，
 * 在那个还空着的位置上熄灭，下面紧接着就是那句邀请。
 */
const CLOSING_VOID = { x: 57, y: 26, rx: 11, ry: 9 };

/**
 * 导航安全区。导航栏是固定高度的像素条，压在星空最上层——
 * 落进这条带的星既看不清也点不到（实测「John」就被 h-[72px] 那层挡住）。
 * 底部同样留一点，避免星贴在山林里。
 * 星的纵向位置是 0~1 的比例，这里换算成实际像素范围。
 */
const NAV_SAFE = 126;
const BOTTOM_SAFE = 96;

/** 比例 → CSS top。视口多高都不会撞导航，因为安全区是像素不是百分比。 */
const starTop = (ratio: number) =>
  `calc(${NAV_SAFE}px + (100% - ${NAV_SAFE + BOTTOM_SAFE}px) * ${ratio.toFixed(4)})`;

/** 比例 → 像素。星座连线要和星的实际位置对齐，必须用同一套换算。 */
const starY = (ratio: number, h: number) => NAV_SAFE + (h - NAV_SAFE - BOTTOM_SAFE) * ratio;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * 占位符替换。文案里用 `{n}` `{name}` 这样的占位而不是函数——
 * 函数不能跨服务端→客户端边界序列化，而这个仓库的规矩是
 * 「客户端不自己判断语言，由服务端把文案当 props 传进来」。
 */
const fill = (tpl: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), tpl);

function halton(i: number, base: number): number {
  let f = 1;
  let r = 0;
  let n = i + 1;
  while (n > 0) {
    f /= base;
    r += f * (n % base);
    n = Math.floor(n / base);
  }
  return r;
}

/** 山脊 / 树冠线。三层用不同的粗糙度和步长拉开远近，种子固定、刷新不变。 */
function ridgePath(seed: number, baseY: number, amp: number, step: number, jag: boolean) {
  const W = 1440;
  const H = 210;
  let d = `M0,${baseY.toFixed(1)}`;
  let x = 0;
  let i = 0;
  while (x < W && i < 240) {
    const k = `r${seed}-${i}`;
    const r1 = skyHash(k, 11);
    const r2 = skyHash(k, 13);
    const r3 = skyHash(k, 17);
    const span = step * (0.5 + r1 * 1.5); // 宽度差 3 倍
    const mid = x + span * (0.3 + r3 * 0.4);
    if (jag) {
      // 树冠：约两成明显高出一截，相邻的树互相重叠——真实林线是参差的
      const tall = r2 < 0.22;
      const top = baseY - amp * (tall ? 1.5 + r3 * 0.9 : 0.28 + r2 * 0.85);
      const half = span * (0.34 + r3 * 0.3);
      d +=
        ` L${(mid - half).toFixed(1)},${(baseY - amp * 0.12).toFixed(1)}` +
        ` Q${(mid - half * 0.34).toFixed(1)},${((top + baseY) / 2).toFixed(1)} ${mid.toFixed(1)},${top.toFixed(1)}` +
        ` Q${(mid + half * 0.34).toFixed(1)},${((top + baseY) / 2).toFixed(1)} ${(mid + half).toFixed(1)},${(baseY - amp * 0.1).toFixed(1)}` +
        ` L${(x + span * 0.82).toFixed(1)},${(baseY - amp * 0.06 * r1).toFixed(1)}`;
      x -= span * 0.3;
    } else {
      const peak = baseY - amp * (0.35 + r2 * 0.65);
      d += ` Q${mid.toFixed(1)},${peak.toFixed(1)} ${(x + span).toFixed(1)},${(baseY - amp * 0.22 * r2).toFixed(1)}`;
    }
    x += span;
    i += 1;
  }
  return `${d} L${W},${H} L0,${H} Z`;
}


/**
 * 树下坐着的两个人，仰头看星。
 *
 * 为什么是两个人：站上的 logo 本来就是「树 + 两个人 + 根系 + 开放圆环」，
 * 树已经在结尾出现了，人是缺的那一半。
 * 「树向下扎根，星向上发光」——扎根的、发光的、和看见的人，
 * 这里是整页唯一一次三样同框。
 *
 * 尺寸刻意压得很小（约 34px，树高 165px）。真实的树远大于人，
 * 人画大了就成了插画主角，而这一幕的主角始终是那片星空。
 * 两个人挨得近但不重叠——附近森林讲的是连接，不是合为一体。
 */
type Bone = [x1: number, y1: number, x2: number, y2: number, w: number];

/**
 * 树下抱膝蹲坐、仰头看星的人。
 *
 * 不用「一条外轮廓画完整个人」的办法——试过三版，出来的都是钟形罩子加一个球：
 * 一条平滑的轮廓没有脖子的收口，也没有膝盖的凸起，而这两处恰恰是
 * 「蹲坐的人」在小尺寸下唯一还读得出来的特征。
 *
 * 改成**带圆端的骨架**：躯干、大腿、小腿、环着小腿的手臂各是一段有粗细的骨，
 * 同色并起来自然就有关节的鼓和关节之间的凹。手臂那一段还顺便把
 * 肩和膝之间的空填掉一半，剩下的那点凹口正好是抱膝的形。
 *
 * 坐标以**臀部着地处为原点**，y 向上为负。
 */
function seatedWatcher(x: number, y: number, k: number, tilt: number) {
  const bones: Bone[] = [
    [-3.0, -3.2, 1.5, -3.2, 6.2],    // 臀，压在地上
    [0.0, -4.0, 3.4, -14.0, 6.4],    // 躯干，向前收着
    [0.5, -4.0, 9.0, -8.4, 5.0],     // 大腿，屈起来朝前上
    [9.0, -8.4, 11.0, -1.5, 3.6],    // 小腿，落回地面
    [2.8, -12.8, 8.8, -8.6, 2.5],    // 环着小腿的手臂
    // 脖子**往回仰**：起点在肩前(2.8)，终点反而更靠后(1.9-tilt)。
    // 前倾的身体配上后仰的头，才是「抬头看天」；两者同向就成了低头坐着。
    [2.8, -14.6, 1.9 - tilt * 0.5, -17.6 - tilt * 0.4, 2.4],
  ];
  // tilt 让两个人抬头的角度不同：头越靠后越高，下巴抬得越开
  const head = { cx: 1.8 - tilt * 0.5, cy: -19.6 - tilt * 0.6, r: 2.85 };

  return {
    bones: bones.map(
      b => [x + b[0] * k, y + b[1] * k, x + b[2] * k, y + b[3] * k, b[4] * k] as Bone,
    ),
    head: { cx: x + head.cx * k, cy: y + head.cy * k, r: head.r * k },
  };
}

/** 结尾那棵树。递归分叉 + 打碎的树冠轮廓——整页唯一一次让星和树同框。 */
function buildTree() {
  const INK = '#04100B';
  const branches: string[] = [];
  const tips: { x: number; y: number; r: number }[] = [];

  function branch(x: number, y: number, angle: number, len: number, width: number, depth: number, key: string) {
    const x2 = x + Math.sin(angle) * len;
    const y2 = y - Math.cos(angle) * len;
    const nx = (Math.cos(angle) * width) / 2;
    const ny = (Math.sin(angle) * width) / 2;
    const w2 = width * 0.66;
    const nx2 = (Math.cos(angle) * w2) / 2;
    const ny2 = (Math.sin(angle) * w2) / 2;
    branches.push(
      `M${(x - nx).toFixed(1)},${(y - ny).toFixed(1)} L${(x + nx).toFixed(1)},${(y + ny).toFixed(1)} ` +
        `L${(x2 + nx2).toFixed(1)},${(y2 + ny2).toFixed(1)} L${(x2 - nx2).toFixed(1)},${(y2 - ny2).toFixed(1)} Z`,
    );
    if (depth === 0) {
      tips.push({ x: x2, y: y2, r: len * (1.05 + skyHash(`lf${key}`, 7) * 0.5) });
      return;
    }
    // 左右**镜像**分叉。单侧累加会让整棵树歪向一边。
    const h1 = skyHash(`a${key}`, 13);
    const h2 = skyHash(`a${key}`, 17);
    const h3 = skyHash(`a${key}`, 19);
    const spread = 0.3 + h1 * 0.22;
    const lean = (h2 - 0.5) * 0.14; // 极小的整体倾斜，避免完全对称
    [-1, 1].forEach((dir, k) => {
      const sub = skyHash(`s${key}${k}`, 23);
      branch(x2, y2, angle + dir * spread + lean, len * (0.66 + sub * 0.16), w2, depth - 1, `${key}-${k}`);
    });
    if (depth >= 3 && h3 > 0.5) {
      branch(x2, y2, angle + lean * 2, len * 0.72, w2 * 0.8, depth - 1, `${key}-m`);
    }
  }
  branch(280, 290, 0, 66, 19, 4, 'T');

  const blob = (cx: number, cy: number, rx: number, ry: number) =>
    `M${(cx - rx).toFixed(1)},${cy.toFixed(1)}` +
    `a${rx.toFixed(1)},${ry.toFixed(1)} 0 1,0 ${(rx * 2).toFixed(1)},0` +
    `a${rx.toFixed(1)},${ry.toFixed(1)} 0 1,0 ${(-rx * 2).toFixed(1)},0Z`;

  const canopy: string[] = [];
  tips.forEach((t, i) => {
    const k = skyHash(`c${i}`, 29);
    canopy.push(blob(t.x, t.y, t.r * (1.1 + k * 0.35), t.r * (0.86 + k * 0.28)));
    // 沿外缘补小团把轮廓打碎。只有大团时边缘是光滑圆弧，读起来像积云不像树叶。
    const n = 3 + Math.floor(skyHash(`n${i}`, 59) * 3);
    for (let j = 0; j < n; j += 1) {
      const key = `p${i}-${j}`;
      const a = skyHash(key, 61) * Math.PI * 2;
      const d = t.r * (0.85 + skyHash(key, 67) * 0.45);
      const rr = t.r * (0.26 + skyHash(key, 71) * 0.3);
      canopy.push(blob(t.x + Math.cos(a) * d, t.y + Math.sin(a) * d * 0.75, rr, rr * 0.85));
    }
  });

  // 冠隙星：从枝梢向外取点，才叫「透过树冠」而不是「在树上方」
  const gapStars = Array.from({ length: 16 }, (_, i) => {
    const t = tips[Math.floor(skyHash(`g${i}`, 31) * tips.length)];
    if (!t) return null;
    const ang = skyHash(`g${i}`, 37) * Math.PI * 2;
    const rad = t.r * (0.9 + skyHash(`g${i}`, 41) * 0.7);
    return {
      cx: t.x + Math.cos(ang) * rad,
      cy: t.y + Math.sin(ang) * rad * 0.8,
      r: 0.8 + skyHash(`g${i}`, 43) * 1.3,
      d: lerp(4.2, 9.6, skyHash(`g${i}`, 47)),
      delay: -9 * skyHash(`g${i}`, 53),
    };
  }).filter(Boolean) as { cx: number; cy: number; r: number; d: number; delay: number }[];

  // 这里原本还有 10 颗 skyStars，已删。它们绑在树的坐标系里（cx 0~560），
  // 会跟着树一起缩放——桌面上只占中间 560px，读起来像树自己结的星，
  // 成了圣诞树的比喻；而这一屏的句子是「星向上发光」，星是另一个人，不是树的果实。
  // 而且其中 3 颗一直落在不透明树冠底下，从来没被看见过。
  // 现在整屏的天由 .sky-closing-field 负责，用 section 百分比、不随树缩放。
  // gapStars 保留：它们的意义不是「天」，是**遮挡**——同一片天从冠隙里露出来。

  // 坐在树干右侧的两个人。
  // 两人朝同一侧，因为他们在看**同一片**天。面对面就成了对话，不是共望。
  // 挨得近但不重叠——附近森林讲的是连接，不是合为一体。
  // 尺寸按**窄屏**定：375px 下 SVG 被宽度限死在 0.616 倍，整棵树只有约 152px 高
  // （冠顶 y=45 到地面 y=292，共 247 个 viewBox 单位）。
  // 人再按桌面尺寸画，到手机上就剩十几像素，看不出是人。
  const watchers = [
    { x: 340, y: 291, k: 1.46, tilt: 1.0 },
    { x: 371, y: 292, k: 1.24, tilt: 0.2 },
  ];

  return {
    INK,
    branches: branches.join(' '),
    canopy: canopy.join(' '),
    gapStars,
    watchers: watchers.map(w => seatedWatcher(w.x, w.y, w.k, w.tilt)),
  };
}

/** 一颗流星。scope 决定它挂在固定星空层还是结尾屏自己的天里。 */
type Shot = {
  key: number;
  scope: 'sky' | 'closing';
  top: number;
  left: number;
  ang: number;
  len: number;
  dist: number;
  dur: number;
};

/**
 * 流星本体。两处共用。
 *
 * 除了 onAnimationEnd 还挂了一道定时兜底：**后台标签页里 animationend 可能不触发**，
 * 那样这颗就会永远留在 DOM 里，把下一颗堵住（state 只存一颗）。
 */
function Meteor({ m, onEnd }: { m: Shot; onEnd: () => void }) {
  useEffect(() => {
    const t = setTimeout(onEnd, m.dur * 1000 + 400);
    return () => clearTimeout(t);
  }, [m.key, m.dur, onEnd]);

  return (
    <span
      className="sky-meteor"
      aria-hidden="true"
      onAnimationEnd={onEnd}
      style={
        {
          left: `${m.left.toFixed(2)}%`,
          top: `${m.top.toFixed(2)}%`,
          '--len': `${m.len.toFixed(0)}px`,
          '--ang': `${m.ang.toFixed(1)}deg`,
          '--dist': `${m.dist.toFixed(0)}px`,
          '--dur': `${m.dur.toFixed(2)}s`,
        } as React.CSSProperties
      }
    />
  );
}

export default function CreatorSky({ stars, meId, nearby, risingIds, constellations, t }: Props) {
  const [lens, setLens] = useState<Lens>('near');
  /** 当前选中的星座。三个标签一次只看一组——同时亮三组会亮掉 10/17 颗星，
      「其余退暗但不消失」那层意思就被冲淡了。 */
  const [activeConst, setActiveConst] = useState(0);
  const [lensActive, setLensActive] = useState(false);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [hovering, setHovering] = useState(false);
  const [dims, setDims] = useState({ w: 1440, h: 900 });
  /**
   * 流星。一次只有一颗，间隔 9~26 秒——这是「偶尔抬头刚好看见」的频率。
   * 再密就成了粒子特效，而规格明确禁止把夜空做成装饰特效。
   * 服务端首帧不渲染（初始 null），所以不会有 hydration 不一致。
   */
  const [meteor, setMeteor] = useState<Shot | null>(null);
  /** 结尾屏是否已进入视野。流星在哪一层出现由它决定。 */
  const [closingVisible, setClosingVisible] = useState(false);
  /** 本次停留已经放了几颗。流星不是循环播放的特效。 */
  const closingShots = useRef(0);

  const skyRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLElement>(null);
  const closingRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  const me = useMemo(() => stars.find(s => s.id === meId) || null, [stars, meId]);
  const tree = useMemo(() => buildTree(), []);

  const ridges = useMemo(
    () => [
      { cls: 'opacity-[.44]', fill: '#173126', d: ridgePath(101, 148, 62, 132, false) },
      { cls: 'opacity-[.56]', fill: '#0D2017', d: ridgePath(307, 172, 40, 86, false) },
      { cls: '', fill: '#06100C', d: ridgePath(911, 198, 34, 34, true) },
    ],
    [],
  );

  /**
   * 环境星。幂律分布，不是均匀分布：绝大多数勉强可见，少数几颗真的亮。
   * 上限只有 3px 时，和 Creator 星的 11.6px 之间会空出一大截，
   * 那十七颗读起来就像撒在星图上的 UI 标记，而不是这片天空里最亮的星。
   */
  const ambient = useMemo(
    () =>
      Array.from({ length: AMBIENT_COUNT }, (_, i) => {
        const seed = `amb${i}`;
        const size = lerp(0.65, 8.4, skyHash(seed, 7) ** 3.2);
        const base = lerp(0.12, 0.86, skyHash(seed, 13));
        const color = AMBIENT_COLORS[Math.floor(skyHash(seed, 17) * 5)];
        return {
          x: halton(i, 2) * 100,
          // 环境星也避开导航条：不然那一带的小点同样被盖住
          y: 4 + halton(i, 3) * 92,
          size,
          base,
          color,
          still: skyHash(seed, 29) > 0.79, // 约两成静态，避免整片天空同时运动
          glow: size > 3.4,
          d: lerp(3.1, 10.8, skyHash(seed, 19)),
          delay: -12 * skyHash(seed, 23),
        };
      }),
    [],
  );

  /**
   * 结尾屏自己的那片天。
   *
   * 和固定层的区别是刻意的：这一层**随 section 一起滚动**。
   * 固定层是「我们共享的那片天」，它不动，你从它下面滑过；
   * 这一层是「你和另一个人坐下来一起看的那片天」，它跟着你落座的那块地一起升上来。
   *
   * 沿用同一套 AMBIENT_COLORS 色温、同一支 skyTwinkle、同一条幂律（只压低上限），
   * 所以它仍然是同一片天，只是更少、更靠近地平线。
   * 结尾层里**一颗创造者星都不放**——那 17 颗有名字的人属于共享的天；
   * 这一屏说的是「还没被点亮的那一颗」，所以这里所有的光都是匿名的。
   */
  const closingSky = useMemo(() => {
    const out: {
      x: number; y: number; size: number; color: string;
      o: number; still: boolean; glow: boolean; d: number; delay: number;
    }[] = [];

    // 多取候选，落进空位的直接跳过。固定上界，不做无界拒绝采样
    for (let i = 0; out.length < CLOSING_COUNT && i < 96; i += 1) {
      const seed = `cls${i}`; // ⚠️ 必须传字符串：skyHash 收到数字会静默返回常数
      // +211 偏移不能省：环境星用了 halton(0..167)，创造者星用了 halton(0..16)，
      // 不偏移就会和它们生成同一批坐标，两层叠起来看得出重复的格点。
      const x = halton(i + 211, 2) * 100;
      // ^1.35 把星压向上方，×70 收进树冠顶之上（冠顶约在 section 的 68%）
      const y = halton(i + 211, 3) ** 1.35 * 70;

      const dx = (x - CLOSING_VOID.x) / CLOSING_VOID.rx;
      const dy = (y - CLOSING_VOID.y) / CLOSING_VOID.ry;
      if (dx * dx + dy * dy < 1) continue; // 留给「你」的那块空位，一颗都不放

      // 幂律，但上限只有 4.6px（环境星是 8.4px）：这片天不该盖过那 17 颗创造者星
      const size = lerp(0.7, 4.6, skyHash(seed, 7) ** 3);
      // 越靠近地平线越淡。月光会洗掉暗星，物理如此，构图上也让树冠边缘干净
      const fall = 1 - 0.55 * (y / 70) ** 2;

      out.push({
        x,
        y,
        size,
        color: AMBIENT_COLORS[Math.floor(skyHash(seed, 17) * 5)],
        o: lerp(0.16, 0.78, skyHash(seed, 13)) * fall,
        still: skyHash(seed, 29) > 0.7, // 三成静止，避免整片天同时呼吸
        glow: size > 3.1,
        d: lerp(3.4, 11.2, skyHash(seed, 19)),
        delay: -12 * skyHash(seed, 23),
      });
    }
    return out;
  }, []);

  // 结尾屏进入半屏才算「他们坐下来了」。0.18（镜头区那个阈值）太早，
  // 那时树还没露出来，流星会放在一片还看不见的天上。
  useEffect(() => {
    const el = closingRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      es =>
        es.forEach(e => {
          if (e.isIntersecting) closingShots.current = 0; // 重新进入 = 重新给三颗
          setClosingVisible(e.isIntersecting);
        }),
      { threshold: 0.45 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /**
   * 流星。**一个调度器，两个落点**。
   *
   * 结尾屏可见时不再往固定层放：那一层被 0.84~0.92 的渐变盖着，划了也看不见，
   * 纯属浪费；而且天上同时两颗，「偶然一次」的读法立刻塌成粒子特效。
   *
   * 结尾那颗的意义不是许愿——许愿是「我想要」，主语错了。
   * 文案是「也许**刚好**有人正在寻找这样的你」，流星是「刚好」的视觉形式：
   * 一次抵达，恰好在他们抬头的时候。所以它必须绑在「被看见」上，
   * 一颗没人在场时划过的流星，恰好就是整页在反对的那件事。
   */
  useEffect(() => {
    // 减弱动态时一颗都不放，也不必空转定时器
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let timer: ReturnType<typeof setTimeout>;
    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    /**
     * 结尾那颗：几何是**反解**出来的——先定终点（那个留白的空位），再倒推起点。
     * 不用手调的 left/top 区间，是因为按桌面定的 dist 到 375px 上必然失效，
     * 流星会整个飞出屏幕左侧。这样写，无论多宽的屏它都在同一个位置熄灭。
     */
    const fireClosing = () => {
      const w = window.innerWidth;
      const h = closingRef.current?.offsetHeight || 793;
      const toLeft = Math.random() < 0.5;
      const ang = toLeft ? rand(153, 167) : rand(13, 27);
      const rad = (ang * Math.PI) / 180;
      const dxPct = rand(22, 30); // 横向恒定跨过约四分之一屏宽
      const dist = ((dxPct / 100) * w) / Math.abs(Math.cos(rad));
      const endX = CLOSING_VOID.x + rand(-3, 3); // 抖一下，免得看出是个固定靶子
      const endY = CLOSING_VOID.y + rand(-3, 3);
      setMeteor({
        key: Date.now(),
        scope: 'closing',
        left: toLeft ? endX + dxPct : endX - dxPct,
        top: Math.max(3, endY - ((dist * Math.sin(rad)) / h) * 100),
        ang,
        dist,
        len: dist * 0.34, // 尾长恒为行程的三分之一，窄屏不会缩成一个点
        dur: 0.55 + dist / 460, // 速度恒定：桌面约 1.4s，375px 约 0.8s
      });
    };

    /** 固定层那颗：原样保留 */
    const fireSky = () => {
      // 一半从左上往右下，一半从右上往左下，避免总是同一个方向
      const toLeft = Math.random() < 0.5;
      setMeteor({
        key: Date.now(),
        scope: 'sky',
        top: rand(4, 42),
        left: toLeft ? rand(52, 92) : rand(6, 46),
        ang: toLeft ? rand(148, 166) : rand(14, 32),
        len: rand(64, 132),
        dist: rand(260, 520),
        dur: rand(0.9, 1.5),
      });
    };

    const tick = () => {
      if (closingVisible) {
        // 上限三颗，之后这片天安静下来。流星不是循环播放的特效
        if (closingShots.current >= 3) return;
        fireClosing();
        closingShots.current += 1;
        // 结尾是最后一屏，停留短，间隔必须比首屏（9~26s）压紧一档，
        // 否则第二颗永远等不到
        timer = setTimeout(tick, rand(7000, 14000));
      } else {
        fireSky();
        timer = setTimeout(tick, rand(9000, 26000));
      }
    };

    // 第一颗的时机：读完「这里也可以有你的光」+ 副标题约 2~3s。
    // 早于 2s 会和阅读抢注意力；2.6s 前后正是视线读完标题、正往下移到树的那一刻，
    // 流星把视线拉回上方，正好是构图想要的眼动。
    timer = setTimeout(tick, closingVisible ? rand(2200, 3400) : rand(9000, 26000));
    return () => clearTimeout(timer);
  }, [closingVisible]);

  useEffect(() => {
    const onResize = () =>
      setDims({ w: skyRef.current?.clientWidth || 1440, h: skyRef.current?.clientHeight || 900 });
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 镜头只在镜头区可视时生效
  useEffect(() => {
    const el = lensRef.current;
    if (!el) return;
    const io = new IntersectionObserver(es => es.forEach(e => setLensActive(e.isIntersecting)), {
      threshold: 0.18,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!openId) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenId(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openId]);

  // 关闭后焦点归还触发的那颗星
  useEffect(() => {
    if (!openId && lastFocus.current) {
      lastFocus.current.focus();
      lastFocus.current = null;
    }
  }, [openId]);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  const matchIds = useMemo(() => {
    if (!searching) return null;
    return new Set(
      stars
        .filter(s =>
          `${s.name}${s.city}${s.topics.join('')}${s.keywords.join('')}${s.doing}`
            .toLowerCase()
            .includes(q),
        )
        .map(s => s.id),
    );
  }, [q, searching, stars]);

  const lensIds = useMemo(() => {
    if (searching) return matchIds;
    if (!lensActive) return null;
    if (lens === 'near') return new Set(nearby.ids);
    if (lens === 'rising') return new Set(risingIds);
    return new Set(constellations[activeConst]?.memberIds ?? []);
  }, [searching, matchIds, lensActive, lens, nearby, risingIds, constellations, activeConst]);

  const dimming = lensIds !== null;

  /**
   * 星座连线。最小生成树 + 距离上限**再加一步空间聚类**：
   * 单边有上限管不住整条链——上一版走出过一条从右上角折到左下角的折线，
   * 那不是星座，是路径图。先把范围收成一簇，再连。
   */
  /**
   * 星座连线。只画**当前选中的那一组**。
   *
   * 这里的规则改过一次，原因值得记下来：
   * 最早星座来自「共同议题」，一组能有 11 人、而且同时画三组，
   * 所以加了空间聚类（只留最密的一簇）和 23% 屏宽的单边上限来防蛛网。
   *
   * 现在星座由 AI 按**互补**挑出来，每组只有 3~5 人，而且一次只显示一组。
   * 互补意味着他们本来就分散在天上——那两条规则于是同时出问题：
   *   一、聚类会把够不着的成员从连线里剔掉，但高亮用的是全部成员，
   *       结果就是「4 颗星亮着、0 条线」，两套成员集合对不上；
   *   二、23% 的上限对分散的小组太紧，实测最近的两颗都隔了 27.5%。
   *
   * 所以去掉聚类、放宽上限：3~5 个点的最小生成树最多 4 条线，
   * 画不成蛛网。上限只留一个防极端的兜底。
   */
  const lines = useMemo(() => {
    if (searching || !lensActive || lens !== 'const') return [];
    const group = constellations[activeConst];
    if (!group) return [];

    const { w, h } = dims;
    const MAX = w * 0.55; // 只防跨屏的极端边，不再用来做筛选
    const pts = group.memberIds
      .map(id => stars.find(s => s.id === id))
      .filter((s): s is SkyStar => Boolean(s))
      .map(s => ({ x: (s.x / 100) * w, y: starY(s.y, h) }));
    if (pts.length < 2) return [];

    const out: { x1: number; y1: number; x2: number; y2: number; len: number; delay: number }[] = [];
    const inTree = [0];
    const rest = pts.map((_, i) => i).slice(1);
    let step = 0;

    while (rest.length) {
      let pick: { r: number; t: number; d: number } | null = null;
      for (const r of rest) {
        for (const ti of inTree) {
          const d = Math.hypot(pts[r].x - pts[ti].x, pts[r].y - pts[ti].y);
          if (!pick || d < pick.d) pick = { r, t: ti, d };
        }
      }
      if (!pick || pick.d > MAX) break;
      const a = pts[pick.t];
      const b = pts[pick.r];
      out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, len: pick.d, delay: step * 0.12 });
      inTree.push(pick.r);
      rest.splice(rest.indexOf(pick.r), 1);
      step += 1;
    }
    return out;
  }, [searching, lensActive, lens, dims, constellations, stars, activeConst]);

  // 首屏常驻姓名 ≤ 3 个
  const residents = useMemo(
    () =>
      new Set(
        [...stars]
          .sort((a, b) => skyHash(a.id, 83) - skyHash(b.id, 83))
          .slice(0, 3)
          .map(s => s.id),
      ),
    [stars],
  );

  const open = stars.find(s => s.id === openId) || null;
  const hitCount = matchIds ? matchIds.size : 0;

  const onStar = useCallback((e: React.MouseEvent<HTMLButtonElement>, id: string) => {
    lastFocus.current = e.currentTarget;
    setOpenId(id);
  }, []);

  /**
   * 「今夜与你靠近」那一句。按实际命中的信号拼，最多两个从句——
   * 一句换谁都成立的模板等于什么都没说，而星座那边已经有具体理由了。
   * 未登录时挑的是「今夜最密的一簇」，那时说「与你」是不成立的，换一套说法。
   */
  const nearBody = (() => {
    const n = t.lens.near;
    const topics = nearby.sharedTopics.join('、');
    if (!nearby.personal) {
      return topics ? fill(n.bodyGuest, { topics }) : n.bodyGuestPlain;
    }
    const parts: string[] = [];
    if (topics) parts.push(fill(n.bodyTopics, { topics }));
    if (nearby.complementary > 0) parts.push(fill(n.bodyComplement, { n: nearby.complementary }));
    else if (nearby.sameCity > 0 && nearby.city)
      parts.push(fill(n.bodySameCity, { n: nearby.sameCity, city: nearby.city }));
    return parts.length ? parts.slice(0, 2).join('') : n.bodyPlain;
  })();

  const lensBody =
    lens === 'near'
      ? { title: t.lens.near.title, body: nearBody }
      : lens === 'rising'
        ? { title: t.lens.rising.title, body: t.lens.rising.body }
        : {
            title: t.lens.constellation.title,
            /* AI 聚出来的星座自带一句「是什么在把他们拉近」，
               那句比我写的模板具体得多，有就用它。
               ⚠️ 必须用 ||，不能用 ??：note 有两条路会是**空串**——
               规则聚类根本不产出 note，以及有人退出星空后 note 被清空。
               空串不是 nullish，?? 会让它直接通过，渲染成一个空的 <p>。 */
            body: constellations[activeConst]?.note
              || (constellations.length
                ? fill(t.lens.constellation.body, {
                    labels: constellations.map(c => c.name).join('、'),
                  })
                : t.lens.constellation.bodyFallback),
          };

  const nearbySet = useMemo(() => new Set(nearby.ids), [nearby]);
  const showWhy = open && lensActive && lens === 'near' && !searching && nearbySet.has(open.id);
  /**
   * 「为什么你们可能会靠近」——**只说查得到的事**。
   *
   * 原来这里是 `TA 正在{doing 截前 24 字}。`，三重坏：
   *   一、doing 是第一人称写的（「我是生活整理师…」），套进「TA 正在」
   *       就成了「TA 正在我是生活整理师…」；
   *   二、24 字硬切再补句号，切点落在词中间：「…摆脱那些不必。」；
   *   三、doing 正上方那一栏已经完整显示过一遍了，这是重复，而且是坏掉的那份。
   * 再加一句对所有人都一样的结尾，整块读下来等于什么也没说。
   *
   * 现在每条理由都由「我」和这颗星的真实字段算出来，一条都算不出就整块不显示——
   * 和下面「美 / 种子」那块同一条纪律：绝不用生成的句子填空。
   */
  const why = useMemo(() => {
    if (!open || !me) return null;
    const p = t.panel;
    /**
     * 排版用：拉丁开头的词（「AI」这类）前面补一个窄空格，
     * 否则嵌进中文句子会挤成「提供的AI，」。
     *
     * **只补前面，不补后面**：模板里 {topic} 后面跟的都是「，」「。」这类
     * 中文全角标点，它们自带左侧边距，再加空格会变成「AI ，正是」。
     */
    const pad = (v: string) => (/^[A-Za-z0-9]/.test(v) ? '\u2009' + v : v);
    const lines: string[] = [];

    // 互补最强：一方写下的「可以提供」正好落在另一方的「在寻找」里
    // ⚠️ 匹配用原值，排版才用 pad()——带了窄空格的字符串拿去 includes 会全部落空
    const raw = (x: string) => x.split(' / ')[0].trim();
    const give = open.offer ? open.topics.find(x => me.seeking.includes(raw(x))) : undefined;
    const take = me.offer ? me.topics.find(x => open.seeking.includes(raw(x))) : undefined;
    if (give) lines.push(fill(p.whyGive, { topic: pad(raw(give)) }));
    if (take) lines.push(fill(p.whyTake, { topic: pad(raw(take)) }));

    const shared = open.topics.filter(x => me.topics.includes(x)).slice(0, 2);
    if (shared.length) lines.push(fill(p.whyShared, { topics: pad(shared.join('、')) }));

    // 星轨是注册后 AI 抽的词，比议题细。已经有共同议题时不再叠这一层
    const kw = shared.length ? [] : open.keywords.filter(k => me.keywords.includes(k)).slice(0, 2);
    if (kw.length) lines.push(fill(p.whyOrbit, { keywords: pad(kw.join('、')) }));

    const sameCity = Boolean(me.city && open.city && me.city === open.city);
    if (sameCity) lines.push(fill(p.whyCity, { city: pad(open.city) }));

    // 兜底：pickNearby 可能只因为「最近更新过」就选中了 TA，那也得说得出口
    if (!lines.length && open.recent) lines.push(p.whyRecent);
    if (!lines.length) return null;

    // 结尾跟着最强的那条理由走，不再是所有人同一句
    const end =
      give || take ? p.endComplement : sameCity ? p.endCity : shared.length ? p.endShared : p.endDefault;
    return { lines, end };
  }, [open, me, t]);

  return (
    <>
      {/* ══ 固定夜空：整页共用一片 ══ */}
      <div ref={skyRef} className="sky-layer" data-dim={dimming ? '1' : undefined}>
        <div className="sky-milkyway" />

        {ambient.map((s, i) => (
          <span
            key={i}
            className={`sky-bg ${s.still ? 'sky-still' : ''}`}
            style={
              {
                left: `${s.x}%`,
                top: `${s.y}%`,
                width: `${s.size}px`,
                height: `${s.size}px`,
                background: s.color,
                boxShadow: s.glow ? `0 0 ${(s.size * 2.1).toFixed(1)}px ${(s.size * 0.5).toFixed(1)}px ${s.color}38` : undefined,
                '--o': s.base.toFixed(3),
                '--d': `${s.d.toFixed(2)}s`,
                '--delay': `${s.delay.toFixed(2)}s`,
              } as React.CSSProperties
            }
          />
        ))}

        {meteor?.scope === 'sky' && (
          <Meteor key={meteor.key} m={meteor} onEnd={() => setMeteor(null)} />
        )}

        <svg className="sky-lines" viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="none" aria-hidden="true">
          {lines.map((l, i) => (
            <line
              key={i}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              style={{ '--len': l.len.toFixed(1), animationDelay: `${l.delay}s` } as React.CSSProperties}
            />
          ))}
        </svg>

        {stars.map(s => {
          const on = lensIds ? lensIds.has(s.id) : false;
          const peak = lerp(0.62, 0.96, skyHash(s.id, 11));
          return (
            <button
              key={s.id}
              type="button"
              className={`sky-star ${on ? 'is-on' : ''} ${residents.has(s.id) ? 'is-resident' : ''}`}
              aria-label={s.city
                ? fill(t.panel.starLabel, { name: s.name, city: s.city })
                : fill(t.panel.starLabelNoCity, { name: s.name })}
              onClick={e => onStar(e, s.id)}
              onMouseEnter={() => setHovering(true)}
              onMouseLeave={() => setHovering(false)}
              style={
                {
                  left: `${s.x.toFixed(2)}%`,
                  top: starTop(s.y),
                  '--size': `${lerp(11.6, 15.4, skyHash(s.id, 43)).toFixed(2)}px`,
                  '--rot': `${lerp(-6, 6, skyHash(s.id, 47)).toFixed(1)}deg`,
                  '--peak': peak.toFixed(3),
                  '--dim': (peak * lerp(0.29, 0.43, skyHash(s.id, 53))).toFixed(3),
                  '--low': (peak * lerp(0.43, 0.6, skyHash(s.id, 59))).toFixed(3),
                  '--mid': (peak * lerp(0.66, 0.83, skyHash(s.id, 61))).toFixed(3),
                  // 近 30 天更新过的人呼吸略快。生命感，不是排名。
                  '--d': `${(lerp(3.9, 9.3, skyHash(s.id, 67)) * (s.recent ? 0.88 : 1)).toFixed(2)}s`,
                  '--delay': `${(-10 * skyHash(s.id, 71)).toFixed(2)}s`,
                  '--hd': `${lerp(5.8, 11.9, skyHash(s.id, 73)).toFixed(2)}s`,
                  '--hdelay': `${(-9 * skyHash(s.id, 79)).toFixed(2)}s`,
                } as React.CSSProperties
              }
            >
              <span className="sky-halo" />
              <span className="sky-body" />
              <span className={`sky-label ${hovering ? 'is-quiet' : ''}`}>
                <span className="sky-nm">{s.name}</span>
                {s.city && <span className="sky-ct">{s.city}</span>}
              </span>
            </button>
          );
        })}

        <div className="sky-horizon" aria-hidden="true">
          <div className="sky-glow" />
          <svg viewBox="0 0 1440 210" preserveAspectRatio="none">
            {ridges.map((r, i) => (
              <path key={i} className={r.cls} fill={r.fill} d={r.d} />
            ))}
          </svg>
        </div>
      </div>

      {/* ══ 内容层 ══ */}
      <div className="sky-content">
        <section className="sky-hero">
          <p className="sky-eyebrow">{t.hero.eyebrow}</p>
          <h1 className="sky-h1">{t.hero.title}</h1>
          {/* 去掉 h1 之后首屏没有锚点了：第一句升为主句，第二句退成补充。
              一句「每一颗星，都代表一个正在生长的人」比页面名更该被看见。 */}
          <p className="sky-lead-main">{t.hero.lead1}</p>
          <p className="sky-lead-sub">{t.hero.lead2}</p>
          <p className="sky-status">{stars.length ? fill(t.hero.status, { n: stars.length }) : t.hero.empty}</p>

          <div className="sky-ctas">
            <button
              type="button"
              className="sky-btn sky-btn-1"
              onClick={() => lensRef.current?.scrollIntoView({ behavior: 'smooth' })}
            >
              {t.hero.ctaRoam}
            </button>
            {me ? (
              <button
                type="button"
                className="sky-btn sky-btn-2"
                onClick={() => setOpenId(me.id)}
              >
                {t.hero.ctaMine}
              </button>
            ) : meId ? (
              // 登录了、但这片天上没有他的星——自己关掉了进入星空，或卡是
              // hidden/draft。这时指向 /#join 是在邀请一个已经是成员的人重新注册。
              <Link href={`/creators/${meId}`} className="sky-btn sky-btn-2">
                {t.hero.ctaMyPage}
              </Link>
            ) : (
              <Link href="/#join" className="sky-btn sky-btn-2">
                {t.hero.ctaMine}
              </Link>
            )}
          </div>

          <label className="sky-search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#E2E8D6" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t.hero.searchPlaceholder}
              aria-label={t.hero.searchLabel}
            />
          </label>
          <p className="sky-qmsg" role="status" aria-live="polite">
            {searching &&
              (hitCount > 0 ? (
                fill(t.search.found, { n: hitCount })
              ) : (
                <>
                  {t.search.none}
                  <button type="button" onClick={() => setQuery('')}>
                    {fill(t.search.reset, { n: stars.length })}
                  </button>
                </>
              ))}
          </p>
        </section>

        <section className="sky-lens" ref={lensRef}>
          <div className="sky-lens-intro">
            <p className="sky-eyebrow">{t.lens.eyebrow}</p>
            <h2 className="sky-lens-title">{t.lens.title}</h2>
            <p className="sky-lens-sub">{t.lens.sub}</p>
          </div>

          <div className="sky-tabs" role="tablist" aria-label={t.lens.tabsLabel}>
            <span className="sky-see">{t.lens.see}</span>
            {(
              [
                ['near', t.lens.near.tab],
                ['const', t.lens.constellation.tab],
                ['rising', t.lens.rising.tab],
              ] as [Lens, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={lens === k}
                className="sky-tab"
                onClick={() => setLens(k)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 不再重复镜头名——tab 上已经写着，隔 100px 再写一遍是冗余。
              文档也说「每个镜头只回答一个问题」，那就只留那一句回答。 */}
          <div className="sky-lens-body" role="tabpanel" aria-label={lensBody.title}>
            {lens === 'const' && constellations.length > 0 && (
              <div className="sky-const-names" role="group" aria-label={t.lens.constellation.title}>
                {constellations.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    className={i === activeConst ? 'is-on' : ''}
                    aria-pressed={i === activeConst}
                    onClick={() => setActiveConst(i)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            <p>{lensBody.body}</p>
            {lens === 'near' && !nearby.personal && (
              <p className="sky-guest-hint">{t.lens.near.guestHint}</p>
            )}
          </div>
        </section>

        <section className="sky-closing" ref={closingRef}>
          {/* 结尾屏自己的天。随 section 滚动，画在 section 背景之上、月光与树之下。
              ⚠️ 流星必须放在 .sky-closing-field **外面**：窄屏减星是靠
              nth-child 数序号的，条件挂载的流星混进去会让序号整体漂移。 */}
          <div className="sky-closing-sky" aria-hidden="true">
            <div className="sky-closing-field">
              {closingSky.map((s2, i) => (
                <span
                  key={i}
                  className={`sky-bg ${s2.still ? 'sky-still' : ''}`}
                  style={
                    {
                      left: `${s2.x.toFixed(2)}%`,
                      top: `${s2.y.toFixed(2)}%`,
                      width: `${s2.size.toFixed(2)}px`,
                      height: `${s2.size.toFixed(2)}px`,
                      background: s2.color,
                      boxShadow: s2.glow
                        ? `0 0 ${(s2.size * 2.1).toFixed(1)}px ${(s2.size * 0.5).toFixed(1)}px ${s2.color}38`
                        : undefined,
                      '--o': s2.o.toFixed(3),
                      '--d': `${s2.d.toFixed(2)}s`,
                      '--delay': `${s2.delay.toFixed(2)}s`,
                    } as React.CSSProperties
                  }
                />
              ))}
            </div>
            {meteor?.scope === 'closing' && (
              <Meteor key={meteor.key} m={meteor} onEnd={() => setMeteor(null)} />
            )}
          </div>
          <div className="sky-closing-inner">
            <h2 className="sky-closing-title">{t.closing.title}</h2>
            <p className="sky-closing-body">{t.closing.body}</p>
            <Link href="/#join" className="sky-btn sky-btn-1">
              {t.closing.cta}
            </Link>
            <p className="sky-toforest">
              <Link href="/creators">{t.closing.toForest}</Link>
            </p>
            {/* 「树向下扎根，星向上发光」挪到树的正上方——
                这句话是被下面那棵树illustrate 的，隔着一整块 CTA 就读不到关系了。 */}
            <p className="sky-quote">{t.closing.quote}</p>
          </div>

          <svg className="sky-tree" viewBox="0 0 560 300" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
            {tree.gapStars.map((s, i) => (
              <circle
                key={i}
                className="sky-treestar"
                cx={s.cx.toFixed(1)}
                cy={s.cy.toFixed(1)}
                r={s.r.toFixed(2)}
                fill="#F4E7C4"
                style={{ '--d': `${s.d.toFixed(1)}s`, '--delay': `${s.delay.toFixed(1)}s` } as React.CSSProperties}
              />
            ))}
            <path fill={tree.INK} d={tree.branches} />
            <path fill={tree.INK} d={tree.canopy} />
            {/* 根部外扩：真实的树在地面处是喇叭状的 */}
            <path fill={tree.INK} d="M266,292 Q270,272 272,258 L288,258 Q290,272 294,292 Z" />
            {/* 树下坐着的两个人，仰头看星 */}
            {tree.watchers.map((w, i) => (
              <g key={i}>
                {w.bones.map((b, j) => (
                  <line
                    key={j}
                    x1={b[0].toFixed(2)}
                    y1={b[1].toFixed(2)}
                    x2={b[2].toFixed(2)}
                    y2={b[3].toFixed(2)}
                    stroke={tree.INK}
                    strokeWidth={b[4].toFixed(2)}
                    strokeLinecap="round"
                  />
                ))}
                <circle cx={w.head.cx.toFixed(2)} cy={w.head.cy.toFixed(2)} r={w.head.r.toFixed(2)} fill={tree.INK} />
              </g>
            ))}
            <path
              fill={tree.INK}
              opacity=".85"
              d="M0,300 L0,296 Q70,294 150,291 Q230,288 280,287 Q330,288 410,291 Q490,294 560,296 L560,300 Z"
            />
          </svg>
        </section>

        <p className="sky-note">{t.note}</p>
      </div>

      {/* ══ 星光卡 ══ */}
      <div
        className={`sky-scrim ${open ? 'is-open' : ''}`}
        onClick={() => setOpenId(null)}
        aria-hidden="true"
      />
      <aside
        ref={panelRef}
        className={`sky-panel ${open ? 'is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={open?.name || ''}
        tabIndex={-1}
      >
        {open && (
          <>
            <button type="button" className="sky-close" onClick={() => setOpenId(null)} aria-label={t.panel.close}>
              ✕
            </button>
            <div className="sky-mark">
              <span />
            </div>
            <h3 className="sky-pname">{open.name}</h3>
            <p className="sky-pmeta">
              {open.city ? `${open.city} · ${t.panel.subtitle}` : t.panel.subtitle}
            </p>

            <dl className="sky-rows">
              {open.doing && (
                <div>
                  <dt>{t.panel.doing}</dt>
                  <dd>{open.doing}</dd>
                </div>
              )}
              {open.offer && (
                <div>
                  <dt>{t.panel.offer}</dt>
                  <dd>{open.offer}</dd>
                </div>
              )}
              {open.seeking && (
                <div>
                  <dt>{t.panel.seeking}</dt>
                  <dd>{open.seeking}</dd>
                </div>
              )}
            </dl>

            {showWhy && why && (
              <div className="sky-why">
                <dt>{t.panel.whyTitle}</dt>
                {why.lines.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
                <p>{why.end}</p>
              </div>
            )}

            {/* 「美 / 想创造 / 种子」——全库唯一无法被同质化的内容，
                所以给它米绿底和衬线体。任一为空就整块收起，绝不用生成句子填空。 */}
            {(open.moment || open.create || open.seed) && (
              <div className="sky-human">
                {open.moment && (
                  <div>
                    <dt>{t.panel.moment}</dt>
                    <p>{open.moment}</p>
                  </div>
                )}
                {open.create && (
                  <div>
                    <dt>{t.panel.create}</dt>
                    <p>{open.create}</p>
                  </div>
                )}
                {open.seed && (
                  <div>
                    <dt>{t.panel.seed}</dt>
                    <p>{open.seed}</p>
                  </div>
                )}
              </div>
            )}

            {(open.keywords.length > 0 || open.topics.length > 0) && (
              <>
                <p className="sky-orbit-label">{t.panel.orbit}</p>
                <div className="sky-orbit">
                  <span className="sky-ring sky-r1" />
                  <span className="sky-ring sky-r2" />
                  <span className="sky-core">
                    {/[一-龥]/.test(open.name)
                      ? open.name.replace(/\s/g, '').slice(-2)
                      : open.name.trim()[0]?.toUpperCase()}
                  </span>
                  {(open.keywords.length ? open.keywords : open.topics).slice(0, 6).map((k, i, arr) => {
                    const ang = ((-100 + i * (320 / Math.max(arr.length - 1, 1))) * Math.PI) / 180;
                    const r = i % 2 ? 100 : 74;
                    return (
                      <span
                        key={k}
                        className="sky-kw"
                        style={{
                          left: `calc(50% + ${(Math.cos(ang) * r).toFixed(0)}px)`,
                          top: `calc(50% + ${(Math.sin(ang) * r).toFixed(0)}px)`,
                        }}
                      >
                        {k}
                      </span>
                    );
                  })}
                </div>
              </>
            )}

            <div className="sky-actions">
              <Link href={`/creators/${open.id}`} className="sky-pbtn sky-ghost">
                {t.panel.viewProfile}
              </Link>
              <Link href={`/creators/${open.id}`} className="sky-pbtn sky-solid">
                {t.panel.approach} →
              </Link>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
