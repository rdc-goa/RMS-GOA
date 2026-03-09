import { NextRequest, NextResponse } from "next/server";
import { uploadFileToServer } from "@/app/actions";
import { getAuth } from "firebase-admin/auth";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

function ensureFirebaseAdminInitialized() {
  if (getApps().length) return;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\n/g, "\n");
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

  if (!projectId || !clientEmail || !privateKey || !storageBucket) {
    throw new Error("Firebase Admin credentials are not configured");
  }

  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    storageBucket,
  });
}

// Configuration
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    ensureFirebaseAdminInitialized();

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
    const requestedPath = formData.get("path");

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

    // 5. Upload using provided path (uses server-side storage logic)
    if (requestedPath && typeof requestedPath === "string") {
      if (requestedPath.includes("..") || requestedPath.startsWith("/")) {
        return NextResponse.json(
          { error: "Invalid upload path" },
          { status: 400 }
        );
      }

      const blob = await file.arrayBuffer();
      const buffer = Buffer.from(blob);
      const base64 = buffer.toString("base64");
      const dataUrl = `data:${file.type};base64,${base64}`;

      const uploadResult = await uploadFileToServer(dataUrl, requestedPath);
      if (!uploadResult.success || !uploadResult.url) {
        return NextResponse.json(
          { error: uploadResult.error || "Upload failed" },
          { status: 500 }
        );
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
            uploadedUrl: uploadResult.url,
            uploadedVia: "server-storage",
            path: requestedPath,
          },
        },
        { status: 200 }
      );
    }

    // 6. Upload to blob storage with Firebase Storage fallback
    const blob = await file.arrayBuffer();
    const buffer = Buffer.from(blob);
    
    let uploadUrl: string | null = null;
    let uploadedVia = "unknown";

    // Try blob storage first
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
          uploadedVia = "blob-storage";
        }
      } catch (blobError: any) {
        console.warn("Blob storage upload failed, falling back to Firebase:", blobError.message);
      }
    }

    // Fallback to Firebase Storage if blob storage fails or is not configured
    if (!uploadUrl) {
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
        console.error("Firebase upload also failed:", firebaseError);
        throw new Error(`All storage backends failed: ${firebaseError.message}`);
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
