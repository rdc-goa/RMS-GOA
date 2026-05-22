import { adminRtdb } from './admin';

/**
 * Sanitizes an object for Firebase Realtime Database by removing all undefined values.
 * RTDB will throw an error if an object contains undefined.
 */
export function sanitizeForRtdb<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForRtdb(item)) as unknown as T;
  }

  const sanitized: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (value !== undefined) {
        sanitized[key] = sanitizeForRtdb(value);
      }
    }
  }

  return sanitized;
}

/**
 * Normalizes a claim fetched from RTDB to ensure arrays (like approvals and authors)
 * are correctly formatted as arrays even if RTDB returns them as objects.
 */
export function normalizeClaimFromRtdb(claim: any): any {
  if (!claim || typeof claim !== 'object') return claim;

  const arrayFields = ['approvals', 'authors', 'authorUids', 'authorEmails', 'coPiDetails', 'coPiUids'];
  
  arrayFields.forEach(field => {
    if (claim[field] && typeof claim[field] === 'object' && !Array.isArray(claim[field])) {
      // Ensure we preserve numeric order for array-like objects
      const keys = Object.keys(claim[field]);
      const isNumeric = keys.every(k => !isNaN(Number(k)));
      
      if (isNumeric) {
        const sortedKeys = keys.map(Number).sort((a, b) => a - b);
        claim[field] = sortedKeys.map(k => claim[field][k]).filter(val => val !== null);
      } else {
        claim[field] = Object.values(claim[field]).filter(val => val !== null);
      }
    }
  });

  return claim;
}

/**
 * Atomically saves a claim to its correct nested path in RTDB based on its status and owner's UID.
 * Also cleans up any copy in other folders to prevent stale duplicates.
 */
export async function saveClaimToRtdb(claimId: string, claimData: any): Promise<void> {
  const sanitized = sanitizeForRtdb({ id: claimId, ...claimData, lastSyncedAt: new Date().toISOString() });
  
  const status = claimData.status;
  const uid = claimData.uid;
  
  if (!uid) {
    throw new Error("Cannot save claim to RTDB: Missing claim owner UID.");
  }
  
  let targetPath = '';
  if (status === 'Draft') {
    targetPath = `incentiveClaims/drafts/${uid}/${claimId}`;
  } else if (status === 'Payment Completed' || status === 'Rejected') {
    targetPath = `incentiveClaims/completed/${claimId}`;
  } else {
    targetPath = `incentiveClaims/active/${claimId}`;
  }

  // To guarantee no stale copies reside in any other path, we perform an atomic multi-path update.
  const updates: any = {};
  updates[targetPath] = sanitized;
  
  // Clean up all other possible paths
  const possiblePaths = [
    `incentiveClaims/${claimId}`,
    `incentiveClaims/active/${claimId}`,
    `incentiveClaims/completed/${claimId}`,
    `incentiveClaims/drafts/${uid}/${claimId}`
  ];
  
  possiblePaths.forEach(path => {
    if (path !== targetPath) {
      updates[path] = null;
    }
  });
  
  await adminRtdb.ref().update(updates);
}

/**
 * Atomically deletes a claim from all potential locations in RTDB.
 */
export async function deleteClaimFromRtdb(claimId: string, uid: string): Promise<void> {
  const updates: any = {
    [`incentiveClaims/${claimId}`]: null,
    [`incentiveClaims/active/${claimId}`]: null,
    [`incentiveClaims/completed/${claimId}`]: null,
    [`incentiveClaims/drafts/${uid}/${claimId}`]: null
  };
  await adminRtdb.ref().update(updates);
}

