import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chunkForSpeech,
  cleanForSpeech,
  createSpeechChunker,
  type SpeechChunk,
} from '../src/lib/philCoachSpeech.ts';

/** 模拟模型一小段一小段地吐字 */
function streamThrough(text: string, step = 3) {
  const chunker = createSpeechChunker();
  const out: (SpeechChunk & { at: number | 'flush' })[] = [];
  for (let i = 0; i < text.length; i += step) {
    for (const chunk of chunker.push(text.slice(i, i + step))) out.push({ ...chunk, at: i + step });
  }
  for (const chunk of chunker.flush()) out.push({ ...chunk, at: 'flush' });
  return out;
}

test('cleanForSpeech 去掉 markdown、链接、表情，换行变停顿', () => {
  assert.equal(
    cleanForSpeech('## 先说一句\n- **第一步** 😊\n- 第二步\n看 [这里](https://example.com/a.b) 和 https://x.cn/y 。'),
    '先说一句。第一步。第二步。看这里和。',
  );
});

test('cleanForSpeech 去掉舞台提示，保留正文里的括号内容', () => {
  assert.equal(
    cleanForSpeech('守了一整夜（语气温和）。先感受一下（不用急着回我），回来再说。'),
    '守了一整夜。先感受一下，不用急着回我，回来再说。',
  );
  assert.equal(cleanForSpeech('That sounds heavy (smiles softly). What helps?'), 'That sounds heavy. What helps?');
  assert.equal(cleanForSpeech('（笑）好的。'), '好的。');
});

test('cleanForSpeech 不留开头的右引号和结尾的逗号', () => {
  assert.equal(cleanForSpeech('”然后等一等，'), '然后等一等');
});

test('第一段要快：句末够 4 个字就发，不等后面', () => {
  const reply = '刚才还沉沉的，这会儿忽然亮了一下。中间发生了什么？';
  const out = streamThrough(reply, 2);
  assert.equal(out[0].index, 0);
  assert.equal(out[0].text, '刚才还沉沉的，这会儿忽然亮了一下。');
  // 句号之后再来一个字就能确认句子结束了，不用等到 flush
  assert.notEqual(out[0].at, 'flush');
  assert.ok((out[0].at as number) <= reply.indexOf('。') + 3);
});

test('第一段太短（「嗯。」）不单独发，和下一句一起', () => {
  assert.deepEqual(chunkForSpeech('嗯。我在这儿。').map(c => c.text), ['嗯。我在这儿。']);
});

test('第一段在首个够长的自然停顿立即交出，不等完整长句或 28 字', () => {
  const reply = '这几天你一直独自撑着很多事，没有人可以商量，也没有人能替你照顾家人。我们可以先说说眼下最想解决的事情。';
  const out = streamThrough(reply, 2);
  assert.equal(out[0].text, '这几天你一直独自撑着很多事');
  assert.notEqual(out[0].at, 'flush');
  assert.ok((out[0].at as number) < 28);
  // 一次到齐与逐字到达，首段相同；只缩短首段，不把后续长句都打碎。
  for (const step of [1, 3, 8, reply.length]) {
    const chunks = streamThrough(reply, step);
    assert.equal(chunks[0].text, out[0].text);
    assert.equal(chunks.map(c => c.text).join(''), cleanForSpeech(reply).replace('，', ''));
  }
});

test('首段提前切：保留英文单词、数字千位与时间中的逗号冒号', () => {
  for (const reply of [
    'You have been carrying a lot alone, and we can take this one step at a time.',
    '我们先约定在明天的 10:30 见面，然后一起整理眼下最需要完成的事情。',
    '你提到这次需要支付 12,500 元，我们可以先看看哪些支出能够延后。',
  ]) {
    const expected = chunkForSpeech(reply);
    for (const step of [1, 2, 5, reply.length]) {
      assert.deepEqual(streamThrough(reply, step).map(({ index, text }) => ({ index, text })), expected);
    }
    if (reply.includes('10:30')) assert.ok(expected[0].text.includes('10:30'));
    if (reply.includes('12,500')) assert.ok(expected[0].text.includes('12,500'));
  }
});

