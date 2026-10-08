'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { slugProblem } from '@/lib/space/types';
import './share-panel.css';

/**
 * 管理页「分享」：发布、短链、分享图、名片、分享预览。
 * 设置走 /api/space/settings（PATCH 返回 { settings, urls } 或 { error }）。
 *
 * 两张竖版图分开：
 * - 分享图：二维码里只有公开地址，发朋友圈、发群用这张；
 * - 名片：二维码带名片口令（扫到的人算「扫过我名片」），只该当面给。
 * 两张图都先 fetch 成 blob 再放进 <img>：长按保存用的是本地数据，不会再不带登录态去请求一次（微信里那样只会拿到 403）。
 */

type Props = {
  memberId: string; origin: string;
  initial: { published: boolean; slug: string | null };
  /** 还有几处 AI 起稿本人没确认过（发布前提醒） */
  pendingDrafts?: number;
  /** 管理员在看别人的：可以下线，不能替人发布（接口也拦着） */
  asAdmin?: boolean;
};

type Urls = { pageUrl: string; shortUrl: string | null; cardScanUrl: string; ogImageUrl: string };
type Meta = { title: string; description: string; ogImageUrl?: string };
type Kind = 'share' | 'card';
type Pic = { state: 'loading' | 'ok' | 'failed'; src: string | null };

const LOADING: Pic = { state: 'loading', src: null };
const FILE: Record<Kind, string> = { share: '分享图.png', card: '名片.png' };

const GATE_WORDS: Record<string, string> = {
  forbidden: '你没有权限改这个空间。如果这是你自己的，请先登录。',
  'not-found': '没找到这个空间。',
  'invalid-id': '地址不对，回到管理页重新打开试试。',
  'database-unavailable': '资料库暂时连不上，过一会儿再试。',
};

function words(err: unknown, fallback: string): string {
  if (typeof err === 'string' && err) return GATE_WORDS[err] ?? err;
  return fallback;
}

/** 分享图地址去掉域名：本地开发时 SITE_ORIGIN 可能是线上域名，预览要看的是这台服务器上的图 */
function localPath(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, 'http://x');
    return u.pathname + u.search;
  } catch {
    return null;
  }
}

function asDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function isWeChat(): boolean {
  return /MicroMessenger/i.test(navigator.userAgent);
}
const noSubscribe = () => () => {};

