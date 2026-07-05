// 把本地教练知识库蒸馏入库，供 /api/phil-coach 按主题检索。
// 用法：node --env-file=.env.local scripts/ingest-phil-coach-knowledge.mjs [--dry]
//   需要 NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//   知识库路径默认 /Users/xiaoz/claude/phil-coach，可用 PHIL_COACH_KB_DIR 覆盖
//   --dry  只打印将入库的块，不写数据库
//
// 保密红线（对应知识库《保密处理规范》）：
//   「我的教练真实案例」「成长日志」目录下的任何内容永不入库。

import { createClient } from '@supabase/supabase-js';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const KB_DIR = process.env.PHIL_COACH_KB_DIR || '/Users/xiaoz/claude/phil-coach';
const DRY = process.argv.includes('--dry');
const FORBIDDEN_DIRS = ['我的教练真实案例', '成长日志'];
const MAX_CHUNK = 2000;

// 每本书/文档的主题标签。检索时用用户消息里的主题词做数组重叠匹配。
const THEME_MAP = {
  高绩效教练: ['目标', '行动', '职业', '教练方法'],
  身心合一的奇迹力量: ['心魔', '自我批评', '表现', '专注'],
  唤醒沉睡的天才: ['教练方法', '信念', '正向意图'],
  共创式教练: ['教练方法', '倾听', '价值观', '自我实现'],
  教练式沟通: ['沟通', '反馈', '职场关系'],
  教练的常识: ['教练方法'],
  非暴力沟通: ['情绪', '沟通', '关系', '冲突'],
  萨提亚深层沟通力: ['情绪', '关系', '家庭', '沟通', '渴望'],
  心流: ['职业', '投入', '倦怠', '意义'],
  情商: ['情绪', '关系', '自我觉察'],
  被讨厌的勇气: ['关系', '课题分离', '他人眼光', '勇气', '自卑'],
  自卑与超越: ['自卑', '意义', '关系', '贡献'],
  心态制胜: ['自我批评', '成长', '失败', '学习'],
  大脑的情绪生活: ['情绪', '恢复力', '自我觉察'],
  具身认知: ['身体', '情绪', '压力'],
  非线性成长: ['职业', '转型', '选择', '成长'],
  正念: ['正念', '情绪', '压力', '当下'],
  正念的奇迹: ['正念', '当下', '忙碌'],
  世界上最快乐的人: ['正念', '焦虑', '快乐'],
  金刚经说什么: ['放下', '身份', '意义', '正念'],
  悉达多: ['意义', '迷茫', '人生方向', '倾听'],
  禅与摩托维修艺术: ['投入', '倦怠', '在乎', '品质'],
  斯多葛哲学: ['选择', '可控', '焦虑', '逆境'],
  领导者意识的进化: ['领导力', '成长', '信念'],
  共创式领导力: ['领导力', '关系'],
  孕育青色领导力: ['领导力', '组织', '信任'],
  心桩领导者的诞生: ['领导力', '价值观', '定力'],
  ICF核心能力: ['教练方法', '倾听', '临在'],
  MCC级别能力: ['教练方法', '临在'],
  CPCC共创式教练体系: ['教练方法', '价值观', '自我实现'],
  自我实现与心魔工作: ['心魔', '自我实现', '自我批评', '价值观', '共鸣'],
  教练技术工具箱: ['教练方法', '提问', '情绪', '选择', '行动'],
};

// 深度笔记只取对实时对话最有用的章节
const DEEP_NOTE_SECTIONS = /核心模型|概念深挖|关键概念|实践工具箱|问句|教练对话示范/;

