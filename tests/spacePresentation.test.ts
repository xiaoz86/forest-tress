import assert from 'node:assert/strict';
import test from 'node:test';
import { chapterOrder, type ChapterKey } from '../src/lib/space/edits.ts';
import { coverTaglineLines, sameIntroduction } from '../src/lib/space/presentation.ts';

test('未保存顺序的创造者默认先提供支持，再展开关于我和作品生活', () => {
  assert.deepEqual(chapterOrder(undefined), ['offer', 'knowing', 'path']);
  assert.deepEqual(chapterOrder({}), ['offer', 'knowing', 'path']);
  assert.deepEqual(chapterOrder({ order: [] }), ['offer', 'knowing', 'path']);
});

test('新版结构保留本人已保存的顺序，不改写现有资料', () => {
  for (const order of [
    ['knowing', 'path', 'offer'], ['knowing', 'offer', 'path'],
    ['path', 'knowing', 'offer'], ['path', 'offer', 'knowing'],
    ['offer', 'knowing', 'path'], ['offer', 'path', 'knowing'],
  ] as ChapterKey[][]) {
    const edits = { order, story: '保留本人原话', coverRecent: { text: '尚未公开', visible: false } };
    const before = structuredClone(edits);
    assert.deepEqual(chapterOrder(edits), order);
    assert.deepEqual(edits, before);
  }
});

test('不完整旧顺序保留已有选择，并补齐剩余章节', () => {
  assert.deepEqual(chapterOrder({ order: ['path'] }), ['path', 'offer', 'knowing']);
  assert.deepEqual(chapterOrder({ order: ['knowing', 'knowing'] }), ['knowing', 'offer', 'path']);
});

test('重复介绍忽略空白标点，独特的当下内容仍保留', () => {
  assert.equal(sameIntroduction('陪伴转换方向的人。', '陪伴转换方向的人'), true);
  assert.equal(sameIntroduction('', ''), false);
  assert.equal(sameIntroduction('陪伴转换方向的人', '最近在筹备一次散步活动'), false);
});

test('首屏中文介绍在接近中点的语义边界分行', () => {
  assert.deepEqual(coverTaglineLines('探索生命万般可能，向世界学习，分享真善美。'), [
    '探索生命万般可能，', '向世界学习，分享真善美。',
  ]);
  assert.deepEqual(coverTaglineLines('相信每个人都有自己的节奏；陪伴彼此探索更丰富的人生。'), [
    '相信每个人都有自己的节奏；', '陪伴彼此探索更丰富的人生。',
  ]);
});

test('不强行拆短句、英文、无边界或短尾介绍', () => {
  for (const text of [
    '', '慢慢生长，认真生活。', 'Creating useful things, one day at a time.',
    '希望陪伴每一个正在寻找方向的人探索更多人生可能',
    '陪伴每一个正在寻找人生方向的人慢慢向前走，真好。',
    '探索生命万般可能，\n向世界学习，分享真善美。',
    '陪伴正在探索的人一起创造充满真善美的丰富人生，'.repeat(2),
  ]) assert.deepEqual(coverTaglineLines(text), [text]);
});

test('分行保留空格、emoji 和闭引号，不让闭引号单独起行', () => {
  const quoted = '我们一起「探索生命可能，」向世界学习并分享真善美。';
  assert.deepEqual(coverTaglineLines(quoted), ['我们一起「探索生命可能，」', '向世界学习并分享真善美。']);
  for (const text of [quoted, '  探索生命万般可能🌱， 向世界学习，分享真善美。  ']) {
    const lines = coverTaglineLines(text);
    assert.equal(lines.length, 2);
    assert.equal(lines.join(''), text);
    assert.ok(!/^[，；。！？、”’」』）》】]/.test(lines[1]));
  }
});