test('首段提前切不劈开网址协议与参数，朗读不泄出 URL 残片', () => {
  for (const reply of [
    'Please check https://example.com/help, then tell me which step feels most useful.',
    '我们可以先参考这个练习地址 https://example.com/a,b?step=1 然后谈谈哪个步骤最有帮助。',
  ]) {
    for (const step of [1, 2, 5, reply.length]) {
      const out = streamThrough(reply, step);
      const spoken = out.map(c => c.text).join(' ');
      assert.ok(!/https|example|\/\/|step=1/.test(spoken), spoken);
    }
  }
});

test('之后各段攒到 40 字以上再发，单段不超过 120 字', () => {
  const reply =
    '刚才还沉沉的，这会儿忽然亮了一下。中间发生了什么？我注意到你说到“跑医院”的时候，语速慢了下来，好像那几天的累还压在身上。' +
    '如果你愿意，可以说说那几天里最难的一刻；不想说也没关系，我们就待在这里。你现在最想被谁听见呢？其实不用马上回答，先感受一下，回来再说。';
  const out = streamThrough(reply);
  assert.deepEqual(out.map(c => c.index), out.map((_, i) => i));
  for (const chunk of out.slice(1, -1)) assert.ok(chunk.text.length >= 40, chunk.text);
  for (const chunk of out) assert.ok(chunk.text.length <= 120, chunk.text);
  // 切分不丢字也不多字
  assert.equal(out.map(c => c.text).join(''), cleanForSpeech(reply));
});

test('没有标点的长段也不超过 120 字', () => {
  const longText = '我想先慢慢听你说说你那几天的事情你在医院里陪着家人一个人撑着很多事没人可以商量'.repeat(5);
  const out = chunkForSpeech(longText);
  assert.ok(out.length >= 2);
  for (const chunk of out) assert.ok(chunk.text.length <= 120);
  assert.equal(out.map(c => c.text).join(''), longText);
});

test('英文：按句切，句号要跟空白才算句末，3.5 不切', () => {
  const reply =
    'I hear you. That sounds really heavy, and it makes sense that you feel tired after a whole week of this. ' +
    'When you think about tomorrow, what feels like the smallest step you could take? You slept 3.5 hours.';
  const out = streamThrough(reply, 4);
  assert.equal(out[0].text, 'I hear you.');
  assert.ok(out.every(c => c.text.length <= 120));
  assert.ok(out.some(c => c.text.includes('3.5 hours')));
});

test('引号收尾的句子：右引号跟着上一段走', () => {
  const chunker = createSpeechChunker();
  const out: SpeechChunk[] = [];
  for (const delta of ['你可以说：“我现在很危险', '，需要你陪我。', '”然后等', '一等。']) out.push(...chunker.push(delta));
  out.push(...chunker.flush());
  assert.deepEqual(out.map(c => c.text), ['你可以说：“我现在很危险，需要你陪我。”', '然后等一等。']);
});

test('flush 交出剩下的；只有符号和表情的段不占序号', () => {
  const chunker = createSpeechChunker();
  assert.deepEqual(chunker.push('好的。'), []);
  assert.deepEqual(chunker.flush(), [{ index: 0, text: '好的。' }]);
  assert.deepEqual(chunkForSpeech('😊\n**'), []);
  assert.deepEqual(createSpeechChunker().flush(), []);
});

test('括号里不切：舞台提示不会被劈成两半念出来', () => {
  const out = chunkForSpeech('我在这里（停顿。微笑）。你慢慢说，不着急。');
  assert.equal(out.map(c => c.text).join(''), '我在这里。你慢慢说，不着急。');
});
