'use server';

import { adminDb, adminStorage, adminRtdb } from "@/lib/admin"
import { differenceInDays, parseISO } from "date-fns"
import { GovernanceLogger } from "@/lib/governance-logger"
import { logActivity, EMAIL_STYLES, validateUploadedFile } from "./utils"
import { checkAuth } from "@/lib/check-auth"
import { getSystemSettings } from "./system-service"

export async function uploadToDrive(buffer: Buffer, fileName: string, mimeType: string, filePath: string): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const { google } = await import('googleapis');
    const { Readable } = await import('stream');

    const auth = new google.auth.JWT({
      email: process.env.FIREBASE_CLIENT_EMAIL,
      key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/drive.file']
    });

    const drive = google.drive({ version: 'v3', auth });

    const fileMetadata = {
      name: fileName,
    };

    const media = {
      mimeType: mimeType,
      body: Readable.from(buffer),
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink',
    });

    const fileId = response.data.id;

    if (!fileId) {
      throw new Error("Failed to get file ID after upload.");
    }

    const result = await drive.files.get({
      fileId: fileId,
      fields: 'webViewLink',
    });

    return { success: true, url: result.data.webViewLink || undefined };
  } catch (error: any) {
    console.error("Google Drive upload error:", error);
    await logActivity('ERROR', 'Google Drive upload failed', { path: filePath, error: error.message });
    return { success: false, error: `Google Drive upload failed: ${error.message}.` };
  }
}

/**
 * Core upload logic using Buffer to avoid Base64 serialization overhead.
 */
