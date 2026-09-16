import { ReadonlyURLSearchParams } from 'next/navigation';

export interface ExtractedAuthor {
  name: string;
  email: string;
  role: "First Author" | "Corresponding Author" | "Co-Author" | "First & Corresponding Author" | "Presenting Author" | "First & Presenting Author";
  isExternal: boolean;
  status: "approved" | "pending" | "Applied";
  uid?: string | null;
}

/**
 * Parses author array from query parameters.
 * Supports:
 * 1. JSON string in `authors` key
 * 2. Flat indexed keys: `author1_name`, `author1_email`, `author1_role`, `author1_isExternal`
 */
export function parseAuthorsParam(searchParams: ReadonlyURLSearchParams | URLSearchParams): ExtractedAuthor[] {
  const jsonStr = searchParams.get('authors');
  if (jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((a: any) => ({
          name: String(a.name || ''),
          email: String(a.email || ''),
          role: undefined as any,
          isExternal: Boolean(a.isExternal),
          status: a.status || 'approved',
          uid: a.uid || null,
        }));
      }
    } catch (e) {
      console.warn('Failed to parse authors JSON from URL params:', e);
    }
  }

  // Fallback: Check flat indexed keys (author1_name, author1_email, etc.)
  const authors: ExtractedAuthor[] = [];
  let index = 1;
  while (index <= 20) {
    const name = searchParams.get(`author${index}_name`);
    if (!name) break;

    const email = searchParams.get(`author${index}_email`) || '';
    const isExternalStr = searchParams.get(`author${index}_isExternal`);
    const isExternal = isExternalStr === 'true' || isExternalStr === '1';

    authors.push({
      name,
      email,
      role: undefined as any,
      isExternal,
      status: 'approved',
      uid: null,
    });
    index++;
  }

  return authors;
}

/**
 * Safe boolean parser for URL params ("true", "1", "yes" => true)
 */
export function parseBoolParam(val: string | null): boolean | undefined {
  if (val === null) return undefined;
  const lower = val.trim().toLowerCase();
  if (lower === 'true' || lower === '1' || lower === 'yes') return true;
  if (lower === 'false' || lower === '0' || lower === 'no') return false;
  return undefined;
}

const sdgGoalsList = [
  "Goal 1: No Poverty",
  "Goal 2: Zero Hunger",
  "Goal 3: Good Health and Well-being",
  "Goal 4: Quality Education",
  "Goal 5: Gender Equality",
  "Goal 6: Clean Water and Sanitation",
  "Goal 7: Affordable and Clean Energy",
  "Goal 8: Decent Work and Economic Growth",
  "Goal 9: Industry, Innovation and Infrastructure",
  "Goal 10: Reduced Inequality",
  "Goal 11: Sustainable Cities and Communities",
  "Goal 12: Responsible Consumption and Production",
  "Goal 13: Climate Action",
  "Goal 14: Life Below Water",
  "Goal 15: Life on Land",
  "Goal 16: Peace and Justice Strong Institutions",
  "Goal 17: Partnerships for the Goals",
];

function mapSdgGoalToOption(rawGoal: string): string {
  // Extract number from formats like "SDG 1", "SDG1", "Goal 1", "Goal1", or just "1"
  const match = rawGoal.match(/(?:SDG|Goal)?\s*(\d+)/i);
  if (match) {
    const num = parseInt(match[1], 10);
    const found = sdgGoalsList.find(g => g.startsWith(`Goal ${num}:`));
    if (found) return found;
  }
  return rawGoal;
}

/**
 * Extracts and sanitizes Research Paper parameters from URL query params.
 */
