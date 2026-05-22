import { adminAuth } from './admin';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * Standard server-side authentication check for Next.js Server Components and Actions.
 * Replaces redundant auth checks and standardizes token verification.
 */
export async function checkAuth(options: { 
  role?: string | string[], 
  shouldRedirect?: boolean,
  redirectTo?: string 
} = {}) {
  const { role, shouldRedirect = false, redirectTo = '/login' } = options;
  
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session')?.value;

  if (!sessionToken) {
    console.error('[checkAuth] Missing session token in cookies');
    if (shouldRedirect) redirect(redirectTo);
    return { authenticated: false, error: 'Missing session token' };
  }

  console.log('[checkAuth] Found session token, verifying...');

  try {
    let decodedToken;
    try {
      // Try verifying as a session cookie first (new behavior)
      decodedToken = await adminAuth.verifySessionCookie(sessionToken, true);
      console.log('[checkAuth] Session cookie verified');
    } catch (sessionError) {
      // Fallback to ID token (old behavior / transition)
      console.log('[checkAuth] Session cookie verification failed, trying ID token fallback...');
      decodedToken = await adminAuth.verifyIdToken(sessionToken);
      console.log('[checkAuth] ID token verified as fallback');
    }

    let userRole = decodedToken.role as string;
    const uid = decodedToken.uid;

    if (role) {
      const allowedRoles = Array.isArray(role) ? role : [role];
      const normalizedAllowedRoles = allowedRoles.map(r => r.toLowerCase().trim().replace(/[\s-]+/g, '-'));
      let normalizedUserRole = userRole?.toLowerCase().trim().replace(/[\s-]+/g, '-');

      // If role is missing or doesn't match, try fetching a fresh one from the database
      if (!normalizedUserRole || !normalizedAllowedRoles.includes(normalizedUserRole)) {
        const { adminDb } = await import('./admin');
        const userDoc = await adminDb.collection('users').doc(uid).get();
        if (userDoc.exists) {
          const dbRole = userDoc.data()?.role;
          if (dbRole) {
            userRole = dbRole;
            normalizedUserRole = dbRole.toLowerCase().trim().replace(/[\s-]+/g, '-');
          }
        }
      }

      if (!normalizedUserRole || !normalizedAllowedRoles.includes(normalizedUserRole)) {
        if (shouldRedirect) redirect('/unauthorized');
        return { 
          authenticated: true, 
          authorized: false, 
          user: decodedToken,
          uid: uid,
          role: userRole,
          error: 'Insufficient permissions' 
        };
      }
    }

    return { 
      authenticated: true, 
      authorized: true, 
      user: decodedToken,
      uid: uid,
      role: userRole
    };
  } catch (error) {
    console.error('Auth verification failed:', error);
    if (shouldRedirect) redirect(redirectTo);
    return { authenticated: false, error: 'Invalid or expired session' };
  }
}

/**
 * Validates a Bearer token from the Authorization header for API routes.
 */
export async function validateApiToken(authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) {
    return { success: false, error: 'Missing or invalid authorization header' };
  }

  const token = authHeader.substring(7);
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    return { success: true, user: decodedToken, uid: decodedToken.uid };
  } catch (error) {
    return { success: false, error: 'Invalid or expired token' };
  }
}
