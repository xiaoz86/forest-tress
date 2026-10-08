import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import '@/components/space/studio.css';
import '@/components/space/interact/registration.css';
import RegistrationActions from '@/components/space/interact/RegistrationActions';
import { loadRegistrationView, type RegistrationView } from '@/lib/space/events';
import { formatEventTime, formatFee, formatMoment, MODE_LABEL } from '@/lib/space/eventTime';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: '我的报名 · 附近森林',
  robots: { index: false, follow: false },
  // 链接里的 token 就是凭证：不让它随 Referer 带到别的站
  referrer: 'no-referrer',
};

type Props = { params: Promise<{ token: string }> };

/** 每种状态一句人话 */
function statusLine(v: RegistrationView): { title: string; text: string } {
  const r = v.registration;
  const e = v.event;
  if (e.status === 'cancelled') {
    const paid = r.status === 'claimed' || (r.status === 'confirmed' && r.feeCents > 0);
    return { title: '这场活动取消了', text: paid ? '你付过款，主人会和你联系退款；等不到的话，直接联系主人。' : '不用再做什么了。' };
  }
  switch (r.status) {
    case 'confirmed':
      return { title: '报上了', text: e.past ? '活动已经结束了，谢谢你来。' : '到时候见。有变化的话，主人会联系你。' };
    case 'pending':
      if (e.past) return { title: '活动已经结束了', text: '不用再付款了。有疑问的话，直接联系主人。' };
      if (e.started) return { title: '活动已经开始了', text: '现在不用再付款了。还想参加的话，直接联系主人。' };
      if (!r.canPay) return { title: '名额没能留住', text: '付款的名额只保留一小时，现在已经满了。先别付款；还想参加的话，直接联系主人。' };
      return r.holdExpired
        ? { title: '还差付款', text: '名额保留已经过了一小时，不过现在还有空位。付完款传一张截图，就能占上。' }
        : {
          title: '还差付款',
          text: `名额给你留到 ${r.holdUntil ? formatMoment(r.holdUntil) : '一小时后'}。扫下面的收款码付款，再传一张付款截图就好。`,
        };
    case 'claimed':
      return { title: '付款截图收到了', text: '名额给你留着。主人对过收款记录就会确认，不用再做什么。' };
    case 'waitlist':
      return { title: '你在排队', text: '名额满了。有人退出时按报名先后轮到你——到时候这个页面会变成「报上了」或「还差付款」，主人也会联系你。' };
    case 'cancelled':
      return { title: '你取消了这次报名', text: '想再参加的话，回到主人的页面重新报名。' };
    case 'rejected':
      return { title: '这次报名没有通过', text: '有疑问可以直接联系主人。' };
  }
}

export default async function RegistrationPage({ params }: Props) {
  const { token } = await params;
  const v = await loadRegistrationView(token);
  if (!v) notFound();
  const r = v.registration;
  const e = v.event;
  const s = statusLine(v);
  const place = e.place ? `${MODE_LABEL[e.mode]} · ${e.place}` : MODE_LABEL[e.mode];
  const showPay = r.canPay && (r.status === 'pending' || r.status === 'claimed');

  return (
    <main className="st sr">
      <header className="sr-head">
        <p className="st-kicker">我的报名{v.host.name ? ` · ${v.host.name}的活动` : ''}</p>
        <h1>{e.title}</h1>
        <p className="sr-meta">
          <span>{formatEventTime(e.startsAt, e.endsAt)}</span>
          <span>{place}</span>
          <span>{formatFee(r.feeCents)}</span>
        </p>
      </header>

      <section className="sr-status" data-status={e.status === 'cancelled' ? 'event-cancelled' : r.status}>
        <h2>{s.title}</h2>
        <p>{s.text}</p>
        {r.hostNote && <p className="sr-note">主人留言：{r.hostNote}</p>}
      </section>

      {showPay && (
        <section className="sr-pay" aria-label="付款">
          <dl className="sr-pay-facts">
            <div><dt>金额</dt><dd>{formatFee(r.feeCents)}</dd></div>
            {r.payCode && (
              <div>
                <dt>口令</dt>
                <dd><b className="sr-code">{r.payCode}</b><small>付款时备注里写这四位，主人靠它对上是你</small></dd>
              </div>
            )}
          </dl>
          {v.payQrReady ? (
            <figure className="sr-qr">
              {/* 收款码只从要凭证的接口现取，不缓存 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/space/pay-qr?t=${encodeURIComponent(token)}`} alt="主人的收款码" width={260} height={260} />
              <figcaption>长按识别，或截图后用微信 / 支付宝扫一扫</figcaption>
            </figure>
          ) : (
            <p className="st-note">主人还没放收款码，先别付款。联系一下主人，或者过一会再打开这个页面看看。</p>
          )}
          {v.payQrReady && <RegistrationActions token={token} mode="proof" claimed={r.status === 'claimed'} />}
        </section>
      )}

      <section className="sr-mine">
        <h2>你留下的</h2>
        <dl>
          <div><dt>名字</dt><dd>{r.name}</dd></div>
          {r.note && <div><dt>想说的话</dt><dd className="sr-pre">{r.note}</dd></div>}
        </dl>
        <p className="st-muted">联系方式只有主人看得到，这里不再显示。</p>
      </section>

      {e.desc && (
        <section className="sr-desc">
          <h2>活动介绍</h2>
          <p className="sr-pre">{e.desc}</p>
        </section>
      )}

      <footer className="sr-foot">
        {r.canCancel && <RegistrationActions token={token} mode="cancel" paid={r.status === 'claimed' || (r.status === 'confirmed' && r.feeCents > 0)} />}
        <RegistrationActions token={token} mode="copy" />
        <p className="st-muted">这个页面的链接只有你有，是查看、取消报名的入口。点右上角 ··· 收藏，或者复制链接发给「文件传输助手」。</p>
        {/* 主人取消发布后，TA 的页面是 404，就不给这个链接了 */}
        {v.host.published && <a className="st-go" href={v.host.spaceUrl}>回到{v.host.name || '主人'}的页面</a>}
      </footer>
    </main>
  );
}
