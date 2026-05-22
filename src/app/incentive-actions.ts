'use server';

import { adminDb, adminRtdb } from '@/lib/admin';
import { getIncentiveClaimByIdCombined, getStaticFirestoreClaims } from '@/lib/incentive-data-admin';
import { normalizeClaimFromRtdb } from '@/lib/rtdb-utils';
import type { IncentiveClaim, User } from '@/types';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { getTemplateContentFromUrl } from '@/lib/template-manager';
import { format } from 'date-fns';
import { getSystemSettings } from '@/services/system-service';
import { unstable_cache } from 'next/cache';

export async function generateBookIncentiveForm(claimId: string): Promise<{ success: boolean; fileData?: string; error?: string }> {
  try {
    const claim = await getIncentiveClaimByIdCombined(claimId);
    if (!claim) {
      return { success: false, error: 'Incentive claim not found.' };
    }

    let userRef;
    let userSnap;
    // If it's a co-author claim, fetch the current applicant's details. Otherwise, fetch the original claimant's.
    if (claim.originalClaimId) {
        userRef = adminDb.collection('users').doc(claim.uid);
    } else {
        userRef = adminDb.collection('users').doc(claim.uid);
    }
    
    userSnap = await userRef.get();

    if (!userSnap.exists) {
        return { success: false, error: 'Claimant user profile not found.' };
    }
    const user = userSnap.data() as User;
    
    const settings = await getSystemSettings();
    const templateName = claim.bookApplicationType === 'Book Chapter' 
        ? 'INCENTIVE_BOOK_CHAPTER' 
        : 'INCENTIVE_BOOK_PUBLICATION';
    
    const templateUrl = settings.templateUrls?.[templateName];

    if (!templateUrl) {
        return { success: false, error: `Template URL for ${templateName} not configured.` };
    }
    
    const content = await getTemplateContentFromUrl(templateUrl);
    if (!content) {
        return { success: false, error: `Template file ${templateName} not found or couldn't be loaded.` };
    }

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
    });

    const coAuthors = claim.authors?.filter(a => a.email !== user.email).map(a => a.name) || [];
    const coAuthorData: { [key: string]: string } = {};
    for (let i = 0; i < 6; i++) {
        coAuthorData[`coauthor${i + 1}`] = coAuthors[i] || '';
    }
    
    const internalAuthorsCount = claim.authors?.filter(a => !a.isExternal).length || 0;

    const data = {
        name: user.name, // Use the current applicant's name
        designation: user.designation || 'N/A',
        department: user.department || 'N/A',
        institute: user.institute || 'N/A',
        booktitle: claim.publicationTitle || claim.bookTitleForChapter,
        ...coAuthorData,
        authors_pu: internalAuthorsCount,
        applicant_type: claim.authorRole || 'N/A',
        total_chapters: claim.bookApplicationType === 'Book Chapter' ? 1 : (claim.bookTotalChapters || 'N/A'),
        total_pages: claim.bookTotalPages || claim.bookChapterPages || 'N/A',
        publication_year: claim.publicationYear,
        publisher_name: claim.publisherName,
        publisher_city: claim.publisherCity || 'N/A',
        publisher_country: claim.publisherCountry || 'N/A',
        publisher_type: claim.publisherType,
        print_isbn: claim.isbnPrint || 'N/A',
        electronic_isbn: claim.isbnElectronic || 'N/A',
        date: format(new Date(), 'dd/MM/yyyy'),
    };
    
    doc.setData(data);

    try {
      doc.render();
    } catch (error: any) {
      console.error('Docxtemplater render error:', error);
      return { success: false, error: 'Failed to render the document template.' };
    }

    const buf = doc.getZip().generate({ type: 'nodebuffer' });
    const base64 = buf.toString('base64');

    return { success: true, fileData: base64 };
  } catch (error: any) {
    console.error('Error generating book incentive form:', error);
    return { success: false, error: error.message || 'Failed to generate the form.' };
  }
}
/**
 * Fetches incentive claims from both Firestore and RTDB, merges them and applies role-based filtering.
 * This runs on the server to bypass RTDB security rule limitations for complex client-side queries.
 */
