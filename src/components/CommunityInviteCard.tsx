import Image from 'next/image';

const COMMUNITY_QR_SRC = '/community/nearby-forest-wechat-group-2026-07-20.jpg';

export default function CommunityInviteCard() {
  return (
    <section
      aria-labelledby="community-invite-title"
      className="max-w-[680px] mx-auto overflow-hidden rounded-[28px] border border-moss/15 bg-gradient-to-b from-white to-[#f3f7ef] px-8 py-11 text-center shadow-[0_10px_40px_rgba(26,46,26,0.06)] max-md:px-5 max-md:py-8"
    >
      <p className="text-[11px] font-semibold tracking-[0.2em] text-moss uppercase">
        Community · 社区
      </p>
      <h2
        id="community-invite-title"
        className="mt-3 text-[28px] font-semibold tracking-[-0.02em] text-forest-deep max-md:text-[24px]"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        走进附近
      </h2>
      <p className="mx-auto mt-4 max-w-[520px] text-[14.5px] leading-[1.85] text-text-secondary">
        你已经在森林里拥有了自己的节点。扫码加入附近森林社群，认识真实的人，让线上相遇继续走向交流、共创与互助。
      </p>
      <p className="mt-5 text-[13px] font-semibold tracking-[0.08em] text-forest-mid max-md:leading-7">
        社群联结 · 真诚交流 · 一起共创 · 互惠互助
      </p>

      <figure className="mt-8">
        <div
          className="relative mx-auto aspect-[745/740] max-w-[360px] overflow-hidden rounded-[20px] border border-black/10 bg-[#171717] shadow-[0_12px_36px_rgba(0,0,0,0.12)]"
        >
          <Image
            src={COMMUNITY_QR_SRC}
            alt="附近森林生态社区微信群二维码"
            width={966}
            height={1482}
            sizes="(max-width: 768px) calc(100vw - 80px), 467px"
            className="absolute h-auto max-w-none"
            style={{
              width: '129.664%',
              left: '-15.034%',
              top: '-68.919%',
            }}
            unoptimized
          />
        </div>
        <figcaption className="mt-4 text-[12.5px] italic text-text-light">
          微信扫码，加入附近森林社群
        </figcaption>
      </figure>
    </section>
  );
}
