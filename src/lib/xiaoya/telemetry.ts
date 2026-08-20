import { createHash, createHmac, randomUUID } from 'node:crypto';

export type XiaoyaTelemetryFields = {
  requestId: string;
  actorHash?: string;
  pageType?: string;
  provider?: string;
  model?: string;
  knowledgeIds?: string[];
  durationMs?: number;
  errorCode?: string;
  safetyKind?: string;
};

export function createXiaoyaRequestId(): string {
  return randomUUID();
}

export function anonymizeXiaoyaActor(value: string): string {
  const secret = process.env.AUTH_SECRET?.trim();
  const digest = secret
    ? createHmac('sha256', secret).update(value).digest('hex')
    : createHash('sha256').update(value).digest('hex');
  return digest.slice(0, 16);
}

/** Structured metadata only. Never pass prompts, messages, cookies or contacts. */
export function logXiaoyaEvent(event: string, fields: XiaoyaTelemetryFields): void {
  console.info('[xiaoya]', event, fields);
}

