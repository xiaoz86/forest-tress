// 一次性脚本：删除 Supabase node_cards 里的测试数据
// 只删除以 "UI测试" 或 "测试树" 开头的节点
// 运行方式: NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7890 node scripts/delete-test-nodes.mjs

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// 从 .env.local 读取配置
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);

// 1. 先列出要删除的节点
const { data: candidates, error: listErr } = await supabase
  .from('node_cards')
  .select('id, name, created_at')
  .or('name.like.UI测试%,name.like.测试树%,name.like.UI%');

if (listErr) {
  console.error('List error:', listErr.message);
  process.exit(1);
}

console.log('\n准备删除以下测试节点:');
candidates.forEach(n => console.log(`  - ${n.name}  (${n.id})`));
console.log(`共 ${candidates.length} 条\n`);

if (candidates.length === 0) {
  console.log('没有需要删除的数据');
  process.exit(0);
}

// 2. 执行删除
const ids = candidates.map(c => c.id);
const { error: delErr } = await supabase.from('node_cards').delete().in('id', ids);

if (delErr) {
  console.error('Delete error:', delErr.message);
  process.exit(1);
}

console.log(`✓ 成功删除 ${ids.length} 条测试数据`);

// 3. 再次列出全部剩余节点确认
const { data: remaining } = await supabase
  .from('node_cards')
  .select('name, city, created_at')
  .order('created_at', { ascending: false });

console.log('\n当前剩余节点:');
remaining?.forEach(n => console.log(`  - ${n.name}${n.city ? ` (${n.city})` : ''}`));
