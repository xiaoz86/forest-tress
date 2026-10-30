// 检查浏览器直连识别用的那把专用 Key 是不是真的「只能识别」。
//
//   node scripts/check-asr-direct-key.mjs
//
// 为什么要查：/api/phil-coach/voice/token 会用 DASHSCOPE_ASR_DIRECT_API_KEY 签 st- 临时令牌交给浏览器，
// 令牌继承这把 Key 的全部权限。用主 Key 签的令牌实测（2026-10-28）能直接调 TTS 合成任意文字、
// 能列出复刻音色——所以专用 Key 要建在另一个只开通了 qwen3-asr-flash-realtime 的业务空间里。
// 复刻音色是按业务空间隔离还是按账号共享，文档没写清，这里一并实测。
//
// 做的事（都不产生音频、不改任何东西）：
//   1. 用专用 Key 签一个 st- 令牌；
//   2. 令牌 + ?api_key= 连专用空间的实时识别：应当连得上（session.created）；
//   3. 令牌调专用空间、主空间的 TTS（故意传一个不存在的音色，鉴权过了也合成不出东西）：应当 401/403；
//   4. 令牌调专用空间、主空间的 voice-enrollment list_voice（只读）：应当 401/403。
// 只打印状态码、错误码和数量；Key、令牌、音色 ID 一律不打印。全部符合预期才以 0 退出。

import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

const REGION = env.DASHSCOPE_REGION || 'cn-beijing';
const LABEL = /^[a-z0-9][a-z0-9-]{0,62}$/i;
const directKey = env.DASHSCOPE_ASR_DIRECT_API_KEY;
const directWs = env.DASHSCOPE_ASR_DIRECT_WORKSPACE_ID;
const mainWs = env.DASHSCOPE_WORKSPACE_ID;
if (!directKey || !directWs || !LABEL.test(directWs) || !LABEL.test(REGION)) {
  console.error('缺少 DASHSCOPE_ASR_DIRECT_API_KEY / DASHSCOPE_ASR_DIRECT_WORKSPACE_ID（.env.local）');
  process.exit(1);
}
if (directKey === env.DASHSCOPE_API_KEY || directWs === mainWs) {
  console.error('× 专用 Key / 业务空间和主配置相同，等于没隔离（服务端也会按没配处理）');
  process.exit(1);
}
const host = ws => `${ws}.${REGION}.maas.aliyuncs.com`;
const tokenOrigin = REGION === 'ap-southeast-1' ? 'https://dashscope-intl.aliyuncs.com' : 'https://dashscope.aliyuncs.com';
const model = env.DASHSCOPE_ASR_MODEL || 'qwen3-asr-flash-realtime';
const ttsModel = env.DASHSCOPE_TTS_MODEL || 'qwen-audio-3.1-tts-flash';

let failures = 0;
const report = (ok, label, detail) => {
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '×'} ${label}${detail ? `：${detail}` : ''}`);
};
const codeOf = async res => {
  const text = await res.text().catch(() => '');
  try {
    const json = JSON.parse(text);
    const list = json.output?.voice_list || json.output?.voices;
    return { code: json.code || '', count: Array.isArray(list) ? list.length : null };
  } catch {
    return { code: '', count: null };
  }
};
const denied = status => status === 401 || status === 403;

// 1. 签令牌
const minted = await fetch(`${tokenOrigin}/api/v1/tokens?expire_in_seconds=60`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${directKey}` },
});
const token = (await minted.json().catch(() => ({}))).token;
report(typeof token === 'string' && token.startsWith('st-'), '专用 Key 签令牌', `HTTP ${minted.status}`);
if (typeof token !== 'string') process.exit(1);

// 2. 识别：应当连得上
const asr = await new Promise(resolve => {
  let ws;
  const timer = setTimeout(() => {
    try { ws?.close(); } catch { /* ignore */ }
    resolve('超时');
  }, 8000);
  try {
    ws = new WebSocket(`wss://${host(directWs)}/api-ws/v1/realtime?model=${encodeURIComponent(model)}&api_key=${encodeURIComponent(token)}`);
  } catch (err) {
    clearTimeout(timer);
    resolve(`构造失败 ${err?.name || ''}`);
    return;
  }
  ws.onmessage = event => {
    let message = {};
    try { message = JSON.parse(String(event.data)); } catch { /* ignore */ }
    if (message.type === 'session.created' || message.type === 'error') {
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      resolve(message.type === 'session.created' ? 'ok' : `error ${message.error?.code || ''}`);
    }
  };
  ws.onerror = () => {
    clearTimeout(timer);
    resolve('握手被拒');
  };
});
report(asr === 'ok', '令牌连专用空间的实时识别（应当能连）', asr);

// 3. TTS：应当被拒（音色故意写错：就算鉴权过了也只会回 400，不会合成任何音频）
for (const [name, ws] of [['专用空间', directWs], ['主空间', mainWs]]) {
  if (!ws || !LABEL.test(ws)) continue;
  const res = await fetch(`https://${host(ws)}/api/v1/services/audio/tts/SpeechSynthesizer`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ttsModel,
      input: { text: '嗯', voice: 'no_such_voice_isolation_check', format: 'pcm', sample_rate: 24000 },
    }),
  });
  const { code } = await codeOf(res);
  report(denied(res.status), `令牌调${name}的 TTS（应当 401/403）`, [`HTTP ${res.status}`, code].filter(Boolean).join(' '));
}

// 4. 复刻音色列表（只读）：应当被拒
for (const [name, ws] of [['专用空间', directWs], ['主空间', mainWs]]) {
  if (!ws || !LABEL.test(ws)) continue;
  const res = await fetch(`https://${host(ws)}/api/v1/services/audio/tts/customization`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'voice-enrollment', input: { action: 'list_voice', page_index: 0, page_size: 10 } }),
  });
  const { code, count } = await codeOf(res);
  report(
    denied(res.status),
    `令牌列${name}的复刻音色（应当 401/403）`,
    [`HTTP ${res.status}`, code, count !== null ? `返回 ${count} 个音色` : ''].filter(Boolean).join(' '),
  );
}

console.log(failures ? `\n有 ${failures} 项不符合预期：先别开直连（PHIL_COACH_ASR_DIRECT=off）` : '\n全部符合预期：这把 Key 签的令牌只能识别');
process.exit(failures ? 1 : 0);