export async function uploadFileBuffer(
  buffer: Buffer,
  mimeType: string,
  path: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const validation = validateUploadedFile(buffer, mimeType, path);
    if (!validation.valid) {
      return { success: false, error: validation.error || "File validation failed." };
    }

    const { put } = await import('@vercel/blob');
    const fileName = path.split('/').pop() || 'uploaded-file';

    try {
      const bucket = adminStorage.bucket();
      const file = bucket.file(path);
      await file.save(buffer, { metadata: { contentType: mimeType } });
      
      const publicUrl = `/api/documents/${path}`;
      return { success: true, url: publicUrl, provider: 'firebase' } as any;
    } catch (firebaseError: any) {
      console.warn("Firebase Storage upload failed, trying fallback:", firebaseError.message);
      
      try {
        const driveResult = await uploadToDrive(buffer, fileName, mimeType, path);
        if (driveResult.success) return { ...driveResult, provider: 'googledrive' } as any;
      } catch (driveError) {}

      try {
        const blob = await put(path, buffer, {
          access: 'public',
          contentType: mimeType,
          token: process.env.RDC_READ_WRITE_TOKEN,
        });
        return { success: true, url: blob.url, provider: 'vercelblob' } as any;
      } catch (blobError) {
        return { success: false, error: "All storage backends failed." };
      }
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

function parseDataUrl(fileDataUrl: string): { success: boolean; mimeType?: string; buffer?: Buffer; error?: string } {
  if (!fileDataUrl) {
    return { success: false, error: "Empty data URL." };
  }
  const commaIndex = fileDataUrl.indexOf(',');
  if (commaIndex === -1) {
    return { success: false, error: "Invalid data URL format: missing comma." };
  }
  const meta = fileDataUrl.substring(0, commaIndex);
  const data = fileDataUrl.substring(commaIndex + 1);

  if (!meta.startsWith('data:')) {
    return { success: false, error: "Invalid data URL format: must start with data: prefix." };
  }

  const base64Index = meta.indexOf(';base64');
  if (base64Index === -1) {
    return { success: false, error: "Invalid data URL format: expected base64 encoding." };
  }

  const mimeType = meta.substring(5, base64Index);
  const buffer = Buffer.from(data, 'base64');
  return { success: true, mimeType, buffer };
}

export async function uploadFileToServer(
  fileDataUrl: string,
  path: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  const parsed = parseDataUrl(fileDataUrl);
  if (!parsed.success || !parsed.buffer || !parsed.mimeType) {
    return { success: false, error: parsed.error || "Invalid data URL format." };
  }
  return uploadFileBuffer(parsed.buffer, parsed.mimeType, path);
}


export async function uploadFileToDriveAction(formData: FormData): Promise<{ success: boolean; url?: string; error?: string }> {
  return await uploadFileToServerAction(formData);
}

export async function uploadFileToServerAction(formData: FormData): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const session = await checkAuth();
    if (!session.authenticated) return { success: false, error: "Session expired." };

    const file = formData.get('file') as File;
    const path = formData.get('path') as string;

    if (!file || !path) {
      return { success: false, error: "File and path are required." };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    return await uploadFileBuffer(buffer, file.type, path);
  } catch (error: any) {
    console.error("Error in uploadFileToServerAction:", error);
    return { success: false, error: error.message || "Failed to process upload." };
  }
}

export async function getStorageUsage(): Promise<{ success: boolean; totalSizeMB?: number; error?: string }> {
  try {
    const bucket = adminStorage.bucket();
    const [files] = await bucket.getFiles();

    let totalSizeBytes = 0;
    files.forEach(file => {
      totalSizeBytes += parseInt(file.metadata.size as string, 10);
    });

    const totalSizeMB = totalSizeBytes / (1024 * 1024);

    return { success: true, totalSizeMB: parseFloat(totalSizeMB.toFixed(2)) };
  } catch (error: any) {
    console.error("Error calculating storage usage:", error);
    await logActivity('ERROR', 'Failed to calculate storage usage', { error: error.message, stack: error.stack });
    return { success: false, error: error.message || 'Could not calculate storage usage.' };
  }
}

/**
 * Verifies if a user has access to a specific document based on organizational rules.
 */
export async function verifyDocumentAccess(path: string, userId: string, user: any): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const userRole = user.role;
    // 1. Super Admin, Admin and IQAC have global access
    if (userRole === 'Super-admin' || userRole === 'admin' || userRole === 'IQAC') {
      return { allowed: true };
    }

    const pathParts = path.split('/');
    const collectionName = pathParts[0];
    const entityId = pathParts[1];

    if (!entityId) return { allowed: false, reason: 'Invalid resource path' };

    // 1.5. Profile Pictures - accessible to any authenticated user
    if (collectionName === 'profile-pictures') {
      return { allowed: true };
    }

    // 2. IMR Projects
    if (collectionName === 'projects') {
      const projectSnap = await adminDb.collection('projects').doc(entityId).get();
      if (!projectSnap.exists) return { allowed: false, reason: 'Project not found' };
      const project = projectSnap.data() as any;

      // Always allow PI and Co-PIs
      if (project.pi_uid === userId || project.coPiUids?.includes(userId)) {
        return { allowed: true };
      }

      // Allow Department Authority
      if (user.authorityDepartments && (
        (project.departmentName && user.authorityDepartments.includes(project.departmentName)) ||
        (project.department && user.authorityDepartments.includes(project.department))
      )) {
        return { allowed: true };
      }

      // Allow Institute Authority
      if (user.authorityInstitutes && project.institute && user.authorityInstitutes.includes(project.institute)) {
        return { allowed: true };
      }

      // Evaluator: 30 days after evaluation
      const assignedEvaluators = project.meetingDetails?.assignedEvaluators || [];
      if (assignedEvaluators.includes(userId)) {
        const evaluationSnap = await adminDb.collection('projects').doc(entityId).collection('evaluations')
          .where('evaluatorUid', '==', userId)
          .get();

        if (!evaluationSnap.empty) {
          let latestDate = new Date(0);
          evaluationSnap.forEach(doc => {
            const d = parseISO(doc.data().evaluationDate);
            if (d > latestDate) latestDate = d;
          });
          if (differenceInDays(new Date(), latestDate) <= 30) {
            return { allowed: true };
          }
          return { allowed: false, reason: 'Evaluator access expired (30 days limit)' };
        }
        // If assigned but not yet evaluated, allow access
        return { allowed: true };
      }

      // CRO: 45 days after submission
      if (userRole === 'CRO') {
        const settingsSnap = await adminDb.collection('settings').doc('system').get();
        const settings = settingsSnap.data() as any;
        const croEmailSnap = await adminDb.collection('users').doc(userId).get();
        const croEmail = croEmailSnap.data()?.email?.toLowerCase();
        
        const assignment = settings?.croAssignments?.find((a: any) => a.email.toLowerCase() === croEmail);
        if (assignment && assignment.faculty === project.faculty) {
          const submissionDate = parseISO(project.submissionDate || project.updatedAt || new Date().toISOString());
          if (differenceInDays(new Date(), submissionDate) <= 45) {
            return { allowed: true };
          }
          return { allowed: false, reason: 'CRO access expired (45 days limit)' };
        }
      }
    }

    // 3. EMR Interests / Presentations / Proposals / Endorsements / Acknowledgements / Proofs
    if (collectionName.startsWith('emr-')) {
      // For EMR, the path usually contains callId and userId or interestId
      // We'll try to find the interest record
      let interest: any = null;
      const isDocId = collectionName === 'emr-interests' || collectionName === 'emr-proofs';
      if (isDocId) {
        const snap = await adminDb.collection('emrInterests').doc(entityId).get();
        if (snap.exists) {
          interest = { ...snap.data(), id: snap.id };
        }
      } else {
        // Fallback or specific mapping where format is: emr-{folder}/{callId}/{applicantId}/{fileName}
        const callId = pathParts[1];
        const applicantId = pathParts[2];
        if (callId && applicantId) {
          const q = await adminDb.collection('emrInterests')
            .where('callId', '==', callId)
            .where('userId', '==', applicantId)
            .limit(1)
            .get();
          if (!q.empty) interest = { ...q.docs[0].data(), id: q.docs[0].id };
        }
      }

      if (interest) {
        if ((interest as any).userId === userId || (interest as any).coPiUids?.includes(userId)) return { allowed: true };

        // Evaluator check (either assigned to the interest or to the parent call)
        let isCallEvaluator = false;
        try {
          const callSnap = await adminDb.collection('fundingCalls').doc(interest.callId).get();
          if (callSnap.exists) {
            const callData = callSnap.data();
            const callEvaluators = callData?.assignedEvaluators || callData?.meetingDetails?.assignedEvaluators || [];
            if (callEvaluators.includes(userId)) {
              isCallEvaluator = true;
            }
          }
        } catch (e) {
          console.error("Error fetching call for evaluator check:", e);
        }

        if ((interest as any).assignedEvaluators?.includes(userId) || isCallEvaluator) {
          const evalSnap = await adminDb.collection('emrInterests').doc(interest.id).collection('evaluations')
            .where('evaluatorUid', '==', userId)
            .get();
          
          if (!evalSnap.empty) {
             let latestDate = new Date(0);
             evalSnap.forEach(doc => {
               const d = parseISO(doc.data().evaluationDate);
               if (d > latestDate) latestDate = d;
             });
             if (differenceInDays(new Date(), latestDate) <= 30) return { allowed: true };
             // Do not return false immediately, fall through to check other roles (e.g. CRO permissions)
          } else {
             return { allowed: true };
          }
        }

        // Institutional role checks (CRO, Principal, HOD, Head of Goa Campus)
        const applicantSnap = await adminDb.collection('users').doc(interest.userId).get();
        const applicant = applicantSnap.exists ? applicantSnap.data() : null;
        const applicantFaculty = interest.faculty || applicant?.faculty;
        const applicantDepartment = interest.department || applicant?.department;
        const applicantCampus = interest.campus || applicant?.campus;

        if (userRole === 'CRO' && user.faculties?.includes(applicantFaculty)) {
          return { allowed: true };
        }
        if (user.designation === 'Head of Goa Campus' && applicantCampus === 'Goa') {
          return { allowed: true };
        }
        if (user.designation === 'Principal' && user.faculties?.includes(applicantFaculty)) {
          return { allowed: true };
        }
        if (user.designation === 'HOD' && user.department === applicantDepartment && user.faculty === applicantFaculty) {
          return { allowed: true };
        }
      }
    }

    // 4. Incentive Claims
    if (collectionName.startsWith('incentive-')) {
        const idOrUid = entityId; // In incentive-proofs, this is usually the UID of the folder owner

        // 4a. Owner access
        if (idOrUid === userId) return { allowed: true };

        // 4b. Global access for all incentive approvers and managers
        const settings = await getSystemSettings();
        const isSetIncentiveApprover = settings.incentiveApprovers?.some((a: any) => a.email.toLowerCase() === user.email.toLowerCase()) ||
            ((settings as any).patentStage2Approver?.email?.toLowerCase() === user.email.toLowerCase());

        if (isSetIncentiveApprover || (user.allowedModules && (
            user.allowedModules.includes('incentive-approvals') || 
            user.allowedModules.includes('manage-incentive-claims') ||
            user.allowedModules.some((m: string) => m.startsWith('incentive-approver-'))
        ))) {
            return { allowed: true };
        }

        // 4c. CRO access (for faculty under their supervision)
        if (userRole === 'CRO' && user.faculties) {
            const targetUserSnap = await adminDb.collection('users').doc(idOrUid).get();
            if (targetUserSnap.exists) {
                const targetUser = targetUserSnap.data() as any;
                if (user.faculties.includes(targetUser.faculty)) {
                    return { allowed: true };
                }
            }
        }
        
        // 4d. Accessing via Claim ID (either Firestore ID or Human-readable Claim ID)
        let claim: any = null;
        try {
            const { getIncentiveClaimByIdCombined } = await import('@/lib/incentive-data-admin');
            claim = await getIncentiveClaimByIdCombined(idOrUid);
        } catch (e) {
            console.error("Error reading claim for permission verification:", e);
        }

        if (claim) {
            if (
                claim.uid === userId || 
                claim.authorUids?.includes(userId) || 
                claim.userEmail?.toLowerCase() === userId.toLowerCase()
            ) {
                return { allowed: true };
            }
            
            // Approvers
            const currentApprover = claim.approvals?.find((a: any) => a.approverUid === userId);
            if (currentApprover) return { allowed: true };
        }

        // 4e. Special case: If path is incentive-proofs/OTHER_UID/... 
        // We need to verify if the current user is a co-author on ANY claim that uses this file.
        // For performance, we check if the user is mentioned in the author list of the claim.
        try {
            const relativePath = pathParts.slice(2).join('/');
            
            // Define helpers for recursive check
            const checkIfObjectContainsPath = (obj: any, fullPath: string, relPath: string): boolean => {
                if (!obj) return false;
                const encodedPath = encodeURIComponent(fullPath);
                const encodedRelative = encodeURIComponent(relPath);
                
                if (typeof obj === 'string') {
                    return (
                        obj.includes(fullPath) || 
                        obj.includes(encodedPath) || 
                        obj.includes(relPath) || 
                        obj.includes(encodedRelative)
                    );
                }
                
                if (Array.isArray(obj)) {
                    for (const item of obj) {
                        if (checkIfObjectContainsPath(item, fullPath, relPath)) return true;
                    }
                    return false;
                }
                
                if (typeof obj === 'object') {
                    for (const key of Object.keys(obj)) {
                        if (checkIfObjectContainsPath(obj[key], fullPath, relPath)) return true;
                    }
                    return false;
                }
                
                return false;
            };

            const isUserAuthorOfClaim = (c: any, uId: string, email?: string): boolean => {
                if (!c) return false;
                if (c.uid === uId) return true;
                if (email) {
                    const emailLower = email.toLowerCase();
                    if (c.userEmail?.toLowerCase() === emailLower) return true;
                    if (c.authorEmails && Array.isArray(c.authorEmails)) {
                        if (c.authorEmails.some((e: string) => e?.toLowerCase() === emailLower)) return true;
                    }
                }
                if (c.authorUids && Array.isArray(c.authorUids)) {
                    if (c.authorUids.includes(uId)) return true;
                }
                if (c.authors && Array.isArray(c.authors)) {
                    for (const author of c.authors) {
                        if (author && typeof author === 'object') {
                            if (author.uid === uId) return true;
                            if (email && author.email?.toLowerCase() === email.toLowerCase()) return true;
                        }
                    }
                }
                return false;
            };

            // Fetch owner's claims
            const ownerClaims: any[] = [];

            // 1. Firestore
            const firestoreSnap = await adminDb.collection('incentiveClaims')
                .where('uid', '==', idOrUid)
                .get();
            firestoreSnap.forEach(doc => {
                ownerClaims.push({ ...doc.data(), id: doc.id });
            });

            // 2. RTDB Active
            const activeSnap = await adminRtdb.ref('incentiveClaims/active')
                .orderByChild('uid')
                .equalTo(idOrUid)
                .get();
            if (activeSnap.exists()) {
                const val = activeSnap.val();
                const { normalizeClaimFromRtdb } = await import('@/lib/rtdb-utils');
                Object.keys(val).forEach(key => {
                    ownerClaims.push({ ...normalizeClaimFromRtdb(val[key]), id: key });
                });
            }

            // 3. RTDB Completed
            const completedSnap = await adminRtdb.ref('incentiveClaims/completed')
                .orderByChild('uid')
                .equalTo(idOrUid)
                .get();
            if (completedSnap.exists()) {
                const val = completedSnap.val();
                const { normalizeClaimFromRtdb } = await import('@/lib/rtdb-utils');
                Object.keys(val).forEach(key => {
                    ownerClaims.push({ ...normalizeClaimFromRtdb(val[key]), id: key });
                });
            }

            // 4. RTDB Drafts
            const draftsSnap = await adminRtdb.ref(`incentiveClaims/drafts/${idOrUid}`).get();
            if (draftsSnap.exists()) {
                const val = draftsSnap.val();
                const { normalizeClaimFromRtdb } = await import('@/lib/rtdb-utils');
                Object.keys(val).forEach(key => {
                    ownerClaims.push({ ...normalizeClaimFromRtdb(val[key]), id: key });
                });
            }

            // Iterate and verify
            for (const c of ownerClaims) {
                if (checkIfObjectContainsPath(c, path, relativePath)) {
                    if (isUserAuthorOfClaim(c, userId, user.email)) {
                        return { allowed: true };
                    }
                }
            }
        } catch (e) {
            console.error("Error verifying special co-author access to incentive document:", e);
        }
    }

    // 5. CFP Submissions Files Check
    if (collectionName === 'cfp-submissions') {
      const hasManageCfp = user?.allowedModules?.includes('manage-cfp-submissions') || 
                           user?.role === 'admin' || 
                           user?.role === 'super-admin' || 
                           user?.role === 'Super-admin';
      if (hasManageCfp) {
        return { allowed: true };
      }

      try {
        const possibleUrls = [
          path,
          `/api/documents/${path}`,
          encodeURI(`/api/documents/${path}`),
          decodeURIComponent(path)
        ];

        const cfpQuery = await adminDb.collection('cfpSubmissions').get();
        for (const doc of cfpQuery.docs) {
          const data = doc.data();
          const isEvaluator = data.meetingDetails?.assignedEvaluators?.includes(userId);
          const isPI = data.pi_uid === userId || (user?.email && data.piEmail?.toLowerCase() === user.email.toLowerCase());
          const isCoPi = Boolean(user?.email && data.coPiDetails?.some((c: any) => c.email?.toLowerCase() === user.email.toLowerCase()));

          if (isEvaluator || isPI || isCoPi) {
            if (
              possibleUrls.some(u => data.proposalUrl?.includes(path) || data.proposalUrl === u) ||
              possibleUrls.some(u => data.piCvUrl?.includes(path) || data.piCvUrl === u) ||
              possibleUrls.some(u => data.ethicsUrl?.includes(path) || data.ethicsUrl === u) ||
              (data.proposalUrls && data.proposalUrls.some((pUrl: string) => possibleUrls.some(u => pUrl?.includes(path) || pUrl === u))) ||
              (data.coPiDetails && data.coPiDetails.some((copi: any) => possibleUrls.some(u => copi.cvUrl?.includes(path) || copi.cvUrl === u)))
            ) {
              return { allowed: true };
            }
          }
        }
      } catch (e) {
        console.error("Error checking CFP document access:", e);
      }
    }

    // 6. General Uploads Check
    if (collectionName === 'uploads') {
      // Owner of the uploaded file has access
      if (entityId === userId) {
        return { allowed: true };
      }

      // Check if this file path is referenced in a CFP Submission where the user is an assigned evaluator or has manage-cfp-submissions access
      try {
        const possibleUrls = [
          path,
          `/api/documents/${path}`,
          encodeURI(`/api/documents/${path}`),
          decodeURIComponent(path)
        ];

        // Query CFP Submissions
        const hasManageCfp = user?.allowedModules?.includes('manage-cfp-submissions');
        const cfpQuery = hasManageCfp
          ? await adminDb.collection('cfpSubmissions').get()
          : await adminDb.collection('cfpSubmissions').where('meetingDetails.assignedEvaluators', 'array-contains', userId).get();

        for (const doc of cfpQuery.docs) {
          const data = doc.data();
          if (
            possibleUrls.includes(data.proposalUrl) ||
            possibleUrls.includes(data.piCvUrl) ||
            possibleUrls.includes(data.ethicsUrl) ||
            (data.coPiDetails && data.coPiDetails.some((copi: any) => possibleUrls.includes(copi.cvUrl)))
          ) {
            return { allowed: true };
          }
        }
      } catch (e) {
        console.error("Error checking CFP evaluator access to uploads:", e);
      }

      // Check if referenced in EMR interests where the user is an assigned evaluator
      try {
        const possibleUrls = [
          path,
          `/api/documents/${path}`,
          encodeURI(`/api/documents/${path}`),
          decodeURIComponent(path)
        ];

        // Query emrInterests where the user is in assignedEvaluators
        const emrQuery = await adminDb.collection('emrInterests')
          .where('assignedEvaluators', 'array-contains', userId)
          .get();

        for (const doc of emrQuery.docs) {
          const data = doc.data();
          if (
            possibleUrls.includes(data.proposalUrl) ||
            possibleUrls.includes(data.pptUrl) ||
            possibleUrls.includes(data.proofUrl) ||
            possibleUrls.includes(data.endorsementUrl) ||
            possibleUrls.includes(data.acknowledgementUrl)
          ) {
            return { allowed: true };
          }
        }
      } catch (e) {
        console.error("Error checking EMR evaluator access to uploads:", e);
      }

      // Check if referenced in IMR projects where user is assigned evaluator
      try {
        const possibleUrls = [
          path,
          `/api/documents/${path}`,
          encodeURI(`/api/documents/${path}`),
          decodeURIComponent(path)
        ];

        const imrQuery = await adminDb.collection('projects')
          .where('meetingDetails.assignedEvaluators', 'array-contains', userId)
          .get();

        for (const doc of imrQuery.docs) {
          const data = doc.data();
          if (
            possibleUrls.includes(data.proposalUrl) ||
            possibleUrls.includes(data.piCvUrl) ||
            possibleUrls.includes(data.ethicsUrl)
          ) {
            return { allowed: true };
          }
        }
      } catch (e) {
        console.error("Error checking IMR evaluator access to uploads:", e);
      }
    }

    return { allowed: false, reason: 'Permission denied' };
  } catch (error) {
    console.error('Error verifying document access:', error);
    try {
      const { reportErrorToHelpdesk } = await import('./notification-service');
      await reportErrorToHelpdesk(
        { message: `Error verifying document access: ${error instanceof Error ? error.message : String(error)}`, stack: error instanceof Error ? error.stack : undefined },
        `/api/documents/${path}`,
        user,
        `User attempting to access: ${path}`
      );
    } catch (e) {
      console.error('Failed to send error email to helpdesk:', e);
    }
    return { allowed: false, reason: 'Internal security check failed' };
  }
}

