import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifyMemberSession } from '@/lib/auth';

/** 服务器端唯一可信的会员身份入口。 */
export async function getAuthenticatedMemberId(): Promise<string> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value || '';
  const verdict = verifyMemberSession(token);
  return verdict.ok ? verdict.memberId : '';
}
