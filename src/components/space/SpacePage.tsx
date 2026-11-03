import { notFound } from 'next/navigation';
import { after } from 'next/server';
import './space.css';
import BookButton from '@/components/space/interact/BookButton';
import EventList from '@/components/space/interact/EventList';
import GreetForm from '@/components/space/interact/GreetForm';
import SpaceSite from '@/components/space/SpaceSite';
import TunePanel from '@/components/space/tune/TunePanel';
import Unavailable from '@/components/space/Unavailable';
import { fetchMember } from '@/lib/space/access';
import { draftInBackground } from '@/lib/space/autoDraft';
import { chapterOrder, effectiveDraft, type ChapterKey } from '@/lib/space/edits';
import { listPublicEvents } from '@/lib/space/events';
import { coverPhotoMode } from '@/lib/space/photoMeta';
import { richness } from '@/lib/space/portrait';
import { effectiveVector, recommend, resolveThemeId, type RecommendInput } from '@/lib/space/recommend';
import { getSettings, spaceMode } from '@/lib/space/settings';
import { isMemberId, readSpace, type SpaceRecord } from '@/lib/space/store';
import { THEMES, ZERO, getTheme } from '@/lib/space/themes';
import { tunedTheme } from '@/lib/space/tune';
import { AUDIENCES, type Audience, type PublicEvent, type SpaceSettings, type VisibilityKey } from '@/lib/space/types';
import { isHost, resolveViewer, simulate, visibleFor, type AsRole } from '@/lib/space/viewer';
import type { NodeCard } from '@/lib/supabase';

/**
 * 一个人的个人空间页。/space/<id> 和短链 /@slug 共用这一个渲染。
 *
 * - 没发布：只有本人和管理员能看（预览），其他人 404——不暴露这个人有没有在做个人空间
 * - 发布之后：访客按逐项可见性看到对应的板块；本人看到的是带标注的预览，
 *   还可以「假装」成访客 / 扫过名片的人 / 森林成员，检查自己的可见性设置
 */

type Props = {
  memberId: string;
  searchParams: Record<string, string | string[] | undefined>;
  via: 'id' | 'slug';
};

const AS_ROLES: { value: AsRole; label: string }[] = [
  { value: 'visitor', label: '陌生访客' },
  { value: 'card', label: '扫过名片的人' },
  { value: 'member', label: '森林成员' },
];

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

/** 联系方式没给看时，告诉访客怎样才能看到 */
function contactHint(node: NodeCard, settings: SpaceSettings, visible: Record<VisibilityKey, boolean>): string | null {
  const hidden: Audience[] = [];
  if (node.wechat && !visible.wechat) hidden.push(settings.visibility.wechat);
  if (node.email && !visible.email) hidden.push(settings.visibility.email);
  if (!hidden.length) return null;
  if (hidden.every(a => a === 'self')) return null;
  if (hidden.some(a => a === 'card')) return '我的联系方式给附近森林的成员、和扫过我名片的人看。';
  return '我的联系方式只给附近森林的成员看。';
}

