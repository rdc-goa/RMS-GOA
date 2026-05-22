import { adminDb } from './src/lib/admin';
import * as dotenv from 'dotenv';
dotenv.config();

async function resetCounter() {
    try {
        console.log("Resetting lab consumables counter...");
        await adminDb.collection('system').doc('labConsumablesCounter').delete();
        console.log("Counter successfully reset! The next submission will be 0001.");
    } catch (e: any) {
        console.error("Error resetting counter:", e.message);
    }
}

resetCounter();
