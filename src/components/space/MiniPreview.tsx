import Image from 'next/image';
import { canOptimize } from '@/lib/space/image';
import { isDisplayableImage } from '@/lib/space/story';
import { tokensToStyle, type ThemeTokens } from '@/lib/space/themes';

/**
 * 一张迷你的「我的网站首屏」。风格测试和看图选风格都用它——
 * 放的是这个人自己的照片、名字和一句话，结构和网站封面一样（照片在上、字在纸上），
 * 选的时候看到的就是「我会长这样」。
 *
 * 头像走 next/image 缩到卡片大小：原图 1–2MB，一页十几张卡都用它，
 * 而且手机竖拍的原图常带 EXIF 旋转，没下载完时会只显示出一条。
 */
export default function MiniPreview({
  tokens,
  name,
  tagline,
  avatarUrl,
  chips,
  dense,
}: {
  tokens: ThemeTokens;
  name: string;
  tagline: string;
  avatarUrl?: string;
  chips: string[];
  /** 疏朗 / 丰盈那一题用：丰盈的一张多放一行内容、间距更紧 */
  dense?: boolean;
}) {
  const glyph = ([...name.trim()][0] ?? '').toUpperCase();
  const photo = isDisplayableImage(avatarUrl) ? avatarUrl : null;
  return (
    <div className="mp" style={tokensToStyle(tokens) as React.CSSProperties}
      data-edge={tokens.edge} data-cover={tokens.cover} data-photo={photo ? 'photo' : 'none'} data-align={tokens.coverAlign} data-dense={dense ? '' : undefined}>
      <div className="mp-photo">
        {photo
          ? <Image src={photo} alt="" fill sizes="360px" quality={75} unoptimized={!canOptimize(photo)} />
          : <span className="mp-glyph" aria-hidden>{glyph}</span>}
      </div>
      <div className="mp-sheet">
        <span className="mp-name">{name}</span>
        {tagline && <p className="mp-tag">{tagline}</p>}
        {chips.length > 0 && <p className="mp-by">{chips.slice(0, dense ? 5 : 3).join(' / ')}</p>}
        {dense && <p className="mp-by">服务与活动 · 在别处的我 · 最近在读</p>}
        <span className="mp-btn">打个招呼</span>
      </div>
    </div>
  );
}