export default async function SpacePage({ memberId: rawId, searchParams: sp, via }: Props) {
  const memberId = rawId.trim().toLowerCase();
  if (!isMemberId(memberId)) notFound();

  let node: NodeCard | null;
  try {
    node = await fetchMember(memberId);
  } catch {
    return <Unavailable what="成员资料" />;
  }
  if (!node) notFound();

  let settings: SpaceSettings;
  let rec: SpaceRecord;
  try {
    [settings, rec] = await Promise.all([getSettings(memberId), readSpace(memberId)]);
  } catch {
    return <Unavailable what="个人空间的设置" />;
  }

  const real = await resolveViewer(memberId, settings);
  const host = isHost(real);
  // 访客看哪一版：发布了的完整版 / 没发布的默认版本 / 不给看（隐藏了、或不在森林里）
  const mode = spaceMode(settings, node);
  if (!host && mode === 'none') notFound();

  // 本人预览时可以假装成某种访客；访客自己带 ?as= 没有用
  const asRaw = one(sp.as);
  const as = host && AS_ROLES.some(r => r.value === asRaw) ? (asRaw as AsRole) : null;
  const viewer = as ? simulate(real, as) : real;
  const preview = host && !as;
  const result = rec.result ?? null;
  const layoutRequested = one(sp.layout) === 'support';
  // 还没有 AI 起稿的（注册时没赶上）：本人打开自己的空间时在后台补上，下一次打开就有了
  if (!rec.result && host && !layoutRequested) after(() => draftInBackground(node));
  // 调风格（?tune=1）和编辑（?edit=1）：本人在自己的网站上直接改。两者不同时开；假装成访客时都不能用
  const tuning = preview && one(sp.tune) === '1';
  const editing = preview && !tuning && one(sp.edit) === '1';
  // 只读结构预览复用真实内容与权限；进入编辑后仍以本人保存的顺序为准，不写共享资料。
  const supportPreview = layoutRequested && !editing && !tuning;
  const eff = rec.result || rec.edits ? effectiveDraft(result?.draft ?? null, rec.edits) : null;
  const extras = {
    order: supportPreview ? ['offer', 'knowing', 'path'] as ChapterKey[] : chapterOrder(rec.edits),
    cover: rec.edits?.cover ?? null,
    learning: rec.edits?.learning ?? [],
    story: rec.edits?.story ?? '',
  };
  const pending = eff?.pending.length ?? 0;

  // 访客看到的主题就是本人定下（或推荐）的那套；?theme= 只给本人试
  const q = host ? one(sp.theme) : undefined;
  const asked = q && getTheme(q) ? q : null;
  const forced = host && process.env.NODE_ENV !== 'production' && (sp.photo === 'none' || sp.photo === 'stamp') ? sp.photo : null;
  const photo = forced ?? await coverPhotoMode(node.avatar_url);

  const sparse = !richness(node).enough;
  const input: RecommendInput | null = rec.result
    ? {
        mode: rec.style?.mode ?? (sparse ? 'fallback' : 'portrait'),
        portrait: rec.result.portrait,
        test: rec.style?.test ?? {},
        picks: rec.style?.picks ?? [],
        feel: rec.tune?.feel,
      }
    : rec.style
      ? { mode: 'fallback', portrait: null, test: rec.style.test, picks: rec.style.picks, feel: rec.tune?.feel }
      : null;
  // 访客看到的那一套；本人用 ?theme= 预览别的套时，调风格面板要说清「网站现在是哪一套」
  const liveId = resolveThemeId(rec.style?.chosen, input);
  const themeId = asked ?? liveId;
  const baseTheme = getTheme(themeId)!;
  // 本人拨过的旋钮只叠在调它的那一套上
  const theme = tunedTheme(baseTheme, rec.tune);
  const tuned = theme !== baseTheme;
  const recommended = !asked && !rec.style?.chosen && input ? recommend(input, 1).items[0] : null;
  const source = (asked ? '手动切换' : rec.style?.chosen ? '你选定的' : recommended ? '推荐的第一套' : '默认，还没选风格')
    + (tuned ? ' + 你的微调' : '');

  const visible = visibleFor(settings, viewer);
  const contacts = {
    wechat: visible.wechat ? node.wechat || undefined : undefined,
    email: visible.email ? node.email || undefined : undefined,
  };

  let events: PublicEvent[] = [];
  if (visible.offer) {
    try {
      events = await listPublicEvents(memberId);
    } catch (err) {
      console.error('[space] events unavailable', err);
    }
  }

  // 登录过的森林成员来打招呼、报名、预约时，名字先帮他填上
  const viewerName = !real.isOwner && real.viewerName ? real.viewerName : undefined;

  const audLabel = Object.fromEntries(
    (Object.entries(settings.visibility) as [VisibilityKey, Audience][])
      .map(([k, a]) => [k, a === 'public' ? '所有人可见' : `${AUDIENCES.find(x => x.value === a)!.label}可见`]),
  ) as Record<VisibilityKey, string>;
  const audTone = Object.fromEntries(
    (Object.entries(settings.visibility) as [VisibilityKey, Audience][])
      .map(([k, a]) => [k, a === 'public' ? 'public' : a === 'self' ? 'tbd' : 'member']),
  ) as Record<VisibilityKey, 'public' | 'member' | 'tbd'>;

  const base = via === 'slug' && settings.slug ? `/@${settings.slug}` : `/space/${memberId}`;
  const keep = (extra: Record<string, string>) => {
    const u = new URLSearchParams();
    if (asked) u.set('theme', asked);
    if (as) u.set('as', as);
    if (editing) u.set('edit', '1');
    if (tuning) u.set('tune', '1');
    if (supportPreview && extra.edit !== '1' && extra.tune !== '1') u.set('layout', 'support');
    for (const [k, v] of Object.entries(extra)) {
      if (v) u.set(k, v);
      else u.delete(k);
    }
    const s = u.toString();
    return `${base}${s ? `?${s}` : ''}`;
  };

  return (
    <>
      {host && (
        <div className="sp-owner">
          <nav className="sp-bar" aria-label="我的空间工具">
            {preview ? <>
              <a className={`sp-bar-edit ${editing ? 'is-on' : ''}`} href={keep({ edit: editing ? '' : '1', tune: '' })}>
                {editing ? '完成编辑' : '改内容'}
              </a>
              <a className={`sp-bar-edit ${tuning ? 'is-on' : ''}`} href={keep({ tune: tuning ? '' : '1', edit: '' })} title="颜色、字体、留白都可以改">
                {tuning ? '完成调风格' : '调风格'}
              </a>
              <a href={`${keep({ edit: '1', tune: '' })}#space-order`}>调整顺序</a>
            </> : <>
              <span className="sp-bar-tag">{AS_ROLES.find(r => r.value === as)?.label}视角</span>
              <a href={keep({ as: '' })}>返回我的预览</a>
            </>}
            <a href={`/space/${memberId}/manage?tab=share`}>预览与分享</a>
            <span className="sp-bar-sp" />
            <span className="sp-bar-title">{node.name} · {theme.name}（{source}）</span>
          </nav>
          <div className="sp-owner-info">
            <p className="sp-owner-notice">
              {mode === 'none'
                ? settings.published ? '当前没有对外展示，你和管理员可以预览。' : '尚未公开；你和管理员可以预览，发布由本人决定。'
                : '已发布 · 保存内容或风格后会更新公开网站。'}
              {preview && pending > 0 && ` ${pending} 处 AI 起稿待你确认。`}
              {supportPreview && ' 当前是支持优先的结构预览，未改变已保存的顺序。'}
            </p>
            <details className="sp-preview-options">
              <summary>访客视角与更多</summary>
              <div className="sp-owner-options">
                <span className="sp-bar-as" aria-label="用别人的身份看">
                  {AS_ROLES.map(r => (
                    <a key={r.value} href={keep({ as: as === r.value ? '' : r.value })} aria-current={as === r.value ? 'page' : undefined}>
                      {r.label}
                    </a>
                  ))}
                </span>
                <span className="sp-swatches" aria-label="试试其他主题">
                  {THEMES.map(t => (
                    <a key={t.id} href={keep({ theme: t.id })} title={t.name} aria-label={t.name}
                      className={`sp-swatch ${t.id === theme.id ? 'is-on' : ''}`}
                      style={{ background: `linear-gradient(135deg, ${t.tokens.bg} 50%, ${t.tokens.accent} 50%)` }} />
                  ))}
                </span>
                <a href={`/space/${memberId}/manage?tab=inbox`}>收件箱</a>
                <a href={`/space/${memberId}/manage?tab=visibility`}>谁能看到</a>
                <a href={`/space/${memberId}/studio`}>风格工作室</a>
              </div>
            </details>
          </div>
        </div>
      )}
      {tuning && (
        <TunePanel
          memberId={memberId}
          base={{ id: baseTheme.id, name: baseTheme.name, tokens: baseTheme.tokens }}
          saved={rec.tune?.base === baseTheme.id ? { knobs: rec.tune.knobs, locks: rec.tune.locks } : null}
          otherBase={rec.tune && rec.tune.base !== baseTheme.id && Object.keys(rec.tune.knobs).length
            ? getTheme(rec.tune.base)?.name ?? null : null}
          willPin={rec.style?.chosen !== baseTheme.id}
          isLive={baseTheme.id === liveId}
          published={mode !== 'none'}
          liveName={getTheme(liveId)?.name ?? baseTheme.name}
          vector={(input && effectiveVector(input)?.v) || ZERO}
          hasPhoto={photo !== 'none'}
          closeHref={keep({ tune: '' })}
        />
      )}
      <SpaceSite
        eff={eff} extras={extras} editing={editing} tuning={tuning}
        node={node} theme={theme} result={result}
        marks={preview} bar={host} sparse={sparse} photo={photo}
        visible={visible} audLabel={audLabel} audTone={audTone}
        contacts={contacts} contactHint={contactHint(node, settings, visible)}
        hasEvents={events.length > 0}
        slots={{
          events: (
            <EventList memberId={memberId} events={events} preview={preview} viewerName={viewerName}
              sharePath={settings.slug ? `/@${settings.slug}` : `/space/${memberId}`} hostName={node.name || ''} />
          ),
          // 关掉了打招呼就不传：SpaceSite 会把首屏、页眉的主行动换成别的真能走的路
          greet: settings.greetingsOpen
            ? <GreetForm memberId={memberId} hostName={node.name} open preview={preview} viewerName={viewerName} />
            : undefined,
          bookFor: settings.bookingsOpen ? (title: string) => (
            <BookButton memberId={memberId} serviceTitle={title} open preview={preview} viewerName={viewerName} />
          ) : undefined,
        }}
      />
    </>
  );
}
