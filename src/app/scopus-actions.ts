
// Force Turbopack revalidation
'use server';

import { checkRateLimit } from '@/lib/rate-limit';
import { callOpenRouter } from '@/lib/openrouter';
import { adminDb } from '@/lib/admin';
import type { ScopusPublication } from '@/types';
import { sendEmail } from '@/lib/email';
import { formatScopusDocumentType, computeHIndex, estimateQuartile, extractUniqueCoAuthorsCount, computeCareerTimeline, resolveSubjectAreaName, extractTopCoAuthors } from '@/lib/scopus-utils';




export async function fetchScopusDataByUrl(
  identifier: string, // Can be a URL or just a DOI
  claimantName: string,
  userId: string,
): Promise<{
  success: boolean
  data?: {
    title: string;
    paperTitle: string;
    journalName: string;
    asjcCategory?: string;
    publicationMonth: string;
    publicationYear: string;
    isPuNameInPublication?: boolean;
    printIssn?: string;
    electronicIssn?: string;
    journalWebsite?: string;
    publicationType?: string;
    journalClassification?: 'Q1' | 'Q2' | 'Q3' | 'Q4';
    totalAuthors: number;
    totalInternalAuthors: number;
    totalInternalCoAuthors: number;
    publisher?: string;
  }
  error?: string
  warning?: string
  claimantIsAuthor?: boolean
}> {
  // Rate limiting [CRIT-02]
  const rateLimit = await checkRateLimit(`scopus-fetch-${userId}`, { points: 15, duration: 600 }); // 5 lookups per 10 mins
  if (!rateLimit.success) {
    return { success: false, error: "Too many search requests. Please try again after 10 minutes." };
  }
  const apiKey = process.env.SCOPUS_API_KEY
  if (!apiKey) {
    console.error("Scopus API key is not configured.")
    return { success: false, error: "Scopus integration is not configured on the server." }
  }

  const lowerIdentifier = identifier.toLowerCase();
  if (lowerIdentifier.includes('/authid/') || lowerIdentifier.includes('authorid=') || lowerIdentifier.includes('/author/')) {
    return {
      success: false,
      error: "The provided URL is a Scopus Author profile link. Link should be of format: https://www.scopus.com/pages/publications/..."
    };
  }

  let apiUrl = '';
  const pagesPubMatch = identifier.match(/pages\/publications\/(\d+)/i);
  const eidMatch = identifier.match(/eid=([^&]+)/);
  const doiMatch = identifier.match(/(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i);

  if (pagesPubMatch && pagesPubMatch[1]) {
    const docId = pagesPubMatch[1];
    apiUrl = `https://api.elsevier.com/content/abstract/scopus_id/${encodeURIComponent(docId)}`;
  } else if (eidMatch && eidMatch[1]) {
    const eid = eidMatch[1];
    apiUrl = `https://api.elsevier.com/content/abstract/eid/${encodeURIComponent(eid)}`;
  } else if (doiMatch && doiMatch[1]) {
    const doi = doiMatch[1];
    apiUrl = `https://api.elsevier.com/content/abstract/doi/${encodeURIComponent(doi)}`;
  } else {
    // Fallback for raw DOI or other formats
    apiUrl = `https://api.elsevier.com/content/abstract/doi/${encodeURIComponent(identifier)}`;
  }

  try {
    const response = await fetch(apiUrl, {
      headers: { "X-ELS-APIKey": apiKey, Accept: "application/json" },
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData?.['service-error']?.status?.statusText || response.statusText || "The resource specified cannot be found.";
      if (
        response.status === 401 ||
        response.status === 403 ||
        errorMessage.toLowerCase().includes("unable to authenticate")
      ) {
        console.error(`Scopus API Authentication Error (Status: ${response.status}, Message: ${errorMessage}). Please check SCOPUS_API_KEY.`);
        return { success: false, error: "Automated fetch is currently unavailable due to a server configuration issue. Please enter details manually." };
      }
      if (
        response.status === 404 ||
        errorMessage.toLowerCase().includes("cannot be found") ||
        errorMessage.toLowerCase().includes("resource specified cannot be found")
      ) {
        return { success: false, error: "This paper does not appear in the Scopus database at this time." };
      }
      throw new Error(`Scopus Abstract API Error: ${errorMessage}`);
    }
    const abstractData = await response.json();
    const retrievalResponse = abstractData?.["abstracts-retrieval-response"];
    const coredata = retrievalResponse?.coredata;

    if (!coredata) {
      return { success: false, error: "Invalid response structure from Scopus Abstract API." }
    }

    const paperTitle = coredata["dc:title"] || "";
    const journalName = coredata["prism:publicationName"] || "";
    const coverDate = coredata["prism:coverDate"];
    const subtypeDescription = coredata["subtypeDescription"] || "";

    const affiliationData = retrievalResponse.affiliation;
    let isPuNameInPublication = false;

    if (Array.isArray(affiliationData)) {
      try {
        isPuNameInPublication = affiliationData.some((affil: any) =>
          affil && typeof affil === 'object' && affil['affilname'] && affil['affilname'].toLowerCase().includes('parul')
        );
      } catch (e) {
        console.warn("Could not parse Scopus affiliation data, ignoring.", e);
      }
    } else if (affiliationData && typeof affiliationData === 'object' && affiliationData['affilname']) {
      isPuNameInPublication = (affiliationData['affilname'] as string).toLowerCase().includes('parul');
    }


    let printIssn: string | undefined;
    let electronicIssn: string | undefined;

    const issnData = coredata["prism:issn"];
    if (Array.isArray(issnData)) {
      issnData.forEach((issn: any) => {
        if (issn && typeof issn === 'object' && issn['$']) {
          if (issn['@type'] === 'electronic') {
            electronicIssn = issn['$'];
          } else {
            printIssn = issn['$'];
          }
        }
      });
    } else if (typeof issnData === 'string') {
      printIssn = issnData;
    }
    if (!electronicIssn && coredata["prism:eIssn"]) {
      electronicIssn = coredata["prism:eIssn"];
    }

    // Split combined ISSNs if they are passed in a single field separated by space/comma
    if (printIssn && (printIssn.includes(' ') || printIssn.includes(','))) {
      const parts = printIssn.split(/[\s,]+/).map(p => p.trim()).filter(Boolean);
      if (parts.length > 1) {
        printIssn = parts[0];
        if (!electronicIssn) {
          electronicIssn = parts[1];
        }
      }
    }

    if (electronicIssn && (electronicIssn.includes(' ') || electronicIssn.includes(','))) {
      const parts = electronicIssn.split(/[\s,]+/).map(p => p.trim()).filter(Boolean);
      if (parts.length > 0) {
        electronicIssn = parts[0];
        if (!printIssn && parts.length > 1) {
          printIssn = parts[1];
        }
      }
    }


    let publicationMonth = '';
    let publicationYear = '';
    let journalWebsite: string | undefined = undefined;
    let publicationType: string | undefined = undefined;
    let journalClassification: 'Q1' | 'Q2' | 'Q3' | 'Q4' | undefined = undefined;
    let warning: string | undefined = undefined;


    if (coverDate) {
      const date = new Date(coverDate);
      publicationYear = date.getFullYear().toString();
      publicationMonth = date.toLocaleString('en-US', { month: 'long' });
    }

    if (subtypeDescription) {
      const subtype = subtypeDescription.toLowerCase();
      if (subtype.includes('article')) {
        publicationType = 'Research Articles/Short Communications';
      } else if (subtype.includes('review')) {
        publicationType = 'Review Articles';
      } else if (subtype.includes('letter')) {
        publicationType = 'Letter to the Editor/Editorial';
      } else if (subtype.includes('conference paper')) {
        publicationType = 'Scopus Indexed Conference Proceedings';
      }
    }



    // After getting journalName, try to find its website via Springer Nature API
    if (journalName) {
      const springerApiKey = process.env.SPRINGER_API_KEY;
      if (springerApiKey) {
        try {
          const springerUrl = `https://api.springernature.com/meta/v2/json?q=journal:"${encodeURIComponent(journalName)}"&p=1&api_key=${springerApiKey}`;
          const springerResponse = await fetch(springerUrl);
          if (springerResponse.ok) {
            const springerData = await springerResponse.json();
            if (springerData.records && springerData.records.length > 0 && springerData.records[0].url && springerData.records[0].url.length > 0) {
              const springerLink = springerData.records[0].url.find((u: { platform: string; value: string; }) => u.platform === 'springerlink');
              if (springerLink && springerLink.value) {
                journalWebsite = springerLink.value;
              }
            }
          }
        } catch (e) {
          console.warn("Springer Nature API call failed, proceeding without website.", e);
        }
      }
    }


    const authorsSource = retrievalResponse.authors?.author || [];
    const authorsCount = Array.isArray(authorsSource) ? authorsSource.length : 1;

    // Simplistic internal author counting: check if any of their affiliations contain 'parul'
    // Usually each author in retrievalResponse has an affiliation list
    let totalInternalAuthors = isPuNameInPublication ? 1 : 0; // At least the claimant if PU check passed
    if (Array.isArray(authorsSource)) {
      totalInternalAuthors = authorsSource.filter((a: any) => {
        const affils = Array.isArray(a.affiliation) ? a.affiliation : [a.affiliation];
        return affils.some((af: any) => af?.['affilname']?.toLowerCase().includes('parul'));
      }).length;
    }

    let processedTitle = paperTitle;
    try {
      const prompt = `
        Format the following research paper title using HTML <sub> and <sup> tags for chemical formulas and scientific notation:
        "${paperTitle}"
        
        Example: H2O -> H<sub>2</sub>O, La2Ni -> La<sub>2</sub>Ni, 10^-3 -> 10<sup>-3</sup>.
        Return ONLY the formatted string. No extra text or markdown.
      `;

      console.log("OpenRouter: Formatting title...");
      const text = await callOpenRouter({ prompt });
      if (text && text.trim().length > 5) processedTitle = text.trim();
    } catch (e) {
      console.error("OpenRouter Title Formatting Error:", e);
    }

    const subjectAreasData = retrievalResponse?.['subject-areas']?.['subject-area'] || retrievalResponse?.['subject-areas'];
    let asjcCategory = '';
    if (subjectAreasData) {
      const saList = Array.isArray(subjectAreasData) ? subjectAreasData : [subjectAreasData];
      const categories: string[] = [];
      saList.forEach((sa: any) => {
        const rawName = sa?.['$'] || sa?.rawName || sa?.name;
        const abbrev = sa?.['@abbrev'] || sa?.abbrev;
        if (rawName || abbrev) {
          categories.push(resolveSubjectAreaName(rawName, abbrev));
        }
      });
      if (categories.length > 0) {
        asjcCategory = categories.join(', ');
      }
    }

    return {
      success: true,
      data: {
        title: processedTitle,
        paperTitle: processedTitle,
        journalName,
        asjcCategory,
        publicationMonth,
        publicationYear,
        isPuNameInPublication,
        printIssn: printIssn || '',
        electronicIssn: electronicIssn || '',
        journalWebsite: journalWebsite || '',
        publicationType,
        journalClassification,
        totalAuthors: authorsCount,
        totalInternalAuthors: totalInternalAuthors,
        totalInternalCoAuthors: Math.max(0, totalInternalAuthors - 1),
        publisher: coredata["dc:publisher"] || '',
      },
      warning,
    }
  } catch (error: any) {
    console.error("Error calling Scopus API:", error)
    const errMessage = error.message || "An unexpected error occurred while fetching Scopus data.";
    if (
      errMessage.toLowerCase().includes("cannot be found") ||
      errMessage.toLowerCase().includes("resource specified cannot be found")
    ) {
      return { success: false, error: "This paper does not appear in the Scopus database at this time." };
    }
    return { success: false, error: errMessage }
  }
}

export async function getJournalWebsite({ journalName }: { journalName: string }): Promise<{ success: boolean; url?: string; error?: string }> {
  const springerApiKey = process.env.SPRINGER_API_KEY;
  if (!springerApiKey) {
    return { success: false, error: "Springer Nature API key is not configured." };
  }

  try {
    const springerUrl = `https://api.springernature.com/meta/v2/json?q=journal:"${encodeURIComponent(journalName)}"&p=1&api_key=${springerApiKey}`;
    const springerResponse = await fetch(springerUrl);
    if (!springerResponse.ok) {
      throw new Error(`Springer Nature API Error: ${springerResponse.statusText}`);
    }

    const springerData = await springerResponse.json();
    if (springerData.records && springerData.records.length > 0 && springerData.records[0].url) {
      const springerLink = springerData.records[0].url.find((u: { platform: string; value: string; }) => u.platform === 'springerlink');
      if (springerLink && springerLink.value) {
        return { success: true, url: springerLink.value };
      }
    }
    return { success: false, error: "No website found for this journal." };
  } catch (error: any) {
    console.error("Error finding journal website:", error);
    return { success: false, error: error.message || "An unexpected error occurred." };
  }
}

// Backward compatibility alias
export async function fetchAdvancedScopusData(...args: Parameters<typeof fetchScopusDataByUrl>) {
  return fetchScopusDataByUrl(...args);
}

export async function fetchAndSaveScopusPublicationsAction(
  targetUserId: string,
  scopusId: string,
  callerUid: string
): Promise<{
  success: boolean;
  count?: number;
  publications?: ScopusPublication[];
  lastFetchedAt?: string;
  hIndex?: number;
  subjectAreas?: { name: string; count: number }[];
  coAuthorCount?: number;
  careerStartYear?: string;
  scopusAffiliations?: { name: string; city?: string; country?: string; current?: boolean }[];
  scopusNameVariants?: string[];
  topCoAuthors?: { name: string; count: number }[];
  orcidId?: string;
  error?: string;
}> {


  if (!targetUserId || !scopusId || !callerUid) {
    return { success: false, error: 'Missing required parameters (targetUserId, scopusId, or callerUid).' };
  }

  // 1. Authorization check: caller must be an authenticated user
  try {
    const callerSnap = await adminDb.collection('users').doc(callerUid).get();
    if (!callerSnap.exists) {
      return { success: false, error: 'Caller user record not found.' };
    }
  } catch (err: any) {
    console.error('Error verifying caller permissions:', err);
    return { success: false, error: 'Failed to verify caller permissions.' };
  }

  // 2. API Key check
  const apiKey = process.env.SCOPUS_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'Scopus API key (SCOPUS_API_KEY) is not configured on the server.' };
  }

  const cleanScopusId = scopusId.trim();

  try {
    const allEntries: any[] = [];
    let startIndex = 0;
    const countPerPage = 25; // Standard service level limit for Elsevier Search API
    let totalResults = 0;

    do {
      const apiUrl = `https://api.elsevier.com/content/search/scopus?query=AU-ID(${encodeURIComponent(cleanScopusId)})&count=${countPerPage}&start=${startIndex}`;
      const res = await fetch(apiUrl, {
        headers: {
          'X-ELS-APIKey': apiKey,
          'Accept': 'application/json'
        }
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const errMsg = errJson?.['service-error']?.status?.statusText || res.statusText || 'Scopus Search API request failed';
        return { success: false, error: `Scopus Search API error: ${errMsg}` };
      }

      const searchData = await res.json();
      const searchResults = searchData?.['search-results'];
      totalResults = parseInt(searchResults?.['opensearch:totalResults'] || '0', 10);

      const entries = searchResults?.entry || [];
      if (Array.isArray(entries)) {
        const validEntries = entries.filter((e: any) => e && !e.error && e.eid);
        allEntries.push(...validEntries);
        if (validEntries.length === 0) break;
      } else {
        break;
      }

      startIndex += countPerPage;
    } while (allEntries.length < totalResults && startIndex < 1000);

    const nowIso = new Date().toISOString();

    const publications: ScopusPublication[] = [];
    const springerApiKey = process.env.SPRINGER_API_KEY;

    const isPlaceholderDate = (cDate?: string): boolean => {
      if (!cDate) return true;
      const parts = cDate.split('-');
      if (parts.length < 2) return true;
      const monthNum = parseInt(parts[1], 10);
      const dayNum = parts.length >= 3 ? parseInt(parts[2], 10) : null;
      return (monthNum === 1 && dayNum === 1) || (monthNum === 12 && dayNum === 31);
    };

    for (const entry of allEntries) {
      const coverDate = entry['prism:coverDate'] || '';
      let pubYear = '';
      if (coverDate && coverDate.length >= 4) {
        pubYear = coverDate.substring(0, 4);
      }

      const docId = entry.eid ? entry.eid.replace(/^2-s2\.0-/, '') : '';
      let scopusUrl = docId ? `https://www.scopus.com/pages/publications/${docId}?origin=resultslist` : `https://www.scopus.com/record/display.uri?eid=${entry.eid || ''}`;
      if (Array.isArray(entry.link)) {
        const scopusLinkObj = entry.link.find((l: any) => l['@rel'] === 'scopus');
        if (scopusLinkObj?.['@href']) {
          const href = scopusLinkObj['@href'];
          const m = href.match(/pages\/publications\/(\d+)/i) || href.match(/eid=2-s2\.0-(\d+)/i);
          if (m && m[1]) {
            scopusUrl = `https://www.scopus.com/pages/publications/${m[1]}?origin=resultslist`;
          } else {
            scopusUrl = href;
          }
        }
      }

      let authorsStr = '';
      if (Array.isArray(entry.author)) {
        authorsStr = entry.author
          .map((a: any) => a['given-name'] ? `${a['given-name']} ${a['surname'] || ''}` : (a['authname'] || ''))
          .filter(Boolean)
          .join(', ');
      } else if (entry['dc:creator']) {
        authorsStr = entry['dc:creator'];
      }

      const rawSubtype = entry['subtypeDescription'] || entry['subtype'] || '';
      const rawAgg = entry['prism:aggregationType'] || '';
      const formattedType = formatScopusDocumentType(rawSubtype, rawAgg);

      const rawOa = entry['openaccess'] ?? entry['openaccessFlag'];
      const isOpenAccess = String(rawOa) === '1' || String(rawOa) === 'true';
      const oaStatusStr = entry['openaccessStatus'] || (isOpenAccess ? 'Open Access' : 'Subscribed');

      const journalName = entry['prism:publicationName'] || '';
      const citationCount = parseInt(entry['citedby-count'] || '0', 10);
      const quartile = estimateQuartile(citationCount, pubYear, journalName, entry['quartile']);

      const fundingSponsor = entry['fund-sponsor'] || entry['grant-sponsor'] || entry['fund-no'] || undefined;

      let isPuNameInPublication = false;
      const affilData = entry['affiliation'];
      if (affilData) {
        if (Array.isArray(affilData)) {
          isPuNameInPublication = affilData.some((a: any) => {
            const name = typeof a === 'string' ? a : (a['affilname'] || a['affiliation-name'] || a['$'] || '');
            return name.toLowerCase().includes('parul');
          });
        } else if (typeof affilData === 'object') {
          const name = (affilData['affilname'] || affilData['affiliation-name'] || affilData['$'] || '').toLowerCase();
          isPuNameInPublication = name.includes('parul');
        } else if (typeof affilData === 'string') {
          isPuNameInPublication = affilData.toLowerCase().includes('parul');
        }
      }

      const doi = entry['prism:doi'] || '';
      const publisher = entry['dc:publisher'] || entry['publisher'] || entry['prism:publisher'] || undefined;

      let finalCoverDate = coverDate;
      let finalPubYear = pubYear;

      const isSpringer = (publisher || '').toLowerCase().includes('springer') ||
        (journalName || '').toLowerCase().includes('springer') ||
        doi.startsWith('10.1007') ||
        doi.startsWith('10.1186') ||
        doi.startsWith('10.1038') ||
        doi.startsWith('10.2165');

      if (isSpringer && doi && springerApiKey) {
        try {
          const springerUrl = `https://api.springernature.com/meta/v2/json?q=doi:${encodeURIComponent(doi)}&api_key=${springerApiKey}`;
          const springerResponse = await fetch(springerUrl);
          if (springerResponse.ok) {
            const springerData = await springerResponse.json();
            if (springerData.records && springerData.records.length > 0) {
              const record = springerData.records[0];
              let targetDate = record.publicationDate;
              if (!targetDate || isPlaceholderDate(targetDate)) {
                if (record.onlineDate && !isPlaceholderDate(record.onlineDate)) {
                  targetDate = record.onlineDate;
                }
              }
              if (!targetDate) {
                targetDate = record.onlineDate || record.printDate || record.coverDate;
              }
              if (targetDate) {
                if (targetDate.length === 7 && targetDate.includes('-')) {
                  targetDate = `${targetDate}-15`;
                }
                finalCoverDate = targetDate;
                const dateParts = targetDate.split('-');
                if (dateParts[0] && dateParts[0].length === 4) {
                  finalPubYear = dateParts[0];
                }
              }
            }
          }
        } catch (err) {
          console.warn(`Failed to fetch Springer metadata for DOI ${doi}:`, err);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      publications.push({
        eid: entry.eid || entry['dc:identifier'] || Math.random().toString(),
        title: entry['dc:title'] || 'Untitled',
        journalName: entry['prism:publicationName'] || '',
        coverDate: finalCoverDate,
        publicationYear: finalPubYear,
        doi,
        scopusUrl,
        citationCount,
        authors: authorsStr,
        aggregationType: rawAgg,
        subtypeDescription: formattedType,
        volume: entry['prism:volume'] || '',
        issue: entry['prism:issueIdentifier'] || '',
        pageRange: entry['prism:pageRange'] || '',
        issn: entry['prism:issn'] || entry['prism:eIssn'] || '',
        fetchedAt: nowIso,
        openAccess: isOpenAccess,
        openAccessStatus: oaStatusStr,
        quartile,
        fundingSponsor,
        publisher,
        isPuNameInPublication,
      });
    }

    // Compute author-level co-author & timeline metrics
    const coAuthorCount = extractUniqueCoAuthorsCount(publications);
    const timeline = computeCareerTimeline(publications);

    // Try fetching author profile metrics (h-index & subject areas) strictly from Scopus Author API
    let authorHIndex: number | undefined = undefined;
    let subjectAreas: { name: string; count: number }[] = [];
    let nameVariants: string[] = [];
    let scopusAffiliations: { name: string; city?: string; country?: string; current?: boolean }[] = [];
    let scopusOrcid: string | undefined = undefined;

    try {
      const authorApiUrl = `https://api.elsevier.com/content/author/author_id/${encodeURIComponent(cleanScopusId)}?view=ENHANCED`;
      const authorRes = await fetch(authorApiUrl, {
        headers: { 'X-ELS-APIKey': apiKey, Accept: 'application/json' }
      });
      if (authorRes.ok) {
        const authorJson = await authorRes.json();
        const resp = Array.isArray(authorJson?.['author-retrieval-response'])
          ? authorJson?.['author-retrieval-response']?.[0]
          : (authorJson?.['author-retrieval-response'] || authorJson?.['author-retrieval-response-list']?.['author-retrieval-response']?.[0]);

        const hIdxStr = resp?.['h-index'] || resp?.coredata?.['h-index'];
        if (hIdxStr) {
          const parsedH = parseInt(hIdxStr, 10);
          if (!isNaN(parsedH)) authorHIndex = parsedH;
        }

        scopusOrcid = resp?.['coredata']?.['orcid'] || resp?.['orcid'] || undefined;

        // Name Variants
        const nameVarData = resp?.['author-profile']?.['name-variant'] || resp?.['name-variant'];
        if (nameVarData) {
          const nvList = Array.isArray(nameVarData) ? nameVarData : [nameVarData];
          nvList.forEach((nv: any) => {
            const given = nv['given-name'] || nv['initials'] || '';
            const surname = nv['surname'] || '';
            const full = `${given} ${surname}`.trim();
            if (full && full.toLowerCase() !== 'director rdc' && !nameVariants.includes(full)) nameVariants.push(full);
          });
        }

        // Affiliations
        const currAff = resp?.['author-profile']?.['affiliation-current']?.['affiliation'] || resp?.['affiliation-current'];
        if (currAff) {
          const cList = Array.isArray(currAff) ? currAff : [currAff];
          cList.forEach((ca: any) => {
            const affName = ca['ip-doc']?.['afdispname'] || ca['affiliation-name'] || ca['$'];
            const city = ca['ip-doc']?.['address']?.['city'] || ca['affiliation-city'];
            const country = ca['ip-doc']?.['address']?.['country'] || ca['affiliation-country'];
            if (affName && !scopusAffiliations.some(a => a.name === affName)) {
              scopusAffiliations.push({ name: affName, city, country, current: true });
            }
          });
        }

        const histAff = resp?.['author-profile']?.['affiliation-history']?.['affiliation'] || resp?.['affiliation-history'];
        if (histAff) {
          const hList = Array.isArray(histAff) ? histAff : [histAff];
          hList.forEach((ha: any) => {
            const affName = ha['ip-doc']?.['afdispname'] || ha['affiliation-name'] || ha['$'];
            const city = ha['ip-doc']?.['address']?.['city'] || ha['affiliation-city'];
            const country = ha['ip-doc']?.['address']?.['country'] || ha['affiliation-country'];
            if (affName && !scopusAffiliations.some(a => a.name === affName)) {
              scopusAffiliations.push({ name: affName, city, country, current: false });
            }
          });
        }

        const saData = resp?.['subject-areas']?.['subject-area'] || resp?.['subject-areas'];
        if (saData) {
          const saList = Array.isArray(saData) ? saData : [saData];
          subjectAreas = saList.map((sa: any) => {
            const rawName = sa['$'] || sa['@name'] || sa['name'];
            const abbrev = sa['@abbrev'] || sa['abbrev'];
            const count = parseInt(sa['@frequency'] || sa['@count'] || sa['frequency'] || '0', 10);
            return {
              name: resolveSubjectAreaName(rawName, abbrev),
              count: isNaN(count) ? 0 : count
            };
          }).filter((sa: any) => sa.name && sa.name !== 'General Research');
        }

      }
    } catch (e) {
      console.warn('Could not fetch Scopus Author profile metrics:', e);
    }

    const topCoAuthors = extractTopCoAuthors(publications, undefined, 8);

    const updateData: Record<string, any> = {
      scopusPublications: publications,
      scopusLastFetchedAt: nowIso,
      scopusCoAuthorCount: coAuthorCount,
      scopusTopCoAuthors: topCoAuthors,
    };

    if (scopusAffiliations.length > 0) {
      updateData.scopusAffiliations = scopusAffiliations;
    }
    if (nameVariants.length > 0) {
      updateData.scopusNameVariants = nameVariants;
    }
    if (scopusOrcid) {
      updateData.orcidId = scopusOrcid;
    }

    if (timeline.startYear) {
      updateData.scopusCareerStartYear = timeline.startYear;
    }
    if (authorHIndex !== undefined) {
      updateData.scopusHIndex = authorHIndex;
      updateData.hIndex = authorHIndex;
    }
    if (subjectAreas.length > 0) {
      updateData.scopusSubjectAreas = subjectAreas;
    }

    // Save to Firestore
    await adminDb.collection('users').doc(targetUserId).update(updateData);

    // Send email notification to Helpdesk
    try {
      const targetUserSnap = await adminDb.collection('users').doc(targetUserId).get();
      const targetUserData = targetUserSnap.data();

      if (targetUserData) {
        const isGoa = targetUserData.campus === 'Goa';
        const profilePath = isGoa ? `/goa/${targetUserData.misId}` : `/profile/${targetUserData.misId}`;
        const profileLink = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://rms.paruluniversity.ac.in'}${profilePath}`;

        const emailHtml = `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333333; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
            <div style="text-align: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #e2e8f0;">
              <img src="https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/RDC-PU-LOGO-BLACK.svg" alt="RDC Logo" style="max-width: 250px; height: auto;" />
            </div>
            <h2 style="color: #1e3a8a; text-align: center; margin-top: 0; font-size: 20px;">Scopus Profile Sync Notification</h2>
            <p>Dear Support Team,</p>
            <p>A user has successfully fetched and synchronized their publications from Scopus. Below are the details:</p>
            
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; margin-bottom: 20px;">
              <h3 style="color: #1e3a8a; margin-top: 0; font-size: 16px; border-bottom: 1px solid #cbd5e1; padding-bottom: 5px;">User Details</h3>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr>
                  <td style="padding: 6px 0; font-weight: bold; color: #475569; width: 120px;">Name:</td>
                  <td style="padding: 6px 0; color: #0f172a;">${targetUserData.name || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-weight: bold; color: #475569;">Email:</td>
                  <td style="padding: 6px 0; color: #0f172a;">${targetUserData.email || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-weight: bold; color: #475569;">MIS ID:</td>
                  <td style="padding: 6px 0; color: #0f172a;">${targetUserData.misId || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-weight: bold; color: #475569;">Campus:</td>
                  <td style="padding: 6px 0; color: #0f172a;">${targetUserData.campus || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-weight: bold; color: #475569;">Department:</td>
                  <td style="padding: 6px 0; color: #0f172a;">${targetUserData.department || 'N/A'}</td>
                </tr>
              </table>
            </div>

            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; margin-bottom: 20px;">
              <h3 style="color: #1e3a8a; margin-top: 0; font-size: 16px; border-bottom: 1px solid #cbd5e1; padding-bottom: 5px;">Scopus Sync Summary</h3>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <tr>
                  <td style="padding: 6px 0; font-weight: bold; color: #475569; width: 120px;">Scopus ID:</td>
                  <td style="padding: 6px 0; color: #0f172a; font-family: monospace;">${scopusId}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-weight: bold; color: #475569;">Publications:</td>
                  <td style="padding: 6px 0; color: #0f172a;"><strong>${publications.length}</strong> items synced</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-weight: bold; color: #475569;">H-Index:</td>
                  <td style="padding: 6px 0; color: #0f172a;">${authorHIndex ?? 'N/A'}</td>
                </tr>
                ${scopusAffiliations && scopusAffiliations.length > 0 ? `
                <tr>
                  <td style="padding: 6px 0; font-weight: bold; color: #475569; vertical-align: top;">Affiliation:</td>
                  <td style="padding: 6px 0; color: #0f172a;">${scopusAffiliations[0].name}${scopusAffiliations[0].city ? `, ${scopusAffiliations[0].city}` : ''}</td>
                </tr>` : ''}
              </table>
            </div>

            <div style="text-align: center; margin: 25px 0;">
              <a href="${profileLink}" target="_blank" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block;">
                View User Profile on Portal
              </a>
            </div>

            <p style="color: #475569; font-size: 12px; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center;">
              This is a system generated automatic email. Please contact the R&D Cell for any queries.
            </p>
          </div>
        `;

        await sendEmail({
          to: 'helpdesk.rdc@paruluniversity.ac.in',
          subject: `Scopus Profile Synced: ${targetUserData.name || 'User'} (${targetUserData.misId || 'N/A'})`,
          html: emailHtml,
          from: 'default',
          category: 'Other'
        });
      }
    } catch (emailErr) {
      console.error('Failed to send Scopus sync email notification:', emailErr);
    }

    return {
      success: true,
      count: publications.length,
      publications,
      lastFetchedAt: nowIso,
      hIndex: authorHIndex,
      subjectAreas,
      coAuthorCount,
      careerStartYear: timeline.startYear,
      scopusAffiliations,
      scopusNameVariants: nameVariants,
      topCoAuthors,
      orcidId: scopusOrcid,
    };



  } catch (error: any) {
    console.error('Error fetching Scopus publications by author ID:', error);
    return { success: false, error: error.message || 'An error occurred while fetching Scopus publications.' };
  }
}

export async function updateUserResearcherIdsAction(
  targetUserId: string,
  scopusId: string,
  googleScholarId: string,
  callerUid: string,
): Promise<{ success: boolean; error?: string }> {
  if (!targetUserId || !callerUid) {
    return { success: false, error: 'Missing required parameters (targetUserId or callerUid).' };
  }

  try {
    // 1. Authorization check: caller must be a Super-admin
    const callerSnap = await adminDb.collection('users').doc(callerUid).get();
    if (!callerSnap.exists) {
      return { success: false, error: 'Caller user record not found.' };
    }
    const callerData = callerSnap.data();
    const isSuperAdmin =
      callerData?.role === 'Super-admin' ||
      callerData?.designation === 'Super-admin' ||
      callerData?.role?.toLowerCase() === 'super-admin' ||
      callerData?.designation?.toLowerCase() === 'super-admin';

    if (!isSuperAdmin) {
      return { success: false, error: 'Permission denied: Only Super Admins can update researcher IDs.' };
    }

    // 2. Update Firestore
    const updateData: Record<string, any> = {
      scopusId: scopusId ? scopusId.trim() : '',
      googleScholarId: googleScholarId ? googleScholarId.trim() : '',
    };

    await adminDb.collection('users').doc(targetUserId).update(updateData);

    return { success: true };
  } catch (error: any) {
    console.error('Error updating researcher IDs:', error);
    return { success: false, error: error.message || 'An error occurred while updating researcher IDs.' };
  }
}

export async function fetchParulUniversityTopCitedScopusPublicationsAction(
  limit: number = 20,
  year?: string,
  affiliationQuery?: string
): Promise<{
  success: boolean;
  publications?: ScopusPublication[];
  totalResults?: number;
  isLiveApi?: boolean;
  error?: string;
}> {
  const apiKey = process.env.SCOPUS_API_KEY;
  if (apiKey) {
    try {
      // AFFILORG / AFFIL searches explicitly for documents where Parul University Goa is listed in document affiliation
      const fetchCount = Math.min(25, Math.max(limit, 25));
      let isAcademicYear = false;
      let ayStart = '';
      let ayEnd = '';
      let rawQuery = affiliationQuery || 'AFFILORG("Parul University Goa") OR AFFIL("Parul University Goa")';

      if (year && year !== 'all') {
        const ayMatch = year.match(/^AY-(\d{4})-(\d{4})$/);
        if (ayMatch) {
          isAcademicYear = true;
          const startYr = parseInt(ayMatch[1], 10);
          const endYr = parseInt(ayMatch[2], 10);
          ayStart = `${startYr}-06-01`;
          ayEnd = `${endYr}-05-31`;
          rawQuery = `(${rawQuery}) AND (PUBYEAR IS ${startYr} OR PUBYEAR IS ${endYr})`;
        } else {
          rawQuery = `(${rawQuery}) AND PUBYEAR IS ${year}`;
        }
      }

      const query = encodeURIComponent(rawQuery);
      const apiUrl = `https://api.elsevier.com/content/search/scopus?query=${query}&sort=-citedby-count&count=${fetchCount}&start=0`;
      const res = await fetch(apiUrl, {
        headers: {
          'X-ELS-APIKey': apiKey,
          'Accept': 'application/json'
        }
      });

      if (res.ok) {
        const searchData = await res.json();
        const searchResults = searchData?.['search-results'];
        const totalResults = parseInt(searchResults?.['opensearch:totalResults'] || '0', 10);
        const entries = searchResults?.entry || [];
        if (Array.isArray(entries) && entries.length > 0) {
          let publicationsList: ScopusPublication[] = entries
            .filter((e: any) => e && !e.error && (e.eid || e['dc:title']))
            .map((entry: any) => {
              const coverDate = entry['prism:coverDate'] || '';
              let pubYear = '';
              if (coverDate && coverDate.length >= 4) {
                pubYear = coverDate.substring(0, 4);
              }

              const docId = entry.eid ? entry.eid.replace(/^2-s2\.0-/, '') : '';
              let scopusUrl = docId ? `https://www.scopus.com/pages/publications/${docId}?origin=resultslist` : `https://www.scopus.com/record/display.uri?eid=${entry.eid || ''}`;
              if (Array.isArray(entry.link)) {
                const scopusLinkObj = entry.link.find((l: any) => l['@rel'] === 'scopus');
                if (scopusLinkObj?.['@href']) {
                  const href = scopusLinkObj['@href'];
                  const m = href.match(/pages\/publications\/(\d+)/i) || href.match(/eid=2-s2\.0-(\d+)/i);
                  if (m && m[1]) {
                    scopusUrl = `https://www.scopus.com/pages/publications/${m[1]}?origin=resultslist`;
                  } else {
                    scopusUrl = href;
                  }
                }
              }

              let authorsStr = '';
              if (Array.isArray(entry.author)) {
                authorsStr = entry.author
                  .map((a: any) => {
                    if (a['given-name'] || a['surname']) {
                      return `${a['given-name'] || ''} ${a['surname'] || ''}`.trim();
                    }
                    return a['authname'] || a['$'] || '';
                  })
                  .filter(Boolean)
                  .join(', ');
              } else if (typeof entry.author === 'string') {
                authorsStr = entry.author;
              } else if (entry['dc:creator']) {
                authorsStr = entry['dc:creator'];
              }

              const rawSubtype = entry['subtypeDescription'] || entry['subtype'] || '';
              const rawAgg = entry['prism:aggregationType'] || '';
              const formattedType = formatScopusDocumentType(rawSubtype, rawAgg);

              const rawOa = entry['openaccess'] ?? entry['openaccessFlag'];
              const isOpenAccess = String(rawOa) === '1' || String(rawOa) === 'true';
              const oaStatusStr = entry['openaccessStatus'] || (isOpenAccess ? 'Open Access' : 'Subscribed');

              const journalName = entry['prism:publicationName'] || '';
              const citationCount = parseInt(entry['citedby-count'] || entry['citedbyCount'] || entry['cited-by-count'] || '0', 10);
              const quartile = estimateQuartile(citationCount, pubYear, journalName, entry['quartile']);

              return {
                eid: entry.eid || entry['dc:identifier'] || Math.random().toString(),
                title: entry['dc:title'] || 'Untitled',
                journalName,
                coverDate,
                publicationYear: pubYear,
                doi: entry['prism:doi'] || '',
                scopusUrl,
                authors: authorsStr || 'Parul University Goa Researchers',
                citationCount,
                subtypeDescription: formattedType,
                aggregationType: rawAgg,
                openAccess: isOpenAccess,
                openAccessStatus: oaStatusStr,
                quartile: quartile || undefined,
                volume: entry['prism:volume'],
                issueIdentifier: entry['prism:issueIdentifier'],
                pageRange: entry['prism:pageRange'],
                issn: entry['prism:issn'],
                isPuNameInPublication: true,
              };
            });

          if (isAcademicYear) {
            publicationsList = publicationsList.filter(p => {
              if (!p.coverDate) return true;
              return p.coverDate >= ayStart && p.coverDate <= ayEnd;
            });
          }

          const publications = publicationsList
            .sort((a, b) => (b.citationCount || 0) - (a.citationCount || 0))
            .slice(0, limit);

          // Enrich full author names via Crossref / Scopus Abstract retrieval
          await Promise.all(
            publications.map(async (pub) => {
              let fullAuthors: string[] = [];
              if (pub.doi) {
                try {
                  const crRes = await fetch(`https://api.crossref.org/works/${encodeURIComponent(pub.doi)}`, {
                    headers: { 'Accept': 'application/json' },
                  });
                  if (crRes.ok) {
                    const crData = await crRes.json();
                    const authorArr = crData.message?.author || [];
                    fullAuthors = authorArr.map((a: any) => {
                      if (a.given && a.family) return `${a.given} ${a.family}`.trim();
                      if (a.family) return a.family;
                      if (a.name) return a.name;
                      return '';
                    }).filter(Boolean);
                  }
                } catch (e) {
                  // Fall back to Scopus abstract
                }
              }

              if (fullAuthors.length === 0 && pub.eid && pub.eid.includes('2-s2.0-')) {
                try {
                  const absRes = await fetch(`https://api.elsevier.com/content/abstract/eid/${pub.eid}`, {
                    headers: { 'X-ELS-APIKey': apiKey, 'Accept': 'application/json' },
                  });
                  if (absRes.ok) {
                    const absData = await absRes.json();
                    const creator = absData?.['abstracts-retrieval-response']?.coredata?.['dc:creator'];
                    const authorsArr = Array.isArray(creator?.author)
                      ? creator.author
                      : creator?.author ? [creator.author] : [];
                    if (authorsArr.length > 0) {
                      fullAuthors = authorsArr.map((a: any) => {
                        const given = a['ce:given-name'] || a['given-name'] || '';
                        const surname = a['ce:surname'] || a['surname'] || '';
                        if (given || surname) return `${given} ${surname}`.trim();
                        return a['ce:indexed-name'] || a['authname'] || a['$'] || '';
                      }).filter(Boolean);
                    }
                  }
                } catch (e) {
                  // Keep search entry author string if abstract call fails
                }
              }

              if (fullAuthors.length > 0) {
                const displayAuthors = fullAuthors.slice(0, 10);
                pub.authors = displayAuthors.join(', ') + (fullAuthors.length > 10 ? ` et al. (+${fullAuthors.length - 10} more)` : '');
              }
            })
          );

          return {
            success: true,
            publications,
            totalResults,
            isLiveApi: true
          };
        }
      }
    } catch (err) {
      console.warn('Scopus API fetch failed for Parul University Goa top cited, attempting DB fallback:', err);
    }
  }

  // Fallback: Query all users' synced Scopus publications & incentive claims from Firestore
  try {
    const allPubsMap = new Map<string, ScopusPublication>();

    const usersSnap = await adminDb.collection('users').get();
    usersSnap.docs.forEach(doc => {
      const data = doc.data();
      if (Array.isArray(data.scopusPublications)) {
        data.scopusPublications.forEach((pub: ScopusPublication) => {
          if (pub && pub.title) {
            // Exclude only if explicitly marked as false for Parul University affiliation
            if (pub.isPuNameInPublication === false) return;

            const count = typeof pub.citationCount === 'number'
              ? pub.citationCount
              : parseInt((pub as any).citations || (pub as any).citedbyCount || (pub as any).citedByCount || '0', 10) || 0;

            let authorsStr = pub.authors || '';
            if (!authorsStr && Array.isArray((pub as any).authorList)) {
              authorsStr = (pub as any).authorList.map((a: any) => typeof a === 'string' ? a : (a.name || a.authorName || '')).filter(Boolean).join(', ');
            }
            if (!authorsStr && data.name) {
              authorsStr = data.name;
            }

            const cleanedPub: ScopusPublication = {
              ...pub,
              authors: authorsStr || pub.authors || 'Parul University Goa Researchers',
              citationCount: count,
              isPuNameInPublication: true,
            };

            const key = pub.eid || pub.doi || pub.title.toLowerCase().trim();
            if (!allPubsMap.has(key)) {
              allPubsMap.set(key, cleanedPub);
            } else {
              const existing = allPubsMap.get(key)!;
              const existingAuthors = (existing.authors || '').split(/,\s*/).filter(Boolean);
              const newAuthors = (cleanedPub.authors || '').split(/,\s*/).filter(Boolean);
              const bestAuthors = newAuthors.length > existingAuthors.length ? cleanedPub.authors : existing.authors;
              const maxCount = Math.max(existing.citationCount || 0, count);
              allPubsMap.set(key, {
                ...existing,
                citationCount: maxCount,
                authors: bestAuthors,
              });
            }
          }
        });
      }
    });

    const claimsSnap = await adminDb.collection('incentiveClaims').get();
    claimsSnap.docs.forEach(doc => {
      const claim = doc.data();
      if (claim && (claim.paperTitle || claim.title)) {
        // Only exclude if explicitly marked as false
        if (claim.isPuNameInPublication === false) return;

        const title = claim.paperTitle || claim.title;
        const key = claim.doi || title.toLowerCase().trim();
        const count = typeof claim.citationCount === 'number'
          ? claim.citationCount
          : parseInt(claim.citations || claim.scopusCitations || claim.citedbyCount || '0', 10) || 0;

        let authorsStr = '';
        if (Array.isArray(claim.authors) && claim.authors.length > 0) {
          authorsStr = claim.authors.map((a: any) => typeof a === 'string' ? a : (a.name || a.authorName || a.fullName || '')).filter(Boolean).join(', ');
        } else if (claim.authorName) {
          authorsStr = claim.authorName;
        } else if (claim.allAuthors) {
          authorsStr = claim.allAuthors;
        }

        const claimPub: ScopusPublication = {
          eid: claim.eid || key,
          title,
          journalName: claim.journalName || claim.journal || '',
          publicationYear: claim.publicationYear || claim.year || '',
          doi: claim.doi || '',
          scopusUrl: claim.scopusLink || claim.relevantLink || '',
          authors: authorsStr || claim.userName || 'Parul University Goa Researchers',
          citationCount: count,
          isPuNameInPublication: true,
        };

        if (!allPubsMap.has(key)) {
          allPubsMap.set(key, claimPub);
        } else {
          const existing = allPubsMap.get(key)!;
          const existingAuthors = (existing.authors || '').split(/,\s*/).filter(Boolean);
          const newAuthors = (authorsStr || '').split(/,\s*/).filter(Boolean);
          const bestAuthors = newAuthors.length > existingAuthors.length ? authorsStr : existing.authors;
          const maxCount = Math.max(existing.citationCount || 0, count);
          allPubsMap.set(key, {
            ...existing,
            citationCount: maxCount,
            authors: bestAuthors || existing.authors,
          });
        }
      }
    });

    let publicationsList = Array.from(allPubsMap.values());
    if (year && year !== 'all') {
      const ayMatch = year.match(/^AY-(\d{4})-(\d{4})$/);
      if (ayMatch) {
        const startYr = ayMatch[1];
        const endYr = ayMatch[2];
        const startDate = `${startYr}-06-01`;
        const endDate = `${endYr}-05-31`;
        publicationsList = publicationsList.filter(p => {
          if (p.coverDate) return p.coverDate >= startDate && p.coverDate <= endDate;
          const y = p.publicationYear;
          return y === startYr || y === endYr;
        });
      } else {
        publicationsList = publicationsList.filter(p => {
          const y = p.publicationYear || (p.coverDate ? p.coverDate.substring(0, 4) : '');
          return y === year;
        });
      }
    }

    const publications = publicationsList
      .sort((a, b) => (b.citationCount || 0) - (a.citationCount || 0))
      .slice(0, limit);

    return {
      success: true,
      publications,
      totalResults: publications.length,
      isLiveApi: false
    };
  } catch (err: any) {
    console.error('Error fetching fallback top cited Scopus publications:', err);
    return {
      success: false,
      error: err.message || 'Failed to fetch top cited Scopus publications.'
    };
  }
}

export const fetchParulUniversityGoaTopCitedScopusPublicationsAction = fetchParulUniversityTopCitedScopusPublicationsAction;