async function fetchAllClaimsInternal(user: User): Promise<IncentiveClaim[]> {
  if (!user) return [];

  try {
    const isAdmin = user.role === 'Super-admin' || user.role === 'admin';
    // Simplified approver check for server action context
    const isApprover = user.allowedModules?.some(m => m.startsWith('incentive-approver-'));
    
    // 1. Fetch from Firestore (via ultra-efficient 24-hour memory cache)
    let firestoreClaims: IncentiveClaim[] = [];
    const allStaticFirestoreClaims = await getStaticFirestoreClaims();

    if (isAdmin || isApprover) {
      firestoreClaims = allStaticFirestoreClaims;
    } else if (user.role === 'CRO') {
      firestoreClaims = allStaticFirestoreClaims.filter(c => (user.faculties || []).includes(c.faculty || ''));
    } else {
      // Regular user: owned + co-authored
      firestoreClaims = allStaticFirestoreClaims.filter(c =>
        c.uid === user.uid ||
        c.authorUids?.includes(user.uid) ||
        c.authorEmails?.includes(user.email.toLowerCase())
      );
    }

    // 2. Fetch from RTDB (targeted, structured queries based on role)
    let rtdbClaims: IncentiveClaim[] = [];

    const fetchPromises: Promise<any>[] = [
      adminRtdb.ref('incentiveClaims/active').get(),
      adminRtdb.ref('incentiveClaims/completed').get(),
      adminRtdb.ref('incentiveClaims').get()
    ];

    if (!isAdmin && !isApprover) {
      // Regular user: also fetch their own drafts directly
      fetchPromises.push(adminRtdb.ref(`incentiveClaims/drafts/${user.uid}`).get());
    }

    const snaps = await Promise.all(fetchPromises);
    const activeSnap = snaps[0];
    const completedSnap = snaps[1];
    const legacyRootSnap = snaps[2];
    const userDraftsSnap = (!isAdmin && !isApprover) ? snaps[3] : null;

    const parseClaimsNode = (snap: any, list: IncentiveClaim[]) => {
      if (snap && snap.exists()) {
        const val = snap.val();
        Object.keys(val).forEach(key => {
          list.push({ ...normalizeClaimFromRtdb(val[key]), id: key } as IncentiveClaim);
        });
      }
    };

    parseClaimsNode(activeSnap, rtdbClaims);
    parseClaimsNode(completedSnap, rtdbClaims);
    if (userDraftsSnap) {
      parseClaimsNode(userDraftsSnap, rtdbClaims);
    }

    if (legacyRootSnap && legacyRootSnap.exists()) {
      const legacyData = legacyRootSnap.val();
      Object.keys(legacyData).forEach(key => {
        if (key !== 'active' && key !== 'completed' && key !== 'drafts') {
          rtdbClaims.push({ ...normalizeClaimFromRtdb(legacyData[key]), id: key } as IncentiveClaim);
        }
      });
    }

    // Filter RTDB data
    if (isAdmin || isApprover) {
      // No filtering
    } else if (user.role === 'CRO') {
      rtdbClaims = rtdbClaims.filter(c => (user.faculties || []).includes(c.faculty || ''));
    } else {
      rtdbClaims = rtdbClaims.filter(c => 
        c.uid === user.uid || 
        c.authorUids?.includes(user.uid) || 
        c.authorEmails?.includes(user.email.toLowerCase())
      );
    }

    // 3. Merge (RTDB wins/overrides individual fields)
    const combinedMap = new Map<string, IncentiveClaim>();
    firestoreClaims.forEach(c => combinedMap.set(c.id, c));
    rtdbClaims.forEach(c => {
      const existing = combinedMap.get(c.id);
      combinedMap.set(c.id, {
        ...(existing || {}),
        ...c
      } as IncentiveClaim);
    });

    const mergedClaims = Array.from(combinedMap.values()).filter(c => {
      if (!c.uid) {
        console.warn(`⚠️ [fetchAllClaimsInternal] Skipping claim ${c.id} due to missing owner UID.`);
        return false;
      }
      return true;
    });

    return mergedClaims.sort((a, b) => {
      const dateA = new Date(a.submissionDate).getTime();
      const dateB = new Date(b.submissionDate).getTime();
      return dateB - dateA;
    });

  } catch (error) {
    console.error("Error in fetchAllClaimsInternal:", error);
    return [];
  }
}

export async function fetchAllClaimsAction(user: User): Promise<IncentiveClaim[]> {
  return fetchAllClaimsInternal(user);
}

