
import { adminDb } from './admin';
import { User } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export type LogCategory = 
  | 'APPLICATION'
  | 'AUTH'
  | 'AUDIT'
  | 'WORKFLOW'
  | 'AI'
  | 'DATABASE'
  | 'STORAGE'
  | 'NOTIFICATION'
  | 'INFRASTRUCTURE'
  | 'METRICS'
  | 'SECURITY'
  | 'MIGRATION'
  | 'FRONTEND';

export interface LogEntry {
  timestamp: any; // Firestore Timestamp
  category: LogCategory;
  message: string;
  metadata: Record<string, any>;
  userId?: string;
  userEmail?: string;
  userRole?: string;
  requestId: string;
  path?: string;
  status: 'info' | 'warning' | 'error' | 'success';
}

/**
 * Redacts sensitive fields from a metadata object.
 */
function redact(data: any, depth = 0): any {
  if (depth > 10) return '[Depth Limit Exceeded]';
  if (!data || typeof data !== 'object') return data;
  
  const sensitiveKeys = ['password', 'token', 'apiKey', 'secret', 'cvUrl', 'proofUrl', 'bankName', 'accountNumber'];
  const redacted = Array.isArray(data) ? [...data] : { ...data };
  
  for (const key in redacted) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof redacted[key] === 'object') {
      redacted[key] = redact(redacted[key], depth + 1);
    }
  }
  
  return redacted;
}

/**
 * Removes undefined properties to prevent Firebase ignoreUndefinedProperties errors.
 */
function stripUndefined(obj: any, depth = 0): any {
  if (depth > 10) return '[Depth Limit Reached]';
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(v => stripUndefined(v, depth + 1)).filter(v => v !== undefined);
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [k, stripUndefined(v, depth + 1)])
  );
}

/**
 * Server-side logging utility.
 */
export async function logEvent(
  category: LogCategory,
  message: string,
  params: {
    metadata?: Record<string, any>;
    user?: User | { uid: string; email: string; role: string };
    status?: 'info' | 'warning' | 'error' | 'success';
    requestId?: string;
    path?: string;
  }
) {
  const { metadata = {}, user, status = 'info', requestId = uuidv4(), path } = params;

  const logEntry: LogEntry = stripUndefined({
    timestamp: new Date(), // Firebase Admin will convert this to Timestamp
    category,
    message,
    metadata: redact(metadata),
    userId: user?.uid,
    userEmail: user?.email,
    userRole: user?.role,
    requestId,
    path,
    status
  });

  try {
    // We use adminDb directly for server-side logging
    await adminDb.collection('system_logs').add(logEntry);
  } catch (error) {
    console.error(`CRITICAL: Failed to write log to Firestore: ${category} - ${message}`, error);
    // Fallback to console for emergency observability
    console.log('LOG_FALLBACK:', JSON.stringify(logEntry));
  }
}

/**
 * Client-side logging helper.
 * This should call a server action to record the log.
 */
export async function logFrontendEvent(
  message: string,
  params: {
    metadata?: Record<string, any>;
    status?: 'info' | 'warning' | 'error' | 'success';
  }
) {
  // This will be implemented to call a server action
  // For now, it just logs to console
  console.log('[FRONTEND_LOG]:', message, params);
}

/**
 * AI / Genkit specific logging utility.
 * Captures prompt size, model latency, and token consumption.
 */
export async function logAIEvent(
  feature: string,
  message: string,
  params: {
    modelUsed: string;
    latency_ms: number;
    tokensUsed: number;
    promptHash?: string;
    userId?: string;
    status?: 'success' | 'warning' | 'error';
    error?: string;
  }
) {
  await logEvent('AI', message, {
    metadata: {
      feature,
      modelUsed: params.modelUsed,
      latency_ms: params.latency_ms,
      tokensUsed: params.tokensUsed,
      promptHash: params.promptHash,
      error: params.error
    },
    user: params.userId ? { uid: params.userId, email: '', role: '' } : undefined,
    status: params.status || 'success'
  });
}
