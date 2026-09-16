import { logEvent, LogCategory } from "@/lib/logger"

export type LogLevel = "INFO" | "WARNING" | "ERROR"

export async function logActivity(level: LogLevel, message: string, context: Record<string, any> = {}) {
  try {
    let status: 'info' | 'warning' | 'error' | 'success' = 'info';
    if (level === 'ERROR') status = 'error';
    if (level === 'WARNING') status = 'warning';

    let category: LogCategory = 'AUDIT';
    const lowerMsg = message.toLowerCase();
    if (
      lowerMsg.includes('project status') || 
      lowerMsg.includes('evaluation') || 
      lowerMsg.includes('phase') || 
      lowerMsg.includes('status updated') || 
      lowerMsg.includes('booking') || 
      lowerMsg.includes('submitted') || 
      lowerMsg.includes('deleted') || 
      lowerMsg.includes('transition')
    ) {
      category = 'WORKFLOW';
    }
    else if (lowerMsg.includes('failed') || lowerMsg.includes('error')) category = 'APPLICATION';
    else if (lowerMsg.includes('bulk')) category = 'MIGRATION';
    else if (lowerMsg.includes('login') || lowerMsg.includes('auth')) category = 'AUTH';
    else if (lowerMsg.includes('security') || lowerMsg.includes('permission')) category = 'SECURITY';

    const finalContext = { ...context };
    const entityId = context.submissionId || context.projectId || context.claimId || context.bookingId || context.interestId;
    if (entityId) {
      finalContext.submissionId = entityId;
    }

    await logEvent(category, message, {
      metadata: finalContext,
      status
    });
  } catch (error) {
    console.error("Failed to log activity:", error);
  }
}

export const EMAIL_STYLES = {
  background:
    'style="background: linear-gradient(135deg, #0f2027, #203a43, #2c5364); color:#ffffff; font-family:Arial, sans-serif; padding:20px; border-radius:8px;"',
  logo: '<div style="text-align:center; margin-bottom:20px;"><img src="https://atkqjlzikx23ms5d.public.blob.vercel-storage.com/Pu%20Goa%20White.png" alt="RDC Logo" style="max-width:300px; height:auto;" /></div>',
  footer: ` 
    <p style="color:#b0bec5; margin-top: 30px;">Best Regards,</p>
    <p style="color:#b0bec5;">Research & Development Cell Team,</p>
    <p style="color:#b0bec5;">Parul University Goa</p>
    <hr style="border-top: 1px solid #4f5b62; margin-top: 20px;">
    <p style="font-size:10px; color:#999999; text-align:center; margin-top:10px;">
        This is a system generated automatic email. If you feel this is an error, please report at the earliest.
    </p>`,
}

export function validateUploadedFile(
  buffer: Buffer,
  mimeType: string,
  path: string
): { valid: boolean; error?: string } {
  const mimeLower = mimeType.toLowerCase().trim();
  const pathLower = path.toLowerCase().trim();

  // 1. Block dangerous/executable web files (HTML, SVG, Javascript)
  if (
    mimeLower.includes("svg") ||
    mimeLower.includes("html") ||
    mimeLower.includes("javascript") ||
    (mimeLower.includes("xml") && !mimeLower.includes("openxmlformats")) ||
    pathLower.endsWith(".svg") ||
    pathLower.endsWith(".html") ||
    pathLower.endsWith(".htm") ||
    pathLower.endsWith(".xml")
  ) {
    return {
      valid: false,
      error: "SVG, HTML, XML, or web executable files are not allowed for security reasons.",
    };
  }

  // 2. Profile picture specific restrictions (strict image whitelist)
  if (pathLower.includes("profile-pictures/")) {
    const isAllowedImage =
      mimeLower === "image/jpeg" ||
      mimeLower === "image/jpg" ||
      mimeLower === "image/png";

    if (!isAllowedImage) {
      return {
        valid: false,
        error: "Only JPEG, JPG, and PNG images are allowed for profile pictures.",
      };
    }

    // Verify magic bytes for JPEG and PNG
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;

    if (!isJpeg && !isPng) {
      return {
        valid: false,
        error: "Invalid image content. The uploaded file does not match allowed image formats.",
      };
    }

    return { valid: true };
  }

  // 3. Global whitelist for all uploads
  const ALLOWED_MIME_TYPES = [
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/zip",
    "application/x-zip-compressed",
  ];

  if (!ALLOWED_MIME_TYPES.includes(mimeLower)) {
    return {
      valid: false,
      error: `File type ${mimeType} is not allowed.`,
    };
  }

  // Magic bytes check for whitelist
  const isPdf = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isZipOrDocxOrPptx = buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  const isOldOffice =
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0 &&
    buffer[4] === 0xa1 &&
    buffer[5] === 0xb1 &&
    buffer[6] === 0x1a &&
    buffer[7] === 0xe1;

  if (!isPdf && !isPng && !isJpeg && !isZipOrDocxOrPptx && !isOldOffice) {
    return {
      valid: false,
      error: "File content verification failed. The file format is invalid or corrupted.",
    };
  }

  return { valid: true };
}
