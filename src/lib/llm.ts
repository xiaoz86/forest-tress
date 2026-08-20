export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type LLMConfig = {
  provider: 'deepseek' | 'moonshot';
  apiKey: string;
  baseUrl: string;
  model: string;
};

type ChatCompletionOptions = {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: 'json_object' };
  timeoutMs?: number;
};

export type ChatCompletionStream = {
  provider: LLMConfig['provider'];
  model: string;
  chunks: AsyncIterable<string>;
  cancel: () => void;
};

export function getLLMConfig(): LLMConfig | null {
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (deepseekKey) {
    return {
      provider: 'deepseek',
      apiKey: deepseekKey,
      baseUrl: (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, ''),
      model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
    };
  }

  const moonshotKey = process.env.MOONSHOT_API_KEY?.trim();
  if (moonshotKey) {
    return {
      provider: 'moonshot',
      apiKey: moonshotKey,
      baseUrl: (process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1').replace(/\/+$/, ''),
      model: process.env.KIMI_MODEL || 'kimi-k2-turbo-preview',
    };
  }

  return null;
}

export async function createChatCompletion({
  messages,
  temperature = 0.4,
  maxTokens,
  responseFormat,
  timeoutMs = 45000,
}: ChatCompletionOptions): Promise<string | null> {
  const config = getLLMConfig();
  if (!config) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature,
    stream: false,
  };

  if (maxTokens) body.max_tokens = maxTokens;
  if (responseFormat) body.response_format = responseFormat;
  if (config.provider === 'deepseek') {
    body.thinking = { type: 'disabled' };
  }

  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[llm] non-200', config.provider, res.status, text.slice(0, 300));
      return null;
    }

    const json = await res.json();
    const content: string | undefined = json?.choices?.[0]?.message?.content;
    return content?.trim() || null;
  } catch (err) {
    console.error('[llm] failed', config.provider, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Streaming sibling for OpenAI-compatible providers.
 *
 * Existing non-streaming callers keep their exact behavior. Consumers receive
 * only assistant text deltas; provider reasoning fields and raw SSE metadata
 * are deliberately ignored.
 */
export async function createChatCompletionStream({
  messages,
  temperature = 0.4,
  maxTokens,
  timeoutMs = 60000,
}: Omit<ChatCompletionOptions, 'responseFormat'>): Promise<ChatCompletionStream | null> {
  const config = getLLMConfig();
  if (!config) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature,
    stream: true,
  };
  if (maxTokens) body.max_tokens = maxTokens;
  if (config.provider === 'deepseek') body.thinking = { type: 'disabled' };

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch {
    clearTimeout(timer);
    console.error('[llm] stream_connect_failed', { provider: config.provider, errorCode: 'connect_failed' });
    return null;
  }

  if (!response.ok || !response.body) {
    clearTimeout(timer);
    console.error('[llm] stream_non_200', { provider: config.provider, status: response.status });
    await response.body?.cancel().catch(() => {});
    return null;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  async function* chunks(): AsyncGenerator<string> {
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        if (done && buffer) {
          lines.push(buffer);
          buffer = '';
        }

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (!data) continue;
          if (data === '[DONE]') return;
          try {
            const event = JSON.parse(data);
            const content: unknown = event?.choices?.[0]?.delta?.content;
            if (typeof content === 'string' && content) yield content;
          } catch {
            // A malformed provider event is skipped without exposing its body.
          }
        }
        if (done) return;
      }
    } finally {
      clearTimeout(timer);
      await reader.cancel().catch(() => {});
    }
  }

  return {
    provider: config.provider,
    model: config.model,
    chunks: chunks(),
    cancel: () => ctrl.abort(),
  };
}
