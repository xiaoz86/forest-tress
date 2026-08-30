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

  const skyStars = Array.from({ length: 10 }, (_, i) => ({
    cx: 50 + skyHash(`k${i}`, 3) * 460,
    cy: 12 + skyHash(`k${i}`, 5) * 90,
    r: 0.7 + skyHash(`k${i}`, 7) * 1.2,
    d: lerp(4.6, 9.8, skyHash(`k${i}`, 11)),
    delay: -9 * skyHash(`k${i}`, 13),
  }));

  return { INK, branches: branches.join(' '), canopy: canopy.join(' '), gapStars, skyStars };
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

  const skyRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLElement>(null);
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
               那句比我写的模板具体得多，有就用它。 */
            body: constellations[activeConst]?.note
              ?? (constellations.length
                ? fill(t.lens.constellation.body, {
                    labels: constellations.map(c => c.name).join('、'),
                  })
                : t.lens.constellation.bodyFallback),
          };

  const nearbySet = useMemo(() => new Set(nearby.ids), [nearby]);
  const showWhy = open && lensActive && lens === 'near' && !searching && nearbySet.has(open.id);
  const sharedTopic = open && me ? open.topics.find(x => me.topics.includes(x)) : undefined;

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

        <section className="sky-closing">
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
            {[...tree.skyStars, ...tree.gapStars].map((s, i) => (
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

            {showWhy && (
              <div className="sky-why">
                <dt>{t.panel.whyTitle}</dt>
                {sharedTopic && <p>{fill(t.panel.whyShared, { topic: sharedTopic })}</p>}
                {open.doing && <p>{fill(t.panel.whyThem, { doing: open.doing.slice(0, 24) })}</p>}
                <p>{t.panel.whyEnd}</p>
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
