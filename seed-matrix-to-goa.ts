/**
 * Seed script to import Matrix data into RMS-GOA Firestore.
 * Usage: npx tsx --env-file=.env seed-matrix-to-goa.ts [--from-vadodara]
 */
import { adminDb } from './src/lib/admin';
import matrixData from './src/lib/vadodara-faculty-matrix.json';

async function seed() {
  console.log('Connecting to RMS-GOA Firestore...');
  const settingsRef = adminDb.collection('system').doc('settings');
  const snap = await settingsRef.get();
  
  if (!snap.exists) {
    console.log('Settings document not found, creating one...');
    await settingsRef.set({ facultyMatrix: matrixData }, { merge: true });
  } else {
    const existing = snap.data();
    if (existing?.facultyMatrix && existing.facultyMatrix.length > 0) {
      console.log(`RMS-GOA already has ${existing.facultyMatrix.length} faculties in its matrix.`);
      const force = process.argv.includes('--force');
      if (!force) {
        console.log('Skipping seed. Pass --force to overwrite.');
        process.exit(0);
      }
    }
    await settingsRef.set({ facultyMatrix: matrixData }, { merge: true });
  }
  
  console.log(`Successfully seeded ${matrixData.length} faculties into RMS-GOA system/settings!`);
}

seed().then(() => process.exit(0)).catch(err => {
  console.error('Failed to seed matrix:', err);
  process.exit(1);
});
