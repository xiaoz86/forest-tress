import Link from 'next/link';
import '@/components/space/studio.css';
import '@/components/space/interact/registration.css';

/** 报名链接不对（抄错了、被截断了），或者报名已经被主人删掉 */
export default function RegistrationNotFound() {
  return (
    <main className="st sr">
      <header className="sr-head">
        <p className="st-kicker">我的报名</p>
        <h1>找不到这条报名</h1>
      </header>
      <section className="sr-status">
        <p>可能是链接没复制完整（微信里长链接有时会被截断），也可能这条报名已经被删掉了。</p>
        <p>回到报名成功时保存的那个链接再打开一次；实在找不到，直接联系活动的主人，TA 那边查得到你的报名。</p>
      </section>
      <footer className="sr-foot">
        <Link className="st-go" href="/">回附近森林首页</Link>
      </footer>
    </main>
  );
}
