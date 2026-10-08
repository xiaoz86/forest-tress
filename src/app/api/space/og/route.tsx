import { NextRequest, NextResponse } from 'next/server';
import { ImageResponse } from 'next/og';
import { gateSpace, isFail } from '@/lib/space/gate';
import { familyFor, loadOgFonts, type OgFont } from '@/lib/space/ogfont';
import { avatarDataUrl, paletteOf } from '@/lib/space/shareart';
import { clip, displayUrl, shareFacts, spaceUrls, themeOf } from '@/lib/space/share';
import { readSpace, type SpaceRecord } from '@/lib/space/store';
import { glyphOf, visualLen } from '@/lib/space/story';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/space/og?id=…&v=… —— 1200×630 的分享图（链接卡片上的封面）。
 *
 * 只用首屏公开的信息：名字、一句话、城市、头像。没发布的空间只给本人和管理员（和访客接口同一道关）。
 * v 是版本号（share.ts 的 ogVersion）：页面 metadata 和管理页引用的都是带版本的地址，内容变了地址就变。
 * 缓存放得短：浏览器 5 分钟、中间层 10 分钟——取消发布后，旧地址最多这么久之后对谁都是 404。
 */
const NO_STORE = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
  const g = await gateSpace(request.nextUrl.searchParams.get('id'));
  // 404 也不能被缓存：重新发布后同一个地址要能马上出图
  if (isFail(g)) return NextResponse.json({ error: g.error }, { status: g.status, headers: NO_STORE });

  let rec: SpaceRecord = {};
  try {
    rec = await readSpace(g.memberId);
  } catch {
    // 画像读坏了：只用注册资料
  }
  const theme = themeOf(g.node, rec);
  const pal = paletteOf(theme);
  const t = theme.tokens;
  const facts = shareFacts(g.node, rec);
  const urls = spaceUrls(g.memberId, g.settings);

  const name = clip(facts.name, 16);
  const nameSize = visualLen(name) <= 5 ? 96 : visualLen(name) <= 8 ? 76 : 58;
  const tagline = facts.tagline ? clip(facts.tagline, 40) : facts.now ? clip(facts.now, 40) : '';
  const meta = [facts.city, ...facts.roles.slice(0, 2)].filter(Boolean).join(' · ');
  const foot = `附近森林 · ${displayUrl(urls.shortUrl ?? urls.pageUrl.replace(/\/space\/.*$/, ''))}`;

  const headFamily = familyFor(t.headFont);
  const bodyFamily = familyFor(t.bodyFont);
  const headWeight = Math.max(400, t.headWeight);
  const square = t.edge === 'print' || t.edge === 'rule';

  const [avatar, fonts] = await Promise.all([
    avatarDataUrl(facts.avatarUrl, request.nextUrl.origin),
    loadOgFonts([
      { family: headFamily, weight: headWeight, text: name + tagline + glyphOf(name) },
      { family: bodyFamily, weight: 400, text: meta + foot },
    ]),
  ]);

  const render = (withAvatar: boolean, withFonts: OgFont[] | undefined) => new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', alignItems: 'center',
        background: pal.bg, color: pal.ink, padding: '0 88px', fontFamily: bodyFamily,
      }}>
        {withAvatar && avatar ? (
          // eslint-disable-next-line @next/next/no-img-element -- ImageResponse 里只能用 <img>
          <img src={avatar} width={340} height={340} alt=""
            style={{ width: 340, height: 340, objectFit: 'cover', borderRadius: square ? 6 : 170 }} />
        ) : (
          <div style={{
            width: 340, height: 340, borderRadius: square ? 6 : 170, background: pal.blockBg, color: pal.blockInk,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: headFamily, fontWeight: headWeight, fontSize: 150,
          }}>{glyphOf(name)}</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, marginLeft: 72 }}>
          <div style={{
            display: 'flex', fontFamily: headFamily, fontWeight: headWeight, fontSize: nameSize,
            lineHeight: 1.15, letterSpacing: t.nameTrack,
          }}>{name}</div>
          {meta && <div style={{ display: 'flex', marginTop: 16, fontSize: 28, color: pal.meta }}>{meta}</div>}
          {tagline && (
            <div style={{
              display: 'flex', marginTop: 36, fontFamily: headFamily, fontWeight: headWeight,
              fontSize: visualLen(tagline) <= 14 ? 40 : 34, lineHeight: 1.5, color: pal.accent,
            }}>{tagline}</div>
          )}
          <div style={{ display: 'flex', marginTop: 48, fontSize: 24, color: pal.meta }}>{foot}</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: withFonts?.length ? withFonts : undefined },
  );

  let png: ArrayBuffer;
  try {
    png = await render(true, fonts).arrayBuffer();
  } catch (err) {
    console.warn('[space] og image retry without avatar/fonts', (err as Error).message);
    try {
      png = await render(false, undefined).arrayBuffer();
    } catch (err2) {
      console.error('[space] og image failed', err2);
      return NextResponse.json({ error: 'image-failed' }, { status: 500, headers: NO_STORE });
    }
  }

  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      // 发布了才让中间层缓存；没发布时只有本人在看，不能留在任何共享缓存里
      'Cache-Control': g.settings.published ? 'public, max-age=300, s-maxage=600' : 'private, no-store',
    },
  });
}
