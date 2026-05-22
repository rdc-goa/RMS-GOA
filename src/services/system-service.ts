'use server';

import { adminDb } from "@/lib/admin"
import { FieldValue } from "firebase-admin/firestore"
import admin from "firebase-admin"
import { SystemSettings, User } from "@/types"
import { GovernanceLogger } from "@/lib/governance-logger"
import { logEvent, LogCategory } from "@/lib/logger"
import { logActivity } from "./utils"

import { unstable_cache, revalidateTag } from 'next/cache';
import { startOfDay } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

const getCachedSettings = unstable_cache(
  async () => {

    const settingsRef = adminDb.collection("system").doc("settings")
    const settingsSnap = await settingsRef.get()
    if (settingsSnap.exists) {
      return settingsSnap.data() as SystemSettings
    }
    return { is2faEnabled: false, allowedDomains: [], croAssignments: [] }
  },
  ['system-settings-cache'],
  { revalidate: 86400, tags: ['system'] }
);

export async function getSystemSettings(): Promise<SystemSettings> {
  try {
    return await getCachedSettings();
  } catch (error) {
    console.error("Error fetching system settings:", error)
    return { is2faEnabled: false, allowedDomains: [], croAssignments: [] }
  }
}

export async function updateSystemSettings(settings: SystemSettings): Promise<{ success: boolean; error?: string }> {
  try {
    const settingsRef = adminDb.collection("system").doc("settings")
    const oldSettings = await getSystemSettings();

    await settingsRef.set(settings, { merge: true });
    (revalidateTag as any)('system');
    
    await GovernanceLogger.logEntityChange(
        'main',
        'SYSTEM_SETTINGS',
        'SYSTEM_ADMIN',
        oldSettings,
        settings
    );

    await logActivity("INFO", "System settings updated", { newSettings: settings })
    return { success: true }
  } catch (error: any) {
    console.error("Error updating system settings:", error)
    await logActivity("ERROR", "Failed to update system settings", { error: error.message })
    return { success: false, error: error.message || "Failed to update settings." }
  }
}

export async function checkHODUniqueness(
  department: string,
  institute: string,
  currentUid: string,
): Promise<{ exists: boolean }> {
  try {
    if (!department || !institute) {
      return { exists: false }
    }
    const usersRef = adminDb.collection("users")
    const q = usersRef
      .where("designation", "==", "HOD")
      .where("department", "==", department)
      .where("institute", "==", institute)

    const querySnapshot = await q.get()

    if (querySnapshot.empty) {
      return { exists: false }
    }

    const foundUserDoc = querySnapshot.docs[0]
    if (foundUserDoc.id === currentUid) {
      return { exists: false }
    }

    return { exists: true }
  } catch (error: any) {
    console.error("Error checking HOD uniqueness:", error)
    await logActivity("ERROR", "Failed to check HOD uniqueness", {
      department,
      institute,
      error: error.message,
    })
    throw new Error("Failed to verify HOD status due to a server error.")
  }
}

export async function isEmailDomainAllowed(
  email: string,
): Promise<{ allowed: boolean; isCro: boolean; croFaculty?: string; croCampus?: string; isIqac: boolean }> {
  try {
    const settings = await getSystemSettings()
    const allowedDomains = settings.allowedDomains || ["@paruluniversity.ac.in", "@goa.paruluniversity.ac.in"]
    const croAssignments = settings.croAssignments || []
    const iqacEmail = settings.iqacEmail || ""

    if (email === "rathipranav07@gmail.com" || email === "vicepresident_86@paruluniversity.ac.in") {
      return { allowed: true, isCro: false, isIqac: false }
    }

    const isIqac = iqacEmail.toLowerCase() === email.toLowerCase()
    if (isIqac) {
      return { allowed: true, isCro: false, isIqac: true }
    }

    const isAllowed = allowedDomains.some((domain) => email.endsWith(domain))
    const croAssignment = croAssignments.find((c) => c.email.toLowerCase() === email.toLowerCase())

    if (croAssignment) {
      return { allowed: true, isCro: true, croFaculty: croAssignment.faculty, croCampus: croAssignment.campus, isIqac: false }
    }

    return { allowed: isAllowed, isCro: false, isIqac: false }
  } catch (error) {
    console.error("Error checking email domain:", error)
    const defaultAllowed = email.endsWith("@paruluniversity.ac.in") || email.endsWith("@goa.paruluniversity.ac.in")
    return { allowed: defaultAllowed, isCro: false, isIqac: false }
  }
}

