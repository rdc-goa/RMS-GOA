'use server';

import nodemailer from 'nodemailer';
import { getSystemSettings } from '@/app/actions';
import { logEvent } from '@/lib/logger';

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_AUTH_USER = process.env.GMAIL_AUTH_USER || process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const RDC_EMAIL = process.env.RDC_EMAIL;
const RDC_PASSWORD = process.env.RDC_PASSWORD;
const NOREPLY_EMAIL = process.env.NOREPLY_EMAIL || 'noreply.rdc@paruluniversity.ac.in';
const NOREPLY_PASSWORD = process.env.NOREPLY_PASSWORD;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
  console.warn(
    'Default email features are disabled. Please provide GMAIL_USER and GMAIL_APP_PASSWORD in your .env file.'
  );
}
if (!RDC_EMAIL || !RDC_PASSWORD) {
  console.warn(
    'RDC announcement email features are disabled. Please provide RDC_EMAIL and RDC_PASSWORD in your .env file.'
  );
}
if (!NOREPLY_PASSWORD) {
  console.warn(
    'Noreply email features are disabled. Please provide NOREPLY_PASSWORD in your .env file. Falling back to default if used.'
  );
}


// Transporter for general app notifications (e.g., status updates)
const defaultTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_AUTH_USER,
    pass: GMAIL_APP_PASSWORD,
  },
});

// Transporter for RDC announcements (e.g., new funding calls)
const rdcTransporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: RDC_EMAIL,
    pass: RDC_PASSWORD,
  },
});

// Transporter for noreply emails
const noreplyTransporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: NOREPLY_EMAIL,
    pass: NOREPLY_PASSWORD,
  },
});

interface EmailOptions {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html: string;
  attachments?: { filename: string; path: string }[];
  from: 'default' | 'rdc' | 'noreply';
  category?: 'IMR' | 'EMR' | 'Incentive' | 'Other';
  icalEvent?: {
    filename: string;
    method: 'REQUEST';
    content: string;
  };
}

type MailSendResult = {
  success: boolean;
  error?: string;
  message?: string;
};

export async function sendEmail({ to, cc, bcc, subject, html, attachments, from = 'default', icalEvent, category }: EmailOptions): Promise<MailSendResult> {
  // DND Check
  try {
    const settings = await getSystemSettings();
    if (settings.dndEmail && to.toLowerCase() === settings.dndEmail.toLowerCase()) {
      console.log(`Email to ${to} blocked due to DND setting.`);
      return { success: true, message: 'Email blocked by DND setting.' };
    }
  } catch (e) {
    console.error("Could not fetch system settings to check DND, proceeding to send email.", e);
  }

  const isDefaultConfigured = GMAIL_USER && GMAIL_APP_PASSWORD;
  const isRdcConfigured = RDC_EMAIL && RDC_PASSWORD;
  const isNoreplyConfigured = NOREPLY_EMAIL && NOREPLY_PASSWORD;

  let transporter;
  let fromAddress: string;
  let selectedSender: 'default' | 'rdc' | 'noreply';

  if (from === 'rdc') {
    if (!isRdcConfigured) {
      if (!isDefaultConfigured) {
        console.error(`RDC email not sent to ${to}: no RDC or default email service is configured.`);
        return { success: false, error: 'No email service is configured on the server.' };
      }
      console.warn(`RDC email service is not configured. Falling back to default email account for ${to}.`);
      transporter = defaultTransporter;
      fromAddress = `"Research & Development Cell - PU" <${GMAIL_USER}>`;
      selectedSender = 'default';
    } else {
      transporter = rdcTransporter;
      fromAddress = `"Research & Development Cell - PU" <${RDC_EMAIL}>`;
      selectedSender = 'rdc';
    }
  } else if (from === 'noreply') {
    if (!isNoreplyConfigured) {
      console.warn(`Noreply dedicated password not configured. Using default transporter with noreply alias for ${to}.`);
      if (!isDefaultConfigured) {
        console.error(`Default email not sent to ${to}: Default email service is not configured.`);
        return { success: false, error: 'Default email service not configured on the server.' };
      }
      transporter = defaultTransporter;
      fromAddress = `"Research & Development Cell - PU" <${NOREPLY_EMAIL}>`;
      selectedSender = 'noreply';
    } else {
      transporter = noreplyTransporter;
      fromAddress = `"Research & Development Cell - PU" <${NOREPLY_EMAIL}>`;
      selectedSender = 'noreply';
    }
  } else {
    if (!isDefaultConfigured) {
      console.error(`Default email not sent to ${to}: Default email service is not configured.`);
      return { success: false, error: 'Default email service not configured on the server.' };
    }
    transporter = defaultTransporter;
    fromAddress = `"Research & Development Cell - PU" <${GMAIL_USER}>`;
    selectedSender = 'default';
  }

  let finalBcc = bcc;

  const mailOptions = {
    from: fromAddress,
    to: to,
    cc: cc,
    bcc: finalBcc,
    subject: subject,
    html: html,
    attachments: attachments,
    icalEvent: icalEvent,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to ${to} from ${selectedSender} account.`);
    await logEvent('NOTIFICATION', `Email sent successfully: ${subject}`, {
      metadata: { to, subject, from: selectedSender, attachments: attachments?.length || 0 },
      status: 'success'
    });
    return { success: true };
  } catch (error: any) {
    const canRetryWithDefault =
      (selectedSender === 'rdc' || selectedSender === 'noreply') &&
      isDefaultConfigured &&
      GMAIL_USER &&
      GMAIL_USER !== (selectedSender === 'rdc' ? RDC_EMAIL : NOREPLY_EMAIL);

    if (canRetryWithDefault) {
      const fallbackFromAddress = `"Research & Development Cell - PU" <${GMAIL_USER}>`;
      try {
        await defaultTransporter.sendMail({
          ...mailOptions,
          from: fallbackFromAddress,
        });
        console.warn(`${selectedSender.toUpperCase()} email failed for ${to}. Sent successfully using default account instead.`);
        await logEvent('NOTIFICATION', `Fallback email sent successfully: ${subject}`, {
          metadata: { to, subject, from: 'default', originalError: error.message },
          status: 'warning'
        });
        return {
          success: true,
          message: `Sent using default email account after ${selectedSender} account failed.`,
        };
      } catch (fallbackError: any) {
        console.error(`Fallback email attempt also failed for ${to}.`, fallbackError);
      }
    }

    console.error(`--- EMAIL SENDING ERROR ---`);
    console.error(`Timestamp: ${new Date().toISOString()}`);
    console.error(`Recipient: ${to}`);
    console.error(`Subject: ${subject}`);
    console.error(`From: ${fromAddress}`);
    console.error(`Error Message: ${error.message}`);
    console.error(`Full Error Object:`, error);
    console.error(`---------------------------`);
    await logEvent('NOTIFICATION', `Email sending failed: ${subject}`, {
      metadata: { to, subject, error: error.message, stack: error.stack },
      status: 'error'
    });
    return { success: false, error: error.message };
  }
}
