export const XIAOYA_MAX_MESSAGES = 12;
export const XIAOYA_MAX_MESSAGE_CHARS = 1800;
export const XIAOYA_MAX_BODY_BYTES = 48 * 1024;

export type XiaoyaClientMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type XiaoyaSuggestion = {
  label: string;
  href: string;
};

export type XiaoyaMemberContext = {
  authenticated: boolean;
  displayName: string;
  isNewUser: boolean;
  hasPublishedWork: boolean;
};

export type XiaoyaStreamEvent =
  | {
      type: 'meta';
      requestId: string;
      suggestions: XiaoyaSuggestion[];
    }
  | { type: 'delta'; text: string }
  | {
      type: 'done';
      requestId: string;
      suggestions: XiaoyaSuggestion[];
    }
  | {
      type: 'error';
      requestId: string;
      code: string;
      message: string;
    };

export type ParsedXiaoyaMessages =
  | { ok: true; messages: XiaoyaClientMessage[] }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Treat every chat message as untrusted client input. We accept only the two
 * conversational roles, reject overlong items, and retain a bounded tail.
 */
export function parseXiaoyaMessages(value: unknown): ParsedXiaoyaMessages {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: 'messages_required' };
  }

  const parsed: XiaoyaClientMessage[] = [];
  for (const item of value) {
    if (!isRecord(item) || (item.role !== 'user' && item.role !== 'assistant')) {
      return { ok: false, error: 'invalid_message_role' };
    }
    if (typeof item.content !== 'string') {
      return { ok: false, error: 'invalid_message_content' };
    }
    const content = item.content.trim();
    if (!content) return { ok: false, error: 'empty_message' };
    if (content.length > XIAOYA_MAX_MESSAGE_CHARS) {
      return { ok: false, error: 'message_too_long' };
    }
    parsed.push({ role: item.role, content });
  }

  const messages = parsed.slice(-XIAOYA_MAX_MESSAGES);
  if (messages.at(-1)?.role !== 'user') {
    return { ok: false, error: 'last_message_must_be_user' };
  }
  return { ok: true, messages };
}