export async function getLogs(filters: {
  category?: LogCategory | 'ALL';
  duration?: 'today' | '24h' | '7d' | '30d' | 'all';
  search?: string;
  limit?: number;
}) {
  try {
    let query: admin.firestore.Query = adminDb.collection("system_logs");

    if (filters.category && filters.category !== 'ALL') {
      query = query.where("category", "==", filters.category);
    }

    const now = new Date();
    const timeZone = 'Asia/Kolkata';

    if (filters.duration && filters.duration !== 'all') {
      let startDate: Date;
      if (filters.duration === 'today') {
        const zonedNow = toZonedTime(now, timeZone);
        const zonedStart = startOfDay(zonedNow);
        startDate = fromZonedTime(zonedStart, timeZone);
      } else if (filters.duration === '24h') {
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      } else if (filters.duration === '7d') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (filters.duration === '30d') {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else {
        startDate = new Date(0);
      }
      query = query.where("timestamp", ">=", startDate);
    }

    query = query.orderBy("timestamp", "desc");
    query = query.limit(filters.limit || 100);

    const snapshot = await query.get();
    let logs = snapshot.docs.map(doc => {
      const data = doc.data();
      let dateValue: Date;

      if (data.timestamp && typeof data.timestamp.toDate === 'function') {
        dateValue = data.timestamp.toDate();
      } else if (data.timestamp instanceof Date) {
        dateValue = data.timestamp;
      } else if (typeof data.timestamp === 'string' || typeof data.timestamp === 'number') {
        dateValue = new Date(data.timestamp);
      } else {
        dateValue = new Date();
      }

      const isoTimestamp = !isNaN(dateValue.getTime()) ? dateValue.toISOString() : new Date().toISOString();

      return {
        id: doc.id,
        ...data,
        timestamp: isoTimestamp,
      };
    });

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      logs = logs.filter((log: any) =>
        log.message?.toLowerCase().includes(searchLower) ||
        log.userId?.toLowerCase().includes(searchLower) ||
        log.userEmail?.toLowerCase().includes(searchLower)
      );
    }

    return { success: true, logs };
  } catch (error: any) {
    console.error("Error fetching logs:", error);
    return { success: false, error: error.message };
  }
}

export async function exportLogs(filters: {
  category?: LogCategory | 'ALL';
  duration?: 'today' | '24h' | '7d' | '30d' | 'all';
  search?: string;
}) {
    return await getLogs({ ...filters, limit: 2000 });
}

export async function logFrontendAction(
  category: LogCategory,
  message: string,
  params: {
    metadata?: Record<string, any>;
    status?: 'info' | 'warning' | 'error' | 'success';
    path?: string;
    user?: User;
  }
) {
  await logEvent(category, message, params);
  return { success: true };
}

export async function bulkGrantModuleAccess(
  userIds: string[],
  moduleId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const batch = adminDb.batch()
    const usersRef = adminDb.collection("users")
    userIds.forEach((uid) => {
      batch.update(usersRef.doc(uid), {
        allowedModules: FieldValue.arrayUnion(moduleId),
      })
    })
    await batch.commit()
    await logActivity("INFO", "Bulk module access granted", { userIds, moduleId })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to update permissions." }
  }
}

export async function bulkRevokeModuleAccess(
  userIds: string[],
  moduleId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const batch = adminDb.batch()
    const usersRef = adminDb.collection("users")
    userIds.forEach((uid) => {
      batch.update(usersRef.doc(uid), {
        allowedModules: FieldValue.arrayRemove(moduleId),
      })
    })
    await batch.commit()
    await logActivity("INFO", "Bulk module access revoked", { userIds, moduleId })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to update permissions." }
  }
}

export async function fetchOrcidData(orcidId: string): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  try {
    const response = await fetch(`https://pub.orcid.org/v3.0/${orcidId}/person`, {
      headers: { Accept: "application/json" },
    })
    if (!response.ok) throw new Error("ORCID profile not found.")
    const data = await response.json()
    return { success: true, data }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}


