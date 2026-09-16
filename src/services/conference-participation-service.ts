'use server';

import { adminDb } from '@/lib/admin';
import { sendEmail } from '@/lib/email';
import type { User } from '@/types';
import { logActivity } from './utils';

export interface ConferenceParticipation {
  id?: string;
  uid: string;
  userName: string;
  userEmail: string;
  misId: string;
  faculty: string;
  institute: string;
  department: string;
  conferenceName: string;
  organizerName: string;
  venue: string;
  presentationType: 'Oral' | 'Poster' | 'Participation Only' | string;
  paperTitle?: string;
  conferenceStartDate: string;
  conferenceEndDate: string;
  registrationFee: number;
  travelFare: number;
  accommodationFare: number;
  totalAmount: number;
  hodEmail: string;
  hodName: string;
  principalEmail: string;
  principalName: string;
  status: 'Pending HOD Approval' | 'Pending Principal Approval' | 'Approved' | 'Rejected';
  hodApproval?: {
    approved: boolean;
    date: string;
    comments?: string;
    email: string;
    name: string;
  };
  principalApproval?: {
    approved: boolean;
    date: string;
    comments?: string;
    email: string;
    name: string;
  };
  submissionDate: string;
  history?: Array<{
    action: string;
    date: string;
    actorEmail: string;
    actorName: string;
    comments?: string;
  }>;
}

// Resolves HOD and Principal names and emails based on system settings matrix config
export async function resolveConferenceHierarchy(userEmail: string) {
  try {
    console.log(`[resolveConferenceHierarchy] userEmail: "${userEmail}"`);
    // 1. Fetch user doc
    const userSnap = await adminDb.collection('users').where('email', '==', userEmail).limit(1).get();
    if (userSnap.empty) {
      console.log(`[resolveConferenceHierarchy] User not found for email: "${userEmail}"`);
      return { success: false, error: 'User profile not found.' };
    }
    const user = userSnap.docs[0].data() as User;
    console.log(`[resolveConferenceHierarchy] User profile loaded: Faculty="${user.faculty}", Institute="${user.institute}", Department="${user.department}"`);

    if (!user.faculty || !user.institute || !user.department) {
      console.log(`[resolveConferenceHierarchy] User academic profile is incomplete.`);
      return { success: false, error: 'User academic profile (Faculty, Institute, or Department) is incomplete.' };
    }

    // 2. Fetch system settings
    const settingsSnap = await adminDb.collection('system').doc('settings').get();
    if (!settingsSnap.exists) {
      console.log(`[resolveConferenceHierarchy] system/settings document not found!`);
      return { success: false, error: 'System settings not found.' };
    }
    const systemSettings = settingsSnap.data();
    const matrix = systemSettings?.facultyMatrix || [];
    console.log(`[resolveConferenceHierarchy] Loaded matrix with ${matrix.length} faculties.`);

    const targetFaculty = user.faculty.trim().toLowerCase();
    const targetInstitute = user.institute.trim().toLowerCase();
    const targetDepartment = user.department.trim().toLowerCase();

    let hodEmail: string | null = null;
    let principalEmail: string | null = null;

    for (const fac of matrix) {
      if (fac.name.trim().toLowerCase() === targetFaculty) {
        console.log(`[resolveConferenceHierarchy] Matched Faculty: "${fac.name}"`);
        for (const inst of fac.institutes) {
          if (inst.name.trim().toLowerCase() === targetInstitute) {
            console.log(`[resolveConferenceHierarchy] Matched Institute: "${inst.name}" (email: ${inst.authorityEmail})`);
            principalEmail = inst.authorityEmail || null;
            for (const dept of inst.departments) {
              if (dept.name.trim().toLowerCase() === targetDepartment) {
                console.log(`[resolveConferenceHierarchy] Matched Department: "${dept.name}" (email: ${dept.authorityEmail})`);
                hodEmail = dept.authorityEmail || null;
                break;
              }
            }
            break;
          }
        }
        break;
      }
    }

    console.log(`[resolveConferenceHierarchy] Resolved Emails - HOD: "${hodEmail}", Principal: "${principalEmail}"`);
    let hodName = hodEmail || 'Not Assigned';
    let principalName = principalEmail || 'Not Assigned';

    // Query actual names from the users collection
    if (hodEmail) {
      const hodUserSnap = await adminDb.collection('users').where('email', '==', hodEmail.trim().toLowerCase()).limit(1).get();
      if (!hodUserSnap.empty) {
        hodName = hodUserSnap.docs[0].data().name || hodEmail;
      }
    }

    if (principalEmail) {
      const principalUserSnap = await adminDb.collection('users').where('email', '==', principalEmail.trim().toLowerCase()).limit(1).get();
      if (!principalUserSnap.empty) {
        principalName = principalUserSnap.docs[0].data().name || principalEmail;
      }
    }

    return {
      success: true,
      hod: hodEmail ? { email: hodEmail, name: hodName } : null,
      principal: principalEmail ? { email: principalEmail, name: principalName } : null,
    };
  } catch (error: any) {
    console.error('Error in resolveConferenceHierarchy:', error);
    return { success: false, error: error.message };
  }
}