export async function fetchPendingIncentiveApprovalsCountAction(user: User): Promise<number> {
  if (!user) return 0;

  const approverModule = user.allowedModules?.find((m) => m.startsWith('incentive-approver-'));
  const stageIndex = approverModule ? parseInt(approverModule.split('-')[2], 10) - 1 : null;
  if (stageIndex === null || Number.isNaN(stageIndex)) return 0;

  const statusToFetch = `Pending Stage ${stageIndex + 1} Approval`;
  const claims = await fetchAllClaimsInternal(user);
  let pendingClaims = claims.filter((claim) => claim.status === statusToFetch);

  if (stageIndex === 0) {
    const settings = await getSystemSettings();
    if (settings?.principalEmails) {
      const userEmailLower = user.email.toLowerCase();
      const principalInstitutes = Object.entries(settings.principalEmails)
        .filter(([_, email]) => email.toLowerCase() === userEmailLower)
        .map(([inst, _]) => inst);

      if (principalInstitutes.length > 0) {
        const claimantUids = Array.from(new Set(pendingClaims.map(c => c.uid)));
        if (claimantUids.length > 0) {
          const userSnapshots = await Promise.all(
            claimantUids.map(uid => adminDb.collection('users').doc(uid).get())
          );
          const uidToInstitute: Record<string, string> = {};
          userSnapshots.forEach(snap => {
            if (snap.exists) {
              uidToInstitute[snap.id] = snap.data()?.institute || '';
            }
          });
          pendingClaims = pendingClaims.filter(claim => 
            principalInstitutes.includes(uidToInstitute[claim.uid] || '')
          );
        } else {
          pendingClaims = [];
        }
      } else {
        pendingClaims = [];
      }
    } else {
      pendingClaims = [];
    }
  }

  return pendingClaims.length;
}

/**
 * Server action to fetch a single incentive claim by ID.
 * This is used by form components to safely load drafts from either RTDB or Firestore.
 */
export async function getIncentiveClaimByIdAction(claimId: string): Promise<{ success: boolean; data?: IncentiveClaim; error?: string }> {
  try {
    const claim = await getIncentiveClaimByIdCombined(claimId);
    if (!claim) {
      return { success: false, error: 'Incentive claim not found.' };
    }
    return { success: true, data: claim };
  } catch (error: any) {
    console.error(`Error in getIncentiveClaimByIdAction for ID ${claimId}:`, error);
    return { success: false, error: error.message || 'Failed to fetch incentive claim.' };
  }
}

function normalizeTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "") // Strip fullstops, commas, hyphens, colons, brackets, etc.
    .replace(/\s+/g, ""); // Strip all spaces/whitespace
}

function isConferenceClaim(claim: any): boolean {
  return typeof claim?.claimType === 'string' && claim.claimType.toLowerCase().includes('conference');
}

function getClaimTitles(claim: any): string[] {
  const titles: string[] = [];
  const fields = [
    claim.conferencePaperTitle,
    claim.paperTitle,
    claim.publicationTitle,
    claim.apcPaperTitle,
    claim.patentTitle,
    claim.awardTitle
  ];
  
  for (const field of fields) {
    if (field && typeof field === 'string' && field.trim()) {
      titles.push(normalizeTitle(field));
    }
  }
  
  return titles;
}

