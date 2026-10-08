import type { Portrait, Quote } from './portrait';
import {
  DIMENSIONS, THEMES, blendVector, dimensionWord, getTheme, rankThemes, vectorFromPicks,
  type DimensionKey, type SpaceTheme, type StyleVector,
} from './themes';
import { withFeel } from './tune';

/**
 * 推荐 = 位置 + 距离 + 理由。客户端（风格测试时实时更新）和服务端（网站默认主题）共用。
 *
 * 理由只从两处来：画像里有原话撑着的那几维，和本人在测试里的选择；
 * 而且一句理由只有在「资料、测试、这套主题」方向一致时才成立——理由必须和最终结果说同一件事。
 * 不合的那一维要说出来，资料和测试冲突了也要说出来：只报喜的推荐，人一眼就不信了。
 */

export type Reason = { text: string; quote?: Quote };

export type Recommendation = {
  theme: SpaceTheme;
  match: number;
  reasons: Reason[];
  caveat: string | null;
  /** 和上一名分数相同 */
  tied: boolean;
};

export type RecommendInput = {
  mode: 'portrait' | 'fallback';
  portrait: Portrait | null;
  test: Partial<StyleVector>;
  picks: string[];
  /** 本人在「这不像我」、一句话调风格里亲口说过的偏好（tune.feel），直接加在位置上 */
  feel?: Partial<StyleVector>;
};

export type RecommendResult = {
  items: Recommendation[];
  /** 资料里读不出倾向、也没答测试：从林间米白开始（v2 §7.3），不显示契合度 */
  noSignal: boolean;
  /** 资料和测试方向相反的维度 */
  conflicts: string[];
  /** 看图模式下还不够 2 张 */
  needMorePicks: boolean;
};

const sign = (n: number) => (n > 0.3 ? 1 : n < -0.3 ? -1 : 0);

/** 感受词只在画像某一维判为中性时，作为弱先验补上 */
const FEELING_PRIOR: Record<string, Partial<StyleVector>> = {
  温暖: { warmth: 0.5 },
  安静: { energy: -0.5 },
  松弛: { energy: -0.5 },
  活力: { energy: 0.5 },
  有趣: { energy: 0.5 },
  冒险: { energy: 0.5 },
  自然: { texture: 0.5 },
  人文: { texture: 0.5 },
  艺术感: { texture: 0.5 },
  清晰: { texture: -0.5 },
  简洁: { density: -0.5 },
  高级感: { density: -0.5 },
  丰富: { density: 0.5 },
};

function portraitBase(p: Portrait): StyleVector {
  const out = {} as StyleVector;
  for (const d of DIMENSIONS) {
    const v = p.aesthetic[d.key].value;
    if (v !== 0) { out[d.key] = v; continue; }
    const prior = p.feelings.reduce((s, f) => s + (FEELING_PRIOR[f]?.[d.key] ?? 0), 0);
    out[d.key] = Math.max(-1, Math.min(1, prior));
  }
  return out;
}

export function effectiveVector(input: RecommendInput): { v: StyleVector; noSignal: boolean } | null {
  if (input.mode === 'fallback') {
    // 看图兜底只由挑的图决定（v2 §7.2），测试答案不掺进来；至少 2 张才有意义
    if (input.picks.length < 2) return null;
    const v = vectorFromPicks(input.picks);
    return v ? { v: withFeel(v, input.feel), noSignal: false } : null;
  }
  if (!input.portrait) return null;
  const v = withFeel(blendVector(portraitBase(input.portrait), input.test), input.feel);
  const answered = DIMENSIONS.some(d => typeof input.test[d.key] === 'number' || Math.abs(input.feel?.[d.key] ?? 0) > 0);
  const strength = Math.max(...DIMENSIONS.map(d => Math.abs(v[d.key])));
  if (strength < 0.5 && !answered) return { v: getTheme('forest')!.vector, noSignal: true };
  return { v, noSignal: false };
}

