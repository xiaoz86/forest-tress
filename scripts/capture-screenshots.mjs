#!/usr/bin/env node
// 发布说明（/launch）用的截图：按顺序一张张截，存进 public/launch-screenshots/<版本>/。
//
// 用法：
//   node scripts/capture-screenshots.mjs                      # 访客视角的那些
//   NF_SESSION=<nf_session cookie> node scripts/capture-screenshots.mjs   # 再加上登录后的几张（调风格、管理页）
// 环境变量：HOST（默认 http://localhost:3000）、OUT（默认 public/launch-screenshots/2026-10）、ONLY=名字1,名字2
//
// 不依赖 puppeteer：直接用本机 Chrome 的 DevTools 协议。一次只开一个 Chrome、一张一张截，
// 整个脚本有总超时——并行开很多个无头 Chrome 曾经把这台机器的负载拖到 600。
// 登录 cookie 只从环境变量读，不写进仓库。

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HOST = process.env.HOST || 'http://localhost:3000';
const OUT = process.env.OUT || 'public/launch-screenshots/2026-10';
const SESSION = process.env.NF_SESSION || '';
const ONLY = new Set((process.env.ONLY || '').split(',').filter(Boolean));
const ZID = '4670a424-ffc5-4b5d-822e-36fc69ac0659';

/**
 * 要截的画面。w×h 是视口；mobile 用 2 倍像素密度、手机 UA；login 需要 NF_SESSION；
 * eval 在截图前在页面里跑（可以 await，有 sleep / click 两个帮手）。
 */
const SHOTS = [
  { name: '01-home', url: '/', w: 1280, h: 800 },
  { name: '02-creators', url: '/creators', w: 1280, h: 860 },
  { name: '03-space', url: '/@xiaoz', w: 1280, h: 800 },
  { name: '04-space-tune', url: `/space/${ZID}?tune=1`, w: 1280, h: 800, login: true },
  { name: '05-space-share', url: `/space/${ZID}/manage?tab=share`, w: 1280, h: 1000, login: true },
  { name: '06-square', url: '/shares', w: 1280, h: 860 },
  { name: '07-phil-coach', url: '/phil-coach', w: 1280, h: 800 },
  { name: '08-phil-coach-mobile', url: '/phil-coach', w: 390, h: 844, mobile: true },
  { name: '09-meditations', url: '/meditations', w: 1280, h: 800 },
  { name: '10-sky', url: '/sky', w: 1280, h: 800 },
  { name: '11-creators-mobile', url: '/creators', w: 390, h: 844, mobile: true },
  { name: '12-space-mobile', url: '/@xiaoz', w: 390, h: 844, mobile: true },
  // 个人网站往下：服务和活动那一章（报名、预约就在这里）
  { name: '13-space-offer', url: '/@xiaoz', w: 1280, h: 900, eval: `const el=document.querySelector('#offer'); if (el) scrollTo({ top: el.getBoundingClientRect().top + scrollY - 24, behavior: 'instant' }); await sleep(1200);` },
  // 小芽：只把对话面板打开，不发消息
  { name: '14-xiaoya', url: '/creators', w: 1280, h: 800, eval: `click('问问小芽'); await sleep(900);` },
];

mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const port = 9600 + Math.floor(Math.random() * 300);
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'nf-shots-'))}`,
  '--no-first-run', '--hide-scrollbars', '--force-device-scale-factor=1', 'about:blank',
], { stdio: 'ignore' });
const quit = code => { try { chrome.kill(); } catch {} process.exit(code); };
// 总超时：服务端挂住时不让它一直挂着，也不留下孤儿 Chrome
setTimeout(() => { console.error('TIMEOUT: 8 分钟还没截完'); quit(2); }, 8 * 60_000).unref();
process.on('SIGINT', () => quit(130));

let targets;
for (let i = 0; i < 60; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (targets.length) break; } catch {}
  await sleep(200);
}
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
let events = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else events.push(m);
});
const send = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });

await send('Page.enable');
await send('Network.enable');
const host = new URL(HOST).hostname;

for (const shot of SHOTS) {
  if (ONLY.size && !ONLY.has(shot.name)) continue;
  if (shot.login && !SESSION) { console.log(`- ${shot.name}: 跳过（没有 NF_SESSION）`); continue; }
  await send('Network.clearBrowserCookies');
  // 发布说明是中文的：固定中文界面
  await send('Network.setCookie', { name: 'nf_lang', value: 'zh', domain: host, path: '/' });
  if (shot.login) await send('Network.setCookie', { name: 'nf_session', value: SESSION, domain: host, path: '/' });
  await send('Emulation.setDeviceMetricsOverride', { width: shot.w, height: shot.h, deviceScaleFactor: shot.mobile ? 2 : 1, mobile: !!shot.mobile });
  await send('Emulation.setUserAgentOverride', {
    userAgent: shot.mobile
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
      : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
  });
  events = [];
  await send('Page.navigate', { url: `${HOST}${shot.url}` });
  for (let i = 0; i < 150 && !events.some(e => e.method === 'Page.loadEventFired'); i++) await sleep(200);
  // 懒加载的图滚一遍再回顶；等图片优化器把头像吐出来
  await send('Runtime.evaluate', {
    expression: `(async()=>{for(let y=0;y<document.body.scrollHeight;y+=600){scrollTo(0,y);await new Promise(r=>setTimeout(r,120))}scrollTo(0,0)})()`,
    awaitPromise: true,
  });
  await send('Runtime.evaluate', {
    expression: `Promise.race([Promise.all([...document.images].filter(i=>!i.complete).map(i=>new Promise(r=>{i.onload=i.onerror=r}))),new Promise(r=>setTimeout(r,8000))])`,
    awaitPromise: true,
  });
  await sleep(1500);
  if (shot.eval) {
    await send('Runtime.evaluate', {
      expression: `(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));const click=t=>{const b=[...document.querySelectorAll('button,a')].find(x=>x.textContent.trim()===t||x.getAttribute('aria-label')===t);if(!b)throw new Error('no '+t);b.click();};${shot.eval}})()`,
      awaitPromise: true,
    });
    await sleep(900);
  }
  // 截图时藏掉开发环境的角标（Next 的「N」按钮）
  await send('Runtime.evaluate', { expression: `document.querySelectorAll('nextjs-portal').forEach(n=>n.remove())` });
  const shotRes = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${shot.name}.png`, Buffer.from(shotRes.result.data, 'base64'));
  console.log(`✓ ${shot.name}.png`);
}

ws.close();
quit(0);
