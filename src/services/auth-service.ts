'use server';

import { adminDb, adminAuth } from "@/lib/admin"
import { User, LoginOtp } from "@/types"
import { sendEmail as sendEmailUtility } from "@/lib/email"
import { logActivity, EMAIL_STYLES } from "./utils"
import { getSystemSettings } from "./system-service"
import { checkRateLimit } from "@/lib/rate-limit"
import { cookies } from "next/headers"

export async function getUserByMisId(misId: string): Promise<User | null> {
  try {
    const usersRef = adminDb.collection("users")
    const snapshot = await usersRef.where("misId", "==", misId).limit(1).get()
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { ...doc.data(), uid: doc.id } as User;
  } catch (error) {
    console.error("Error fetching user by MIS ID:", error);
    return null;
  }
}

export async function getAllUsers(): Promise<User[]> {
  try {
    const usersRef = adminDb.collection("users")
    const snapshot = await usersRef.get()
    const users: User[] = []
    snapshot.forEach((doc) => {
      const data = doc.data() as User;
      users.push({ ...data, uid: doc.id });
    })
    return users
  } catch (error) {
    console.error("Error fetching users:", error)
    return []
  }
}

export async function sendLoginOtp(email: string, isPasswordVerified: boolean = false): Promise<{ success: boolean; error?: string }> {
  try {
    const rateLimit = await checkRateLimit(`otp-send-${email}`, { points: 10, duration: 300 }); // Increased to 10 attempts per 5 mins
    if (!rateLimit.success) {
      return { success: false, error: "Too many attempts. Please try again later." }
    }


    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = Date.now() + 10 * 60 * 1000 // 10 minutes from now

    const otpData: LoginOtp = { email, otp, expiresAt, isPasswordVerified }
    await adminDb.collection("loginOtps").doc(email).set(otpData)

    const emailHtml = `
      <div ${EMAIL_STYLES.background}>
        ${EMAIL_STYLES.logo}
        <p style="color:#ffffff; text-align:center; font-size:18px;">Your Verification Code</p>
        <p style="color:#e0e0e0; text-align:center;">Please use the following code to complete your login. This code will expire in 10 minutes.</p>
        <div style="text-align:center; margin: 20px 0;">
            <p style="background-color:#2c3e50; color:#ffffff; display:inline-block; padding: 10px 20px; font-size:24px; letter-spacing: 5px; border-radius: 5px;">
                ${otp}
            </p>
        </div>
        ${EMAIL_STYLES.footer}
      </div>
    `

    await sendEmailUtility({
      to: email,
      subject: "Your Login Verification Code for PU Research Projects Portal",
      html: emailHtml,
      from: "default",
    })

    return { success: true }
  } catch (error: any) {
    console.error("Error sending OTP:", error)
    return { success: false, error: "Failed to send OTP email." }
  }
}

export async function verifyLoginOtp(email: string, otp: string): Promise<{ success: boolean; error?: string; customToken?: string }> {
  try {
    const rateLimit = await checkRateLimit(`otp-verify-${email}`, { points: 15, duration: 600 });
    if (!rateLimit.success) {
      return { success: false, error: "Too many failed attempts. Please request a new OTP." }
    }

    const otpRef = adminDb.collection("loginOtps").doc(email)
    const otpSnap = await otpRef.get()

    if (!otpSnap.exists) {
      return { success: false, error: "Invalid or expired OTP. Please try again." }
    }

    const otpData = otpSnap.data() as LoginOtp

    if (otpData.otp !== otp) {
      return { success: false, error: "The OTP you entered is incorrect." }
    }

    if (Date.now() > otpData.expiresAt) {
      await otpRef.delete()
      return { success: false, error: "Your OTP has expired. Please log in again to receive a new one." }
    }

    await otpRef.delete()

    // Generate Custom Token for secure authentication ONLY if password was verified
    if (otpData.isPasswordVerified) {
      const userRecord = await adminAuth.getUserByEmail(email);
      const customToken = await adminAuth.createCustomToken(userRecord.uid);
      return { success: true, customToken }
    }

    return { success: true }
  } catch (error: any) {
    console.error("Error verifying OTP:", error)
    return { success: false, error: "An unexpected error occurred during verification." }
  }
}

/**
 * Initiates the login process by verifying primary credentials on the server.
 * This prevents client-side bypass of 2FA by keeping the logic server-side.
 */
export async function initiateLogin(email: string, password: string): Promise<{
  success: boolean;
  error?: string;
  otpRequired?: boolean;
  customToken?: string;
}> {
  try {
    // 1. Validate primary credentials via Firebase REST API
    const authResult = await validateFirebaseCredentials(email, password);
    if (!authResult.success) {
      return { success: false, error: authResult.error || "Invalid email or password." };
    }

    // 2. Check if 2FA is enabled in system settings
    const settings = await getSystemSettings();
    const is2faRequired = settings.is2faEnabled && email !== "vicepresident_86@paruluniversity.ac.in";

    if (is2faRequired) {
      // 3a. Send OTP and return requirement
      // Set isPasswordVerified to true so verifyLoginOtp knows it's safe to grant access
      const otpSent = await sendLoginOtp(email, true);
      if (!otpSent.success) {
        return { success: false, error: otpSent.error || "Failed to send verification code." };
      }
      return { success: true, otpRequired: true };
    } else {
      // 3b. Generate custom token for immediate login
      const userRecord = await adminAuth.getUserByEmail(email);
      const customToken = await adminAuth.createCustomToken(userRecord.uid);
      return { success: true, customToken };
    }
  } catch (error: any) {
    console.error("Login initiation error:", error);
    return { success: false, error: "An unexpected error occurred during login." };
  }
}

