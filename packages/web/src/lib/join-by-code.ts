export interface JoinResult {
  status: 'approved' | 'pending';
  organizationName: string;
  /** Pending only until the user verifies their email; the org then adds them automatically. */
  awaitingEmailVerification?: true;
}

/** Same two calls as pages/join-by-code.tsx: look the org up by code, then request membership. */
export async function joinOrganizationByCode(code: string): Promise<JoinResult> {
  const orgRes = await fetch(`/api/organizations/join/${encodeURIComponent(code)}`);
  const orgData = await orgRes.json().catch(() => ({}));
  if (!orgRes.ok) throw new Error(orgData.message || 'Organization not found');
  const { id, name } = orgData.organization;

  const reqRes = await fetch('/api/membership-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ organizationId: id, discoveryMethod: 'direct_link' }),
  });
  const reqData = await reqRes.json().catch(() => ({}));
  if (!reqRes.ok) throw new Error(reqData.message || 'Failed to submit request');
  return {
    status: reqData.request.status === 'approved' ? 'approved' : 'pending',
    organizationName: name,
    ...(reqData.awaitingEmailVerification === true && { awaitingEmailVerification: true as const }),
  };
}
