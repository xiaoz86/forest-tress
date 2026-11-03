import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeAboutChapters, sameIntroduction } from '../src/lib/space/presentation.ts';

test('少资料合章不越过支持章节，也不覆盖作品优先', () => {
  assert.equal(mergeAboutChapters(true, ['knowing', 'path', 'offer']), true);
  assert.equal(mergeAboutChapters(true, ['offer', 'knowing', 'path']), true);
  assert.equal(mergeAboutChapters(true, ['path', 'knowing', 'offer']), false);
  assert.equal(mergeAboutChapters(true, ['knowing', 'offer', 'path']), false);
  assert.equal(mergeAboutChapters(false, ['knowing', 'path', 'offer']), false);
});

test('重复介绍忽略空白标点，独特的当下内容仍保留', () => {
  assert.equal(sameIntroduction('陪伴转换方向的人。', '陪伴转换方向的人'), true);
  assert.equal(sameIntroduction('', ''), false);
  assert.equal(sameIntroduction('陪伴转换方向的人', '最近在筹备一次散步活动'), false);
});