export async function checkDuplicateConferenceClaimAction(
  paperTitle: string,
  confName: string,
  claimId?: string | null,
  currentUid?: string
): Promise<{ success: boolean; isDuplicate: boolean; appliedBy?: string }> {
  console.log("⚙️ [Server Action] checkDuplicateConferenceClaimAction started with args:", {
    paperTitle,
    confName,
    claimId,
    currentUid
  });

  try {
    if (!paperTitle) {
      console.log("⚙️ [Server Action] Missing paperTitle, returning success: true, isDuplicate: false");
      return { success: true, isDuplicate: false };
    }

    // 1. Fetch from Firestore
    console.log("⚙️ [Server Action] Fetching claims from Firestore...");
    const claimsCollection = adminDb.collection('incentiveClaims');
    const firestoreSnapshot = await claimsCollection.get();
    const firestoreClaims = firestoreSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));

    // 2. Fetch from RTDB - need to get from all nested paths (active, completed, drafts)
    console.log("⚙️ [Server Action] Fetching claims from RTDB...");
    let rtdbClaims: any[] = [];
    
    const fetchRtdbPath = async (path: string) => {
      const snap = await adminRtdb.ref(path).get();
      const claims: any[] = [];
      if (snap.exists()) {
        const data = snap.val();
        if (typeof data === 'object') {
          Object.keys(data).forEach(key => {
            const val = data[key];
            claims.push({ ...normalizeClaimFromRtdb(val), id: key } as any);
          });
        }
      }
      return claims;
    };

    const [activeClaims, completedClaims, draftClaims] = await Promise.all([
      fetchRtdbPath('incentiveClaims/active'),
      fetchRtdbPath('incentiveClaims/completed'),
      fetchRtdbPath('incentiveClaims/drafts')
    ]);

    rtdbClaims = [...activeClaims, ...completedClaims, ...draftClaims];

    // 3. Merge claims (RTDB overrides Firestore if they share the same ID)
    const combinedMap = new Map<string, any>();
    firestoreClaims.forEach(c => combinedMap.set(c.id, c));
    rtdbClaims.forEach(c => {
      const existing = combinedMap.get(c.id);
      combinedMap.set(c.id, {
        ...(existing || {}),
        ...c
      });
    });

    const allClaims = Array.from(combinedMap.values());
    console.log(`⚙️ [Server Action] Found ${allClaims.length} total claims (Firestore + RTDB). Starting matching loop...`);

    const userTitleNormalized = normalizeTitle(paperTitle);
    console.log(`⚙️ [Server Action] User input normalized to: "${userTitleNormalized}"`);

    const conferenceClaimsFound = allClaims.filter(c => {
      const claimTypeStr = (c.claimType || '').toString().toLowerCase();
      return claimTypeStr.includes('conference');
    });
    console.log(`⚙️ [Server Action] Found ${conferenceClaimsFound.length} conference claims out of ${allClaims.length} total claims`);
    
    // Debug: log claim type distribution
    const claimTypeDistribution: Record<string, number> = {};
    for (const c of allClaims) {
      const type = c.claimType || 'UNDEFINED';
      claimTypeDistribution[type] = (claimTypeDistribution[type] || 0) + 1;
    }
    console.log(`⚙️ [Server Action] Claim type distribution:`, JSON.stringify(claimTypeDistribution));

    for (const claim of allClaims) {
      const claimTypeStr = (claim.claimType || '').toString().toLowerCase();
      if (!claimTypeStr.includes('conference')) {
        continue;
      }

      const matchDocId = claim.id;
      const matchStatus = claim.status || "";
      const matchUid = claim.uid || "";
      const matchUserName = claim.userName || "";

      // Gather and normalize all potential title fields from this claim
      const titlesToCheck = getClaimTitles(claim);
      const titleMatches = titlesToCheck.length > 0 && titlesToCheck.includes(userTitleNormalized);
      const idMatches = matchDocId === claimId;
      const isRejected = matchStatus === 'Rejected';
      const isDraft = matchStatus === 'Draft';
      const isCurrentUserAuthor = Boolean(
        currentUid &&
        (Array.isArray(claim.authorUids) && claim.authorUids.includes(currentUid) ||
         Array.isArray(claim.authors) && claim.authors.some((author: any) => author?.uid === currentUid))
      );
      const isCurrentUserOwner = currentUid && matchUid === currentUid;
      const isAuthorOnlyDuplicate = isCurrentUserAuthor && !isCurrentUserOwner;

      console.log(`   👉 Checking claim ID: ${matchDocId} (Type: ${claim.claimType || 'Unknown'})`);
      console.log(`      - Normalized input title: "${userTitleNormalized}"`);
      console.log(`      - DB Titles (Normalized): ${JSON.stringify(titlesToCheck)}`);
      console.log(`      - Status: "${matchStatus}" (IsRejected: ${isRejected}, IsDraft: ${isDraft})`);
      console.log(`      - Doc ID is current draft: ${idMatches}`);
      console.log(`      - Title match: ${titleMatches}`);
      console.log(`      - Current user author on existing claim: ${isCurrentUserAuthor}`);
      console.log(`      - Current user is owner of existing claim: ${isCurrentUserOwner}`);

      if (isAuthorOnlyDuplicate) {
        console.log(`⚙️ [Server Action] Skipping duplicate warning because current user is an author on existing claim ${matchDocId}`);
        continue;
      }

      if (
        !idMatches &&
        titleMatches &&
        !isRejected &&
        !isDraft
      ) {
        console.log(`🔥 [Server Action] FOUND DUPLICATE GLOBALLY! DocID: ${matchDocId}, Claimant: ${matchUserName}, Type: ${claim.claimType || 'Unknown'}`);
        return {
          success: true,
          isDuplicate: true,
          appliedBy: matchUserName || "Another researcher"
        };
      }
    }

    console.log("⚙️ [Server Action] Finished matching loop. No active duplicates found.");
    return { success: true, isDuplicate: false };
  } catch (error: any) {
    console.error('❌ [Server Action] Error checking duplicate claim in server action:', error);
    return { success: false, isDuplicate: false };
  }
}

