import nodemailer from 'nodemailer';
import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/admin';

export async function POST(req: Request) {
  try {
    // Authenticate user and verify role is admin or Super-admin
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid authorization token" },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    try {
      const decodedToken = await adminAuth.verifyIdToken(token);
      const userId = decodedToken.uid;
      
      const { adminDb } = await import('@/lib/admin');
      const userDoc = await adminDb.collection('users').doc(userId).get();
      const userRole = userDoc.data()?.role;
      if (userRole !== 'admin' && userRole !== 'Super-admin') {
        return NextResponse.json(
          { error: "Access Denied: Admin role required" },
          { status: 403 }
        );
      }
    } catch (authError) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    const { email, tempPassword } = await req.json();
    if (!email || !tempPassword) {
      return NextResponse.json({ error: 'Missing email or password' }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
    const adminEmail = process.env.ADMIN_EMAIL;
    const fromEmail = process.env.FROM_EMAIL || process.env.GMAIL_USER;
    const loginUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://rndprojects.goa.paruluniversity.ac.in'}/login`;

    const mailOptions = {
      from: `"Research & Development Cell - PU Goa" <${fromEmail}>`,
      to: email,
      bcc: adminEmail,
      subject: 'Your Guest Evaluator Account Credentials: RDC, Parul University (Goa Campus)',
      html: `<p>Hello,</p>
       <p>Greetings from Parul University Research & Development Cell, Goa Campus!</p>
        <p>Your guest evaluator account has been created. Below are your temporary login details:</p>
        <ul>
          <li><strong>Email:</strong> ${email}</li>
          <li><strong>Temporary Password:</strong> ${tempPassword}</li>
        </ul>
        <p>You can log in at <a href="${loginUrl}">${loginUrl}</a>.</p>
        <p>If you did not request this, please ignore this email.</p>
        <p>Best regards,<br/>Research & Development Cell,<br/>Parul University, Goa</p>`,
    };

    await transporter.sendMail(mailOptions);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error sending guest credentials email:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
