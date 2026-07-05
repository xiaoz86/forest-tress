// phil-coach 知识检索：从用户消息识别主题 → 从 Supabase 取最相关的知识块。
// 任何一步失败都静默降级为空——对话永远不因知识库不可用而中断。

import { createClient } from '@supabase/supabase-js';

/** 用户语言 → 主题标签。与 scripts/ingest-phil-coach-knowledge.mjs 的 THEME_MAP 呼应。 */
const THEME_SIGNALS: Array<{ re: RegExp; themes: string[] }> = [
  { re: /难受|委屈|挫败|沮丧|焦虑|害怕|生气|愤怒|崩溃|哭|情绪/, themes: ['情绪', '正念'] },
  { re: /纠结|选择|要不要|该不该|offer|抉择|两难/, themes: ['选择', '可控', '价值观'] },
  { re: /不行|做不到|否定自己|自我怀疑|批评自己|不够好|配不上|丢脸/, themes: ['心魔', '自我批评', '自卑'] },
  { re: /工作|职业|事业|转型|辞职|跳槽|创业|工作室/, themes: ['职业', '转型', '选择'] },
  { re: /累|倦怠|没劲|提不起|疲惫|耗竭|麻木/, themes: ['倦怠', '投入', '正念'] },
  { re: /家人|父母|妈妈|爸爸|伴侣|老公|老婆|孩子|婆|岳/, themes: ['关系', '家庭', '课题分离', '渴望'] },
  { re: /同事|领导|老板|团队|下属|客户|职场/, themes: ['职场关系', '沟通', '领导力'] },
  { re: /别人怎么看|面子|评价|眼光|认可|比较/, themes: ['他人眼光', '课题分离'] },
  { re: /意义|迷茫|方向|为什么活|价值|使命|愿景/, themes: ['意义', '人生方向', '价值观'] },
  { re: /冲突|吵架|沟通|误解|表达/, themes: ['沟通', '冲突', '关系'] },
  { re: /冥想|正念|睡不着|失眠|静不下来|杂念/, themes: ['正念', '当下'] },
  { re: /目标|计划|行动|拖延|执行/, themes: ['目标', '行动'] },
  { re: /带团队|管理|领导力|组织/, themes: ['领导力'] },
];

export function detectThemes(text: string): string[] {
  const hit = new Set<string>();
  for (const { re, themes } of THEME_SIGNALS) {
    if (re.test(text)) themes.forEach(t => hit.add(t));
    if (hit.size >= 6) break;
  }
  return Array.from(hit);
}

type KnowledgeRow = {
  title: string;
  content: string;
  priority: number;
};

/**
 * 取与近几条用户消息最相关的知识块（≤maxChunks 块、每块≤2000字）。
 * 失败/未配置/无命中 → 返回空字符串。
 */
export async function fetchRelevantKnowledge(
  recentUserText: string,
  maxChunks = 2,
): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return '';

  const themes = detectThemes(recentUserText);
  if (themes.length === 0) return '';

  try {
    const sb = createClient(url, key);
    const { data, error } = await sb
      .from('phil_coach_knowledge')
      .select('title, content, priority')
      .overlaps('themes', themes)
      .order('priority', { ascending: true })
      .limit(maxChunks * 6); // 候选窗口放宽：同一来源块多时，仍给第二视角留位置
    if (error || !data?.length) return '';

    // 同优先级内随机化一点，避免每次都取同一块
    const picked: KnowledgeRow[] = [];
    const byPriority = data as KnowledgeRow[];
    const seenTitle = new Set<string>();
    for (const row of byPriority) {
      const book = row.title.split('·')[0];
      if (seenTitle.has(book)) continue; // 同一来源最多一块，保证视角多样
      seenTitle.add(book);
      picked.push(row);
      if (picked.length >= maxChunks) break;
    }

    return picked
      .map(row => `《${row.title}》\n${row.content}`)
      .join('\n\n---\n\n');
  } catch {
    return '';
  }
}
