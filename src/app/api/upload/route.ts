import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminStorage } from "@/lib/admin";

// Configuration
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
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
      const decodedToken = await adminAuth.verifyIdToken(token);
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
        { error: `File type ${file.type} is not allowed.` },
        { status: 400 }
      );
    }

    // 5. Upload to Firebase Storage
    const buffer = Buffer.from(await file.arrayBuffer());
    
    const fileName = `uploads/${userId}/${Date.now()}-${file.name}`;
    const bucket = adminStorage.bucket();
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
    const uploadUrl = fileRef.publicUrl();
    
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
        "Access-Control-Allow-Origin": "*", // Be more specific in production
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    }
  );
}