// Submits a new conference participation request
export async function submitConferenceParticipation(requestData: Omit<ConferenceParticipation, 'status' | 'submissionDate'>) {
  try {
    const submissionDate = new Date().toISOString();
    const payload: ConferenceParticipation = {
      ...requestData,
      status: 'Pending HOD Approval',
      submissionDate,
      history: [
        {
          action: 'Submitted Request',
          date: submissionDate,
          actorEmail: requestData.userEmail,
          actorName: requestData.userName,
        }
      ]
    };

    const docRef = await adminDb.collection('conferenceParticipations').add(payload);
    
    // Log Activity
    await logActivity('INFO', 'Conference participation request submitted', {
      requestId: docRef.id,
      applicantEmail: requestData.userEmail,
      conferenceName: requestData.conferenceName,
    });

    // Send Email to HOD
    if (requestData.hodEmail) {
      const htmlContent = `
        <div style="font-family: sans-serif; padding: 20px; line-height: 1.6;">
          <h2 style="color: #1e293b;">Conference Participation Approval Required</h2>
          <p>Dear ${requestData.hodName || 'HOD'},</p>
          <p>A new request for conference participation approval has been submitted and is pending your review.</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;"/>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; font-weight: bold; width: 180px;">Applicant Name:</td>
              <td style="padding: 6px 0;">${requestData.userName}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-weight: bold;">Department/Institute:</td>
              <td style="padding: 6px 0;">${requestData.department} / ${requestData.institute}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-weight: bold;">Conference Name:</td>
              <td style="padding: 6px 0;">${requestData.conferenceName}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-weight: bold;">Presentation Type:</td>
              <td style="padding: 6px 0;">${requestData.presentationType}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-weight: bold;">Dates:</td>
              <td style="padding: 6px 0;">${new Date(requestData.conferenceStartDate).toLocaleDateString()} to ${new Date(requestData.conferenceEndDate).toLocaleDateString()}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-weight: bold;">Total Estimated Cost:</td>
              <td style="padding: 6px 0; font-weight: bold; color: #0f766e;">₹${requestData.totalAmount.toLocaleString('en-IN')}</td>
            </tr>
          </table>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;"/>
          <p>Please log in to the <strong>R&D Portal</strong> to view details and approve or reject this request.</p>
          <p style="margin-top: 30px; font-size: 12px; color: #64748b;">This is an automated notification. Please do not reply directly to this email.</p>
        </div>
      `;

      await sendEmail({
        to: requestData.hodEmail,
        subject: `[Approval Required] Conference Participation - ${requestData.userName}`,
        html: htmlContent,
        from: 'noreply',
        category: 'Other',
      });
    }

    return { success: true, id: docRef.id };
  } catch (error: any) {
    console.error('Error in submitConferenceParticipation:', error);
    return { success: false, error: error.message };
  }
}