export function extractResearchPaperIQACParams(searchParams: ReadonlyURLSearchParams | URLSearchParams) {
  if (!searchParams || Array.from(searchParams.keys()).length === 0) {
    return null;
  }

  const paperTitle = searchParams.get('paperTitle') || searchParams.get('title');
  const journalName = searchParams.get('journalName');
  const journalWebsite = searchParams.get('journalWebsite');
  const doi = searchParams.get('doi');
  const publicationType = searchParams.get('publicationType');
  const indexType = searchParams.get('indexType');
  const journalClassification = searchParams.get('journalClassification');
  const wosType = searchParams.get('wosType');
  const wosAccessionNumber = searchParams.get('wosAccessionNumber');
  const scopusLink = searchParams.get('scopusLink');
  const wosLink = searchParams.get('wosLink');
  const relevantLink = searchParams.get('relevantLink');
  const locale = searchParams.get('locale');
  const printIssn = searchParams.get('printIssn');
  const electronicIssn = searchParams.get('electronicIssn') || searchParams.get('eIssn');
  const publicationMonth = searchParams.get('publicationMonth');
  const publicationYear = searchParams.get('publicationYear');
  
  const sdgGoalsRaw = searchParams.get('sdgGoals');
  const sdgGoals = sdgGoalsRaw ? sdgGoalsRaw.split(',').map(s => mapSdgGoalToOption(s.trim())).filter(Boolean) : undefined;

  const openAccessOrSubscription = searchParams.get('openAccessOrSubscription');
  const openAccessType = searchParams.get('openAccessType');
  const authorPosition = searchParams.get('authorPosition');

  const isPuNameInPublication = parseBoolParam(searchParams.get('isPuNameInPublication'));
  const wasApcPaidByUniversity = parseBoolParam(searchParams.get('wasApcPaidByUniversity'));

  const totalPuStudentAuthorsStr = searchParams.get('totalPuStudentAuthors');
  const totalPuStudentAuthors = totalPuStudentAuthorsStr ? parseInt(totalPuStudentAuthorsStr, 10) : undefined;
  const puStudentNames = searchParams.get('puStudentNames');
  const externalId = searchParams.get('externalId');
  const paperProofLink = searchParams.get('paperProofLink');
  const claimType = searchParams.get('claimType');

  const authors = parseAuthorsParam(searchParams);

  if (!paperTitle && !journalName && !doi && authors.length === 0) {
    return null;
  }

  return {
    ...(paperTitle && { paperTitle }),
    ...(journalName && { journalName }),
    ...(journalWebsite && { journalWebsite }),
    ...(doi && { doi }),
    ...(publicationType && { publicationType }),
    ...(indexType && { indexType }),
    ...(journalClassification && { journalClassification }),
    ...(wosType && { wosType }),
    ...(wosAccessionNumber && { wosAccessionNumber }),
    ...(scopusLink && { scopusLink }),
    ...(wosLink && { wosLink }),
    ...(relevantLink && { relevantLink }),
    ...(locale && { locale }),
    ...(printIssn && { printIssn }),
    ...(electronicIssn && { electronicIssn }),
    ...(publicationMonth && { publicationMonth }),
    ...(publicationYear && { publicationYear }),
    ...(sdgGoals && sdgGoals.length > 0 && { sdgGoals }),
    ...(openAccessOrSubscription && { openAccessOrSubscription }),
    ...(openAccessType && { openAccessType }),
    ...(authorPosition && { authorPosition }),
    ...(isPuNameInPublication !== undefined && { isPuNameInPublication }),
    ...(wasApcPaidByUniversity !== undefined && { wasApcPaidByUniversity }),
    ...(totalPuStudentAuthors !== undefined && !isNaN(totalPuStudentAuthors) && { totalPuStudentAuthors }),
    ...(puStudentNames && { puStudentNames }),
    ...(externalId && { externalId }),
    ...(paperProofLink && { paperProofLink }),
    ...(claimType && { claimType }),
    ...(authors.length > 0 && { authors }),
  };
}

/**
 * Extracts and sanitizes Book / Book Chapter parameters from URL query params.
 */
