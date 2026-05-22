import { ai, z } from '../genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { crossrefSearchTool } from '../tools/crossref-search';
import { getIncentiveClaimByIdCombined } from '@/lib/incentive-data-admin';
import { adminRtdb } from '@/lib/admin';

export const VerificationResultSchema = z.object({
  isAuthentic: z.boolean().describe('True if the claim passes all checks, false if flagged.'),
  affiliationMentioned: z.boolean().describe('True if Parul University Goa is mentioned as affiliation.'),
  authorsMatch: z.boolean().describe('True if the applicant name matches the author list exactly.'),
  isIndexed: z.boolean().describe('True if the paper was found in Crossref/Scopus and is indexed.'),
  reasoning: z.string().describe('Detailed reasoning for the decision.'),
  confidenceScore: z.number().min(0).max(100).describe('Confidence score of this verification 0-100.'),
});

export const verifyClaimFlow = ai.defineFlow({
  name: 'verifyClaimFlow',
  inputSchema: z.object({
    claimId: z.string(),
    fileUrl: z.string().optional(),
  }),
  outputSchema: VerificationResultSchema,
}, async ({ claimId, fileUrl }) => {
  const claim = await getIncentiveClaimByIdCombined(claimId);
  if (!claim) {
    throw new Error(`Claim not found: ${claimId}`);
  }

  console.log(`\n[VerifyFlow] Starting automated verification for claim: ${claimId}`);

  let promptData: any[] = [];
  promptData.push(`Verify the incentive claim for a publication.`);
  promptData.push(`Applicant Name: ${claim.userName}`);
  promptData.push(`Paper Title: ${claim.paperTitle || claim.conferencePaperTitle || claim.publicationTitle}`);
  promptData.push(`DOI: ${claim.doi}`);
  
  if (fileUrl || claim.relevantLink) {
    const urlToFetch = fileUrl || claim.relevantLink;
    if (urlToFetch?.startsWith('http')) {
      try {
        console.log(`[VerifyFlow] Fetching media from ${urlToFetch} for parsing...`);
        const response = await fetch(urlToFetch);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          const mimeType = response.headers.get('content-type') || 'application/pdf';
          
          if (mimeType.includes('pdf') && buffer.byteLength < 20 * 1024 * 1024) {
            console.log(`[VerifyFlow] Successfully loaded PDF (${Math.round(buffer.byteLength / 1024)} KB). Providing inline base64 to Genkit model.`);
            promptData.push({
              media: {
                url: `data:${mimeType};base64,${base64}`
              }
            });
          }
        }
      } catch (e) {
        console.error("Failed to fetch media for Genkit:", e);
      }
    }
  }

  console.log(`[VerifyFlow] Calling Gemini AI to parse document and perform verification...`);
  const result = await ai.generate({
    model: googleAI.model('gemini-2.5-flash'), // Using flash for speed, switch to pro if needed
    prompt: [
      `You are an expert fraud and authenticity verification AI. Your job is to verify a publication proof.
      1. Affiliation Check: Verify that "Parul University Goa" is explicitly mentioned as the author's affiliation.
      2. Authorship Check: Verify the applicant's name matches the author list.
      3. Index Verification: Use the crossrefSearchTool to verify if the paper exists and is properly indexed.
      If it is flagged/suspicious, set isAuthentic to false. Otherwise, set it to true.`,
      ...promptData,
    ],
    tools: [crossrefSearchTool],
    output: {
      schema: VerificationResultSchema,
    }
  });

  const verificationResult = result.output;
  if (!verificationResult) {
    throw new Error("Verification failed: Gemini AI returned an empty or invalid output.");
  }

  console.log(`[VerifyFlow] Gemini verification complete. Result: ${verificationResult.isAuthentic ? 'PASSED' : 'FLAGGED'}. Confidence: ${verificationResult.confidenceScore}%`);

  const { sanitizeForRtdb } = await import('@/lib/rtdb-utils');
  
  let targetPath = '';
  if (claim.status === 'Draft') {
    targetPath = `incentiveClaims/drafts/${claim.uid}/${claim.id}/aiVerification`;
  } else if (claim.status === 'Payment Completed' || claim.status === 'Rejected') {
    targetPath = `incentiveClaims/completed/${claim.id}/aiVerification`;
  } else {
    targetPath = `incentiveClaims/active/${claim.id}/aiVerification`;
  }

  console.log(`[VerifyFlow] Writing verification result to RTDB path: ${targetPath}`);
  await adminRtdb.ref(targetPath).set(sanitizeForRtdb({
    ...verificationResult,
    verifiedAt: new Date().toISOString()
  }));

  return verificationResult;
});
