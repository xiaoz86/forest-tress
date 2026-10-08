import { NextRequest, NextResponse } from 'next/server';
import { ImageResponse } from 'next/og';
import QRCode from 'qrcode';
import { gateHost, isFail } from '@/lib/space/gate';
import { familyFor, loadOgFonts, type OgFont } from '@/lib/space/ogfont';
import { avatarDataUrl, paletteOf } from '@/lib/space/shareart';
import { clip, displayUrl, shareFacts, spaceUrls, themeOf } from '@/lib/space/share';
import { tunedTheme } from '@/lib/space/tune';
import { readSpace, type SpaceRecord } from '@/lib/space/store';
import { glyphOf, visualLen } from '@/lib/space/story';
import { getTheme } from '@/lib/space/themes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const W = 1080;
const H = 1440;

/**
 * GET /api/space/card-image?id=…[&kind=card|share][&download=1][&theme=…]
 *
 * 竖版图（v2 §9）：头像、名字、身份、一句话、正在做什么、二维码。配色和字体跟这个人网站当前的主题走。
 * 两种，只差二维码里的地址：
 * - kind=share（分享图）：二维码只放公开地址，不带口令——发朋友圈、发群用这张；
 * - kind=card（默认，当面递的名片）：二维码是 /c/<id>/<名片口令>，扫到的人算「扫过我名片」——只该当面给。
 * 两种都只给本人和管理员，也不让任何一层缓存（名片那张带口令；分享图没发布前也只有本人能看）。
 */
const NO_STORE = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const g = await gateHost(sp.get('id'));
  if (isFail(g)) return NextResponse.json({ error: g.error }, { status: g.status, headers: NO_STORE });
  const kind = sp.get('kind') === 'share' ? 'share' : 'card';

  let rec: SpaceRecord = {};
  try {
    rec = await readSpace(g.memberId);
  } catch {
    // 画像读坏了：名片照样出，只是少了一句话和身份
  }
  // ?theme=… 看换一套风格时名片的样子（只有本人能调这个接口，不影响网站本身）
  // 本人在那一套上拨过旋钮的话，也叠上
  const asked = getTheme(sp.get('theme'));
  const theme = asked ? tunedTheme(asked, rec.tune) : themeOf(g.node, rec);
  const pal = paletteOf(theme);
  const t = theme.tokens;
  const facts = shareFacts(g.node, rec);
  const urls = spaceUrls(g.memberId, g.settings);

  const name = clip(facts.name, 16);
  const nameSize = visualLen(name) <= 5 ? 112 : visualLen(name) <= 8 ? 88 : 66;
  const meta = [facts.city, ...facts.roles.slice(0, 3)].filter(Boolean).join(' · ');
  const tagline = facts.tagline ? clip(facts.tagline, 44) : '';
  const now = facts.now ? clip(facts.now, 60) : '';
  const linkText = displayUrl(urls.shortUrl ?? urls.pageUrl.replace(/\/space\/.*$/, ''));
  const scanLine = '扫码看我的个人空间';
  const brand = '附近森林';
  const nowLead = '最近在做——';

  const headFamily = familyFor(t.headFont);
  const bodyFamily = familyFor(t.bodyFont);
  const headWeight = Math.max(400, t.headWeight);
  const square = t.edge === 'print' || t.edge === 'rule';

  const [qr, avatar, fonts] = await Promise.all([
    QRCode.toDataURL(kind === 'share' ? urls.pageUrl : urls.cardScanUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 600,
      color: { dark: '#1a1a1a', light: '#ffffff' },
    }),
    avatarDataUrl(facts.avatarUrl, request.nextUrl.origin),
    loadOgFonts([
      { family: headFamily, weight: headWeight, text: name + tagline + glyphOf(name) },
      { family: bodyFamily, weight: 400, text: meta + now + nowLead + scanLine + linkText + brand },
    ]),
  ]);

  const render = (withAvatar: boolean, withFonts: OgFont[] | undefined) => new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: pal.bg, color: pal.ink, padding: '104px 96px 88px',
        fontFamily: bodyFamily,
      }}>
        {withAvatar && avatar ? (
          // eslint-disable-next-line @next/next/no-img-element -- ImageResponse 里只能用 <img>
          <img src={avatar} width={248} height={248} alt=""
            style={{ width: 248, height: 248, objectFit: 'cover', borderRadius: square ? 6 : 124 }} />
        ) : (
          <div style={{
            width: 248, height: 248, borderRadius: square ? 6 : 124, background: pal.blockBg, color: pal.blockInk,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: headFamily, fontWeight: headWeight, fontSize: 120,
          }}>{glyphOf(name)}</div>
        )}

        <div style={{
          display: 'flex', marginTop: 64, fontFamily: headFamily, fontWeight: headWeight,
          fontSize: nameSize, lineHeight: 1.15, letterSpacing: t.nameTrack,
        }}>{name}</div>
        {meta && <div style={{ display: 'flex', marginTop: 22, fontSize: 32, color: pal.meta, lineHeight: 1.5 }}>{meta}</div>}

        <div style={{ display: 'flex', width: 72, height: 3, background: pal.accent, marginTop: 52, opacity: 0.8 }} />

        {tagline && (
          <div style={{
            display: 'flex', marginTop: 44, fontFamily: headFamily, fontWeight: headWeight,
            fontSize: 50, lineHeight: 1.5, color: pal.accent,
          }}>{tagline}</div>
        )}
        {now && (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: tagline ? 40 : 44 }}>
            <div style={{ display: 'flex', fontSize: 28, color: pal.meta }}>{nowLead}</div>
            <div style={{ display: 'flex', marginTop: 10, fontSize: 36, lineHeight: 1.6, color: pal.soft }}>{now}</div>
          </div>
        )}

        <div style={{ display: 'flex', flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 44 }}>
          <div style={{ display: 'flex', background: '#ffffff', padding: 14, borderRadius: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse 里只能用 <img> */}
            <img src={qr} width={272} height={272} alt="" style={{ width: 272, height: 272 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 10, flex: 1 }}>
            <div style={{ display: 'flex', fontSize: 34, color: pal.ink }}>{scanLine}</div>
            <div style={{ display: 'flex', marginTop: 12, fontSize: 28, color: pal.meta }}>{linkText}</div>
            <div style={{ display: 'flex', marginTop: 40, fontSize: 26, color: pal.meta, letterSpacing: '0.3em' }}>{brand}</div>
          </div>
        </div>
      </div>
    ),
    { width: W, height: H, fonts: withFonts?.length ? withFonts : undefined },
  );

  // 先整张渲染成 PNG 再回：渲染出错（头像格式怪、字体坏）时还能退一步重画，而不是给出半截的 500
  let png: ArrayBuffer;
  try {
    png = await render(true, fonts).arrayBuffer();
  } catch (err) {
    console.warn('[space] card image retry without avatar/fonts', (err as Error).message);
    try {
      png = await render(false, undefined).arrayBuffer();
    } catch (err2) {
      console.error('[space] card image failed', err2);
      return NextResponse.json({ error: '图没生成出来，稍后再试一次' }, { status: 500, headers: NO_STORE });
    }
  }

  const headers: Record<string, string> = { 'Content-Type': 'image/png', ...NO_STORE };
  if (sp.get('download') === '1') {
    headers['Content-Disposition'] = `attachment; filename="${kind}.png"`;
  }
  return new Response(png, { headers });
}