export function extractBookIQACParams(searchParams: ReadonlyURLSearchParams | URLSearchParams) {
  if (!searchParams || Array.from(searchParams.keys()).length === 0) {
    return null;
  }

  const bookApplicationType = searchParams.get('bookApplicationType');
  const publicationTitle = searchParams.get('publicationTitle') || searchParams.get('bookTitle') || searchParams.get('title');
  const bookTitleForChapter = searchParams.get('bookTitleForChapter');
  const bookEditor = searchParams.get('bookEditor');
  const publisherName = searchParams.get('publisherName');
  const publisherCity = searchParams.get('publisherCity');
  const publisherCountry = searchParams.get('publisherCountry');
  const publisherType = searchParams.get('publisherType');
  const authorRole = searchParams.get('authorRole');
  const indexType = searchParams.get('indexType');
  const scopusLink = searchParams.get('scopusLink');
  const wosLink = searchParams.get('wosLink');
  const isScopusIndexed = parseBoolParam(searchParams.get('isScopusIndexed'));

  const publicationYearStr = searchParams.get('publicationYear');
  const publicationYear = publicationYearStr ? parseInt(publicationYearStr, 10) : undefined;

  const authors = parseAuthorsParam(searchParams);

  if (!publicationTitle && !publisherName && authors.length === 0) {
    return null;
  }

  return {
    ...(bookApplicationType && { bookApplicationType }),
    ...(publicationTitle && { publicationTitle }),
    ...(bookTitleForChapter && { bookTitleForChapter }),
    ...(bookEditor && { bookEditor }),
    ...(publisherName && { publisherName }),
    ...(publisherCity && { publisherCity }),
    ...(publisherCountry && { publisherCountry }),
    ...(publisherType && { publisherType }),
    ...(authorRole && { authorRole }),
    ...(indexType && { indexType }),
    ...(scopusLink && { scopusLink }),
    ...(wosLink && { wosLink }),
    ...(isScopusIndexed !== undefined && { isScopusIndexed }),
    ...(publicationYear && !isNaN(publicationYear) && { publicationYear }),
    ...(authors.length > 0 && { authors }),
  };
}

/**
 * Extracts and sanitizes Conference Presentation parameters from URL query params.
 */
export function extractConferenceIQACParams(searchParams: ReadonlyURLSearchParams | URLSearchParams) {
  if (!searchParams || Array.from(searchParams.keys()).length === 0) {
    return null;
  }

  const conferenceName = searchParams.get('conferenceTitle') || searchParams.get('conferenceName');
  const organizerName = searchParams.get('organizer') || searchParams.get('organizerName');
  const locale = searchParams.get('locale');
  const externalId = searchParams.get('externalId');
  const paperProofLink = searchParams.get('paperProofLink');
  const claimType = searchParams.get('claimType');
  const authors = parseAuthorsParam(searchParams);

  // Parse dates
  let conferenceDate: string | undefined = undefined;
  let conferenceEndDate: string | undefined = undefined;
  const conferenceDatesStr = searchParams.get('conferenceDates');
  if (conferenceDatesStr) {
    const parts = conferenceDatesStr.split(' to ');
    if (parts.length === 2) {
      const parseDate = (d: string) => {
        const dp = d.trim().split('-');
        if (dp.length === 3) return `${dp[2]}-${dp[1]}-${dp[0]}`;
        return undefined;
      };
      conferenceDate = parseDate(parts[0]);
      conferenceEndDate = parseDate(parts[1]);
    }
  }

  // Parse venue
  let conferenceVenue: any = undefined;
  const rawVenue = searchParams.get('venue');
  if (rawVenue) {
    const lowerVenue = rawVenue.toLowerCase();
    if (lowerVenue.includes('india')) {
      conferenceVenue = 'India';
    } else if (lowerVenue.includes('subcontinent')) {
      conferenceVenue = 'Indian Subcontinent';
    } else if (lowerVenue.includes('korea') || lowerVenue.includes('japan') || lowerVenue.includes('australia') || lowerVenue.includes('east')) {
      conferenceVenue = 'South Korea, Japan, Australia and Middle East';
    } else if (lowerVenue.includes('europe')) {
      conferenceVenue = 'Europe';
    } else if (lowerVenue.includes('america')) {
      conferenceVenue = 'African/South American/North American';
    } else {
      conferenceVenue = 'Other';
    }
  }

  // Parse type
  let conferenceType: any = undefined;
  if (locale) {
    const lowerLocale = locale.toLowerCase();
    if (lowerLocale.includes('international')) {
      conferenceType = 'International';
    } else if (lowerLocale.includes('national')) {
      conferenceType = 'National';
    } else {
      conferenceType = 'Regional/State';
    }
  }

  if (!conferenceName && !organizerName && authors.length === 0) {
    return null;
  }

  return {
    eventType: "Conference",
    ...(conferenceName && { conferenceName }),
    ...(organizerName && { organizerName }),
    ...(conferenceType && { conferenceType }),
    ...(conferenceDate && { conferenceDate }),
    ...(conferenceEndDate && { conferenceEndDate }),
    ...(conferenceVenue && { conferenceVenue }),
    ...(externalId && { externalId }),
    ...(paperProofLink && { paperProofLink }),
    ...(claimType && { claimType }),
    ...(authors.length > 0 && { authors }),
  };
}