/**
 * Internal helper to verify credentials with Firebase Auth REST API.
 */
async function validateFirebaseCredentials(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error("Firebase API Key is not configured.");
  }

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });

  const data = await response.json();
  if (!response.ok) {
    const errorCode = data.error?.message;
    if (errorCode === 'INVALID_LOGIN_CREDENTIALS' || errorCode === 'EMAIL_NOT_FOUND' || errorCode === 'INVALID_PASSWORD') {
      return { success: false, error: "Invalid email or password." };
    }
    return { success: false, error: errorCode || "Authentication failed." };
  }

  return { success: true };
}

export async function checkMisIdExists(
  misId: string,
  currentUid: string,
  campus: string,
): Promise<{ exists: boolean }> {
  try {
    if (!misId || typeof misId !== "string" || misId.trim() === "" || !campus) {
      return { exists: false }
    }
    const usersRef = adminDb.collection("users")
    const q = usersRef.where("misId", "==", misId).where("campus", "==", campus)
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
    console.error("Error checking MIS ID uniqueness:", error)
    await logActivity("ERROR", "Failed to check MIS ID existence", {
      misId,
      campus,
      error: error.message,
      stack: error.stack,
    })
    throw new Error("Failed to verify MIS ID due to a server error. Please try again.")
  }
}

export async function notifySuperAdminsOnNewUser(userName: string, role: string) {
  try {
    const superAdminUsersSnapshot = await adminDb.collection("users").where("role", "==", "Super-admin").get();
    if (superAdminUsersSnapshot.empty) {
      console.log("No Super-admin users found to notify for new user.");
      return;
    }

    const batch = adminDb.batch();
    const notificationTitle = `New ${role} signed up: ${userName}`;

    superAdminUsersSnapshot.forEach((userDoc) => {
      const notificationRef = adminDb.collection("notifications").doc();
      batch.set(notificationRef, {
        uid: userDoc.id,
        title: notificationTitle,
        createdAt: new Date().toISOString(),
        isRead: false,
      });
    });

    await batch.commit();
    await logActivity("INFO", "New user notification sent to super-admins", { userName, role });
  } catch (error: any) {
    console.error("Error notifying Super-admins about new user:", error);
    await logActivity("ERROR", "Failed to notify super-admins on new user", {
      userName,
      role,
      error: error.message,
      stack: error.stack,
    });
  }
}

export async function registerUserInDatabase(user: User): Promise<{ success: boolean; error?: string }> {
  try {
    if (!user.uid || !user.email) {
      return { success: false, error: "User UID and Email are required." };
    }

    await adminDb.collection("users").doc(user.uid).set(user, { merge: true });
    
    await logActivity("INFO", "User document initialized via server action", { 
      uid: user.uid, 
      email: user.email,
      role: user.role 
    });

    return { success: true };
  } catch (error: any) {
    console.error("Error in registerUserInDatabase:", error);
    await logActivity("ERROR", "Failed to initialize user document", { uid: user.uid, error: error.message });
    return { success: false, error: error.message || "Failed to register user in database." };
  }
}



export async function updateUserTutorialStatus(uid: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!uid) return { success: false, error: "User ID missing." }
    await adminDb.collection("users").doc(uid).update({ hasCompletedTutorial: true })
    await logActivity("INFO", "User completed tutorial", { uid })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: "Failed to update tutorial status." }
  }
}

export async function saveSidebarOrder(uid: string, newOrder: string[]): Promise<{ success: boolean; error?: string }> {
  try {
    if (!uid || !newOrder) return { success: false, error: 'Required fields missing.' };
    await adminDb.collection('users').doc(uid).update({ sidebarOrder: newOrder });
    await logActivity('INFO', 'User sidebar order saved', { uid });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: 'Failed to save order.' };
  }
}
export async function setSession(idToken: string) {
  try {
    const cookieStore = await cookies();
    
    // Set session expiration to 5 days.
    const expiresIn = 60 * 60 * 24 * 5 * 1000;
    
    // Decode the token payload (without verifying) to surface helpful debug info
    try {
      const parts = idToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));

        const expectedProject = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
        if (payload.aud && expectedProject && String(payload.aud) !== String(expectedProject)) {
          console.error('[setSession] ID token project mismatch. Token aud does not match server project config.');
          return { success: false, error: 'Invalid ID token for this project' };
        }
      }
    } catch (decodeError) {
      console.warn('[setSession] Failed to decode ID token payload for debugging.', decodeError);
    }

    // Create the session cookie. This will also verify the ID token.
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });
    
    cookieStore.set('session', sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 5, // 5 days in seconds
      path: '/',
      sameSite: 'lax',
    });
    
    return { success: true };
  } catch (error) {
    console.error('Failed to set session cookie:', error);
    return { success: false };
  }
}

export async function clearSession() {
  try {
     const cookieStore = await cookies();
     cookieStore.delete('session');
     return { success: true };
  } catch (error) {
    return { success: false };
  }
}