// Processes HOD or Principal approvals
export async function reviewConferenceParticipation(
  requestId: string,
  actorEmail: string,
  actorName: string,
  role: 'HOD' | 'Principal',
  approved: boolean,
  comments?: string
) {
  try {
    const docRef = adminDb.collection('conferenceParticipations').doc(requestId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return { success: false, error: 'Request not found.' };
    }
    const data = docSnap.data() as ConferenceParticipation;

    const now = new Date().toISOString();
    const updatePayload: Partial<ConferenceParticipation> = {};
    const newHistoryItem = {
      action: `${role} ${approved ? 'Approved' : 'Rejected'}`,
      date: now,
      actorEmail,
      actorName,
      comments,
    };

    const updatedHistory = [...(data.history || []), newHistoryItem];
    updatePayload.history = updatedHistory;

    if (role === 'HOD') {
      if (data.status !== 'Pending HOD Approval') {
        return { success: false, error: 'Request is not in HOD review stage.' };
      }
      updatePayload.hodApproval = {
        approved,
        date: now,
        comments,
        email: actorEmail,
        name: actorName,
      };

      if (approved) {
        updatePayload.status = 'Pending Principal Approval';
        // Email Principal
        if (data.principalEmail) {
          const htmlContent = `
            <div style="font-family: sans-serif; padding: 20px; line-height: 1.6;">
              <h2 style="color: #1e293b;">Conference Participation Approval Required</h2>
              <p>Dear ${data.principalName || 'Principal'},</p>
              <p>HOD (${actorName}) has approved the conference participation request for <strong>${data.userName}</strong>. It is now pending your final approval.</p>
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;"/>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 6px 0; font-weight: bold; width: 180px;">Applicant Name:</td>
                  <td style="padding: 6px 0;">${data.userName}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-weight: bold;">Department/Institute:</td>
                  <td style="padding: 6px 0;">${data.department} / ${data.institute}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-weight: bold;">Conference Name:</td>
                  <td style="padding: 6px 0;">${data.conferenceName}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-weight: bold;">Total Estimated Cost:</td>
                  <td style="padding: 6px 0; font-weight: bold; color: #0f766e;">₹${data.totalAmount.toLocaleString('en-IN')}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-weight: bold;">HOD Comments:</td>
                  <td style="padding: 6px 0; font-style: italic;">"${comments || 'No comments'}"</td>
                </tr>
              </table>
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;"/>
              <p>Please log in to the <strong>R&D Portal</strong> to view details and approve or reject this request.</p>
              <p style="margin-top: 30px; font-size: 12px; color: #64748b;">This is an automated notification. Please do not reply directly to this email.</p>
            </div>
          `;
          await sendEmail({
            to: data.principalEmail,
            subject: `[Approval Required] Conference Participation - ${data.userName}`,
            html: htmlContent,
            from: 'noreply',
            category: 'Other',
          });
        }
      } else {
        updatePayload.status = 'Rejected';
        // Email Applicant
        await sendRejectionEmail(data, role, actorName, comments);
      }
    } else if (role === 'Principal') {
      if (data.status !== 'Pending Principal Approval') {
        return { success: false, error: 'Request is not in Principal review stage.' };
      }
      updatePayload.principalApproval = {
        approved,
        date: now,
        comments,
        email: actorEmail,
        name: actorName,
      };

      if (approved) {
        updatePayload.status = 'Approved';
        // Email Applicant about final approval
        const htmlContent = `
          <div style="font-family: sans-serif; padding: 20px; line-height: 1.6;">
            <h2 style="color: #0f766e;">Conference Participation Approved</h2>
            <p>Dear ${data.userName},</p>
            <p>Congratulations! Your request for conference participation approval has been <strong>Approved</strong> by the HOD and Principal.</p>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;"/>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; font-weight: bold; width: 180px;">Conference Name:</td>
                <td style="padding: 6px 0;">${data.conferenceName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold;">Estimated Budget:</td>
                <td style="padding: 6px 0;">₹${data.totalAmount.toLocaleString('en-IN')}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold;">Status:</td>
                <td style="padding: 6px 0; font-weight: bold; color: #0f766e;">Approved</td>
              </tr>
            </table>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;"/>
            <p>You can now participate in the conference. Keep your invoices, certificates, and presentation proof safe to apply for reimbursement / incentives afterwards.</p>
            <p style="margin-top: 30px; font-size: 12px; color: #64748b;">This is an automated notification. Please do not reply directly to this email.</p>
          </div>
        `;
        await sendEmail({
          to: data.userEmail,
          subject: `[Approved] Conference Participation Request - ${data.conferenceName}`,
          html: htmlContent,
          from: 'noreply',
          category: 'Other',
        });
      } else {
        updatePayload.status = 'Rejected';
        // Email Applicant
        await sendRejectionEmail(data, role, actorName, comments);
      }
    }

    await docRef.update(updatePayload);

    await logActivity('INFO', `Conference participation request reviewed by ${role}`, {
      requestId,
      actorEmail,
      approved,
      status: updatePayload.status,
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error in reviewConferenceParticipation:', error);
    return { success: false, error: error.message };
  }
}

// Helper to send rejection email
async function sendRejectionEmail(data: ConferenceParticipation, role: string, actorName: string, comments?: string) {
  const htmlContent = `
    <div style="font-family: sans-serif; padding: 20px; line-height: 1.6;">
      <h2 style="color: #dc2626;">Conference Participation Request Rejected</h2>
      <p>Dear ${data.userName},</p>
      <p>Your request for conference participation approval has been <strong>Rejected</strong> by the ${role} (${actorName}).</p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;"/>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 0; font-weight: bold; width: 180px;">Conference Name:</td>
          <td style="padding: 6px 0;">${data.conferenceName}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold;">Reviewing Stage:</td>
          <td style="padding: 6px 0;">${role} Review</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; font-weight: bold;">Comments/Reason:</td>
          <td style="padding: 6px 0; color: #b91c1c; font-weight: 500;">"${comments || 'No comments provided'}"</td>
        </tr>
      </table>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;"/>
      <p>Please resolve the issues mentioned above and re-submit your request if necessary.</p>
      <p style="margin-top: 30px; font-size: 12px; color: #64748b;">This is an automated notification. Please do not reply directly to this email.</p>
    </div>
  `;
  await sendEmail({
    to: data.userEmail,
    subject: `[Rejected] Conference Participation Request - ${data.conferenceName}`,
    html: htmlContent,
    from: 'noreply',
    category: 'Other',
  });
}
