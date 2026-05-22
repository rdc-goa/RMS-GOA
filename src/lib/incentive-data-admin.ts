import { adminDb, adminRtdb } from './admin';
import type { IncentiveClaim } from '@/types';
import { normalizeClaimFromRtdb } from './rtdb-utils';
import { unstable_cache } from 'next/cache';

/**
 * Ultra-efficient 24-hour memory cache for static legacy claims in Firestore.
 * Since no new claims are written to Firestore (strictly RTDB-only), this cache
 * never needs manual invalidation on new claims/updates, reducing Firestore reads to exactly 1 per day!
 */
export const getStaticFirestoreClaims = unstable_cache(
    async () => {
        console.log("🔥 [Cache Miss] Fetching static archive from Firestore...");
        try {
            const snap = await adminDb.collection('incentiveClaims').get();
            return snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as IncentiveClaim));
        } catch (error) {
            console.error("Error in getStaticFirestoreClaims:", error);
            return [];
        }
    },
    ['static-firestore-claims-archive'],
    { revalidate: 86400 } // 24 hours
);

const RTDB_CLAIM_BUCKET_PATHS = ['active', 'completed'] as const;
const RTDB_LEGACY_BUCKET_KEYS = new Set(['active', 'completed', 'drafts']);

type RtdbClaimHit = { data: Record<string, unknown>; storageKey: string };

function recordMatchesLookupId(
    storageKey: string,
    record: Record<string, unknown>,
    lookupId: string
): boolean {
    if (storageKey === lookupId) return true;
    const humanClaimId = record.claimId;
    const embeddedId = record.id;
    return (
        (typeof humanClaimId === 'string' && humanClaimId === lookupId) ||
        (typeof embeddedId === 'string' && embeddedId === lookupId)
    );
}

function findClaimInClaimsNode(
    claimsNode: Record<string, unknown>,
    lookupId: string
): RtdbClaimHit | null {
    for (const storageKey of Object.keys(claimsNode)) {
        const normalized = normalizeClaimFromRtdb(claimsNode[storageKey]);
        if (recordMatchesLookupId(storageKey, normalized, lookupId)) {
            return { data: normalized, storageKey };
        }
    }
    return null;
}

/**
 * Fetches claim payload from RTDB across legacy flat path, active/completed buckets, and drafts.
 * Falls back to scanning buckets when the lookup id is a human claimId (e.g. RDC/IC/BOOK/0001).
 */
async function fetchClaimFromRtdbById(lookupId: string): Promise<RtdbClaimHit | null> {
    const directPaths = [
        `incentiveClaims/${lookupId}`,
        ...RTDB_CLAIM_BUCKET_PATHS.map((bucket) => `incentiveClaims/${bucket}/${lookupId}`),
    ];

    const directSnaps = await Promise.all(directPaths.map((path) => adminRtdb.ref(path).get()));
    for (const snap of directSnaps) {
        if (snap.exists()) {
            return { data: normalizeClaimFromRtdb(snap.val()), storageKey: lookupId };
        }
    }

    const bucketSnaps = await Promise.all(
        RTDB_CLAIM_BUCKET_PATHS.map((bucket) => adminRtdb.ref(`incentiveClaims/${bucket}`).get())
    );
    for (const snap of bucketSnaps) {
        if (!snap.exists()) continue;
        const hit = findClaimInClaimsNode(snap.val(), lookupId);
        if (hit) return hit;
    }

    const legacySnap = await adminRtdb.ref('incentiveClaims').get();
    if (legacySnap.exists()) {
        const legacyData = legacySnap.val();
        const legacyClaims: Record<string, unknown> = {};
        Object.keys(legacyData).forEach((key) => {
            if (!RTDB_LEGACY_BUCKET_KEYS.has(key)) {
                legacyClaims[key] = legacyData[key];
            }
        });
        const hit = findClaimInClaimsNode(legacyClaims, lookupId);
        if (hit) return hit;
    }

    const draftsSnap = await adminRtdb.ref('incentiveClaims/drafts').get();
    if (draftsSnap.exists()) {
        const draftsByUid = draftsSnap.val();
        for (const uid of Object.keys(draftsByUid)) {
            const hit = findClaimInClaimsNode(draftsByUid[uid], lookupId);
            if (hit) return hit;
        }
    }

    return null;
}