export default function SharePanel({ memberId, origin, initial, pendingDrafts = 0, asAdmin = false }: Props) {
  // 管理员看别人的：下面的说明都改成「TA」
  const you = asAdmin ? 'TA ' : '你';
  const host = origin.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const q = encodeURIComponent(memberId);
  // 服务端渲染时当作不在微信里；浏览器里水合后再按 UA 换
  const wechat = useSyncExternalStore(noSubscribe, isWeChat, () => false);

  const [published, setPublished] = useState(initial.published);
  const [slug, setSlug] = useState<string | null>(initial.slug);
  const [draft, setDraft] = useState(initial.slug ?? '');
  const [urls, setUrls] = useState<Urls | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [busy, setBusy] = useState<'publish' | 'slug' | 'rotate' | null>(null);
  const [err, setErr] = useState<{ where: 'publish' | 'slug' | 'card'; text: string } | null>(null);
  const [said, setSaid] = useState<{ where: 'publish' | 'slug' | 'card'; text: string } | null>(null);
  const [copied, setCopied] = useState<'ok' | 'manual' | null>(null);
  // 保存短链、换口令、发布后 +1，让两张图重新生成
  const [ver, setVer] = useState(0);
  const [pics, setPics] = useState<Record<Kind, Pic>>({ share: LOADING, card: LOADING });
  const [big, setBig] = useState<Kind | null>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const objectUrls = useRef<Partial<Record<Kind, string>>>({});

  const load = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([
        fetch(`/api/space/settings?id=${q}`, { cache: 'no-store' }).then(r => r.json()),
        fetch(`/api/space/share-meta?id=${q}`, { cache: 'no-store' }).then(r => r.json()),
      ]);
      if (s?.urls) setUrls(s.urls as Urls);
      if (s?.settings) {
        setPublished(!!s.settings.published);
        setSlug(s.settings.slug ?? null);
      }
      if (m?.title) setMeta(m as Meta);
    } catch {
      // 读不到就先按 initial 显示；保存时会再拿一次
    }
  }, [q]);

  useEffect(() => {
    // 挂上来时拿一次完整地址（分享预览要用）；这里的 setState 都在请求回来之后
    void load();
  }, [load]);

  // 两张竖版图：fetch 成 blob。微信里转成 data: 地址（它的「保存图片」认这个，不认 blob:），其他浏览器用 object URL
  useEffect(() => {
    let alive = true;
    const wx = isWeChat();
    async function one(kind: Kind) {
      try {
        const res = await fetch(`/api/space/card-image?id=${q}&kind=${kind}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        const src = wx ? await asDataUrl(blob) : URL.createObjectURL(blob);
        if (!alive) {
          if (!wx) URL.revokeObjectURL(src);
          return;
        }
        const old = objectUrls.current[kind];
        if (old) URL.revokeObjectURL(old);
        objectUrls.current[kind] = wx ? undefined : src;
        setPics(p => ({ ...p, [kind]: { state: 'ok', src } }));
      } catch {
        if (alive) setPics(p => ({ ...p, [kind]: { state: 'failed', src: null } }));
      }
    }
    void one('share');
    void one('card');
    return () => { alive = false; };
  }, [q, ver]);

  useEffect(() => {
    const made = objectUrls.current;
    return () => { Object.values(made).forEach(u => u && URL.revokeObjectURL(u)); };
  }, []);

  function redraw() {
    setPics({ share: LOADING, card: LOADING });
    setVer(v => v + 1);
  }

  async function patch(body: Record<string, unknown>): Promise<{ ok: true; urls?: Urls; settings?: { published: boolean; slug: string | null } } | { ok: false; error: string }> {
    try {
      const res = await fetch(`/api/space/settings?id=${q}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) return { ok: false, error: words(data.error, '没保存上，检查一下网络再试一次。') };
      return { ok: true, urls: data.urls, settings: data.settings };
    } catch {
      return { ok: false, error: '网络好像断了，没保存上。连上之后再点一次。' };
    }
  }

  /** 正在报名的活动有几场（开放报名、还没结束）；读不到时返回 null */
  async function openEvents(): Promise<number | null> {
    try {
      const res = await fetch(`/api/space/events?id=${q}`, { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      const t = Date.now();
      const list: { status?: string; startsAt?: string; endsAt?: string | null }[] = Array.isArray(data?.events) ? data.events : [];
      return list.filter(e => e.status === 'open' && !(Date.parse(e.endsAt || e.startsAt || '') < t)).length;
    } catch {
      return null;
    }
  }

  async function togglePublish() {
    const next = !published;
    setErr(null);
    setSaid(null);
    if (!next) {
      setBusy('publish');
      const n = await openEvents();
      setBusy(null);
      const events = n === null
        ? '如果有正在报名的活动，报名入口也会一起消失。'
        : n > 0 ? `${asAdmin ? 'TA' : '你'}有 ${n} 场正在报名的活动，报名入口也会一起消失。` : '';
      const ask = asAdmin
        ? `下线 TA 的空间？\n\n下线之后，别人打开 TA 的链接、扫 TA 的名片，都只会看到「页面不存在」；创造者平台里 TA 的卡片会回到资料页。${events ? `\n${events}` : ''}\n\n重新发布要 TA 本人来。`
        : `取消发布？\n\n取消之后，别人打开你的链接、扫你的名片，都只会看到「页面不存在」；创造者平台里你的卡片会回到资料页。${events ? `\n${events}` : ''}\n\n之后可以随时重新发布。`;
      if (!confirm(ask)) return;
    }
    setBusy('publish');
    const r = await patch({ published: next });
    setBusy(null);
    if (!r.ok) {
      setErr({ where: 'publish', text: r.error });
      return;
    }
    const now = r.settings?.published ?? next;
    setPublished(now);
    if (r.urls) setUrls(r.urls);
    if (now) setSaid({ where: 'publish', text: '已发布，现在访客能看到了。' });
    void load();
  }

  const clean = draft.trim().toLowerCase();
  const problem = clean ? slugProblem(clean) : null;
  const unchanged = clean === (slug ?? '');

  async function saveSlug(e: React.FormEvent) {
    e.preventDefault();
    if (problem || unchanged) return;
    if (slug && !confirm(clean
      ? `把短链从 @${slug} 换成 @${clean}？\n\n之前发出去的 ${host}/@${slug} 会自动跳到新地址，这个旧短链也会留给${you.trim()}，别人占用不了。\n名片二维码不受影响，已经印好的名片照样能扫。\n\n分享图、名片上印着的地址会换成新的，之后记得重新保存一张。`
      : `不用短链了？\n\n之前发出去的 ${host}/@${slug} 会自动跳到 ${host}/space/…，这个短链也会留给${you.trim()}，别人占用不了。\n名片二维码不受影响，已经印好的名片照样能扫。`)) return;
    setBusy('slug');
    setErr(null);
    setSaid(null);
    const r = await patch({ slug: clean || null });
    setBusy(null);
    if (!r.ok) {
      setErr({ where: 'slug', text: r.error });
      return;
    }
    const saved = r.settings?.slug ?? (clean || null);
    setSlug(saved);
    setDraft(saved ?? '');
    if (r.urls) setUrls(r.urls);
    setCopied(null);
    setSaid({
      where: 'slug',
      text: slug
        ? saved ? '短链存好了。旧短链会自动跳过来；下面的分享图和名片已经换成新地址。' : `短链去掉了。旧短链会自动跳到${you}的空间。`
        : '短链存好了。',
    });
    redraw();
    void load();
  }

  async function copy() {
    const text = urls?.shortUrl ?? (slug ? `${origin}/@${slug}` : '');
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied('ok');
    } catch {
      // 微信内置浏览器、非 https 下经常没有剪贴板权限：选中文字，让人长按复制
      linkRef.current?.focus();
      linkRef.current?.select();
      setCopied('manual');
    }
  }

  async function rotate() {
    if (!confirm(`换一个名片口令？\n\n之前发出去的名片二维码还能打开${you}的空间，但不再能看到只给扫过名片的人的内容。`)) return;
    setBusy('rotate');
    setErr(null);
    setSaid(null);
    const r = await patch({ rotateCardToken: true });
    setBusy(null);
    if (!r.ok) {
      setErr({ where: 'card', text: r.error });
      return;
    }
    if (r.urls) setUrls(r.urls);
    setSaid({ where: 'card', text: '换好了。下面是新的名片，记得重新保存一张。' });
    redraw();
  }

  useEffect(() => {
    if (!big) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setBig(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [big]);

  const shortUrl = urls?.shortUrl ?? (slug ? `${origin}/@${slug}` : null);
  const ogSrc = localPath(meta?.ogImageUrl);
  const shownUrl = (shortUrl ?? urls?.pageUrl ?? `${origin}/space/${memberId}`).replace(/^https?:\/\//, '');

  function picture(kind: Kind, alt: string) {
    const p = pics[kind];
    return (
      <div className="shp-card">
        {p.state === 'failed' ? (
          <p className="shp-err shp-card-fail">图没生成出来。刷新一下页面再试；还不行的话，告诉我们一声。</p>
        ) : p.src ? (
          // 用 <img> 不用 next/image：本地 blob / data 地址，要让手机能长按保存
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.src} alt={alt} width={1080} height={1440} className="shp-card-img" />
        ) : (
          <div className="shp-card-img shp-card-wait" aria-hidden="true" />
        )}
        {p.state === 'loading' && <p className="shp-mute" role="status">正在生成，第一次要几秒…</p>}
      </div>
    );
  }

  function saveActions(kind: Kind, label: string) {
    const p = pics[kind];
    const ready = p.state === 'ok' && !!p.src;
    if (wechat) {
      return (
        <>
          <p className="shp-hint">长按上面的图 → 保存图片</p>
          <div className="shp-actions">
            <button type="button" className="shp-btn shp-btn-quiet" onClick={() => setBig(kind)} disabled={!ready}>打开大图</button>
          </div>
        </>
      );
    }
    return (
      <div className="shp-actions">
        {ready
          ? <a className="shp-btn" href={p.src!} download={FILE[kind]}>{label}</a>
          : <button type="button" className="shp-btn" disabled>{label}</button>}
        <button type="button" className="shp-btn shp-btn-quiet" onClick={() => setBig(kind)} disabled={!ready}>打开大图</button>
      </div>
    );
  }

  const bigPic = big ? pics[big] : null;

  return (
    <div className="shp">
      {/* 1. 发布 */}
      <section className="shp-sec">
        <h3 className="shp-h">发布</h3>
        <div className="shp-row">
          <button type="button" role="switch" aria-checked={published} className={`shp-switch ${published ? 'is-on' : ''}`}
            onClick={togglePublish} disabled={busy === 'publish' || (asAdmin && !published)}>
            <span className="shp-knob" aria-hidden="true" />
            <span className="shp-switch-text">{published ? '已发布' : '未发布'}</span>
          </button>
          {busy === 'publish' && <span className="shp-mute">正在保存…</span>}
        </div>
        {asAdmin ? (
          <p className="shp-p">
            发布要 TA 本人来：发布表示 TA 确认了 AI 起的这一版。管理员可以帮忙改内容{published ? '，也可以在需要时先下线' : ''}。
          </p>
        ) : (
          <p className="shp-p">
            AI 已经根据你的资料起好了一版（标着 AI 的地方）。发布表示你确认了这一版：之后访客才看得到，创造者平台里你的卡片也会直接打开你的网站。之后可以随时改、随时取消发布。
          </p>
        )}
        {!published && <p className="shp-p shp-strong">{asAdmin ? '现在只有 TA 本人和管理员能看到。' : '现在只有你自己和管理员能看到。'}</p>}
        {pendingDrafts > 0 && !asAdmin && (
          <p className="shp-p shp-warn">
            还有 {pendingDrafts} 处 AI 起稿你还没确认。发布后访客看到的就是现在的样子，建议先确认或改掉。{' '}
            <a className="shp-a" href={`/space/${q}?edit=1`}>去确认 →</a>
          </p>
        )}
        {err?.where === 'publish' && <p className="shp-err" role="alert">{err.text}</p>}
        {said?.where === 'publish' && (
          <p className="shp-ok" role="status">
            {said.text}{' '}
            <a className="shp-a" href={`/space/${q}?as=visitor`} target="_blank" rel="noopener">以陌生访客身份看看 →</a>
          </p>
        )}
      </section>

      {/* 2. 短链 */}
      <section className="shp-sec">
        <h3 className="shp-h">短链</h3>
        <p className="shp-p">起一个好记的地址，写在朋友圈、简介里都方便。小写字母、数字和连字符，2–24 位。</p>
        <form className="shp-slug" onSubmit={saveSlug} noValidate>
          <label className="shp-field">
            <span className="shp-prefix">{host}/@</span>
            <input className="shp-input" value={draft} onChange={e => { setDraft(e.target.value); setSaid(null); setErr(null); }}
              inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={24}
              placeholder="比如 xiaoz" aria-label="短链" aria-invalid={!!problem}
              aria-describedby="shp-slug-hint" />
          </label>
          <button type="submit" className="shp-btn" disabled={!!problem || unchanged || busy === 'slug'}>
            {busy === 'slug' ? '正在保存…' : clean || !slug ? '保存' : '去掉短链'}
          </button>
        </form>
        <p id="shp-slug-hint" className={problem ? 'shp-err' : 'shp-mute'} aria-live="polite">
          {problem ?? (clean && !unchanged ? `保存后是 ${host}/@${clean}` : '')}
        </p>
        {err?.where === 'slug' && <p className="shp-err" role="alert">{err.text}</p>}
        {said?.where === 'slug' && <p className="shp-ok" role="status">{said.text}</p>}

        {shortUrl && unchanged && (
          <div className="shp-link">
            <input ref={linkRef} className="shp-input shp-link-text" readOnly value={shortUrl} aria-label={`${you}的短链`}
              onFocus={e => e.currentTarget.select()} />
            <button type="button" className="shp-btn shp-btn-quiet" onClick={copy}>复制</button>
          </div>
        )}
        {copied === 'ok' && <p className="shp-ok" role="status">复制好了，去粘贴吧。</p>}
        {copied === 'manual' && <p className="shp-mute" role="status">这里没法直接复制：链接已经选中，长按它选「复制」。</p>}
      </section>

      {/* 3. 分享图：发朋友圈、发群用这张 */}
      <section className="shp-sec">
        <h3 className="shp-h">分享图</h3>
        <p className="shp-p">
          发朋友圈、发群用这张。二维码里只有{you}的公开地址，谁扫都一样，看到的是{you}给陌生访客看的那一版。
        </p>
        {picture('share', `${you}的分享图`)}
        {saveActions('share', '下载分享图')}
        {!published && <p className="shp-mute">还没发布：现在扫这张图只会看到「页面不存在」。</p>}
      </section>

      {/* 4. 名片：当面递的，带口令 */}
      <section className="shp-sec">
        <h3 className="shp-h">当面递的名片</h3>
        <p className="shp-p">
          当面给别人看、或者打印出来用。二维码里带着{you}的名片口令：扫码的人能看到{you}设为「森林成员和扫过我名片的人」的内容。
        </p>
        <p className="shp-warn" role="note">不要发到群里或朋友圈：看到这张图的人都能用它。要发到网上，用上面的分享图。</p>
        {picture('card', `${you}的名片`)}
        {saveActions('card', '下载名片')}
        <div className="shp-actions">
          <button type="button" className="shp-btn shp-btn-quiet" onClick={rotate} disabled={busy === 'rotate'}>
            {busy === 'rotate' ? '正在换…' : '换一个名片口令'}
          </button>
        </div>
        <p className="shp-mute">名片不小心传出去了，就换一个口令：之前的名片二维码还能打开{you}的空间，但不再能看到只给扫过名片的人的内容。</p>
        {err?.where === 'card' && <p className="shp-err" role="alert">{err.text}</p>}
        {said?.where === 'card' && <p className="shp-ok" role="status">{said.text}</p>}
      </section>

      {/* 5. 分享预览 */}
      <section className="shp-sec">
        <h3 className="shp-h">分享预览</h3>
        <p className="shp-p">把链接发到社交平台时，大致是这个样子：</p>
        <div className="shp-og" aria-label="链接卡片预览">
          {ogSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- 预览用，和真实分享图同一个地址
            <img key={ogSrc} src={ogSrc} alt="" width={1200} height={630} className="shp-og-img" />
          ) : (
            <div className="shp-og-img" aria-hidden="true" />
          )}
          <div className="shp-og-body">
            <p className="shp-og-title">{meta?.title ?? '……'}</p>
            <p className="shp-og-desc">{meta?.description ?? ''}</p>
            <p className="shp-og-host">{shownUrl}</p>
          </div>
        </div>
        <p className="shp-mute">
          在微信里直接转发链接时，卡片样子由微信决定；想要更好看的分享，发上面的分享图。
        </p>
        {!published && <p className="shp-mute">还没发布：别人现在打开链接只会看到「页面不存在」，分享卡片也不会有图。</p>}
      </section>

      {big && bigPic?.src && (
        <div className="shp-big" role="dialog" aria-modal="true" aria-label={big === 'share' ? '分享图大图' : '名片大图'}
          onClick={e => { if (e.target === e.currentTarget) setBig(null); }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 本地 blob / data 地址，长按保存 */}
          <img src={bigPic.src} alt={big === 'share' ? `${you}的分享图` : `${you}的名片`} className="shp-big-img" />
          <p className="shp-big-tip">{wechat ? '长按图片 → 保存图片' : '在手机上长按图片保存；电脑上右键「图片另存为」'}</p>
          <button type="button" className="shp-big-close" onClick={() => setBig(null)} autoFocus>关闭</button>
        </div>
      )}
    </div>
  );
}
