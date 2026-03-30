
'use server';

import type { IncentiveClaim } from '@/types';

function calculateQuartile(percentile: number): 'Q1' | 'Q2' | 'Q3' | 'Q4' | undefined {
    if (percentile >= 75) return 'Q1';
    if (percentile >= 50) return 'Q2';
    if (percentile >= 25) return 'Q3';
    if (percentile >= 0) return 'Q4';
    return undefined;
}

export async function fetchAdvancedScopusData(
  identifier: string, // Can be a URL or just a DOI
  claimantName: string,
): Promise<{
  success: boolean
  data?: {
    paperTitle: string;
    journalName: string;
    publicationMonth: string;
    publicationYear: string;
    isPuNameInPublication?: boolean;
    printIssn?: string;
    electronicIssn?: string;
    journalWebsite?: string;
    publicationType?: string;
    journalClassification?: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  }
  error?: string
  warning?: string
  claimantIsAuthor?: boolean
}> {
  const apiKey = process.env.SCOPUS_API_KEY
  if (!apiKey) {
    console.error("Scopus API key is not configured.")
    return { success: false, error: "Scopus integration is not configured on the server." }
  }

  let apiUrl = '';
  const eidMatch = identifier.match(/eid=([^&]+)/);
  const doiMatch = identifier.match(/(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i);

  if (eidMatch && eidMatch[1]) {
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
        const errorData = await response.json();
        const errorMessage = errorData?.['service-error']?.status?.statusText || response.statusText || "The resource specified cannot be found.";
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

    const sourceId = coredata['source-id'];
    if (sourceId) {
        try {
            const serialApiUrl = `https://api.elsevier.com/content/serial/title/source_id/${sourceId}?apiKey=${apiKey}&view=ENHANCED`;
            const serialResponse = await fetch(serialApiUrl, { headers: { Accept: "application/json" } });
            if (serialResponse.ok) {
                const serialData = await serialResponse.json();
                const serialTitleResponse = serialData?.['serial-title-response']?.[0];
                const citeScoreInfo = serialTitleResponse?.citeScoreYearInfoList;

                if (citeScoreInfo?.citeScoreTracker && citeScoreInfo?.citeScoreCurrentMetric) {
                     const percentile = parseFloat(citeScoreInfo.citeScoreTracker);
                     if (!isNaN(percentile)) {
                        journalClassification = calculateQuartile(percentile);
                     } else {
                        warning = 'Could not parse percentile from Scopus to determine Q rating.';
                     }
                } else {
                    warning = 'Q rating information was not available in the Scopus response for this journal.';
                }
            } else {
                 warning = `Could not fetch Q rating details. Scopus returned status: ${serialResponse.status}`;
                 console.warn(`Scopus Serial API failed with status: ${serialResponse.status}`);
            }
        } catch (serialError) {
            warning = 'Could not fetch journal Q rating due to a network error. Please enter it manually.';
            console.warn("Could not fetch journal Q rating from Scopus Serial API, but proceeding without it.", serialError);
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


    return {
      success: true,
      data: {
        paperTitle,
        journalName,
        publicationMonth,
        publicationYear,
        isPuNameInPublication,
        printIssn: printIssn || '',
        electronicIssn: electronicIssn || '',
        journalWebsite: journalWebsite || '',
        publicationType,
        journalClassification,
      },
      warning,
    }
  } catch (error: any) {
    console.error("Error calling Scopus API:", error)
    return { success: false, error: error.message || "An unexpected error occurred while fetching Scopus data." }
  }
}
