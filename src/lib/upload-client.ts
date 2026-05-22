import { auth, storage } from "@/lib/config";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { uploadFileToServerAction } from "@/app/actions";

/**
 * Upload a file directly to Firebase Storage from the client
 * Bypasses Vercel Serverless Function body size limits (4.5MB)
 * 
 * FALLBACK: If Firebase fails, attempts to upload via Server Action to Google Drive 
 * (Drive fallback is limited to 4.5MB).
 */
export async function uploadFileToApi(
  file: File,
  options?: {
    onProgress?: (progress: number) => void;
    signal?: AbortSignal;
    path?: string;
  }
): Promise<{ success: boolean; url?: string; error?: string; fileData?: any; provider?: 'firebase' | 'googledrive' }> {
  try {
    // 1. Check authentication
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: "User not authenticated - please log in" };
    }

    // 2. Prepare storage reference
    const storagePath = options?.path || `uploads/${user.uid}/${Date.now()}-${file.name}`;
    const storageRef = ref(storage, storagePath);

    // 3. Start resumable upload
    const uploadTask = uploadBytesResumable(storageRef, file, {
      contentType: file.type,
      customMetadata: {
        originalName: file.name,
        uploadedBy: user.uid,
      }
    });

    // 4. Handle progress and completion via Promise
    const firebaseResult = await new Promise<{ success: boolean; url?: string; error?: string; provider?: 'firebase' }>((resolve) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          if (options?.onProgress) {
            options.onProgress(Math.round(progress));
          }
        },
        (error) => {
          console.error("Firebase upload error:", error);
          resolve({
            success: false,
            error: error.message || "Failed to upload file to storage",
          });
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            resolve({
              success: true,
              url: downloadURL,
              provider: 'firebase'
            });
          } catch (urlError: any) {
            console.error("Error getting download URL:", urlError);
            resolve({
              success: false,
              error: "Upload succeeded but failed to retrieve URL",
            });
          }
        }
      );

      if (options?.signal) {
        options.signal.addEventListener("abort", () => {
          uploadTask.cancel();
          resolve({ success: false, error: "Upload cancelled by user" });
        });
      }
    });

    // 5. IF FIREBASE FAILED, TRY GOOGLE DRIVE FALLBACK
    if (!firebaseResult.success && firebaseResult.error !== "Upload cancelled by user") {
      console.warn("Firebase upload failed, attempting Google Drive fallback...", firebaseResult.error);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', storagePath);

      const driveResult = await uploadFileToServerAction(formData);

      if (driveResult.success) {
        return {
          success: true,
          url: driveResult.url,
          provider: 'googledrive',
          fileData: {
            name: file.name,
            size: file.size,
            type: file.type,
            path: storagePath,
            uploadedAt: new Date().toISOString(),
          }
        };
      } else {
        return {
          success: false,
          error: `Both Firebase and Google Drive uploads failed. Drive error: ${driveResult.error}`,
        };
      }
    }

    // 6. Return Firebase result if it was successful
    return {
      ...firebaseResult,
      fileData: firebaseResult.success ? {
        name: file.name,
        size: file.size,
        type: file.type,
        path: storagePath,
        uploadedAt: new Date().toISOString(),
      } : undefined
    };

  } catch (error: any) {
    console.error("Setup error for upload:", error);
    return {
      success: false,
      error: error.message || "An unexpected error occurred during upload setup",
    };
  }
}

/**
 * Validate file before upload
 */
export function validateFile(
  file: File,
  options?: {
    maxSize?: number;
    allowedTypes?: string[];
  }
): { valid: boolean; error?: string } {
  const maxSize = options?.maxSize || 100 * 1024 * 1024; // 100MB default
  const allowedTypes = options?.allowedTypes || [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size exceeds ${maxSize / (1024 * 1024)}MB limit`,
    };
  }

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `File type ${file.type} is not allowed`,
    };
  }

  return { valid: true };
}
