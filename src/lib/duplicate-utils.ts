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

export function isEventCategory(claimType?: string): boolean {
  if (!claimType) return false;
  const normalized = claimType.toLowerCase();
  return (
    normalized.includes('workshop') ||
    normalized.includes('fdp') ||
    normalized.includes('training') ||
    normalized.includes('event') ||
    normalized.includes('conference')
  );
}

export function getClaimEventDate(claim: Partial<IncentiveClaim>): Date | null {
  const dateStr =
    claim.workshopStartDate ||
    claim.workshopEndDate ||
    (claim as any).eventDate ||
    claim.conferenceDate ||
    claim.conferenceEndDate ||
    claim.presentationDate;
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

export function getClaimEventYear(claim: Partial<IncentiveClaim>): number | null {
  const eventDate = getClaimEventDate(claim);
  if (eventDate) return eventDate.getFullYear();
  if (claim.submissionDate) {
    const subDate = new Date(claim.submissionDate);
    return isNaN(subDate.getTime()) ? null : subDate.getFullYear();
  }
  return null;
}

export function isPotentialDuplicate(a: IncentiveClaim, b: IncentiveClaim, threshold = 0.92): DuplicateInfo | null {
  if (!a || !b) return null;
  if (a.id === b.id) return null;
  if (b.status === 'Draft' || (b.status as string) === 'Not Approved' || (b.status as string) === 'Rejected') return null;
  if (a.claimType !== b.claimType) return null;

  // If both are research papers, check if they are co-authors.
  // If either applicant is listed in the other claim's authors list, they are co-authors, not duplicates.
  if (a.claimType === 'Research Papers') {
    const isCoAuthor = (
      a.authors?.some(author => 
        (b.userEmail && author.email?.toLowerCase() === b.userEmail.toLowerCase()) || 
        (b.uid && author.uid === b.uid)
      ) ||
      b.authors?.some(author => 
        (a.userEmail && author.email?.toLowerCase() === a.userEmail.toLowerCase()) || 
        (a.uid && author.uid === a.uid)
      )
    );
    if (isCoAuthor) {
      return null;
    }
  }

  // If both are books, check application type and chapter details.
  if (a.claimType === 'Books') {
    // If different application types (e.g. Book vs Book Chapter), they are not duplicates
    if (a.bookApplicationType !== b.bookApplicationType) {
      return null;
    }
    // If both are Book Chapters, they can share the same book DOI.
    // If the chapter titles (publicationTitle) are different and not semantically similar, they are not duplicates.
    if (a.bookApplicationType === 'Book Chapter') {
      const titleA = (a.publicationTitle || '').trim().toLowerCase();
      const titleB = (b.publicationTitle || '').trim().toLowerCase();
      if (titleA !== titleB) {
        const titleSimilarity = getTextSimilarity(titleA, titleB);
        if (titleSimilarity < threshold) {
          return null;
        }
      }
    }
  }

  const matchUid = a.uid || '';
  const otherUid = b.uid || '';

  const isEvent = isEventCategory(a.claimType);

  // Skip cross-duplicate checks for Workshop/FDP/Training/Conference/Event as multiple faculties can participate in the same event
  if (matchUid !== otherUid && isEvent) {
    return null;
  }

  // If both claims are event-based (Event Participation, Workshop, FDP, Conference):
  // Check the date of the event. If the event years or event dates are different (e.g. one event from previous year, and one event from this year), it should NOT be marked as duplicate!
  if (isEvent) {
    const eventYearA = getClaimEventYear(a);
    const eventYearB = getClaimEventYear(b);
    if (eventYearA && eventYearB && eventYearA !== eventYearB) {
      return null;
    }

    // If both have specific start dates and they are distinct dates, they are different events
    const eventDateA = getClaimEventDate(a);
    const eventDateB = getClaimEventDate(b);
    if (
      eventDateA &&
      eventDateB &&
      a.workshopStartDate &&
      b.workshopStartDate &&
      a.workshopStartDate !== b.workshopStartDate
    ) {
      return null;
    }
  }

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

export type PolicyNotice = {
  text: string;
  variant: 'blue' | 'amber' | 'red';
};

export function getClaimPolicyNotices(claim: any, allClaims: any[], allUsers: any[]): PolicyNotice[] {
  const notices: PolicyNotice[] = [];
  if (!claim) return notices;

  const user = allUsers?.find(u => u.uid === claim.uid);
  const designation = user?.designation || '';
  const isPhdScholar = designation === 'Ph.D. Scholar' || designation === 'Ph.D Scholar';

  // 1. PhD Scholar Quartile Limit
  if (claim.claimType === 'Research Papers' && isPhdScholar) {
    const quartile = claim.journalClassification || '';
    if (quartile !== 'Q1' && quartile !== 'Q2') {
      notices.push({
        text: 'Claimant is a PhD Scholar and this publication is Q3/Q4/UGC-CARE (Ineligible under policy)',
        variant: 'red'
      });
    }
  }

  // 2. Double Claim (APC + Paper Incentive)
  if (claim.claimType === 'Research Papers') {
    const doiA = (claim.doi || '').trim().toLowerCase();
    const titleA = (claim.paperTitle || '').trim().toLowerCase();

    const hasApcClaim = allClaims.some(b => {
      if (b.id === claim.id) return false;
      if (b.uid !== claim.uid) return false;
      if (b.claimType !== 'Seed Money for APC') return false;
      if (b.status === 'Draft' || (b.status as string) === 'Not Approved' || b.status === 'Rejected') return false;

      const doiB = (b.doi || '').trim().toLowerCase();
      const titleB = (b.apcPaperTitle || '').trim().toLowerCase();

      return (doiA !== '' && doiA === doiB) || (titleA !== '' && titleA === titleB);
    });

    if (hasApcClaim) {
      notices.push({
        text: 'User has an active/approved APC Seed Money claim for this same work (50% incentive reduction applies)',
        variant: 'blue'
      });
    }
  }

  // 3. Conference Proceedings Presenting Author
  if (claim.claimType === 'Research Papers' && claim.publicationType === 'Scopus Indexed Conference Proceedings') {
    const myAuthor = claim.authors?.find((a: any) => a.uid === claim.uid);
    const isPresenting = myAuthor?.role === 'Presenting Author' || myAuthor?.role === 'First & Presenting Author';
    if (!isPresenting) {
      notices.push({
        text: 'User is applying for Conference Proceedings but is not listed as the Presenting Author',
        variant: 'amber'
      });
    }
  }

  // 4. PU-Organized Conference Limits
  if (claim.claimType === 'Conference Presentations') {
    const organizerName = (claim.organizerName || '').toLowerCase();
    const confName = (claim.conferenceName || '').toLowerCase();
    const isPuConf = organizerName.includes('parul university') || confName.includes('picet');

    if (isPuConf) {
      const yearA = claim.submissionDate ? new Date(claim.submissionDate).getFullYear() : null;
      if (yearA) {
        const hasOtherPuConf = allClaims.some(b => {
          if (b.id === claim.id) return false;
          if (b.uid !== claim.uid) return false;
          if (b.claimType !== 'Conference Presentations') return false;
          if (b.status === 'Draft' || (b.status as string) === 'Not Approved' || b.status === 'Rejected') return false;

          const orgB = (b.organizerName || '').toLowerCase();
          const nameB = (b.conferenceName || '').toLowerCase();
          const isPuConfB = orgB.includes('parul university') || nameB.includes('picet');
          if (!isPuConfB) return false;

          const yearB = b.submissionDate ? new Date(b.submissionDate).getFullYear() : null;
          return yearA === yearB;
        });

        if (hasOtherPuConf) {
          notices.push({
            text: 'User has already submitted a PU-organized conference claim in this calendar year',
            variant: 'amber'
          });
        }
      }
    }
  }

  // 5. Membership Frequency Cap
  if (claim.claimType === 'Membership of Professional Bodies') {
    const yearA = claim.submissionDate ? new Date(claim.submissionDate).getFullYear() : null;
    if (yearA) {
      const hasOtherMembership = allClaims.some(b => {
        if (b.id === claim.id) return false;
        if (b.uid !== claim.uid) return false;
        if (b.claimType !== 'Membership of Professional Bodies') return false;
        if (b.status === 'Draft' || (b.status as string) === 'Not Approved' || b.status === 'Rejected') return false;

        const yearB = b.submissionDate ? new Date(b.submissionDate).getFullYear() : null;
        return yearA === yearB;
      });

      if (hasOtherMembership) {
        notices.push({
          text: 'User has already submitted a Professional Body Membership claim in this calendar year',
          variant: 'amber'
        });
      }
    }
  }

  // 6. Book Chapter multiple claims notice
  if (claim.claimType === 'Books' && claim.bookApplicationType === 'Book Chapter') {
    const doiA = (claim.doi || '').trim().toLowerCase();
    const bookTitleA = (claim.bookTitleForChapter || '').trim().toLowerCase();

    const hasOtherChapters = allClaims.some(b => {
      if (b.id === claim.id) return false;
      if (b.uid !== claim.uid) return false;
      if (b.claimType !== 'Books' || b.bookApplicationType !== 'Book Chapter') return false;
      if (b.status === 'Draft' || (b.status as string) === 'Not Approved' || b.status === 'Rejected') return false;

      const doiB = (b.doi || '').trim().toLowerCase();
      const bookTitleB = (b.bookTitleForChapter || '').trim().toLowerCase();

      return (doiA !== '' && doiA === doiB) || (bookTitleA !== '' && bookTitleA === bookTitleB);
    });

    if (hasOtherChapters) {
      notices.push({
        text: 'User has multiple Book Chapter claims in same book (incentive capped at full book)',
        variant: 'blue'
      });
    }
  }

  // 7. Workshop/Event (FDP) Notice
  const claimType = claim.claimType || '';
  const isConf = claimType.toLowerCase().includes('conference');
  const isWksp = claimType.toLowerCase().includes('workshop') || claimType.toLowerCase().includes('fdp') || claimType.toLowerCase().includes('training') || claimType.toLowerCase().includes('event');

  if (isConf || isWksp) {
    const getClaimEventYear = (c: any) => {
      let dateStr = c.workshopStartDate || c.workshopEndDate || c.eventDate || c.conferenceDate || c.conferenceEndDate || c.submissionDate;
      if (c.submissionDate && typeof c.submissionDate === 'object' && (c.submissionDate as any).toDate) {
        dateStr = (c.submissionDate as any).toDate().toISOString();
      }
      if (dateStr) {
        const date = new Date(String(dateStr));
        return isNaN(date.getTime()) ? null : date.getFullYear();
      }
      return null;
    };

    const yearA = getClaimEventYear(claim);
    if (yearA) {
      const matches: string[] = [];
      allClaims.forEach(b => {
        if (b.status === 'Draft' || (b.status as string) === 'Not Approved' || b.status === 'Rejected') return;
        if (b.uid !== claim.uid) return;

        const bType = b.claimType || '';
        const yearB = getClaimEventYear(b);
        if (!yearB) return;

        if (isConf) {
          const isConfB = bType.toLowerCase().includes('conference');
          if (isConfB && Math.abs(yearB - yearA) <= 1) {
            matches.push(b.claimId || b.id);
          }
        } else {
          const isWkspB = bType.toLowerCase().includes('workshop') || bType.toLowerCase().includes('fdp') || bType.toLowerCase().includes('training') || bType.toLowerCase().includes('event');
          if (isWkspB && yearA === yearB) {
            matches.push(b.claimId || b.id);
          }
        }
      });

      if (matches.length > 1) {
        if (isConf) {
          const years = matches
            .map(id => {
              const c = allClaims.find(x => (x.claimId || x.id) === id);
              return c ? getClaimEventYear(c) : null;
            })
            .filter((y): y is number => y !== null);
          const minYear = Math.min(yearA, ...years);
          const maxYear = Math.max(yearA, ...years);
          notices.push({
            text: `User has ${matches.length} Conference claims in 2-year window (${minYear}-${Math.max(minYear + 1, maxYear)})`,
            variant: 'blue'
          });
        } else {
          notices.push({
            text: `User has ${matches.length} Workshop/Event claims for event year ${yearA}`,
            variant: 'blue'
          });
        }
      }
    }
  }

  return notices;
}

