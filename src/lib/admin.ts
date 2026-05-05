export function getAdminIds(): string[] {
  const raw = process.env.ADMIN_NODE_IDS || '';
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

export function isAdminId(id: string | null | undefined): boolean {
  if (!id) return false;
  return getAdminIds().includes(id);
}
