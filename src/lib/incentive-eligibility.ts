import type { IncentiveClaim, Author } from '@/types';

function toAuthorPositionNumber(authorPosition?: string): number {
  if (!authorPosition) return 0;
  const parsed = parseInt(authorPosition, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getClaimantRole(claim: Partial<IncentiveClaim>): Author['role'] | undefined {
  if (claim.authorType) {
    return claim.authorType as Author['role'];
  }

  const claimantByEmail = claim.authors?.find(
    (a) => !!claim.userEmail && a.email.toLowerCase() === claim.userEmail.toLowerCase()
  );
  if (claimantByEmail?.role) return claimantByEmail.role;

  const claimantByUid = claim.authors?.find(
    (a) => !!claim.uid && !!a.uid && a.uid === claim.uid
  );
  return claimantByUid?.role;
}

function getClaimantAuthorPosition(claim: Partial<IncentiveClaim>): number {
  const explicitPosition = toAuthorPositionNumber(claim.authorPosition);
  if (explicitPosition > 0) return explicitPosition;

  if (claim.authors && claim.authors.length > 0) {
    const byEmailIndex = claim.authors.findIndex(
      (a) => !!claim.userEmail && a.email.toLowerCase() === claim.userEmail.toLowerCase()
    );
    if (byEmailIndex >= 0) return byEmailIndex + 1;

    const byUidIndex = claim.authors.findIndex(
      (a) => !!claim.uid && !!a.uid && a.uid === claim.uid
    );
    if (byUidIndex >= 0) return byUidIndex + 1;
  }

  return 0;
}

export function isResearchCoAuthorBeyondFifthPosition(claim: Partial<IncentiveClaim>): boolean {
  if (claim.claimType !== 'Research Papers') return false;

  const role = getClaimantRole(claim);
  if (role !== 'Co-Author') return false;

  const position = getClaimantAuthorPosition(claim);
  return position > 5;
}

export function isEligibleForFinancialDisbursement(claim: Partial<IncentiveClaim>): boolean {
  return !isResearchCoAuthorBeyondFifthPosition(claim);
}
