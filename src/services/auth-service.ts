
'use server';

import { adminDb, adminAuth } from "@/lib/admin"
import { User, LoginOtp } from "@/types"
import { sendEmail as sendEmailUtility } from "@/lib/email"
import { logActivity, EMAIL_STYLES } from "./utils"
import { getSystemSettings } from "./system-service"
import { checkRateLimit } from "@/lib/rate-limit"
import { cookies } from "next/headers"
import { getDefaultModulesForRole } from "@/lib/modules"

export async function createGuestEvaluatorAction(
  currentUserEmail: string,
  userData: {
    name: string;
    email: string;
    role: User['role'];
    designation: string;
    faculty: string;
    department: string;
    institute: string;
    campus: User['campus'];
    faculties?: string[];
    allowedModules?: string[];
    phoneNumber?: string;
  }
): Promise<{ success: boolean; error?: string; tempPassword?: string }> {
  try {
    // 1. Verify caller has Super-admin privileges
    const callerSnap = await adminDb.collection("users").where("email", "==", currentUserEmail).limit(1).get();
    if (callerSnap.empty || callerSnap.docs[0].data().role !== "Super-admin") {
      return { success: false, error: "Unauthorized. Only Super-admins can create accounts." };
    }

    // 2. Validate email is unique
    try {
      await adminAuth.getUserByEmail(userData.email);
      return { success: false, error: "A user with this email address already exists." };
    } catch (e: any) {
      if (e.code !== 'auth/user-not-found') {
        throw e;
      }
    }

    // 3. Generate a temporary password
    const tempPassword = Math.random().toString(36).substring(2, 10) + "A1!";

    // 4. Create user in Firebase Auth
    const userRecord = await adminAuth.createUser({
      email: userData.email,
      password: tempPassword,
      displayName: userData.name,
    });

    // 5. Create user document in Firestore
    const defaultModules = userData.allowedModules || getDefaultModulesForRole(userData.role, userData.designation);
    const slug = userData.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const newUser: User = {
      uid: userRecord.uid,
      name: userData.name,
      email: userData.email.toLowerCase(),
      role: userData.role,
      designation: userData.designation,
      faculty: userData.faculty,
      department: userData.department,
      institute: userData.institute,
      campus: userData.campus || 'Goa',
      faculties: userData.faculties || [],
      allowedModules: defaultModules,
      profileComplete: true,
      hasCompletedTutorial: false,
      phoneNumber: userData.phoneNumber || '',
      slug,
    };

    await adminDb.collection("users").doc(userRecord.uid).set(newUser);
    await logActivity("INFO", "Super-admin created guest evaluator account", { 
      uid: userRecord.uid, 
      email: userData.email, 
      role: userData.role 
    });

    return { success: true, tempPassword };
  } catch (error: any) {
    console.error("Error creating guest evaluator account:", error);
    return { success: false, error: error.message || "Failed to create account." };
  }
}

export async function getUserByMisId(misId: string): Promise<User | null> {
  try {
    const usersRef = adminDb.collection("users")
    let snapshot = await usersRef.where("misId", "==", misId).limit(1).get()
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      return { ...doc.data(), uid: doc.id } as User;
    }

    // Try by slug
    snapshot = await usersRef.where("slug", "==", misId.toLowerCase()).limit(1).get()
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      return { ...doc.data(), uid: doc.id } as User;
    }

    // Fallback computed slug match for users without slug field
    const allSnapshot = await usersRef.get();
    for (const doc of allSnapshot.docs) {
      const data = doc.data();
      if (data.name) {
        const computedSlug = data.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        if (computedSlug === misId.toLowerCase()) {
          return { ...data, uid: doc.id } as User;
        }
      }
    }

    return null;
  } catch (error) {
    console.error("Error fetching user by MIS ID/slug:", error);
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

    const emailText = `Code Requested: ${otp}\n\nYour verification code is: ${otp}\n\nPlease use this code to complete your login for the PU Goa Research Projects Portal. This code will expire in 10 minutes.\n\nIf you did not request this code, you can safely ignore this email.`;

    const emailHtml = `
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "EmailMessage",
        "description": "Your login verification code is ${otp}"
      }
      </script>
      <div ${EMAIL_STYLES.background}>
        ${EMAIL_STYLES.logo}
        <div style="text-align:center; padding: 15px 0 10px 0;">
          <p style="margin: 0; color: #b0bec5; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px;">Code Requested</p>
          <h2 style="color:#ffffff; font-size:22px; font-weight:bold; margin: 8px 0 16px 0;">Your Verification Code</h2>
          <p style="color:#e0e0e0; font-size: 14px; margin: 0 0 20px 0;">Please use the following code to complete your login. This code will expire in 10 minutes.</p>
          <div style="margin: 25px 0;">
            <span style="background-color:#1e293b; color:#ffffff; display:inline-block; padding: 12px 28px; font-size:28px; font-weight: 700; letter-spacing: 8px; border-radius: 8px; font-family: 'Courier New', Courier, monospace; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              ${otp}
            </span>
          </div>
          <p style="color:#94a3b8; font-size: 12px; margin-top: 15px;">If you did not request this verification code, you can safely ignore this email.</p>
        </div>
        ${EMAIL_STYLES.footer}
      </div>
    `;

    await sendEmailUtility({
      to: email,
      subject: `${otp} is your verification code for PU Goa Research Portal`,
      text: emailText,
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


/**
 * Generates a custom token for a user matching a specific MIS ID.
 * Only callable by authenticated Super-admins.
 */
export async function impersonateUserByMisId(callerUid: string, targetMisId: string): Promise<{
  success: boolean;
  error?: string;
  customToken?: string;
}> {
  try {
    const callerSnap = await adminDb.collection('users').doc(callerUid).get();
    if (!callerSnap.exists || callerSnap.data()?.role !== 'Super-admin') {
      return { success: false, error: 'Unauthorized. Impersonation is restricted to Super-admins.' };
    }

    const targetSnap = await adminDb.collection('users').where('misId', '==', targetMisId).limit(1).get();
    if (targetSnap.empty) {
      return { success: false, error: `No user found with MIS ID "${targetMisId}".` };
    }

    const targetUserDoc = targetSnap.docs[0];
    const targetUid = targetUserDoc.id;

    const customToken = await adminAuth.createCustomToken(targetUid);
    
    return { success: true, customToken };
  } catch (error: any) {
    console.error("Impersonation error:", error);
    return { success: false, error: error.message || "Failed to impersonate user." };
  }
}

/**
 * Generates a custom token to return to the Super-admin account.
 * Crucially, verifies that the target UID has the role 'Super-admin' in the database.
 */
export async function revertImpersonation(adminUid: string): Promise<{
  success: boolean;
  error?: string;
  customToken?: string;
}> {
  try {
    const adminSnap = await adminDb.collection('users').doc(adminUid).get();
    if (!adminSnap.exists || adminSnap.data()?.role !== 'Super-admin') {
      return { success: false, error: 'Unauthorized. Target account must be a Super-admin.' };
    }

    const customToken = await adminAuth.createCustomToken(adminUid);
    return { success: true, customToken };
  } catch (error: any) {
    console.error("Revert impersonation error:", error);
    return { success: false, error: error.message || "Failed to switch back to admin." };
  }
}
