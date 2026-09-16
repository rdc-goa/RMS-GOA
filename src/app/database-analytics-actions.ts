'use server';

import { google } from 'googleapis';
import { adminDb } from '@/lib/admin';
import { subDays, format } from 'date-fns';

export interface DatabaseMetricPoint {
  date: string;
  firestoreReads: number;
  firestoreWrites: number;
  firestoreDeletes: number;
  rtdbSentBytes: number;
  rtdbReceivedBytes: number;
  activeConnections: number;
  estimatedCost: number;
}

export interface DatabaseMetricsResponse {
  success: boolean;
  isSimulated: boolean;
  error?: string;
  data: DatabaseMetricPoint[];
  summary: {
    totalFirestoreReads: number;
    totalFirestoreWrites: number;
    totalFirestoreDeletes: number;
    totalRtdbSentBytes: number;
    totalRtdbReceivedBytes: number;
    maxActiveConnections: number;
    totalEstimatedCost: number;
    costBreakdown: {
      firestoreReadsCost: number;
      firestoreWritesCost: number;
      firestoreDeletesCost: number;
      rtdbBandwidthCost: number;
    };
  };
}

// Pricing rules (Firebase pay-as-you-go Plan)
const FIRESTORE_READ_PRICE_PER_100K = 0.06;
const FIRESTORE_WRITE_PRICE_PER_100K = 0.18;
const FIRESTORE_DELETE_PRICE_PER_100K = 0.02;
const RTDB_BANDWIDTH_PRICE_PER_GB = 5.00;

function calculateEstimatedCost(reads: number, writes: number, deletes: number, sentBytes: number): {
  total: number;
  readsCost: number;
  writesCost: number;
  deletesCost: number;
  bandwidthCost: number;
} {
  const readsCost = (reads / 100000) * FIRESTORE_READ_PRICE_PER_100K;
  const writesCost = (writes / 100000) * FIRESTORE_WRITE_PRICE_PER_100K;
  const deletesCost = (deletes / 100000) * FIRESTORE_DELETE_PRICE_PER_100K;
  const sentGb = sentBytes / (1024 * 1024 * 1024);
  const bandwidthCost = sentGb * RTDB_BANDWIDTH_PRICE_PER_GB;

  return {
    total: parseFloat((readsCost + writesCost + deletesCost + bandwidthCost).toFixed(4)),
    readsCost: parseFloat(readsCost.toFixed(4)),
    writesCost: parseFloat(writesCost.toFixed(4)),
    deletesCost: parseFloat(deletesCost.toFixed(4)),
    bandwidthCost: parseFloat(bandwidthCost.toFixed(4)),
  };
}

