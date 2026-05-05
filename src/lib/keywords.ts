import type { NodeCard } from './supabase';

/**
 * 用 Kimi 从一份创造者节点信息中抽出 5-8 个高质量关键词。
 * 没有 MOONSHOT_API_KEY 时返回 []，调用方应自行回落到规则提取。
 */
export async function generateKeywordsAI(
  node: NodeCard,
  count = 7,
): Promise<string[]> {
  const apiKey = process.env.MOONSHOT_API_KEY;
  if (!apiKey) return [];

  const baseUrl = (process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1').replace(/\/+$/, '');
  const model = process.env.KIMI_MODEL || 'kimi-k2-turbo-preview';

  const profile = [
    node.name && `姓名：${node.name}`,
    node.city && `城市：${node.city}`,
    node.doing && `在做：${node.doing}`,
    node.product && `作品/项目：${node.product}`,
    node.experience && `经验/独特性：${node.experience}`,
    node.offer && `可以提供：${node.offer}`,
    node.seeking && `在寻找：${node.seeking}`,
    node.topics?.length ? `已有标签：${node.topics.join('、')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  if (!profile.trim()) return [];

  const system = `你是社群目录的关键词提取专家。
任务：从一份创造者的节点信息里，提炼 6-8 个最能代表 TA 的关键词作为卡片 chip 标签。

【关键词应混合覆盖以下四类，缺哪类补哪类】
A. 身份/角色：如「Co-Active 教练」「独立开发者」「社区主理人」
B. 核心专长/方法论：如「正念冥想」「个人商业画布」「产品设计」
C. 具名项目/作品/产品：如「附近森林」「Focus-AI」「随机漫步的进化」（书名/播客名/社区名/产品名）
D. 主题方向/议题：如「教育创新」「AI+成长」「社区营造」

【硬性规则】
1. 文本中出现的"具名项目/作品/产品"（带书名号《》「」、带冒号、有明显产品名形态如英文+连字符）必须优先保留，至少抽 2 个（如果存在）
2. 已有用户标签（topics）保留并放在最前
3. 每个关键词 2-12 字（中英混合都算字符），干净的名词短语，不要"的/在/做/也/并"等虚词
4. 避免重叠（"教练" vs "Co-Active 教练" → 选具体的）
5. 仅输出 JSON，无解释`;

  const user = `${profile}

请提取 ${count} 个关键词。务必从【具名项目/作品/产品】类别至少抽 2 个（如果文本中存在）。
按重要度从高到低排序，以 JSON 返回：
{"keywords": ["关键词1", "关键词2", ...]}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[keywords] Kimi non-200', res.status, text.slice(0, 240));
      return [];
    }

    const json = await res.json();
    const content: string | undefined = json?.choices?.[0]?.message?.content;
    if (!content) return [];

    let parsed: { keywords?: unknown };
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) return [];
      try {
        parsed = JSON.parse(m[0]);
      } catch {
        return [];
      }
    }

    const arr = Array.isArray(parsed?.keywords) ? parsed.keywords : [];
    const out: string[] = [];
    for (const k of arr) {
      if (typeof k !== 'string') continue;
      const t = k.trim().replace(/^[#"'\s]+|[#"'\s]+$/g, '');
      if (!t) continue;
      // 长度护栏：2-12 字符，避免 AI 偶尔吐出整句
      if (t.length < 2 || t.length > 12) continue;
      if (out.includes(t)) continue;
      out.push(t);
      if (out.length >= count + 2) break;
    }
    return out;
  } catch (err) {
    console.error('[keywords] failed', err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}
