export type XiaoyaFlags = {
  enabled: boolean;
  ragEnabled: boolean;
  toolsEnabled: boolean;
  feedbackEnabled: boolean;
};

function envFlag(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return fallback;
}

/** Read on every request so environment changes are never hidden by a cache. */
export function getXiaoyaFlags(): XiaoyaFlags {
  return {
    enabled: envFlag('XIAOYA_ENABLED', true),
    ragEnabled: envFlag('XIAOYA_RAG_ENABLED', true),
    toolsEnabled: envFlag('XIAOYA_TOOLS_ENABLED', false),
    feedbackEnabled: envFlag('XIAOYA_FEEDBACK_ENABLED', false),
  };
}

export function isXiaoyaEnabled(): boolean {
  return getXiaoyaFlags().enabled;
}