export async function fetchDatabaseUsageMetricsAction(daysRange: number = 30): Promise<DatabaseMetricsResponse> {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  const now = new Date();
  const startTime = subDays(now, daysRange);

  // Fallback simulator generator
  const getSimulatedData = async (msgReason?: string): Promise<DatabaseMetricsResponse> => {
    console.log(`ℹ️ Returning high-fidelity simulated metrics. Reason: ${msgReason || 'Request'}`);
    
    // Fetch some counts from DB to anchor the simulation in reality
    let activeUsers = 50;
    let projectsCount = 100;
    let claimsCount = 200;

    try {
      const [usersSnap, projectsSnap, claimsSnap] = await Promise.all([
        (adminDb.collection('users') as any).count().get(),
        (adminDb.collection('projects') as any).count().get(),
        (adminDb.collection('incentiveClaims') as any).count().get().catch(() => ({ data: () => ({ count: 180 }) }))
      ]);
      activeUsers = usersSnap.data().count || 50;
      projectsCount = projectsSnap.data().count || 100;
      claimsCount = claimsSnap.data().count || 180;
    } catch (e) {
      console.warn("Failed to get database document counts for simulation anchor, using defaults.");
    }

    const dataPoints: DatabaseMetricPoint[] = [];
    let cumulativeReads = 0;
    let cumulativeWrites = 0;
    let cumulativeDeletes = 0;
    let cumulativeSentBytes = 0;
    let cumulativeReceivedBytes = 0;
    let maxConnections = 0;

    for (let i = daysRange; i >= 0; i--) {
      const date = subDays(now, i);
      const dayStr = format(date, 'yyyy-MM-dd');
      
      // Multiplier based on day of week (weekend dip)
      const dayOfWeek = date.getDay();
      const multiplier = (dayOfWeek === 0 || dayOfWeek === 6) ? 0.3 : 1.0;
      
      // Random variance
      const variance = 0.85 + Math.random() * 0.3; // 85% to 115%
      
      // Calculate active metrics
      const dailyActiveUsers = Math.round(activeUsers * (0.4 + Math.random() * 0.4) * multiplier);
      
      // Simulate Firestore operations
      // Standard user reads dashboard, details page: ~150 reads/active user/day
      const firestoreReads = Math.round(dailyActiveUsers * 120 * variance);
      // Writes: approvals, updates: ~15 writes/active user/day
      const firestoreWrites = Math.round(dailyActiveUsers * 12 * variance);
      // Deletes: cleanups, edits: ~2 deletes/active user/day
      const firestoreDeletes = Math.round(dailyActiveUsers * 1.5 * variance);

      // Simulate Realtime Database network bytes
      // Before optimization: admins fetched everything (~500KB per layout load). 
      // We simulate a mixed environment where optimization saved bandwidth over time.
      const baseRtdbSentBytes = dailyActiveUsers * 15 * 1024 * 1024; // ~15MB per active user per day before
      const optimizedRtdbSentBytes = dailyActiveUsers * 0.15 * 1024 * 1024; // ~150KB per user after
      
      // Let's assume the optimization was active for the last 5 days
      const isOptimized = i <= 5;
      const rtdbSentBytes = Math.round((isOptimized ? optimizedRtdbSentBytes : baseRtdbSentBytes) * variance);
      const rtdbReceivedBytes = Math.round(dailyActiveUsers * 80 * 1024 * variance); // ~80KB uploads
      
      const activeConnections = Math.round(dailyActiveUsers * 0.35 * variance); // Peak active connections
      
      const { total } = calculateEstimatedCost(firestoreReads, firestoreWrites, firestoreDeletes, rtdbSentBytes);
      
      dataPoints.push({
        date: dayStr,
        firestoreReads,
        firestoreWrites,
        firestoreDeletes,
        rtdbSentBytes,
        rtdbReceivedBytes,
        activeConnections,
        estimatedCost: total
      });

      cumulativeReads += firestoreReads;
      cumulativeWrites += firestoreWrites;
      cumulativeDeletes += firestoreDeletes;
      cumulativeSentBytes += rtdbSentBytes;
      cumulativeReceivedBytes += rtdbReceivedBytes;
      if (activeConnections > maxConnections) {
        maxConnections = activeConnections;
      }
    }

    const { readsCost, writesCost, deletesCost, bandwidthCost, total } = calculateEstimatedCost(
      cumulativeReads,
      cumulativeWrites,
      cumulativeDeletes,
      cumulativeSentBytes
    );

    return {
      success: true,
      isSimulated: true,
      error: msgReason,
      data: dataPoints,
      summary: {
        totalFirestoreReads: cumulativeReads,
        totalFirestoreWrites: cumulativeWrites,
        totalFirestoreDeletes: cumulativeDeletes,
        totalRtdbSentBytes: cumulativeSentBytes,
        totalRtdbReceivedBytes: cumulativeReceivedBytes,
        maxActiveConnections: maxConnections,
        totalEstimatedCost: total,
        costBreakdown: {
          firestoreReadsCost: readsCost,
          firestoreWritesCost: writesCost,
          firestoreDeletesCost: deletesCost,
          rtdbBandwidthCost: bandwidthCost
        }
      }
    };
  };

  // Check variables first
  if (!projectId || !clientEmail || !privateKey) {
    return getSimulatedData("Missing environment credentials (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)");
  }

  try {
    const formattedPrivateKey = privateKey.replace(/\\n/g, '\n').replace(/^"|"$/g, "");
    
    // Auth client for Google Monitoring API
    const auth = new google.auth.JWT({
      email: clientEmail,
      key: formattedPrivateKey,
      scopes: ['https://www.googleapis.com/auth/monitoring.read']
    });

    const monitoring = google.monitoring({
      version: 'v3',
      auth
    });

    const startTimeIso = startTime.toISOString();
    const endTimeIso = now.toISOString();

    const fetchMetric = async (metricType: string): Promise<any> => {
      try {
        const response = await monitoring.projects.timeSeries.list({
          name: `projects/${projectId}`,
          filter: `metric.type = "${metricType}"`,
          'interval.startTime': startTimeIso,
          'interval.endTime': endTimeIso,
          'aggregation.alignmentPeriod': '86400s', // 1 day intervals
          'aggregation.perSeriesAligner': 'ALIGN_SUM'
        });
        return response.data;
      } catch (err: any) {
        console.warn(`Failed to fetch metric ${metricType}:`, err.message);
        return null;
      }
    };

    // Load metrics in parallel
    const [readsData, writesData, deletesData, sentBytesData, recBytesData, connectionsData] = await Promise.all([
      fetchMetric('firestore.googleapis.com/document/read_count'),
      fetchMetric('firestore.googleapis.com/document/write_count'),
      fetchMetric('firestore.googleapis.com/document/delete_count'),
      fetchMetric('firebasedatabase.googleapis.com/network/sent_bytes_count'),
      fetchMetric('firebasedatabase.googleapis.com/network/received_bytes_count'),
      fetchMetric('firebasedatabase.googleapis.com/network/active_connections')
    ]);

    // Check if we received any real metrics
    const hasRealData = !!(
      (readsData?.timeSeries && readsData.timeSeries.length > 0) ||
      (writesData?.timeSeries && writesData.timeSeries.length > 0) ||
      (sentBytesData?.timeSeries && sentBytesData.timeSeries.length > 0)
    );

    if (!hasRealData) {
      return getSimulatedData("Cloud Monitoring returned empty results. Make sure Cloud Monitoring API is active on Google Cloud Console.");
    }

    // Process and merge the metric data series by date
    const dateMap = new Map<string, DatabaseMetricPoint>();

    const getPoints = (timeSeriesList: any[], fieldName: Exclude<keyof DatabaseMetricPoint, 'date'>, isAverage: boolean = false) => {
      if (!timeSeriesList || timeSeriesList.length === 0) return;
      
      timeSeriesList.forEach((series: any) => {
        const points = series.points || [];
        points.forEach((p: any) => {
          const dateStr = p.interval.endTime.split('T')[0]; // yyyy-MM-dd
          const value = p.value.doubleValue || p.value.int64Value || 0;
          const numericValue = typeof value === 'string' ? parseFloat(value) : Number(value);

          if (!dateMap.has(dateStr)) {
            dateMap.set(dateStr, {
              date: dateStr,
              firestoreReads: 0,
              firestoreWrites: 0,
              firestoreDeletes: 0,
              rtdbSentBytes: 0,
              rtdbReceivedBytes: 0,
              activeConnections: 0,
              estimatedCost: 0
            });
          }

          const dayData = dateMap.get(dateStr)!;
          if (isAverage) {
            dayData[fieldName] = Math.max(dayData[fieldName] as number, Math.round(numericValue));
          } else {
            (dayData[fieldName] as number) += Math.round(numericValue);
          }
        });
      });
    };

    getPoints(readsData?.timeSeries, 'firestoreReads');
    getPoints(writesData?.timeSeries, 'firestoreWrites');
    getPoints(deletesData?.timeSeries, 'firestoreDeletes');
    getPoints(sentBytesData?.timeSeries, 'rtdbSentBytes');
    getPoints(recBytesData?.timeSeries, 'rtdbReceivedBytes');
    getPoints(connectionsData?.timeSeries, 'activeConnections', true); // Connections is average/gauge

    // Ensure all days are present, filling gaps
    const sortedDates = Array.from(dateMap.keys()).sort();
    
    // Sort metric points and calculate estimated costs
    const dataPoints: DatabaseMetricPoint[] = sortedDates.map(dateKey => {
      const pt = dateMap.get(dateKey)!;
      const { total } = calculateEstimatedCost(pt.firestoreReads, pt.firestoreWrites, pt.firestoreDeletes, pt.rtdbSentBytes);
      pt.estimatedCost = total;
      return pt;
    });

    let cumulativeReads = 0;
    let cumulativeWrites = 0;
    let cumulativeDeletes = 0;
    let cumulativeSentBytes = 0;
    let cumulativeReceivedBytes = 0;
    let maxConnections = 0;

    dataPoints.forEach(pt => {
      cumulativeReads += pt.firestoreReads;
      cumulativeWrites += pt.firestoreWrites;
      cumulativeDeletes += pt.firestoreDeletes;
      cumulativeSentBytes += pt.rtdbSentBytes;
      cumulativeReceivedBytes += pt.rtdbReceivedBytes;
      if (pt.activeConnections > maxConnections) {
        maxConnections = pt.activeConnections;
      }
    });

    const { readsCost, writesCost, deletesCost, bandwidthCost, total } = calculateEstimatedCost(
      cumulativeReads,
      cumulativeWrites,
      cumulativeDeletes,
      cumulativeSentBytes
    );

    return {
      success: true,
      isSimulated: false,
      data: dataPoints,
      summary: {
        totalFirestoreReads: cumulativeReads,
        totalFirestoreWrites: cumulativeWrites,
        totalFirestoreDeletes: cumulativeDeletes,
        totalRtdbSentBytes: cumulativeSentBytes,
        totalRtdbReceivedBytes: cumulativeReceivedBytes,
        maxActiveConnections: maxConnections,
        totalEstimatedCost: total,
        costBreakdown: {
          firestoreReadsCost: readsCost,
          firestoreWritesCost: writesCost,
          firestoreDeletesCost: deletesCost,
          rtdbBandwidthCost: bandwidthCost
        }
      }
    };
  } catch (error: any) {
    console.error("GCP Cloud Monitoring Query Error:", error);
    return getSimulatedData(`Cloud Monitoring Connection Failed: ${error.message || error}`);
  }
}
