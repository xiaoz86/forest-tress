import { createClient } from '@supabase/supabase-js';
import type { Metadata } from 'next';
import Nav from '@/components/Nav';
import CreatorSky from '@/components/CreatorSky';
import { dict } from '@/i18n';
import { getLocale } from '@/lib/locale';
import { fetchSkyNodes } from '@/lib/nodeVisibility';
import { getAuthenticatedMemberId } from '@/lib/session';
import { pickNearby, pickRising, toSkyStars } from '@/lib/sky';
import { resolveConstellations } from '@/lib/skyConstellations';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = dict(await getLocale()).sky;
  return { title: t.metaTitle, description: t.metaDescription };
}

/**
 * 遇见星空。
 *
 * 和「创造者森林」（/creators）是同一批人的两种看法：
 * 森林回答「我如何生长」，星空回答「我能看见谁、谁正在靠近」。
 * 两页互相留了入口。
 *
 * ⚠️ 下发给客户端的只有 `toSkyStars()` 产出的白名单字段，
 * 里面**没有联系方式**。星空把所有人的名字、城市、正在做的事聚合到一屏，
 * 聚合本身就改变了暴露程度——即使每条信息原本都公开。
 *
 * 也因为这个，进星空是可以单独关掉的：fetchSkyNodes 比 fetchListedNodes
 * 多一道 in_sky 闸。关掉的人仍留在创造者森林里，只是不出现在这片天上，
 * 也不参与星座的 AI 分析。见 nodeVisibility.ts 的 isInSky。
 */
export default async function SkyPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const [nodes, locale, meId] = await Promise.all([
    supabaseUrl && serviceKey
      ? fetchSkyNodes(createClient(supabaseUrl, serviceKey))
      : Promise.resolve([]),
    getLocale(),
    getAuthenticatedMemberId(),
  ]);

  // 按加入时间正序：位置用序号做 Halton 铺开，新人只在末尾追加，
  // 已有的星就不会因为有人加入而集体移动。
  const ordered = [...nodes].sort((a, b) =>
    String(a.created_at || '').localeCompare(String(b.created_at || '')),
  );
  const stars = toSkyStars(ordered);
  const me = stars.find(s => s.id === meId) || null;

  // 星座读缓存（由 scripts/generate-sky-constellations.mjs 生成）；
  // 没缓存就退回按关键词的规则聚类，这个镜头不会空掉
  const constellations = await resolveConstellations(stars);

  const t = dict(locale).sky;

  return (
    <>
      {/* 反相导航：米白胶囊压在夜空上会比星还亮 */}
      <Nav night />
      <CreatorSky
        stars={stars}
        // 传原始 session id，**不是** me?.id：退出星空的人 me 是 null，
        // 但他仍然是登录成员，CreatorSky 要靠 meId 认出这一点，
        // 才不会把「找到我的星」指向 /#join 去邀请他重新注册。
        meId={meId || null}
        nearby={pickNearby(stars, me)}
        risingIds={pickRising(stars)}
        constellations={constellations}
        t={t}
      />
    </>
  );
}
