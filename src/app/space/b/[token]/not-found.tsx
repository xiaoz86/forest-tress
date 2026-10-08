import Link from 'next/link';
import '@/components/space/studio.css';
import '@/components/space/interact/booking.css';

/** 预约链接无效（打错了、被删掉了、或者主人删除了这条预约） */
export default function BookingNotFound() {
  return (
    <main className="st bks">
      <div className="bks-in">
        <p className="st-kicker">附近森林 · 个人空间</p>
        <h1 className="bks-h">找不到这条预约</h1>
        <p className="bks-say">
          可能是链接没复制完整，或者这条预约已经被对方删掉了。
          回到你预约时的那一页、找到当时的「查看我的预约」链接再点一次；如果还是打不开，直接回 TA 的个人空间重新预约或者打个招呼就好。
        </p>
        <p className="bks-back"><Link className="st-go" href="/">去附近森林首页</Link></p>
      </div>
    </main>
  );
}