function mergeClaimsIntoMap(
    combinedMap: Map<string, IncentiveClaim>,
    claimsNode: Record<string, unknown> | null | undefined
) {
    if (!claimsNode || typeof claimsNode !== 'object') return;

    Object.keys(claimsNode).forEach((storageKey) => {
        const existing = combinedMap.get(storageKey);
        const rtdbClaim = normalizeClaimFromRtdb(claimsNode[storageKey]);
        combinedMap.set(storageKey, {
            ...(existing || {}),
            ...rtdbClaim,
            id: storageKey,
        } as IncentiveClaim);
    });
}

function findFirestoreClaim(
    firestoreClaims: IncentiveClaim[],
    lookupId: string
): IncentiveClaim | undefined {
    return firestoreClaims.find(
        (c) => c.id === lookupId || c.claimId === lookupId
    );
}

/**
 * Fetches a single incentive claim by ID, checking RTDB first, then static cached Firestore archive.
 * Resolves both Firebase storage keys and human-readable claimId values (RDC/IC/...).
 */
export async function getIncentiveClaimByIdCombined(lookupId: string): Promise<IncentiveClaim | null> {
    try {
        const [rtdbHit, firestoreClaims] = await Promise.all([
            fetchClaimFromRtdbById(lookupId),
            getStaticFirestoreClaims(),
        ]);

        const firestoreData = findFirestoreClaim(firestoreClaims, lookupId);
        if (!rtdbHit && !firestoreData) return null;

        const storageId = rtdbHit?.storageKey ?? firestoreData?.id ?? lookupId;

        const merged = {
            ...(firestoreData || {}),
            ...(rtdbHit?.data || {}),
            id: storageId,
        } as IncentiveClaim;

        if (!merged.uid) {
            console.error(`❌ [getIncentiveClaimByIdCombined] Combined claim ${lookupId} is missing owner UID.`);
            return null;
        }

        return merged;
    } catch (error) {
        console.error(`Error fetching combined claim ${lookupId}:`, error);
        return null;
    }
}

/**
 * Fetches all incentive claims from both Firestore and RTDB, merging them.
 * Useful for bulk server actions like Excel generation.
 */
export async function getAllClaimsCombinedAdmin(): Promise<IncentiveClaim[]> {
    try {
        const [firestoreClaims, activeSnap, completedSnap, legacyRootSnap, draftsSnap] = await Promise.all([
            getStaticFirestoreClaims(),
            adminRtdb.ref('incentiveClaims/active').get(),
            adminRtdb.ref('incentiveClaims/completed').get(),
            adminRtdb.ref('incentiveClaims').get(),
            adminRtdb.ref('incentiveClaims/drafts').get(),
        ]);

        const combinedMap = new Map<string, IncentiveClaim>();

        firestoreClaims.forEach((claim) => {
            combinedMap.set(claim.id, claim);
        });

        mergeClaimsIntoMap(combinedMap, activeSnap.exists() ? activeSnap.val() : null);
        mergeClaimsIntoMap(combinedMap, completedSnap.exists() ? completedSnap.val() : null);

        if (legacyRootSnap.exists()) {
            const legacyData = legacyRootSnap.val();
            Object.keys(legacyData).forEach((key) => {
                if (!RTDB_LEGACY_BUCKET_KEYS.has(key)) {
                    mergeClaimsIntoMap(combinedMap, { [key]: legacyData[key] });
                }
            });
        }

        if (draftsSnap.exists()) {
            const draftsByUid = draftsSnap.val();
            Object.keys(draftsByUid).forEach((uid) => {
                mergeClaimsIntoMap(combinedMap, draftsByUid[uid]);
            });
        }

        return Array.from(combinedMap.values()).sort((a, b) => {
            const dateA = new Date(a.submissionDate).getTime();
            const dateB = new Date(b.submissionDate).getTime();
            return dateB - dateA;
        });
    } catch (error) {
        console.error("Error fetching all combined claims (admin):", error);
        return [];
    }
}
