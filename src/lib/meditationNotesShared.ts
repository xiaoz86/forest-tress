/**
 * 感悟的类型和常量，服务端和浏览器都要用。
 *
 * 单独放一个文件，是因为 meditationNotes.ts 顶层 import 了
 * @supabase/supabase-js —— 客户端组件只要从那里取一个常量，
 * 整个 supabase 客户端就会被打进浏览器包。
 */

export const NOTE_MAX_CHARS = 500;

/** 匿名者的显示名。库里仍存着真名，只是永不下发。 */
export const ANON_LABEL = '森林里的一个人';

export type TrackNote = {
  id: string;
  trackId: string;
  /** 已按匿名处理过的显示名 */
  author: string;
  /** 匿名时为空字符串 */
  avatarUrl: string;
  body: string;
  createdAt: string;
  /** 当前访客是不是作者——决定能不能删 */
  mine: boolean;
};
