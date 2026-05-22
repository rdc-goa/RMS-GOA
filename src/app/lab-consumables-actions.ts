'use server'

import { adminDb } from '@/lib/admin'
import admin from 'firebase-admin'
import { sendEmail } from '@/lib/email'

const EMAIL_STYLES = {
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
};

export async function submitLabConsumable(data: any) {
    try {
        const counterRef = adminDb.collection('system').doc('labConsumablesCounter');

        const refNo = await adminDb.runTransaction(async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            let newCount = 1;
            if (counterDoc.exists) {
                const currentData = counterDoc.data();
                newCount = (typeof currentData?.count === 'number' ? currentData.count : 0) + 1;
            }
            transaction.set(counterRef, { count: newCount }, { merge: true });
            const generatedRef = `RDC/CONSUMABLES/${newCount.toString().padStart(4, '0')}`;
            console.log(`[Counter] Generated reference number: ${generatedRef}`);
            return generatedRef;
        });

        const submissionData = {
            ...data,
            refNo: refNo,
            status: 'Pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const docRef = await adminDb.collection('labConsumables').add(submissionData);
        console.log(`[Submission] Lab consumable request saved with ID: ${docRef.id}`);

        const emailHtml = `
      <div ${EMAIL_STYLES.background}>
        ${EMAIL_STYLES.logo}
        <h2 style="color: #ffffff; border-bottom: 2px solid #64b5f6; padding-bottom: 10px; margin-bottom: 20px;">Lab Consumable Request Submitted</h2>
        <p style="color: #ffffff;">Dear ${data.applicantName},</p>
        <p style="color: #e0e0e0;">Your request for lab consumables has been successfully submitted. Here are the details:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px; background-color: rgba(0,0,0,0.2); border-radius: 8px;">
          <tr><td style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1); font-weight: bold; color: #ffffff;">Reference Number</td><td style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1); color: #e0e0e0;">${refNo}</td></tr>
          <tr><td style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1); font-weight: bold; color: #ffffff;">Date Applied</td><td style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1); color: #e0e0e0;">${new Date().toLocaleDateString()}</td></tr>
          <tr><td style="padding: 10px; font-weight: bold; color: #ffffff;">Lab Name</td><td style="padding: 10px; color: #e0e0e0;">${data.labName}</td></tr>
        </table>
        
        <h3 style="color: #ffffff; margin-top: 30px;">Items Requested</h3>
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px; background-color: rgba(0,0,0,0.2);">
          <thead>
            <tr>
              <th style="padding: 10px; border: 1px solid rgba(255,255,255,0.1); background-color: rgba(0,0,0,0.3); color: #ffffff; text-align: left;">Item</th>
              <th style="padding: 10px; border: 1px solid rgba(255,255,255,0.1); background-color: rgba(0,0,0,0.3); color: #ffffff; text-align: left;">Qty Present</th>
              <th style="padding: 10px; border: 1px solid rgba(255,255,255,0.1); background-color: rgba(0,0,0,0.3); color: #ffffff; text-align: left;">Qty Required</th>
              <th style="padding: 10px; border: 1px solid rgba(255,255,255,0.1); background-color: rgba(0,0,0,0.3); color: #ffffff; text-align: left;">Justification</th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map((item: any) => `
              <tr>
                <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.1); color: #e0e0e0;">${item.itemsDescription}</td>
                <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.1); color: #e0e0e0;">${item.qtyPresent || '0'}</td>
                <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.1); color: #e0e0e0;">${item.qtyRequired}</td>
                <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.1); color: #e0e0e0;">${item.justification}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <p style="color: #e0e0e0; margin-top: 20px;">You will be notified once your request has been reviewed.</p>
        ${EMAIL_STYLES.footer}
      </div>
    `;

        await sendEmail({
            to: data.applicantEmail,
            subject: `Lab Consumable Request Submitted - ${refNo}`,
            html: emailHtml,
            from: 'noreply',
        });

        return { success: true, refNo }
    } catch (error: any) {
        console.error('Error submitting lab consumable request:', error)
        return { success: false, error: error.message }
    }
}

export async function approveLabConsumable(id: string) {
    try {
        const docRef = adminDb.collection('labConsumables').doc(id)
        await docRef.update({ status: 'Approved' })

        const snapshot = await docRef.get()
        if (snapshot.exists) {
            const data = snapshot.data()!
            const emailHtml = `
        <div ${EMAIL_STYLES.background}>
          ${EMAIL_STYLES.logo}
          <h2 style="color: #4caf50; border-bottom: 2px solid #4caf50; padding-bottom: 10px; margin-bottom: 20px;">Lab Consumable Request Approved</h2>
          <p style="color: #ffffff;">Dear ${data.applicantName},</p>
          <p style="color: #e0e0e0;">Your request for lab consumables has been <strong style="color: #ffffff;">approved</strong>.</p>
          <p style="color: #e0e0e0;">You can now proceed with the collection of the requested items from the admin office.</p>
          ${EMAIL_STYLES.footer}
        </div>
      `;

            await sendEmail({
                to: data.applicantEmail,
                subject: `Lab Consumable Request Approved`,
                html: emailHtml,
                from: 'noreply',
            });
        }

        return { success: true }
    } catch (error: any) {
        console.error('Error approving lab consumable:', error)
        return { success: false, error: error.message }
    }
}

export async function fetchAllLabConsumables() {
    try {
        const querySnapshot = await adminDb.collection('labConsumables').orderBy('createdAt', 'desc').get()
        const items = querySnapshot.docs.map(doc => {
            const data = doc.data()
            let createdAtStr = new Date().toISOString()
            if (data.createdAt && typeof data.createdAt.toDate === 'function') {
                createdAtStr = data.createdAt.toDate().toISOString()
            }
            return {
                id: doc.id,
                ...data,
                createdAt: createdAtStr
            }
        })
        return { success: true, data: items }
    } catch (error: any) {
        console.error('Error fetching lab consumables:', error)
        return { success: false, error: error.message }
    }
}