/**
 * Logs document access events for audit and security tracking.
 */
export async function trackDocumentAccess(userIdArg: string, path: string, action: 'READ' | 'WRITE' | 'DELETE'): Promise<void> {
  try {
    const session = await checkAuth();
    if (!session.authenticated) return;
    const userId = session.uid;

    await logActivity('INFO', `Document ${action}: ${path}`, {
      userId,
      path,
      action,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to track document access:', error);
  }
}

/**
 * Generates a short-lived Signed URL for a document if the user is authorized.
 */
export async function getSecureDocumentUrl(path: string, userIdArg: string): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const session = await checkAuth();
    if (!session.authenticated) return { success: false, error: 'Unauthorized session' };
    const userId = session.uid;
    if (!userId) return { success: false, error: 'Unauthorized session' };

    const userSnap = await adminDb.collection('users').doc(userId).get();
    if (!userSnap.exists) return { success: false, error: 'User session invalid' };
    const user = userSnap.data() as any;

    const auth = await verifyDocumentAccess(path, userId, user);
    if (!auth.allowed) {
      await logActivity('WARNING', 'Blocked unauthorized document access attempt', { path, userId, reason: auth.reason });
      try {
        const { reportErrorToHelpdesk } = await import('./notification-service');
        await reportErrorToHelpdesk(
          { message: `Blocked unauthorized document access attempt: ${auth.reason || 'Unauthorized'}. Path: ${path}` },
          `/api/documents/${path}`,
          user,
          `User blocked from accessing: ${path}`
        );
      } catch (e) {
        console.error('Failed to send block email to helpdesk:', e);
      }
      return { success: false, error: auth.reason || 'Unauthorized' };
    }

    const bucket = adminStorage.bucket();
    const file = bucket.file(path);
    
    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) return { success: false, error: 'File not found on server' };

    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    });

    await trackDocumentAccess(userId, path, 'READ');
    return { success: true, url };
  } catch (error: any) {
    try {
      const { reportErrorToHelpdesk } = await import('./notification-service');
      await reportErrorToHelpdesk(
        { message: `Error getting secure document URL: ${error.message}`, stack: error.stack },
        `/api/documents/${path}`,
        null,
        `System attempting to retrieve secure URL for: ${path}`
      );
    } catch (e) {
      console.error('Failed to send secure URL error email to helpdesk:', e);
    }
    return { success: false, error: error.message };
  }
}

