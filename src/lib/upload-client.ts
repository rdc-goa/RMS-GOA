import { auth } from "@/lib/config";

/**
 * Upload a file to the secure upload endpoint
 * Handles authentication, file validation, and streaming
 */
export async function uploadFileToApi(
  file: File,
  options?: {
    onProgress?: (progress: number) => void;
    signal?: AbortSignal;
    path?: string;
  }
): Promise<{ success: boolean; url?: string; error?: string; fileData?: any }> {
  try {
    // Get Firebase auth token
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: "User not authenticated" };
    }

    const token = await user.getIdToken();

    // Create FormData with file
    const formData = new FormData();
    formData.append("file", file);
    if (options?.path) {
      formData.append("path", options.path);
    }

    // Upload to the new API route with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch("/api/upload", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
      body: formData,
      signal: options?.signal || controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error || errorData.message || `Upload failed with status ${response.status}`;
      return {
        success: false,
        error: errorMessage,
      };
    }

    const result = await response.json();
    return {
      success: true,
      url: result.file?.uploadedUrl || result.uploadedUrl || result.url,
      fileData: result.file || result,
    };
  } catch (error: any) {
    console.error("Upload error:", error);
    
    // Provide specific error messages
    let errorMessage = "Failed to upload file";
    if (error.name === "AbortError") {
      errorMessage = "Upload timeout - server did not respond";
    } else if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
      errorMessage = "Network error - unable to reach server";
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    return {
      success: false,
      error: errorMessage,
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
