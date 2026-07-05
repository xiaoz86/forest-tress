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
