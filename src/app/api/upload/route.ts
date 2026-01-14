import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

// Initialize Firebase Admin SDK
const firebaseApps = getApps();
if (!firebaseApps.length) {
  initializeApp({
    credential: cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

// Configuration
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid authorization token" },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    let userId: string;

    try {
      const decodedToken = await getAuth().verifyIdToken(token);
      userId = decodedToken.uid;
    } catch (error) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    // 2. Validate content type (FormData sends multipart/form-data)
    const contentType = req.headers.get("content-type");
    if (!contentType || !contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Invalid content type. Expected multipart/form-data" },
        { status: 400 }
      );
    }

    // 3. Check content length before processing
    const contentLength = req.headers.get("content-length");
    if (contentLength) {
      const fileSizeBytes = parseInt(contentLength, 10);
      if (fileSizeBytes > MAX_FILE_SIZE) {
        return NextResponse.json(
          {
            error: `File size exceeds maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)} MB`,
          },
          { status: 413 }
        );
      }
    }

    // 4. Stream the file to your blob storage
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file size again
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `File size exceeds maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)} MB`,
        },
        { status: 413 }
      );
    }

    // Validate file MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `File type ${file.type} is not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    // 5. Upload to Firebase Storage with Vercel Blob as fallback
    const blob = await file.arrayBuffer();
    const buffer = Buffer.from(blob);
    
    let uploadUrl: string | null = null;
    let uploadedVia = "unknown";

    // Try Firebase Storage first
    try {
      const fileName = `uploads/${userId}/${Date.now()}-${file.name}`;
      const bucket = getStorage().bucket();
      const fileRef = bucket.file(fileName);

      await fileRef.save(buffer, {
        metadata: {
          contentType: file.type,
          metadata: {
            originalName: file.name,
            uploadedBy: userId,
          },
        },
      });

      // Make file publicly readable
      await fileRef.makePublic();
      uploadUrl = fileRef.publicUrl();
      uploadedVia = "firebase-storage";
    } catch (firebaseError: any) {
      console.warn("Firebase Storage upload failed, falling back to Vercel Blob:", firebaseError.message);
      
      // Fallback to Vercel Blob if Firebase fails or is not configured
      if (process.env.NEXT_PUBLIC_PERSONAL_STORAGE_URL) {
        try {
          const uploadFormData = new FormData();
          uploadFormData.append("file", new Blob([blob], { type: file.type }));
          uploadFormData.append("userId", userId);
          uploadFormData.append("originalName", file.name);

          const response = await fetch(
            `${process.env.NEXT_PUBLIC_PERSONAL_STORAGE_URL}/api/upload`,
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${process.env.PERSONAL_STORAGE_API_TOKEN}`,
              },
              body: uploadFormData,
            }
          );

          if (response.ok) {
            const uploadResult = await response.json();
            uploadUrl = uploadResult.url || uploadResult.uploadedUrl || `${process.env.NEXT_PUBLIC_PERSONAL_STORAGE_URL}/${uploadResult.path || file.name}`;
            uploadedVia = "vercel-blob";
          } else {
            throw new Error(`Vercel Blob upload failed with status ${response.status}`);
          }
        } catch (blobError: any) {
          console.error("Vercel Blob upload also failed:", blobError.message);
          throw new Error(`All storage backends failed: ${blobError.message}`);
        }
      } else {
        throw new Error("Firebase Storage failed and Vercel Blob is not configured");
      }
    }

    return NextResponse.json(
      {
        ok: true,
        message: "File uploaded successfully",
        file: {
          name: file.name,
          size: file.size,
          type: file.type,
          uploadedAt: new Date().toISOString(),
          userId,
          uploadedUrl: uploadUrl,
          uploadedVia,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      {
        error: "Failed to process upload",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// OPTIONS for CORS preflight
export async function OPTIONS(req: NextRequest) {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGINS || "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    }
  );
}
