import './studio.css';

/** 数据库或本地缓存暂时读不到：说清楚是「暂时」，不要让人以为页面不存在 */
export default function Unavailable({ what }: { what: string }) {
  return (
    <div className="st" style={{ paddingTop: 120, textAlign: 'center' }}>
      <p className="st-kicker">暂时打不开</p>
      <p className="st-lead" style={{ margin: '12px auto 0' }}>{what}读取失败，多半是网络抖了一下。刷新页面再试一次。</p>
    </div>
  );
}
