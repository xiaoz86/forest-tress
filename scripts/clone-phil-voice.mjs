// 把一段自己录的声音克隆成 phil-coach 的朗读嗓音（SiliconFlow / CosyVoice2 零样本克隆）。
//
//   列出已有音色： node scripts/clone-phil-voice.mjs list
//   上传参考音频： node scripts/clone-phil-voice.mjs upload <音频文件> "<这段音频里你说的原话>" [音色名]
//   试听：        node scripts/clone-phil-voice.mjs try <uri> ["要试听的句子"]
//   删除：        node scripts/clone-phil-voice.mjs delete <uri>
//
// 参考音频要求：单人、8～10 秒（最长 30 秒）、吐字清楚、音量稳定、几乎没有背景噪音；
// mp3 建议 192kbps 以上。第二个参数必须和音频里说的话逐字一致，克隆质量主要取决于这两点。
//
// 上传成功后把打印出来的 uri 填到 .env.local 和 Vercel 的 PHIL_COACH_TTS_VOICE 里。

import { readFileSync, writeFileSync } from 'fs';
import { basename, extname } from 'path';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

const KEY = env.SILICONFLOW_API_KEY;
if (!KEY) {
  console.error('缺少 SILICONFLOW_API_KEY（.env.local）');
  process.exit(1);
}

const MODEL = 'FunAudioLLM/CosyVoice2-0.5B';
const MIME = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.opus': 'audio/opus', '.pcm': 'audio/pcm' };

async function call(path, init) {
  const res = await fetch(`https://api.siliconflow.cn/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${KEY}`, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    console.error(`× ${path} ${res.status}\n${(await res.text().catch(() => '')).slice(0, 400)}`);
    process.exit(1);
  }
  return res;
}

const [command, ...args] = process.argv.slice(2);

if (command === 'list') {
  const { result } = await (await call('/audio/voice/list', { method: 'GET' })).json();
  if (!result?.length) {
    console.log('还没有自定义音色。用 upload 传一段自己的录音。');
  } else {
    for (const v of result) console.log(`${v.customName}\n  ${v.uri}\n`);
  }
} else if (command === 'upload') {
  const [file, text, name = 'phil-coach'] = args;
  if (!file || !text) {
    console.error('用法: node scripts/clone-phil-voice.mjs upload <音频文件> "<音频里的原话>" [音色名]');
    process.exit(1);
  }

  const bytes = readFileSync(file);
  const seconds = extname(file).toLowerCase() === '.wav' ? Math.round(bytes.length / 32000) : null;
  console.log(`参考音频 ${basename(file)} · ${(bytes.length / 1024 / 1024).toFixed(2)} MB${seconds ? ` · 约 ${seconds}s` : ''}`);
  if (seconds && (seconds < 5 || seconds > 30)) {
    console.warn(`⚠︎ 时长 ${seconds}s 偏离建议区间（8～10s，最长 30s），克隆效果可能不稳`);
  }

  const form = new FormData();
  form.append('file', new Blob([bytes], { type: MIME[extname(file).toLowerCase()] ?? 'audio/mpeg' }), basename(file));
  form.append('model', MODEL);
  form.append('customName', name);
  form.append('text', text);

  const { uri } = await (await call('/uploads/audio/voice', { method: 'POST', body: form })).json();
  console.log(`\n✓ 音色已建好\n  ${uri}\n`);

  // 顺手写回 .env.local，省得手抄这一长串
  const line = `PHIL_COACH_TTS_VOICE=${uri}`;
  const current = readFileSync('.env.local', 'utf8');
  writeFileSync(
    '.env.local',
    /^PHIL_COACH_TTS_VOICE=.*$/m.test(current)
      ? current.replace(/^PHIL_COACH_TTS_VOICE=.*$/m, line)
      : `${current.replace(/\n*$/, '\n')}${line}\n`,
  );
  console.log('已写入 .env.local。线上还要在 Vercel 加同名环境变量。');
  console.log(`试听： node scripts/clone-phil-voice.mjs try ${uri}`);
} else if (command === 'try') {
  const [uri, sentence = '快一点了还在工作。听起来你声音里带着疲惫。'] = args;
  if (!uri) {
    console.error('用法: node scripts/clone-phil-voice.mjs try <uri> ["试听句子"]');
    process.exit(1);
  }
  const res = await call('/audio/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      input: sentence,
      voice: uri,
      response_format: 'mp3',
      speed: 0.9,     // 和线上朗读保持一致，试听才作数
    }),
  });
  const out = 'phil-voice-preview.mp3';
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log(`✓ 已生成 ${out}（用线上同样的语速 0.9）\n  open ${out}`);
} else if (command === 'delete') {
  const [uri] = args;
  if (!uri) {
    console.error('用法: node scripts/clone-phil-voice.mjs delete <uri>');
    process.exit(1);
  }
  await call('/audio/voice/deletions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uri }),
  });
  console.log('✓ 已删除');
} else {
  console.log(readFileSync(new URL(import.meta.url)).toString().split('\n').slice(0, 14).join('\n'));
}