export function recommend(input: RecommendInput, top = 3): RecommendResult {
  const eff = effectiveVector(input);

  // 冲突要说到结果：只说「取了中间」，下面理由里却还写着「温暖」，看起来就自相矛盾
  const conflicts: string[] = [];
  if (input.mode === 'portrait' && input.portrait && eff) {
    for (const d of DIMENSIONS) {
      const p = input.portrait.aesthetic[d.key].value;
      const t = input.test[d.key];
      if (p !== 0 && typeof t === 'number' && Math.sign(p) !== Math.sign(t)) {
        const lands = sign(eff.v[d.key]);
        const tail = lands === 0 ? '这一维两边折中了' : `折中之后仍偏「${dimensionWord(d.key, lands)}」一点`;
        conflicts.push(`你的资料偏「${dimensionWord(d.key, p)}」，测试里你选了更「${dimensionWord(d.key, t)}」的那一张，${tail}`);
      }
    }
  }

  if (!eff) {
    return { items: [], noSignal: false, conflicts, needMorePicks: input.mode === 'fallback' && input.picks.length < 2 };
  }
  const { v, noSignal } = eff;

  const scored = rankThemes(v).map(({ theme, match }) => {
    const reasons: Reason[] = [];
    if (noSignal) {
      if (theme.id === 'forest') reasons.push({ text: '资料里还读不出明显的倾向，先从「自然温暖」开始' });
    } else {
      if (input.mode === 'fallback' && input.picks.includes(theme.id)) reasons.push({ text: '你在看图时挑中了它' });

      if (input.portrait) {
        const aside = input.mode === 'fallback' ? '（你的资料里也这么写）' : '';
        const dims = DIMENSIONS
          .map(d => ({ key: d.key, a: input.portrait!.aesthetic[d.key] }))
          .filter(x => x.a.quote && x.a.value !== 0
            && sign(x.a.value) === sign(v[x.key]) && sign(theme.vector[x.key]) === sign(v[x.key]))
          .sort((x, y) => Math.abs(y.a.value) - Math.abs(x.a.value));
        for (const x of dims.slice(0, 2)) {
          reasons.push({ text: `${dimensionWord(x.key, x.a.value)}${aside}`, quote: x.a.quote! });
        }
      }

      // 本人亲口说过的偏好：比画像和测试都直接
      for (const d of DIMENSIONS) {
        const f = input.feel?.[d.key] ?? 0;
        if (Math.abs(f) >= 0.5 && sign(f) === sign(v[d.key]) && sign(theme.vector[d.key]) === sign(f) && reasons.length < 4) {
          reasons.push({ text: `你说过想要更「${dimensionWord(d.key, f)}」一点` });
        }
      }

      if (input.mode === 'portrait') {
        for (const d of DIMENSIONS) {
          const t = input.test[d.key];
          if (typeof t === 'number' && sign(t) === sign(v[d.key]) && sign(theme.vector[d.key]) === sign(t) && reasons.length < 4) {
            reasons.push({ text: `测试里你选了更「${dimensionWord(d.key, t)}」的那一张` });
          }
        }
      }
    }

    // 最不合的一维：方向相反、且差得不小
    let caveat: string | null = null;
    let worst: { key: DimensionKey; gap: number } | null = null;
    if (!noSignal) {
      for (const d of DIMENSIONS) {
        const gap = Math.abs(v[d.key] - theme.vector[d.key]);
        if (sign(v[d.key]) !== 0 && sign(theme.vector[d.key]) === -sign(v[d.key]) && gap >= 1.5 && (!worst || gap > worst.gap)) {
          worst = { key: d.key, gap };
        }
      }
    }
    if (worst) {
      caveat = `不太一样的地方：它偏「${dimensionWord(worst.key, theme.vector[worst.key])}」，而你更「${dimensionWord(worst.key, v[worst.key])}」`;
    }
    return { theme, match, reasons, caveat };
  });

  // 分数相同时，依据多的排前面；再相同就按主题表的顺序（林间米白在最前）
  const order = (t: SpaceTheme) => THEMES.findIndex(x => x.id === t.id);
  scored.sort((a, b) => b.match - a.match || b.reasons.length - a.reasons.length || order(a.theme) - order(b.theme));

  const items = scored.slice(0, top).map((r, i, arr) => ({
    ...r,
    reasons: r.reasons.length ? r.reasons : [{ text: '这一套没有来自你资料的直接依据，是按整体距离排进来的' }],
    tied: i > 0 && arr[i - 1].match === r.match,
  }));
  return { items, noSignal, conflicts, needMorePicks: false };
}

/** 网站默认用哪套：本人选定的 > 推荐的第一套 > 林间米白 */
export function resolveThemeId(chosen: string | null | undefined, input: RecommendInput | null): string {
  if (chosen && getTheme(chosen)) return chosen;
  const rec = input ? recommend(input, 1).items[0] : null;
  return rec?.theme.id ?? 'forest';
}