export async function checkDuplicateResearchPaperClaimAction(
  doi: string,
  claimId?: string | null,
  currentUid?: string
): Promise<{ success: boolean; isDuplicate: boolean; appliedBy?: string }> {
  console.log("⚙️ [Server Action] checkDuplicateResearchPaperClaimAction started with args:", {
    doi,
    claimId,
    currentUid
  });

  try {
    if (!doi) {
      console.log("⚙️ [Server Action] Missing DOI, returning success: true, isDuplicate: false");
      return { success: true, isDuplicate: false };
    }

    const cleanDoi = doi.trim().toLowerCase();

    // 1. Fetch from Firestore
    console.log("⚙️ [Server Action] Fetching claims from Firestore...");
    const claimsCollection = adminDb.collection('incentiveClaims');
    const firestoreSnapshot = await claimsCollection.get();
    const firestoreClaims = firestoreSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));

    // 2. Fetch from RTDB
    console.log("⚙️ [Server Action] Fetching claims from RTDB...");
    let rtdbClaims: any[] = [];
    const rtdbSnap = await adminRtdb.ref('incentiveClaims').get();
    if (rtdbSnap.exists()) {
      const data = rtdbSnap.val();
      rtdbClaims = Object.keys(data).map(key => ({ ...normalizeClaimFromRtdb(data[key]), id: key } as any));
    }

    // 3. Merge claims (RTDB overrides Firestore if they share the same ID)
    const combinedMap = new Map<string, any>();
    firestoreClaims.forEach(c => combinedMap.set(c.id, c));
    rtdbClaims.forEach(c => {
      const existing = combinedMap.get(c.id);
      combinedMap.set(c.id, {
        ...(existing || {}),
        ...c
      });
    });

    const allClaims = Array.from(combinedMap.values());
    console.log(`⚙️ [Server Action] Found ${allClaims.length} total claims (Firestore + RTDB). Starting matching loop for DOI...`);

    for (const claim of allClaims) {
      // Keep matching strictly within the same application category ("Research Papers")
      if (claim.claimType !== 'Research Papers') {
        continue;
      }

      const matchDocId = claim.id;
      const matchStatus = claim.status || "";
      const matchUid = claim.uid || "";
      const matchUserName = claim.userName || "";
      const matchDoi = (claim.doi || "").trim().toLowerCase();

      const doiMatches = matchDoi === cleanDoi && cleanDoi !== "";
      const idMatches = matchDocId === claimId;
      const isRejected = matchStatus === 'Rejected';

      console.log(`   👉 Checking claim ID: ${matchDocId}`);
      console.log(`      - DB DOI: "${matchDoi}" vs User DOI: "${cleanDoi}" (Match: ${doiMatches})`);
      console.log(`      - Status: "${matchStatus}" (IsRejected: ${isRejected})`);
      console.log(`      - Doc ID is current draft: ${idMatches}`);
      console.log(`      - Created by UID: "${matchUid}" (Current UID: "${currentUid}")`);

      if (
        !idMatches &&
        doiMatches &&
        !isRejected
      ) {
        console.log(`🔥 [Server Action] FOUND DUPLICATE RESEARCH PAPER CLAIM! DocID: ${matchDocId}, Claimant: ${matchUserName}`);
        return {
          success: true,
          isDuplicate: true,
          appliedBy: matchUid === currentUid ? "You" : (matchUserName || "Another researcher")
        };
      }
    }

    console.log("⚙️ [Server Action] Finished matching loop. No active duplicates found.");
    return { success: true, isDuplicate: false };
  } catch (error: any) {
    console.error('❌ [Server Action] Error checking duplicate claim in server action:', error);
    return { success: false, isDuplicate: false };
  }
}

