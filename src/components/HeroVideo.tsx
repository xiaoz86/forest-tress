'use client';

import { useCallback, useEffect, useRef } from 'react';

const wechatInlineAttrs = {
  'webkit-playsinline': 'true',
  'x5-playsinline': 'true',
  'x5-video-player-type': 'h5',
  'x5-video-player-fullscreen': 'false',
} as const;

const HERO_VIDEO_SRC = '/hero-forest.mp4?v=20260618-1';

export default function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);

  const playVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    void video.play().catch(() => {
      // Some in-app browsers only allow playback after their bridge or a tap.
    });
  }, []);

  useEffect(() => {
    playVideo();

    const onVisibilityChange = () => {
      if (!document.hidden) playVideo();
    };

    document.addEventListener('WeixinJSBridgeReady', playVideo, false);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('touchstart', playVideo, { once: true, passive: true });

    return () => {
      document.removeEventListener('WeixinJSBridgeReady', playVideo, false);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('touchstart', playVideo);
    };
  }, [playVideo]);

  return (
    <video
      ref={videoRef}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      poster="/hero-forest.jpg"
      aria-hidden="true"
      className="absolute inset-0 w-full h-full object-cover motion-reduce:hidden"
      onCanPlay={playVideo}
      onLoadedMetadata={playVideo}
      {...wechatInlineAttrs}
    >
      <source src={HERO_VIDEO_SRC} type="video/mp4" />
    </video>
  );
}
