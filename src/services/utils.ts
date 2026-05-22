import { logEvent, LogCategory } from "@/lib/logger"

export type LogLevel = "INFO" | "WARNING" | "ERROR"

export async function logActivity(level: LogLevel, message: string, context: Record<string, any> = {}) {
  try {
    if (!message) {
      console.error("Log message is empty or undefined.")
      return
    }

    let category: LogCategory = 'AUDIT';
    const lowerMsg = message.toLowerCase();
    if (lowerMsg.includes('project status') || lowerMsg.includes('evaluation') || lowerMsg.includes('phase')) category = 'WORKFLOW';
    else if (lowerMsg.includes('failed') || lowerMsg.includes('error')) category = 'APPLICATION';
    else if (lowerMsg.includes('bulk')) category = 'MIGRATION';
    else if (lowerMsg.includes('login') || lowerMsg.includes('auth')) category = 'AUTH';

    let status: 'info' | 'warning' | 'error' | 'success' = 'info';
    if (level === 'ERROR') status = 'error';
    if (level === 'WARNING') status = 'warning';

    await logEvent(category, message, {
      metadata: context,
      status
    });
  } catch (error) {
    console.error("FATAL: Failed to write to logs collection.", error)
    console.error("Original Log Entry:", { level, message, context })
  }
}

export const EMAIL_STYLES = {
  background:
    'style="background: linear-gradient(135deg, #0f2027, #203a43, #2c5364); color:#ffffff; font-family:Arial, sans-serif; padding:20px; border-radius:8px;"',
  logo: '<div style="text-align:center; margin-bottom:20px;"><img src="https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/RDC-PU-LOGO-WHITE.png" alt="RDC Logo" style="max-width:300px; height:auto;" /></div>',
  footer: ` 
    <p style="color:#b0bec5; margin-top: 30px;">Best Regards,</p>
    <p style="color:#b0bec5;">Research & Development Cell Team,</p>
    <p style="color:#b0bec5;">Parul University Goa</p>
    <hr style="border-top: 1px solid #4f5b62; margin-top: 20px;">
    <p style="font-size:10px; color:#999999; text-align:center; margin-top:10px;">
        This is a system generated automatic email. If you feel this is an error, please report at the earliest.
    </p>`,
}
