'use client';

import { useRef, type ReactNode } from 'react';

/**
 * 没有链接、但有封面图的作品（公众号、播客常常只有一张带二维码的海报）：点一下就地看大图。
 * 微信里长按大图里的二维码就能识别——关注公众号、打开播客，不用离开这一页。
 *
 * 外面是一个普通的图片链接：脚本没跑起来、或者浏览器不支持 <dialog> 时，照样能在新页面里打开这张图。
 */
export default function WorkPeek({ src, title, className, children }: {
  src: string;
  title: string;
  className?: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <a
        className={className}
        href={src}
        target="_blank"
        rel="noreferrer noopener"
        onClick={e => {
          const d = dialog.current;
          if (!d || typeof d.showModal !== 'function') return;
          e.preventDefault();
          d.showModal();
        }}
      >
        {children}
      </a>
      <dialog
        ref={dialog}
        className="sp-peek"
        aria-label={title}
        // 点图外面的暗处也能关
        onClick={e => { if (e.target === e.currentTarget) e.currentTarget.close(); }}
      >
        <figure className="sp-peek-box">
          {/* eslint-disable-next-line @next/next/no-img-element -- 原图（要能长按识别二维码），不经过 next/image 压缩 */}
          <img src={src} alt={title} />
          <figcaption>
            <span>{title}</span>
            <small>图里有二维码的话，在微信里长按就能识别</small>
          </figcaption>
        </figure>
        <form method="dialog">
          <button type="submit" className="sp-peek-close" aria-label="关上">×</button>
        </form>
      </dialog>
    </>
  );
}
