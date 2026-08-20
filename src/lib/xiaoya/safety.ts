import type { XiaoyaPageContext } from './pageContext.ts';
import type { XiaoyaSuggestion } from './types.ts';

export type XiaoyaDeterministicReply = {
  kind: 'crisis' | 'phil-boundary';
  reply: string;
  suggestions: XiaoyaSuggestion[];
};

const CRISIS_RE = /自杀|轻生|不想活|活不下去|结束生命|伤害自己|割腕|跳楼|kill myself|suicide|end my life|do not want to live|don't want to live|hurt myself/i;
const PHIL_PRODUCT_QUESTION_RE = /phil[\s-]*coach.{0,20}(是什么|怎么用|功能|记忆|隐私|区别|登录|语音|what is|how (?:do|can) i use|feature|memory|privacy|difference|login|voice)|(?:怎么用|介绍|功能|what is|how (?:do|can) i use).{0,20}phil[\s-]*coach/i;
const DEEP_COACHING_RE = /(?:陪我|想和你|帮我).{0,12}(?:聊聊|梳理|探索).{0,16}(?:情绪|感受|关系|人生|选择|困惑|迷茫|内心)|(?:生命教练|教练式对话|心理咨询|情绪陪伴)|(?:help me|can we|i want to).{0,18}(?:talk through|explore|work through).{0,24}(?:feelings?|emotions?|relationship|life|decision|confusion|lost)|life coach|coaching conversation|emotional support/i;

const SAFE_STATIC_PATHS = new Set([
  '/',
  '/about',
  '/creators',
  '/login',
  '/phil-coach',
  '/meditations',
  '/shares',
  '/launch',
]);
const SAFE_CREATOR_PATH_RE = /^\/creators\/[0-9a-f-]{8,64}$/i;

export function sanitizeInternalHref(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const href = value.trim();
  if (!href || href.startsWith('//') || href.includes('\\') || /[\u0000-\u001f]/.test(href)) {
    return null;
  }
  try {
    const parsed = new URL(href, 'https://nearby-forest.invalid');
    if (parsed.origin !== 'https://nearby-forest.invalid') return null;
    if (!SAFE_STATIC_PATHS.has(parsed.pathname) && !SAFE_CREATOR_PATH_RE.test(parsed.pathname)) {
      return null;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function safeSuggestion(label: string, href: string): XiaoyaSuggestion | null {
  const safeHref = sanitizeInternalHref(href);
  return safeHref ? { label, href: safeHref } : null;
}

export function deterministicSafetyReply(
  message: string,
  locale: XiaoyaPageContext['locale'] = 'zh-CN',
): XiaoyaDeterministicReply | null {
  if (CRISIS_RE.test(message)) {
    return {
      kind: 'crisis',
      reply: locale === 'en'
        ? 'It sounds like you may be in immediate danger or carrying more than you can hold alone. Xiaoya is not a crisis service. Please contact local emergency services now and reach a trusted person who can stay with you. If you can, move away from anything or anywhere you could use to hurt yourself.'
        : '听起来你现在可能正处在很危险、很难熬的时刻。小芽不是危机干预服务。请立即联系当地急救或警方，也请马上联系一位身边可信任的人，让对方现在陪着你；如果能做到，先离开可能伤害自己的物品和危险地点。',
      suggestions: [],
    };
  }

  if (!PHIL_PRODUCT_QUESTION_RE.test(message) && DEEP_COACHING_RE.test(message)) {
    return {
      kind: 'phil-boundary',
      reply: locale === 'en'
        ? 'This sounds more like something to slow down and explore around your own experience. Xiaoya mainly guides people through Nearby Forest. If you choose, you can continue with PhilCoach for a coaching-style conversation. For treatment or distress that keeps affecting daily life, please seek qualified human support.'
        : '这更像是一段需要慢下来、围绕你自己认真聊的内容。小芽主要负责附近森林的平台指引；如果你愿意，可以去 PhilCoach 继续，它会用教练式陪伴帮助你梳理。若困扰持续影响生活或需要治疗，请寻找真人专业支持。',
      suggestions: [{
        label: locale === 'en' ? 'Talk with PhilCoach' : '去 PhilCoach 聊聊',
        href: '/phil-coach',
      }],
    };
  }
  return null;
}

export function suggestionsForPage(context: XiaoyaPageContext): XiaoyaSuggestion[] {
  const candidates: Array<XiaoyaSuggestion | null> = [];
  const en = context.locale === 'en';
  switch (context.pageType) {
    case 'creator-profile-edit':
    case 'work-editor':
    case 'creator-profile':
      candidates.push(safeSuggestion(en ? 'Explore the creator forest' : '看看创造者森林', '/creators'));
      break;
    case 'creator-directory':
      candidates.push(safeSuggestion(en ? 'Plant your own node' : '种下自己的节点', '/#join'));
      break;
    case 'login':
      candidates.push(safeSuggestion(en ? 'Go to registration' : '回到注册入口', '/#join'));
      break;
    case 'phil-coach':
      candidates.push(safeSuggestion(en ? 'Learn about PhilCoach' : '了解 PhilCoach', '/phil-coach'));
      break;
    case 'meditation-grove':
    case 'meditation-category':
      candidates.push(safeSuggestion(en ? 'Explore sound and sleep' : '回到声音与睡眠', '/meditations'));
      break;
    case 'share-gallery':
    case 'share-submission':
      candidates.push(safeSuggestion(en ? 'Explore forest stories' : '看看林间分享', '/shares'));
      break;
    case 'forest-about':
      candidates.push(safeSuggestion(en ? 'Learn about the community' : '了解生态社区', '/about#community'));
      break;
    default:
      candidates.push(
        safeSuggestion(en ? 'Learn about Nearby Forest' : '了解附近森林', '/about'),
        safeSuggestion(en ? 'Explore the creator forest' : '看看创造者森林', '/creators'),
      );
  }
  return candidates.filter((item): item is XiaoyaSuggestion => item !== null).slice(0, 2);
}
