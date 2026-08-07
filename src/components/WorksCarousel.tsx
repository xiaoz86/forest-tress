import type { Work } from '@/lib/supabase';

type Props = {
  works: Work[];
};

/**
 * 书架式横向滚动 — 每张作品像一本立着的书 / 一张唱片封面。
 * 没有图就用渐变色 + 标题作为占位封面。
 */
export default function WorksCarousel({ works }: Props) {
  if (!works || works.length === 0) return null;

  return (
    <div className="relative -mx-6 max-md:-mx-5">
      {/* 滚动条本体 */}
      <div className="overflow-x-auto overflow-y-visible scrollbar-thin pb-3">
        <ul className="flex gap-5 px-6 max-md:gap-4 max-md:px-7 snap-x snap-mandatory">
          {works.map((w) => (
            <li
              key={w.id}
              className="snap-start shrink-0 w-[180px] max-md:w-[150px]"
            >
              <WorkCard work={w} />
            </li>
          ))}
          {/* 末尾留白，让最后一张能滑到中间 */}
          <li className="shrink-0 w-2" aria-hidden />
        </ul>
      </div>

      {/* 木架横线 */}
      <div className="mx-6 max-md:mx-5 h-[2px] bg-gradient-to-r from-transparent via-black/[0.08] to-transparent" />
    </div>
  );
}

function WorkCard({ work }: { work: Work }) {
  const cover = (
    <div className="relative aspect-[3/4] w-full rounded-md overflow-hidden bg-[#f3efe6] ring-1 ring-black/[0.06] shadow-[0_8px_24px_rgba(0,0,0,0.10)] group-hover:shadow-[0_14px_36px_rgba(0,0,0,0.18)] group-hover:-translate-y-0.5 transition-all">
      {work.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={work.image_url}
          alt={work.title}
          loading="lazy"
          className="w-full h-full object-cover"
        />
      ) : (
        <PlaceholderCover title={work.title} />
      )}
      {work.url && (
        <span
          className="absolute top-2 right-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/90 backdrop-blur text-forest-deep text-[11px] font-semibold shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
          aria-hidden
        >
          ↗
        </span>
      )}
    </div>
  );

  const meta = (
    <div className="mt-3 px-0.5">
      <div className="text-[13.5px] leading-snug font-medium text-forest-deep line-clamp-2">
        {work.title}
      </div>
      {work.desc && (
        <div className="mt-1 text-[12px] leading-snug text-text-light line-clamp-2">
          {work.desc}
        </div>
      )}
    </div>
  );

  if (work.url) {
    return (
      <a
        href={work.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group block no-underline"
      >
        {cover}
        {meta}
      </a>
    );
  }
  return (
    <div className="group block">
      {cover}
      {meta}
    </div>
  );
}

const COVER_GRADIENTS = [
  'from-[#e8d8c0] to-[#c9a87a]', // 木色
  'from-[#d6e2cc] to-[#9bb487]', // 苔绿
  'from-[#e9d3d3] to-[#c98787]', // 暮红
  'from-[#cfd9e4] to-[#7e9bb8]', // 远山蓝
  'from-[#ebdec5] to-[#b89d6a]', // 麦色
];

function pickGradient(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return COVER_GRADIENTS[h % COVER_GRADIENTS.length];
}

function PlaceholderCover({ title }: { title: string }) {
  return (
    <div
      className={`w-full h-full bg-gradient-to-br ${pickGradient(title)} flex items-center justify-center p-3`}
    >
      <span
        className="text-white text-[15px] font-semibold leading-tight tracking-wide text-center line-clamp-4 [text-shadow:0_1px_2px_rgba(0,0,0,0.18)]"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {title}
      </span>
    </div>
  );
}
