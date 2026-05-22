'use server';

import { adminDb, adminStorage, adminRtdb } from "@/lib/admin"
import { differenceInDays, parseISO } from "date-fns"
import { GovernanceLogger } from "@/lib/governance-logger"
import { logActivity, EMAIL_STYLES } from "./utils"
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

export async function uploadFileToServer(
  fileDataUrl: string,
  path: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  const match = fileDataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) return { success: false, error: "Invalid data URL format." };
  const buffer = Buffer.from(match[2], 'base64');
  const mimeType = match[1];
  return uploadFileBuffer(buffer, mimeType, path);
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

    // 2. IMR Projects
    if (collectionName === 'projects') {
      const projectSnap = await adminDb.collection('projects').doc(entityId).get();
      if (!projectSnap.exists) return { allowed: false, reason: 'Project not found' };
      const project = projectSnap.data() as any;

      // Always allow PI and Co-PIs
      if (project.pi_uid === userId || project.coPiUids?.includes(userId)) {
        return { allowed: true };
      }

      // Evaluator: 30 days after evaluation
      const assignedEvaluators = project.meetingDetails?.assignedEvaluators || [];
      if (assignedEvaluators.includes(userId)) {
        const evaluationSnap = await adminDb.collection('projects').doc(entityId).collection('evaluations')
          .where('evaluatorUid', '==', userId)
          .orderBy('evaluationDate', 'desc')
          .limit(1)
          .get();

        if (!evaluationSnap.empty) {
          const evalDate = parseISO(evaluationSnap.docs[0].data().evaluationDate);
          if (differenceInDays(new Date(), evalDate) <= 30) {
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

    // 3. EMR Interests / Presentations
    if (collectionName === 'emr-presentations' || collectionName === 'emr-proposals' || collectionName === 'emr-interests') {
      // For EMR, the path usually contains callId and userId or interestId
      // We'll try to find the interest record
      let interest;
      if (collectionName === 'emr-interests') {
        const snap = await adminDb.collection('emrInterests').doc(entityId).get();
        interest = { ...snap.data(), id: snap.id };
      } else {
        // Fallback or specific mapping
        const callId = pathParts[1];
        const applicantId = pathParts[2];
        const q = await adminDb.collection('emrInterests')
          .where('callId', '==', callId)
          .where('userId', '==', applicantId)
          .limit(1)
          .get();
        if (!q.empty) interest = { ...q.docs[0].data(), id: q.docs[0].id };
      }

      if (interest) {
        if ((interest as any).userId === userId || (interest as any).coPiUids?.includes(userId)) return { allowed: true };

        // Evaluator check
        if ((interest as any).assignedEvaluators?.includes(userId)) {
          const evalSnap = await adminDb.collection('emrInterests').doc(interest.id).collection('evaluations')
            .where('evaluatorUid', '==', userId)
            .orderBy('evaluationDate', 'desc')
            .limit(1)
            .get();
          
          if (!evalSnap.empty) {
             const evalDate = parseISO(evalSnap.docs[0].data().evaluationDate);
             if (differenceInDays(new Date(), evalDate) <= 30) return { allowed: true };
             return { allowed: false, reason: 'Evaluator access expired' };
          }
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
        const isSetIncentiveApprover = settings.incentiveApprovers?.some((a: any) => a.email.toLowerCase() === user.email.toLowerCase());

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
        // Check RTDB first for modern claims, then fall back to Firestore for legacy claims
        let claim: any = null;
        
        try {
            const rtdbSnap = await adminRtdb.ref(`incentiveClaims/${idOrUid}`).get();
            if (rtdbSnap.exists()) {
                const { normalizeClaimFromRtdb } = await import('@/lib/rtdb-utils');
                claim = normalizeClaimFromRtdb(rtdbSnap.val());
            } else {
                const claimSnap = await adminDb.collection('incentiveClaims').doc(idOrUid).get();
                if (claimSnap.exists) {
                    claim = claimSnap.data();
                }
            }
        } catch (e) {
            console.error("Error reading claim for permission verification:", e);
        }

        if (claim) {
            if (claim.uid === userId || claim.authorUids?.includes(userId) || claim.userEmail?.toLowerCase() === userId.toLowerCase()) return { allowed: true };
            
            // Approvers
            const currentApprover = claim.approvals?.find((a: any) => a.approverUid === userId);
            if (currentApprover) return { allowed: true };
        } else {
            // Fallback: search for claim by the human-readable claimId if the doc ID didn't match
            // Try RTDB search first
            try {
                const rtdbSnap = await adminRtdb.ref('incentiveClaims').get();
                if (rtdbSnap.exists()) {
                    const data = rtdbSnap.val();
                    const matchedKey = Object.keys(data).find(k => data[k].claimId === idOrUid);
                    if (matchedKey) {
                        const { normalizeClaimFromRtdb } = await import('@/lib/rtdb-utils');
                        claim = normalizeClaimFromRtdb(data[matchedKey]);
                    }
                }
            } catch (e) {
                console.error("Error searching claim in RTDB for verification:", e);
            }

            if (!claim) {
                // Try Firestore search
                try {
                    const claimQuery = await adminDb.collection('incentiveClaims').where('claimId', '==', idOrUid).limit(1).get();
                    if (!claimQuery.empty) {
                        claim = claimQuery.docs[0].data();
                    }
                } catch (e) {
                    console.error("Error searching claim in Firestore for verification:", e);
                }
            }

            if (claim) {
                if (claim.uid === userId || claim.authorUids?.includes(userId)) return { allowed: true };
            }
        }

        // 4c. Special case: If path is incentive-proofs/OTHER_UID/... 
        // We need to verify if the current user is a co-author on ANY claim that uses this file.
        // For performance, we check if the user is mentioned in the author list of the claim.
        // Since we don't have the claim ID from the path, we might need a more indexed check if this gets common.
    }

    return { allowed: false, reason: 'Permission denied' };
  } catch (error) {
    console.error('Error verifying document access:', error);
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
    if (!session.authenticated || !session.uid) return { success: false, error: 'Unauthorized session' };
    const userId = session.uid;

    const userSnap = await adminDb.collection('users').doc(userId).get();
    if (!userSnap.exists) return { success: false, error: 'User session invalid' };
    const user = userSnap.data() as any;

    const auth = await verifyDocumentAccess(path, userId, user);
    if (!auth.allowed) {
      await logActivity('WARNING', 'Blocked unauthorized document access attempt', { path, userId, reason: auth.reason });
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
    return { success: false, error: error.message };
  }
}
