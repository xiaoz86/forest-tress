import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chooseCompleteTranscript,
  mergeIncrementalTranscript,
  normalizeAsrTranscript,
} from '../src/lib/voiceTranscript.ts';

test('清除 SenseVoice 标签、表情但保留中文正文', () => {
  assert.deepEqual(normalizeAsrTranscript('<|zh|><|NEUTRAL|>今天想聊聊工作😊'), {
    text: '今天想聊聊工作',
    language: 'zh',
    suspiciousLanguage: false,
  });
});

test('语种标签被判成日文时不直接信任结果', () => {
  const value = normalizeAsrTranscript('<|ja|><|NEUTRAL|>今日发生的事情');
  assert.equal(value.text, '今日发生的事情');
  assert.equal(value.suspiciousLanguage, true);
});

test('没有标签但出现假名时仍能识别异常', () => {
  assert.equal(normalizeAsrTranscript('今日は少し疲れました').suspiciousLanguage, true);
});

test('中文夹英文术语不会被误拦', () => {
  assert.equal(
    normalizeAsrTranscript('今天想聊一下 Phil Coach 和 AI 的使用感受').suspiciousLanguage,
    false,
  );
});

test('最终转写为空时保住实时字幕', () => {
  assert.equal(chooseCompleteTranscript('', '我想聊聊今天发生的事情'), '我想聊聊今天发生的事情');
});

test('最终转写明显缺尾巴时保住更完整的实时字幕', () => {
  assert.equal(
    chooseCompleteTranscript('我想聊聊今天', '我想聊聊今天发生的事情'),
    '我想聊聊今天发生的事情',
  );
});

test('最终结果出现日文时回退到中文实时字幕', () => {
  assert.equal(
    chooseCompleteTranscript('今日は何が起きましたか', '今天发生了一些事情'),
    '今天发生了一些事情',
  );
});

test('两份内容不同时以完整录音定稿为准', () => {
  assert.equal(
    chooseCompleteTranscript('我想聊聊蜘蛛发生的事情', '我想聊聊今天发生的事情'),
    '我想聊聊蜘蛛发生的事情',
  );
});

test('带重叠的实时分片不会重复同一个词', () => {
  assert.equal(
    mergeIncrementalTranscript('我想和你聊聊蜘蛛', '蜘蛛发生的事情'),
    '我想和你聊聊蜘蛛发生的事情',
  );
});

test('没有可靠重叠时不擅自删除文字', () => {
  assert.equal(
    mergeIncrementalTranscript('今天有点累', '但总体还好'),
    '今天有点累但总体还好',
  );
});
