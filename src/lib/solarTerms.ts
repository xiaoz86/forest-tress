/**
 * 二十四节气 —— 「身心的二十四节气」这个专题的骨架。
 *
 * 为什么写死在代码里，而不是跟分类、曲目一样存进 Supabase：
 * 这二十四个名字两千年没变过，也不会由主理人来改。存进库只会多出
 * 一份要维护的数据，还得先手动敲二十四行才能让页面显示完整的一年。
 *
 * 影片是一支一支做的（处暑是第一支），但专题本身从第一天起就该是完整的一年——
 * 人看到的是「一整年的路线，现在走到这里」，而不是「只有一支视频」。
 * 所以节气表在代码里，影片在库里，两边按 seq 对上。
 */

/** 影片挂在哪个分类下。节气条只在这个分类里出现，别的影像专题不受影响。 */
export const SOLAR_TERMS_CATEGORY_ID = 'solar-terms';

export type SolarSeason = 'spring' | 'summer' | 'autumn' | 'winter';

export type SolarTerm = {
  /** 1–24，从立春起算。曲目的 seq 用的就是这个数。 */
  seq: number;
  name: string;
  /** 英文界面用。节气没有官方译名，取的是最通行的那一版。 */
  en: string;
  season: SolarSeason;
  /**
   * 公历的大致日子。真正的节气按太阳黄经算，逐年会差一天，
   * 这里只用来标「此刻大约走到哪」——差一天不影响那个圆点落在哪个名字上。
   */
  month: number;
  day: number;
};

export const SOLAR_TERMS: SolarTerm[] = [
  { seq: 1, name: '立春', en: 'Start of Spring', season: 'spring', month: 2, day: 4 },
  { seq: 2, name: '雨水', en: 'Rain Water', season: 'spring', month: 2, day: 19 },
  { seq: 3, name: '惊蛰', en: 'Awakening of Insects', season: 'spring', month: 3, day: 5 },
  { seq: 4, name: '春分', en: 'Spring Equinox', season: 'spring', month: 3, day: 20 },
  { seq: 5, name: '清明', en: 'Pure Brightness', season: 'spring', month: 4, day: 5 },
  { seq: 6, name: '谷雨', en: 'Grain Rain', season: 'spring', month: 4, day: 20 },
  { seq: 7, name: '立夏', en: 'Start of Summer', season: 'summer', month: 5, day: 5 },
  { seq: 8, name: '小满', en: 'Grain Full', season: 'summer', month: 5, day: 21 },
  { seq: 9, name: '芒种', en: 'Grain in Ear', season: 'summer', month: 6, day: 6 },
  { seq: 10, name: '夏至', en: 'Summer Solstice', season: 'summer', month: 6, day: 21 },
  { seq: 11, name: '小暑', en: 'Minor Heat', season: 'summer', month: 7, day: 7 },
  { seq: 12, name: '大暑', en: 'Major Heat', season: 'summer', month: 7, day: 23 },
  { seq: 13, name: '立秋', en: 'Start of Autumn', season: 'autumn', month: 8, day: 7 },
  { seq: 14, name: '处暑', en: 'End of Heat', season: 'autumn', month: 8, day: 23 },
  { seq: 15, name: '白露', en: 'White Dew', season: 'autumn', month: 9, day: 8 },
  { seq: 16, name: '秋分', en: 'Autumn Equinox', season: 'autumn', month: 9, day: 23 },
  { seq: 17, name: '寒露', en: 'Cold Dew', season: 'autumn', month: 10, day: 8 },
  { seq: 18, name: '霜降', en: 'Frost’s Descent', season: 'autumn', month: 10, day: 23 },
  { seq: 19, name: '立冬', en: 'Start of Winter', season: 'winter', month: 11, day: 7 },
  { seq: 20, name: '小雪', en: 'Minor Snow', season: 'winter', month: 11, day: 22 },
  { seq: 21, name: '大雪', en: 'Major Snow', season: 'winter', month: 12, day: 7 },
  { seq: 22, name: '冬至', en: 'Winter Solstice', season: 'winter', month: 12, day: 22 },
  { seq: 23, name: '小寒', en: 'Minor Cold', season: 'winter', month: 1, day: 5 },
  { seq: 24, name: '大寒', en: 'Major Cold', season: 'winter', month: 1, day: 20 },
];

export const SEASON_ORDER: SolarSeason[] = ['spring', 'summer', 'autumn', 'winter'];

export function termsOfSeason(season: SolarSeason): SolarTerm[] {
  return SOLAR_TERMS.filter(term => term.season === season);
}

export function findSolarTerm(seq: number | undefined): SolarTerm | undefined {
  return seq ? SOLAR_TERMS.find(term => term.seq === seq) : undefined;
}

/**
 * 此刻大约在哪个节气里。
 *
 * 一律按北京时间算，不看服务器或访客在哪个时区：节气是中国的历法，
 * 在东八区之外把它算成另一个日子，只会让那个圆点莫名其妙地早一天动。
 *
 * 只在服务端调用，算好了再传给客户端组件——让浏览器自己算的话，
 * 服务端渲染的那一版和水合之后的那一版可能落在不同的日子上。
 */
export function currentSolarTermSeq(now: Date = new Date()): number {
  // en-CA 给的是 YYYY-MM-DD，省掉自己拼月日的麻烦
  const beijing = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [, month, day] = beijing.split('-').map(Number);
  const today = month * 100 + day;

  // 按公历先后排一遍（小寒、大寒在年初，但它们是这一轮的倒数两个），
  // 取最近一个已经过去的节气。
  const byCalendar = [...SOLAR_TERMS].sort(
    (a, b) => a.month * 100 + a.day - (b.month * 100 + b.day),
  );
  let current = byCalendar[byCalendar.length - 1];  // 一月头几天：还在去年的冬至里
  for (const term of byCalendar) {
    if (term.month * 100 + term.day <= today) current = term;
  }
  return current.seq;
}
