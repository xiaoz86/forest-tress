import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import '@/components/space/studio.css';
import '@/components/space/interact/booking.css';
import { fetchMember } from '@/lib/space/access';
import { list } from '@/lib/space/db';
import { getSettings } from '@/lib/space/settings';
import type { Booking, BookingStatus } from '@/lib/space/types';
import CopyLink from '../CopyLink';

export const dynamic = 'force-dynamic';
// 链接里带着查看口令：不进搜索引擎，也不随 Referer 带到别的页面
export const metadata: Metadata = {
  title: '我的预约 · 附近森林',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

type Props = { params: Promise<{ token: string }> };

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * 预约人查看自己的预约。不需要登录：凭链接里的口令（提交预约时给的）。
 * 只给看这一条预约本身；联系方式打码显示，链接万一被转出去也不至于泄露。
 */
export default async function BookingStatusPage({ params }: Props) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) notFound();
  let booking: Booking | undefined;
  try {
    booking = (await list('bookings', r => r.token === token))[0];
  } catch {
    booking = undefined;
  }
  if (!booking) notFound();

  let host = '对方';
  try {
    const node = await fetchMember(booking.memberId);
    if (node?.name) host = node.name;
  } catch {
    // 查不到名字不影响看预约状态
  }
  let published = false;
  try {
    published = (await getSettings(booking.memberId)).published;
  } catch {
    published = false;
  }

  const state = STATE[booking.status](host);

  return (
    <main className="st bks">
      <div className="bks-in">
        <p className="st-kicker">附近森林 · 个人空间</p>
        <h1 className="bks-h">你向 {host} 发出的预约</h1>

        <p className="bks-state" data-status={booking.status}>
          <span className="bks-dot" aria-hidden />
          <b>{state.title}</b>
        </p>
        <p className="bks-say">{state.body}</p>

        {booking.hostNote && (
          <div className="bks-reply">
            <p className="bks-k">{host} 给你留了一句话——</p>
            <p className="bks-note">{booking.hostNote}</p>
          </div>
        )}

        <dl className="bks-dl">
          <dt>预约的是</dt>
          <dd>{booking.serviceTitle || `和 ${host} 约个时间`}</dd>
          <dt>希望的时间</dt>
          <dd>{booking.preferred || '没写，等 TA 来问你'}</dd>
          {booking.note && (<><dt>你说的话</dt><dd className="bks-pre">{booking.note}</dd></>)}
          <dt>你留的联系方式</dt>
          <dd>{mask(booking.contact)}<small>（为了安全，这里只显示一部分）</small></dd>
          <dt>提交于</dt>
          <dd>{fmt(booking.createdAt)}</dd>
          {booking.updatedAt !== booking.createdAt && (<><dt>最近更新</dt><dd>{fmt(booking.updatedAt)}</dd></>)}
        </dl>

        <p className="bks-keep">
          这个页面只有拿到这条链接的人能打开。把链接复制下来发给自己（比如微信里的「文件传输助手」），之后回来就能看到 {host} 的回复。
        </p>
        <CopyLink className="bks-copy" path={`/space/b/${token}`} label="复制这个页面的链接" />
        {published && (
          <p className="bks-back"><a className="st-go" href={`/space/${booking.memberId}`}>回到 {host} 的个人空间</a></p>
        )}
      </div>
    </main>
  );
}

const STATE: Record<BookingStatus, (host: string) => { title: string; body: string }> = {
  new: host => ({
    title: '已经送到，等 TA 回复',
    body: `预约请求已经在 ${host} 的收件箱里了。TA 看到后会通过你留的联系方式找你，你也可以隔几天回来看看这里。`,
  }),
  accepted: host => ({
    title: `${host} 接受了`,
    body: `${host} 接受了你的预约，会通过你留的联系方式找你，具体时间你们俩再商量。`,
  }),
  declined: host => ({
    title: `${host} 这次婉拒了`,
    body: '可能时间或内容这次不太合适。不用在意——你可以回到 TA 的个人空间打个招呼，说说别的想法。',
  }),
  done: () => ({
    title: '这次预约已经完成了',
    body: '谢谢你来。想再约的话，回到 TA 的个人空间重新预约就好。',
  }),
};

function mask(c: string): string {
  const a = [...c];
  if (a.length <= 4) return `${a[0] ?? ''}***`;
  return `${a.slice(0, 2).join('')}***${a.slice(-2).join('')}`;
}

const DATE = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : DATE.format(d);
}
