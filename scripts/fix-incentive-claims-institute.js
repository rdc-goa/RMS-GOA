/*
  This script backfills missing `institute` fields on existing incentive claim documents.
  It looks at each claim without a valid `institute`, fetches the claimant's user record,
  and updates the claim to store the institute from the user profile.

  Run with:
    npm run fix:claims-institute

  Note: This script only updates claims where the `institute` is missing or empty.
*/

require('dotenv').config();

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

function ensureFirebaseAdminInitialized() {
  if (getApps().length) return; 

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin credentials are not configured. Make sure NEXT_PUBLIC_FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY are set."
    );
  }

  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

async function main() {
  ensureFirebaseAdminInitialized();

  const db = getFirestore();
  console.log('Fetching incentive claims...');

  const claimsSnapshot = await db.collection('incentiveClaims').get();
  console.log(`Found ${claimsSnapshot.size} claims.`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const doc of claimsSnapshot.docs) {
    const claim = doc.data();
    const docInstitute = typeof claim.institute === 'string' ? claim.institute.trim() : '';

    const uid = claim.uid;
    if (!uid) {
      console.warn(`Skipping claim ${doc.id} because it has no uid.`);
      skippedCount++;
      continue;
    }

    const userSnap = await db.collection('users').doc(uid).get();
    const user = userSnap.exists ? userSnap.data() : null;
    const userInstitute = typeof user?.institute === 'string' ? user.institute.trim() : '';

    if (!userInstitute) {
      console.warn(`Skipping claim ${doc.id} because user ${uid} has no institute.`);
      skippedCount++;
      continue;
    }

    const normalizedDocInstitute = docInstitute.toLowerCase();
    const normalizedUserInstitute = userInstitute.toLowerCase();

    if (normalizedDocInstitute === normalizedUserInstitute) {
      skippedCount++;
      continue;
    }

    await doc.ref.update({ institute: userInstitute });
    console.log(`Updated claim ${doc.id} -> institute: ${userInstitute} (was: '${docInstitute || '[empty]'}')`);
    updatedCount++;
  }

  console.log(`Done. Updated ${updatedCount} claims. Skipped ${skippedCount} claims.`);
}

main().catch((err) => {
  console.error('Error running script:', err);
  process.exit(1);
});