function chunksOf(text, size = MAX_CHUNK) {
  const out = [];
  let rest = text.trim();
  while (rest.length > size) {
    // 尽量在段落边界切
    let cut = rest.lastIndexOf('\n\n', size);
    if (cut < size * 0.5) cut = size;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

function splitSections(markdown) {
  const parts = [];
  const lines = markdown.split('\n');
  let heading = '';
  let buf = [];
  for (const line of lines) {
    const m = line.match(/^##\s+(.+)/);
    if (m) {
      if (buf.length) parts.push({ heading, body: buf.join('\n') });
      heading = m[1].trim();
      buf = [];
    } else {
      buf.push(line);
    }
  }
  if (buf.length) parts.push({ heading, body: buf.join('\n') });
  return parts;
}

function titleOf(file) {
  return path.basename(file, '.md');
}

function themesFor(title) {
  return THEME_MAP[title] || ['成长'];
}

async function listMarkdown(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (FORBIDDEN_DIRS.some(f => full.includes(f))) continue; // 保密红线
    if (e.isDirectory()) out.push(...(await listMarkdown(full)));
    else if (e.name.endsWith('.md') && !e.name.startsWith('_') && e.name !== 'README.md')
      out.push(full);
  }
  return out;
}

async function collectRows() {
  const rows = [];

  // 1) 书籍简卡：整卡入库（本身就压缩过）
  const cardsDir = path.join(KB_DIR, '教练知识库');
  for (const file of await listMarkdown(cardsDir)) {
    const rel = path.relative(KB_DIR, file);
    if (rel.includes('深度笔记') || rel.includes('公版原文') || rel.includes('正版渠道')) continue;
    const title = titleOf(file);
    const content = (await readFile(file, 'utf-8')).trim();
    for (const [i, chunk] of chunksOf(content).entries()) {
      rows.push({
        source: rel + (i ? `#${i + 1}` : ''),
        category: 'cards',
        title,
        themes: themesFor(title),
        content: chunk,
        priority: 3,
      });
    }
  }

  // 2) 深度笔记：只取核心章节
  const deepDir = path.join(KB_DIR, '教练知识库', '深度笔记');
  for (const file of await listMarkdown(deepDir)) {
    const rel = path.relative(KB_DIR, file);
    const title = titleOf(file);
    const md = await readFile(file, 'utf-8');
    for (const { heading, body } of splitSections(md)) {
      if (!DEEP_NOTE_SECTIONS.test(heading)) continue;
      for (const [i, chunk] of chunksOf(body).entries()) {
        rows.push({
          source: `${rel}#${heading}${i ? `-${i + 1}` : ''}`,
          category: 'deep-notes',
          title: `${title}·${heading}`,
          themes: themesFor(title),
          content: chunk,
          priority: 2,
        });
      }
    }
  }

  // 3) 能力库：整篇按章节入库（最高优先级）
  const compDir = path.join(KB_DIR, '教练能力知识库');
  for (const file of await listMarkdown(compDir)) {
    const rel = path.relative(KB_DIR, file);
    const title = titleOf(file);
    const md = await readFile(file, 'utf-8');
    for (const { heading, body } of splitSections(md)) {
      const text = body.trim();
      if (text.length < 80) continue;
      for (const [i, chunk] of chunksOf(text).entries()) {
        rows.push({
          source: `${rel}#${heading || '全文'}${i ? `-${i + 1}` : ''}`,
          category: 'competency',
          title: heading ? `${title}·${heading}` : title,
          themes: themesFor(title),
          content: chunk,
          priority: 1,
        });
      }
    }
  }

  return rows;
}

async function main() {
  const rows = await collectRows();
  console.log(`共整理 ${rows.length} 个知识块（cards/deep-notes/competency = ${
    rows.filter(r => r.category === 'cards').length}/${
    rows.filter(r => r.category === 'deep-notes').length}/${
    rows.filter(r => r.category === 'competency').length}）`);

  if (DRY) {
    for (const r of rows.slice(0, 8)) {
      console.log(`- [${r.category}|p${r.priority}] ${r.title} (${r.content.length} 字) themes=${r.themes.join(',')}`);
    }
    console.log('…(--dry 模式，不写库)');
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('缺少 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  const sb = createClient(url, key);

  // 全量重建：先清空再写入（幂等）
  const { error: delErr } = await sb.from('phil_coach_knowledge').delete().neq('category', '__none__');
  if (delErr) throw new Error(`清空失败（表建了吗？先在 SQL Editor 跑 supabase-setup.sql 末段）：${delErr.message}`);

  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await sb.from('phil_coach_knowledge').insert(batch);
    if (error) throw new Error(`写入失败 @${i}: ${error.message}`);
    console.log(`已写入 ${Math.min(i + 100, rows.length)}/${rows.length}`);
  }
  console.log('入库完成 ✓');
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
