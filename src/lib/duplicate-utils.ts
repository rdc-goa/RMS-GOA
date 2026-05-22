import type { IncentiveClaim } from '@/types';

export type DuplicateInfo = {
  isDuplicate: boolean;
  type: 'self' | 'cross';
  originalClaimant: string;
  similarityScore?: number;
  reason?: string;
};

export function normalizeText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()\[\]"]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getClaimText(claim: IncentiveClaim): string {
  const values: Array<string | undefined> = [
    claim.doi,
    claim.paperTitle,
    claim.conferencePaperTitle,
    claim.publicationTitle,
    claim.bookTitleForChapter,
    claim.patentTitle,
    claim.apcPaperTitle,
    claim.professionalBodyName,
    claim.awardTitle,
    claim.emrProjectName,
    claim.workshopName,
    claim.patentApplicationNumber,
    claim.membershipNumber,
    claim.patentTitle,
  ];

  return normalizeText(values.filter(Boolean).join(' '));
}

function getNgrams(text: string, size = 3): string[] {
  const normalized = text.replace(/\s+/g, ' ');
  const grams: string[] = [];
  for (let i = 0; i <= normalized.length - size; i++) {
    grams.push(normalized.slice(i, i + size));
  }
  return grams;
}

function jaccardSimilarity(a: string, b: string): number {
  const aTokens = new Set(a.split(' ').filter(Boolean));
  const bTokens = new Set(b.split(' ').filter(Boolean));

  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  const intersection = new Set([...aTokens].filter(token => bTokens.has(token))).size;
  const union = new Set([...aTokens, ...bTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function ngramSimilarity(a: string, b: string): number {
  const aGrams = getNgrams(a);
  const bGrams = getNgrams(b);
  if (aGrams.length === 0 || bGrams.length === 0) return 0;

  const aSet = new Set(aGrams);
  const bSet = new Set(bGrams);
  const intersection = new Set([...aSet].filter(x => bSet.has(x))).size;
  const union = new Set([...aSet, ...bSet]).size;
  return union === 0 ? 0 : intersection / union;
}

export function getTextSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const normalizedA = normalizeText(a);
  const normalizedB = normalizeText(b);
  const jaccard = jaccardSimilarity(normalizedA, normalizedB);
  const ngram = ngramSimilarity(normalizedA, normalizedB);
  return Math.max(jaccard, ngram);
}

export function isPotentialDuplicate(a: IncentiveClaim, b: IncentiveClaim, threshold = 0.92): DuplicateInfo | null {
  if (!a || !b) return null;
  if (a.id === b.id) return null;
  if (b.status === 'Draft' || b.status === 'Rejected') return null;
  if (a.claimType === 'Membership of Professional Bodies' && b.claimType === 'Membership of Professional Bodies') return null;

  const matchUid = a.uid || '';
  const otherUid = b.uid || '';

  const titlesA = getClaimText(a);
  const titlesB = getClaimText(b);

  if (!titlesA || !titlesB) return null;

  const exactTitleMatch = titlesA === titlesB;
  const doiA = (a.doi || '').trim().toLowerCase();
  const doiB = (b.doi || '').trim().toLowerCase();
  const exactDoiMatch = doiA !== '' && doiA === doiB;

  if (exactDoiMatch || exactTitleMatch) {
    return {
      isDuplicate: true,
      type: matchUid === otherUid ? 'self' : 'cross',
      originalClaimant: b.userName || 'Another researcher',
      similarityScore: 1,
      reason: exactDoiMatch ? 'Exact DOI match' : 'Exact title match'
    };
  }

  const similarityScore = getTextSimilarity(titlesA, titlesB);
  if (similarityScore >= threshold) {
    return {
      isDuplicate: true,
      type: matchUid === otherUid ? 'self' : 'cross',
      originalClaimant: b.userName || 'Another researcher',
      similarityScore,
      reason: 'High probability semantic match'
    };
  }

  return null;
}
