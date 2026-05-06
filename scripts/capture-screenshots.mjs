#!/usr/bin/env node
// Take fullPage captures of each route, then ffmpeg-crop into article-ready stills.
// Output → public/launch-screenshots/

import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HOST = process.env.HOST || 'http://localhost:3000';
const OUT = 'public/launch-screenshots';
const ZID = '4670a424-ffc5-4b5d-822e-36fc69ac0659';
const Z_COOKIE = [{ url: HOST, name: 'nf_member', value: ZID, path: '/' }];

await fs.mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--hide-scrollbars'],
});

async function fullPage({ name, url, width, height, cookies }) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  if (cookies?.length) await ctx.setCookie(...cookies);
  await page.goto(`${HOST}${url}`, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 800));
  const file = `${OUT}/${name}.png`;
  await page.screenshot({ path: file, fullPage: true, type: 'png' });
  await ctx.close();
  console.log(`✓ ${name}.png`);
}

function crop(input, w, h, x, y, output) {
  const r = spawnSync('ffmpeg', ['-y', '-i', input, '-vf', `crop=${w}:${h}:${x}:${y}`, '-loglevel', 'error', output]);
  if (r.status !== 0) throw new Error(`ffmpeg crop failed for ${output}: ${r.stderr}`);
  console.log(`  ↳ cropped ${output.replace(OUT + '/', '')}`);
}

// ── Full-page captures ──────────────────────────────────────────
await fullPage({ name: '_home',           url: '/',                  width: 1280, height: 800 });
await fullPage({ name: '_creators',       url: '/creators',           width: 1280, height: 900 });
await fullPage({ name: '_detail',         url: `/creators/${ZID}`,    width: 1280, height: 800 });
await fullPage({ name: '_detail_editor',  url: `/creators/${ZID}`,    width: 1280, height: 800, cookies: Z_COOKIE });
await fullPage({ name: '_mobile_detail',  url: `/creators/${ZID}`,    width: 420,  height: 800 });
await fullPage({ name: '_mobile_home',    url: '/',                   width: 420,  height: 800 });

await browser.close();

// ── Crops (W H X Y) ─────────────────────────────────────────────
// Homepage: docHeight ≈ 12667 at width 1280.  #join at y≈9605.  works label ≈ y=11366.
crop(`${OUT}/_home.png`, 1280, 800, 0, 0,     `${OUT}/01-hero.png`);
crop(`${OUT}/_creators.png`, 1280, 1500, 0, 0,    `${OUT}/02-forest.png`);
crop(`${OUT}/_detail.png`, 1280, 800, 0, 0,     `${OUT}/03-detail-hero.png`);
crop(`${OUT}/_detail.png`, 1280, 850, 0, 800,   `${OUT}/04-detail-works.png`);
crop(`${OUT}/_detail.png`, 1280, 1100, 0, 2050,  `${OUT}/05-detail-network.png`);
crop(`${OUT}/_home.png`, 1280, 1900, 0, 9605, `${OUT}/06-join-form.png`);
crop(`${OUT}/_detail_editor.png`, 1280, 1500, 0, 800, `${OUT}/08-detail-works-editor.png`);
crop(`${OUT}/_home.png`, 1280, 900, 0, 11200, `${OUT}/09-join-works-section.png`);
crop(`${OUT}/_mobile_detail.png`, 420, 2400, 0, 0, `${OUT}/07-mobile-detail.png`);

// Cleanup intermediate full-page captures
for (const f of ['_home', '_creators', '_detail', '_detail_editor', '_mobile_detail', '_mobile_home']) {
  await fs.unlink(`${OUT}/${f}.png`).catch(() => {});
}

console.log('All captures done.');