export async function runBulkAiMatchAction(claimIds: string[]): Promise<{ success: boolean; results?: any; error?: string }> {
  try {
    console.log(`⚙️ [Server Action] Starting bulk AI match for ${claimIds.length} claims...`);
    const { verifyClaimFlow } = await import('@/ai/flows/verify-claim');
    
    // 1. Fetch all claims in parallel to check if they have scores
    const fetchedClaims = await Promise.all(
      claimIds.map(async (id) => {
        try {
          return await getIncentiveClaimByIdCombined(id);
        } catch {
          return null;
        }
      })
    );

    // 2. Filter claims that do not already have an AI verification confidence score
    const targetClaims = fetchedClaims.filter((claim): claim is NonNullable<typeof claim> => {
      if (!claim) return false;
      const hasScore = claim.aiVerification && typeof claim.aiVerification.confidenceScore === 'number';
      return !hasScore;
    });

    // 3. Take the first 5 claims from this list (already sorted newest first)
    const claimsToProcess = targetClaims.slice(0, 5);

    if (claimsToProcess.length === 0) {
      console.log('⚙️ [Server Action] No claims found without a verification score.');
      return { success: true, results: [] };
    }

    console.log(`⚙️ [Server Action] Running AI match for ${claimsToProcess.length} unverified claims:`, claimsToProcess.map(c => c.id));

    // 4. Run verifyClaimFlow on the selected 5 claims
    const promises = claimsToProcess.map(async (claim) => {
      const claimId = claim.id;
      try {
        const fileUrl = (claim.publicationProofUrls && claim.publicationProofUrls.length > 0)
          ? claim.publicationProofUrls[0]
          : claim.relevantLink;
          
        console.log(`⚙️ [Server Action] Running AI verification for claim ${claimId} with URL: ${fileUrl || 'None'}`);
        const result = await verifyClaimFlow({ claimId, fileUrl });
        return { claimId, success: true, result };
      } catch (e: any) {
        console.error(`❌ [Server Action] AI Match failed for claim ${claimId}:`, e);
        return { claimId, success: false, error: e.message || 'Verification flow failed' };
      }
    });

    const results = await Promise.all(promises);
    return { success: true, results };
  } catch (error: any) {
    console.error('❌ [Server Action] Error in runBulkAiMatchAction:', error);
    return { success: false, error: error.message || 'Failed to run bulk AI match.' };
  }
}

export async function getTopCollaboratingInstitutesGemini(rawOrganizations: string[]): Promise<{
  success: boolean;
  institutes?: Array<{ name: string; count: number; country: string }>;
  error?: string;
}> {
  try {
    if (!rawOrganizations || rawOrganizations.length === 0) {
      return { success: true, institutes: [] };
    }

    const { ai, z } = await import('@/ai/genkit');
    const { googleAI } = await import('@genkit-ai/google-genai');

    const OrganizationSummarySchema = z.object({
      institutes: z.array(z.object({
        name: z.string().describe('Standardized, clean, full official name of the collaborating academic/research institute.'),
        count: z.number().describe('Number of times researchers from this institute have collaborated based on occurrences in the list.'),
        country: z.string().describe('Country where the institute is located.'),
      })),
    });

    const prompt = `
      You are an expert academic research data analyst. 
      You are given a raw list of external co-author organization names from research publications.
      Your task is to:
      1. Standardize and normalize the names. Group alternative spellings, acronyms, or abbreviations together (e.g. "IIT Bombay", "Indian Institute of Technology Bombay", "IIT-B" should be grouped under "Indian Institute of Technology Bombay").
      2. Filter out and ignore "Parul University Goa", "PU", or any variations of the home university itself.
      3. For each unique standardized institute, count how many times it appeared in the raw input list.
      4. Research and identify the correct country where the institute is located.
      5. Return the top collaborating institutes, sorted in descending order of counts.

      Raw Input List:
      ${JSON.stringify(rawOrganizations, null, 2)}
    `;

    const result = await ai.generate({
      model: googleAI.model('gemini-2.5-flash'),
      prompt,
      output: {
        schema: OrganizationSummarySchema,
      }
    });

    const parsedResult = result.output;
    if (!parsedResult || !parsedResult.institutes) {
      return { success: false, error: 'Gemini did not return any structured output.' };
    }

    // Sort by count descending
    const sorted = parsedResult.institutes.sort((a, b) => b.count - a.count);

    return {
      success: true,
      institutes: sorted,
    };
  } catch (error: any) {
    console.error('❌ [Server Action] Error in getTopCollaboratingInstitutesGemini:', error);
    return { success: false, error: error.message || 'Failed to analyze organizations with Gemini.' };
  }
}

