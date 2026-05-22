import { NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/lib/admin';
import { logEvent } from '@/lib/logger';

export async function GET() {
  const start = performance.now();
  let dbStatus = 'disconnected';
  let storageStatus = 'disconnected';
  let isHealthy = false;
  let errorDetails = '';

  try {
    // Check Firestore Connectivity
    await adminDb.collection('system_logs').limit(1).get();
    dbStatus = 'connected';

    // Check Storage Connectivity
    const [files] = await adminStorage.bucket().getFiles({ maxResults: 1 });
    storageStatus = 'connected';

    isHealthy = true;
  } catch (error: any) {
    console.error('Health check failed', error);
    errorDetails = error.message;
  }

  const latency_ms = performance.now() - start;

  const payload = {
    status: isHealthy ? 'healthy' : 'degraded',
    services: {
      firestore: dbStatus,
      storage: storageStatus,
    },
    latency_ms,
    timestamp: new Date().toISOString()
  };

  // Log to Infrastructure category
  await logEvent('INFRASTRUCTURE', 'System health check ping', {
    metadata: { ...payload, errorDetails },
    status: isHealthy ? 'success' : 'error'
  });

  return NextResponse.json(payload, { status: isHealthy ? 200 : 503 });
}
