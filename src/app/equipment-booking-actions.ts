'use server'

import { adminDb, adminRtdb } from '@/lib/admin'
import { FieldValue, DocumentData } from 'firebase-admin/firestore'
import { sendEmail } from '@/lib/email'
import { sanitizeForRtdb } from '@/lib/rtdb-utils'
import type {
  EquipmentBooking,
  EquipmentCatalogItem,
  BookingFormData,
  EquipmentCatalogFormData,
  BookingStatus,
} from '@/types/equipment-booking'

// ─── Email Style Constants (mirrors lab-consumables-actions.ts) ─────────────
const EMAIL_STYLES = {
  background:
    'style="font-family:Arial, sans-serif; padding:20px; color:#333333; line-height: 1.6; max-width: 600px; margin: 0 auto;"',
  logo: `
    <div style="text-align:center; margin-bottom:20px; background-color:#ffffff; padding:15px; border-radius:8px; display:inline-block; margin: 0 auto; width: 100%; box-sizing: border-box; border: 1px solid #eeeeee;">
      <img src="https://atkqjlzikx23ms5d.public.blob.vercel-storage.com/Pu%20Goa%20White.png" alt="RDC Logo" style="max-width:300px; height:auto; display:block; margin:0 auto;" />
    </div>`,
  footer: `
    <p style="color:#555555; margin-top: 30px;">Best Regards,</p>
    <p style="color:#555555;">Research &amp; Development Cell Team,</p>
    <p style="color:#555555;">Parul University Goa</p>
    <hr style="border-top: 1px solid #eeeeee; margin-top: 20px;">
    <p style="font-size:10px; color:#999999; text-align:center; margin-top:10px;">
        This is a system generated automatic email. If you feel this is an error, please report at the earliest.
    </p>`,
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL

async function updateEquipmentBookingsPendingCount(change: 'increment' | 'decrement') {
  try {
    const pendingRef = adminDb.collection('system').doc('pendingCounts');
    await adminDb.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(pendingRef);
      const data = docSnap.exists ? docSnap.data() : { arps: 0, equipmentBookings: 0 };
      const val = data?.equipmentBookings || 0;
      const newVal = (change === 'increment') ? val + 1 : Math.max(0, val - 1);
      transaction.set(pendingRef, { ...data, equipmentBookings: newVal });
    });
  } catch (err) {
    console.error('Error updating Firestore equipment bookings pending count:', err);
  }
}

// ─── Helper: generate refNo ──────────────────────────────────────────────────
async function generateBookingRefNo(): Promise<string> {
  let newCount = 1;

  try {
    const counterDocRef = adminDb.collection('system').doc('equipmentBookingsCounter');
    await adminDb.runTransaction(async (transaction) => {
      const counterDoc = await transaction.get(counterDocRef);
      if (counterDoc.exists) {
        newCount = (counterDoc.data()?.count || 0) + 1;
      } else {
        newCount = 1;
      }
      transaction.set(counterDocRef, { count: newCount });
    });
  } catch (err) {
    console.error('Failed to increment counter on Firestore:', err);
    throw new Error('Could not generate booking reference number');
  }

  return `RDC/CIF/${newCount.toString().padStart(4, '0')}`;
}

// ─── Helper: serialize RTDB Data ─────────────────────────────────────────────
function serializeBooking(id: string, data: any): EquipmentBooking {
  const toISO = (v: any): string => {
    if (!v) return new Date().toISOString()
    if (typeof v?.toDate === 'function') return v.toDate().toISOString()
    return String(v)
  }
  return {
    id,
    ...data,
    createdAt: toISO(data.createdAt),
    updatedAt: toISO(data.updatedAt),
  } as EquipmentBooking
}

function serializeCatalogItem(id: string, data: DocumentData): EquipmentCatalogItem {
  const toISO = (v: any): string => {
    if (!v) return new Date().toISOString()
    if (typeof v?.toDate === 'function') return v.toDate().toISOString()
    return String(v)
  }
  return {
    id,
    ...data,
    createdAt: toISO(data.createdAt),
    updatedAt: toISO(data.updatedAt),
  } as EquipmentCatalogItem
}

async function getEquipmentPrice(equipmentId: string, category?: string): Promise<number> {
  try {
    const equipDoc = await adminDb.collection('equipmentCatalog').doc(equipmentId).get()
    if (!equipDoc.exists) return 0
    const eqData = equipDoc.data()
    return eqData?.prices?.internal || 0
  } catch (err) {
    console.error('[getEquipmentPrice] Error:', err)
  }
  return 0
}

// ═══════════════════════════════════════════════════════════════════════════════
// USER ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Submit a new equipment booking request.
 * Called from the booking form dialog on the equipment-booking page.
 */
export async function submitEquipmentBooking(
  formData: BookingFormData,
  userProfile: {
    uid: string
    name: string
    email: string
    phone?: string
    department?: string | null
    institute?: string
    designation?: string
    misId?: string
    faculty?: string
    userCategory?: string
  }
): Promise<{ success: boolean; refNo?: string; error?: string }> {
  try {
    const refNo = await generateBookingRefNo()

    const pricePerSample = await getEquipmentPrice(formData.equipmentId, formData.userCategory)
    const totalAmount = pricePerSample * formData.noOfSamples
    const paymentStatus = totalAmount > 0 ? 'Pending' : 'Not Required'

    const submissionData = {
      refNo,
      uid: userProfile.uid,
      applicantName: userProfile.name,
      applicantEmail: userProfile.email,
      applicantPhone: userProfile.phone || '',
      department: userProfile.department || '',
      institute: userProfile.institute || '',
      designation: userProfile.designation || '',
      misId: userProfile.misId || '',
      faculty: userProfile.faculty || '',

      equipmentId: formData.equipmentId,
      equipmentName: formData.equipmentName,
      preferredDate: formData.preferredDate,
      preferredTimeSlot: formData.preferredTimeSlot,
      alternateDate: formData.alternateDate || null,
      noOfSamples: formData.noOfSamples,
      purpose: formData.purpose,
      userCategory: formData.userCategory,
      specialRequirements: formData.specialRequirements || null,

      status: 'Pending' as BookingStatus,
      paymentStatus,
      totalAmount,

      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const newBookingRef = adminRtdb.ref('equipmentBookings').push()
    const bookingId = newBookingRef.key
    if (!bookingId) throw new Error('Failed to generate booking ID')
    await newBookingRef.set(sanitizeForRtdb(submissionData))
    await updateEquipmentBookingsPendingCount('increment')

    try {
      const { logEvent } = await import('@/lib/logger');
      await logEvent('WORKFLOW', 'Equipment booking submitted', {
        metadata: { bookingId, action: 'SUBMIT_BOOKING', from: 'None', to: 'Pending', submissionId: bookingId, refNo, equipmentName: formData.equipmentName },
        user: { uid: userProfile.uid, email: userProfile.email, role: 'faculty' }
      });
    } catch (e) {}

    // ── Confirmation email to user ──────────────────────────────────────────
    const userEmailHtml = `
      <div ${EMAIL_STYLES.background}>
        ${EMAIL_STYLES.logo}
        <h2 style="color:#2c3e50; border-bottom:2px solid #1a73e8; padding-bottom:10px; margin-bottom:20px;">
          Equipment Booking Request Received
        </h2>
        <p style="color:#333333;">Dear ${userProfile.name},</p>
        <p style="color:#555555;">Your equipment booking request has been successfully submitted. Our team will review your request and confirm the slot shortly.</p>
        <table style="width:100%; border-collapse:collapse; margin-top:15px; background-color:#f8f9fa; border: 1px solid #eeeeee; border-radius:8px;">
          <tr><td style="padding:10px; border-bottom:1px solid #eeeeee; font-weight:bold; color:#2c3e50;">Reference Number</td><td style="padding:10px; border-bottom:1px solid #eeeeee; color:#555555;">${refNo}</td></tr>
          <tr><td style="padding:10px; border-bottom:1px solid #eeeeee; font-weight:bold; color:#2c3e50;">Equipment</td><td style="padding:10px; border-bottom:1px solid #eeeeee; color:#555555;">${formData.equipmentName}</td></tr>
          <tr><td style="padding:10px; border-bottom:1px solid #eeeeee; font-weight:bold; color:#2c3e50;">Preferred Date</td><td style="padding:10px; border-bottom:1px solid #eeeeee; color:#555555;">${formData.preferredDate}</td></tr>
          <tr><td style="padding:10px; border-bottom:1px solid #eeeeee; font-weight:bold; color:#2c3e50;">Preferred Slot</td><td style="padding:10px; border-bottom:1px solid #eeeeee; color:#555555;">${formData.preferredTimeSlot}</td></tr>
          <tr><td style="padding:10px; border-bottom:1px solid #eeeeee; font-weight:bold; color:#2c3e50;">No. of Samples</td><td style="padding:10px; border-bottom:1px solid #eeeeee; color:#555555;">${formData.noOfSamples}</td></tr>
          <tr><td style="padding:10px; font-weight:bold; color:#2c3e50;">Status</td><td style="padding:10px; color:#f57f17; font-weight:bold;">Pending</td></tr>
        </table>
        <p style="color:#555555; margin-top:20px;">You will be notified once your request has been reviewed and a slot has been assigned. You can also track your booking status in the <strong style="color:#2c3e50;">My Equipment Bookings</strong> section of the portal.</p>
        ${EMAIL_STYLES.footer}
      </div>
    `
    await sendEmail({
      to: userProfile.email,
      subject: `Booking Request Received — ${refNo}`,
      html: userEmailHtml,
      from: 'noreply',
    })

    // ── Notification email to admin ─────────────────────────────────────────
    if (ADMIN_EMAIL) {
      const adminEmailHtml = `
        <div ${EMAIL_STYLES.background}>
          ${EMAIL_STYLES.logo}
          <h2 style="color:#2c3e50; border-bottom:2px solid #f57f17; padding-bottom:10px; margin-bottom:20px;">
            New Equipment Booking Request
          </h2>
          <p style="color:#333333;">A new equipment booking request has been submitted.</p>
          <table style="width:100%; border-collapse:collapse; margin-top:15px; background-color:#f8f9fa; border: 1px solid #eeeeee; border-radius:8px;">
            <tr><td style="padding:10px; border-bottom:1px solid #eeeeee; font-weight:bold; color:#2c3e50;">Reference No.</td><td style="padding:10px; border-bottom:1px solid #eeeeee; color:#555555;">${refNo}</td></tr>
            <tr><td style="padding:10px; border-bottom:1px solid #eeeeee; font-weight:bold; color:#2c3e50;">Applicant</td><td style="padding:10px; border-bottom:1px solid #eeeeee; color:#555555;">${userProfile.name} (${userProfile.email})</td></tr>
            <tr><td style="padding:10px; border-bottom:1px solid #eeeeee; font-weight:bold; color:#2c3e50;">Equipment</td><td style="padding:10px; border-bottom:1px solid #eeeeee; color:#555555;">${formData.equipmentName}</td></tr>
            <tr><td style="padding:10px; border-bottom:1px solid #eeeeee; font-weight:bold; color:#2c3e50;">Preferred Date</td><td style="padding:10px; border-bottom:1px solid #eeeeee; color:#555555;">${formData.preferredDate}</td></tr>
            <tr><td style="padding:10px; border-bottom:1px solid #eeeeee; font-weight:bold; color:#2c3e50;">Preferred Slot</td><td style="padding:10px; border-bottom:1px solid #eeeeee; color:#555555;">${formData.preferredTimeSlot}</td></tr>
            <tr><td style="padding:10px; border-bottom:1px solid #eeeeee; font-weight:bold; color:#2c3e50;">No. of Samples</td><td style="padding:10px; border-bottom:1px solid #eeeeee; color:#555555;">${formData.noOfSamples}</td></tr>
            <tr><td style="padding:10px; border-bottom:1px solid #eeeeee; font-weight:bold; color:#2c3e50;">Purpose</td><td style="padding:10px; color:#555555;">${formData.purpose}</td></tr>
          </table>
          <p style="color:#555555; margin-top:20px;">Please log in to the <strong style="color:#2c3e50;">RMS Admin Portal</strong> to review and take action on this request.</p>
          ${EMAIL_STYLES.footer}
        </div>
      `
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: `New Equipment Booking — ${refNo} (${formData.equipmentName})`,
        html: adminEmailHtml,
        from: 'noreply',
      })
    }

    return { success: true, refNo }
  } catch (error: any) {
    console.error('[submitEquipmentBooking] Error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Fetch all bookings belonging to a specific user (My Equipment Bookings page).
 */
export async function fetchMyEquipmentBookings(
  uid: string
): Promise<{ success: boolean; data?: EquipmentBooking[]; error?: string }> {
  try {
    const snapshot = await adminRtdb
      .ref('equipmentBookings')
      .orderByChild('uid')
      .equalTo(uid)
      .once('value')

    const val = snapshot.val() || {}
    const data = Object.keys(val)
      .map((key) => serializeBooking(key, val[key]))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return { success: true, data }
  } catch (error: any) {
    console.error('[fetchMyEquipmentBookings] Error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Cancel a pending booking (user-initiated).
 */
export async function cancelEquipmentBooking(
  bookingId: string,
  userUid: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const bookingRef = adminRtdb.ref(`equipmentBookings/${bookingId}`)
    const snap = await bookingRef.once('value')

    if (!snap.exists()) return { success: false, error: 'Booking not found.' }

    const data = snap.val()
    if (data.uid !== userUid) return { success: false, error: 'Unauthorized.' }
    if (data.status !== 'Pending') {
      return { success: false, error: 'Only pending bookings can be cancelled.' }
    }

    await bookingRef.update({
      status: 'Cancelled',
      updatedAt: new Date().toISOString(),
    })
    await updateEquipmentBookingsPendingCount('decrement')

    try {
      const { logEvent } = await import('@/lib/logger');
      await logEvent('WORKFLOW', 'Equipment booking status updated', {
        metadata: { bookingId, action: 'CANCEL_BOOKING', from: data.status, to: 'Cancelled', submissionId: bookingId, refNo: data.refNo },
        user: { uid: userUid, email: '', role: 'faculty' }
      });
    } catch (e) {}

    return { success: true }
  } catch (error: any) {
    console.error('[cancelEquipmentBooking] Error:', error)
    return { success: false, error: error.message }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch all equipment bookings (admin view).
 */
export async function fetchAllEquipmentBookings(): Promise<{
  success: boolean
  data?: EquipmentBooking[]
  error?: string
}> {
  try {
    const snapshot = await adminRtdb.ref('equipmentBookings').once('value')
    const val = snapshot.val() || {}
    const data = Object.keys(val)
      .map((key) => serializeBooking(key, val[key]))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return { success: true, data }
  } catch (error: any) {
    console.error('[fetchAllEquipmentBookings] Error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Admin: Approve and assign a confirmed date + slot to a booking.
 */
export async function approveEquipmentBooking(
  bookingId: string,
  assignedDate: string,
  assignedSlot: string,
  adminRemarks?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const bookingRef = adminRtdb.ref(`equipmentBookings/${bookingId}`)
    const snap = await bookingRef.once('value')
    if (!snap.exists()) return { success: false, error: 'Booking not found.' }

    const data = snap.val()
    if (data.status === 'Slot Assigned' || data.status === 'Approved') {
      return { success: true }
    }

    const pricePerSample = await getEquipmentPrice(data.equipmentId, data.userCategory)
    const totalAmount = data.totalAmount ?? (pricePerSample * data.noOfSamples)
    const paymentStatus = data.paymentStatus === 'Not Required' && totalAmount > 0 ? 'Pending' : (data.paymentStatus || 'Not Required')

    await bookingRef.update({
      status: 'Slot Assigned',
      assignedDate,
      assignedSlot,
      adminRemarks: adminRemarks || null,
      totalAmount,
      paymentStatus,
      updatedAt: new Date().toISOString(),
    })
    await updateEquipmentBookingsPendingCount('decrement')

    try {
      const { logEvent } = await import('@/lib/logger');
      await logEvent('WORKFLOW', 'Equipment booking status updated', {
        metadata: { bookingId, action: 'APPROVE_BOOKING', from: data.status, to: 'Slot Assigned', submissionId: bookingId, refNo: data.refNo, assignedDate, assignedSlot },
        user: { uid: data.uid, email: data.applicantEmail, role: 'faculty' }
      });
    } catch (e) {}

    // ── Email to user ─────────────────────────────────────────────────────
    const userEmailHtml = `
      <div ${EMAIL_STYLES.background}>
        ${EMAIL_STYLES.logo}
        <h2 style="color:#2e7d32; border-bottom:2px solid #2e7d32; padding-bottom:10px; margin-bottom:20px;">
          Your Equipment Slot is Confirmed ✅
        </h2>
        <p style="color:#333333;">Dear ${data.applicantName},</p>
        <p style="color:#555555;">Great news! Your equipment booking request has been <strong style="color:#2e7d32;">approved</strong> and a slot has been assigned.</p>
        <table style="width:100%; border-collapse:collapse; margin-top:15px; background-color:#f8f9fa; border: 1px solid #eeeeee; border-radius:8px;">
          <tr><td style="padding:10px; border-bottom:1px solid #eeeeee; font-weight:bold; color:#2c3e50;">Reference No.</td><td style="padding:10px; border-bottom:1px solid #eeeeee; color:#555555;">${data.refNo}</td></tr>
          <tr><td style="padding:10px; border-bottom:1px solid #eeeeee; font-weight:bold; color:#2c3e50;">Equipment</td><td style="padding:10px; border-bottom:1px solid #eeeeee; color:#555555;">${data.equipmentName}</td></tr>
          <tr><td style="padding:10px; border-bottom:1px solid #eeeeee; font-weight:bold; color:#2c3e50;">Confirmed Date</td><td style="padding:10px; border-bottom:1px solid #eeeeee; color:#2e7d32; font-weight:bold;">${assignedDate}</td></tr>
          <tr><td style="padding:10px; border-bottom:1px solid #eeeeee; font-weight:bold; color:#2c3e50;">Confirmed Slot</td><td style="padding:10px; border-bottom:1px solid #eeeeee; color:#2e7d32; font-weight:bold;">${assignedSlot}</td></tr>
          ${adminRemarks ? `<tr><td style="padding:10px; font-weight:bold; color:#2c3e50;">Admin Remarks</td><td style="padding:10px; color:#555555;">${adminRemarks}</td></tr>` : ''}
        </table>
        <p style="color:#555555; margin-top:20px;">Please report to the Central Instrumentation Facility (CIF) on the above date and time with your samples. Ensure you carry this confirmation email as a reference.</p>
        ${EMAIL_STYLES.footer}
      </div>
    `
    await sendEmail({
      to: data.applicantEmail,
      subject: `Slot Confirmed — ${data.refNo} (${data.equipmentName})`,
      html: userEmailHtml,
      from: 'noreply',
    })

    return { success: true }
  } catch (error: any) {
    console.error('[approveEquipmentBooking] Error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Admin: Reject a booking request with a reason.
 */
export async function rejectEquipmentBooking(
  bookingId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const bookingRef = adminRtdb.ref(`equipmentBookings/${bookingId}`)
    const snap = await bookingRef.once('value')
    if (!snap.exists()) return { success: false, error: 'Booking not found.' }

    const data = snap.val()
    if (data.status === 'Rejected') {
      return { success: true }
    }

    await bookingRef.update({
      status: 'Rejected',
      adminRemarks: reason,
      updatedAt: new Date().toISOString(),
    })
    await updateEquipmentBookingsPendingCount('decrement')

    try {
      const { logEvent } = await import('@/lib/logger');
      await logEvent('WORKFLOW', 'Equipment booking status updated', {
        metadata: { bookingId, action: 'REJECT_BOOKING', from: data.status, to: 'Rejected', submissionId: bookingId, refNo: data.refNo, reason },
        user: { uid: data.uid, email: data.applicantEmail, role: 'faculty' }
      });
    } catch (e) {}
    const userEmailHtml = `
      <div ${EMAIL_STYLES.background}>
        ${EMAIL_STYLES.logo}
        <h2 style="color:#c62828; border-bottom:2px solid #c62828; padding-bottom:10px; margin-bottom:20px;">
          Equipment Booking Update
        </h2>
        <p style="color:#333333;">Dear ${data.applicantName},</p>
        <p style="color:#555555;">Unfortunately, your equipment booking request (<strong style="color:#2c3e50;">${data.refNo}</strong>) for <strong style="color:#2c3e50;">${data.equipmentName}</strong> has been <strong style="color:#c62828;">rejected</strong>.</p>
        <table style="width:100%; border-collapse:collapse; margin-top:15px; background-color:#f8f9fa; border: 1px solid #eeeeee; border-radius:8px;">
          <tr><td style="padding:10px; border-bottom:1px solid #eeeeee; font-weight:bold; color:#2c3e50;">Reference No.</td><td style="padding:10px; border-bottom:1px solid #eeeeee; color:#555555;">${data.refNo}</td></tr>
          <tr><td style="padding:10px; border-bottom:1px solid #eeeeee; font-weight:bold; color:#2c3e50;">Reason</td><td style="padding:10px; color:#c62828;">${reason}</td></tr>
        </table>
        <p style="color:#555555; margin-top:20px;">If you have any queries, please contact the RDC office directly or submit a new booking request.</p>
        ${EMAIL_STYLES.footer}
      </div>
    `
    await sendEmail({
      to: data.applicantEmail,
      subject: `Booking Update — ${data.refNo}`,
      html: userEmailHtml,
      from: 'noreply',
    })

    return { success: true }
  } catch (error: any) {
    console.error('[rejectEquipmentBooking] Error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Admin: Mark a booking as completed (test done).
 */
export async function completeEquipmentBooking(
  bookingId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const bookingRef = adminRtdb.ref(`equipmentBookings/${bookingId}`)
    const snap = await bookingRef.once('value')
    if (!snap.exists()) return { success: false, error: 'Booking not found.' }

    const data = snap.val()
    if (data.status === 'Completed') {
      return { success: true }
    }

    await bookingRef.update({
      status: 'Completed',
      updatedAt: new Date().toISOString(),
    })

    try {
      const { logEvent } = await import('@/lib/logger');
      await logEvent('WORKFLOW', 'Equipment booking status updated', {
        metadata: { bookingId, action: 'COMPLETE_BOOKING', from: data.status, to: 'Completed', submissionId: bookingId, refNo: data.refNo },
        user: { uid: data.uid, email: data.applicantEmail, role: 'faculty' }
      });
    } catch (e) {}
    const userEmailHtml = `
      <div ${EMAIL_STYLES.background}>
        ${EMAIL_STYLES.logo}
        <h2 style="color:#2e7d32; border-bottom:2px solid #2e7d32; padding-bottom:10px; margin-bottom:20px;">
          Equipment Test Completed ✅
        </h2>
        <p style="color:#333333;">Dear ${data.applicantName},</p>
        <p style="color:#555555;">Your equipment test for <strong style="color:#2c3e50;">${data.equipmentName}</strong> (Ref: <strong style="color:#2c3e50;">${data.refNo}</strong>) has been marked as <strong style="color:#2e7d32;">completed</strong>.</p>
        <p style="color:#555555; margin-top:10px;">If you require any results, reports, or further analysis, please contact the CIF lab directly.</p>
        ${EMAIL_STYLES.footer}
      </div>
    `
    await sendEmail({
      to: data.applicantEmail,
      subject: `Test Completed — ${data.refNo} (${data.equipmentName})`,
      html: userEmailHtml,
      from: 'noreply',
    })

    return { success: true }
  } catch (error: any) {
    console.error('[completeEquipmentBooking] Error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Admin: Update details of an existing equipment booking.
 */
export async function updateEquipmentBooking(
  bookingId: string,
  updates: Partial<EquipmentBooking>
): Promise<{ success: boolean; error?: string }> {
  try {
    const bookingRef = adminRtdb.ref(`equipmentBookings/${bookingId}`)
    const snap = await bookingRef.once('value')
    if (!snap.exists()) return { success: false, error: 'Booking not found.' }

    const oldStatus = snap.val()?.status
    const newStatus = updates.status || oldStatus

    const cleanedUpdates = { ...updates }
    delete cleanedUpdates.id
    delete cleanedUpdates.refNo
    delete cleanedUpdates.uid
    delete cleanedUpdates.createdAt

    await bookingRef.update(sanitizeForRtdb({
      ...cleanedUpdates,
      updatedAt: new Date().toISOString(),
    }))

    if (oldStatus === 'Pending' && newStatus !== 'Pending') {
      await updateEquipmentBookingsPendingCount('decrement')
    } else if (oldStatus !== 'Pending' && newStatus === 'Pending') {
      await updateEquipmentBookingsPendingCount('increment')
    }

    try {
      const { logEvent } = await import('@/lib/logger');
      await logEvent('WORKFLOW', 'Equipment booking status updated', {
        metadata: { bookingId, action: 'UPDATE_BOOKING', from: oldStatus, to: newStatus, submissionId: bookingId },
        user: { uid: snap.val()?.uid || '', email: snap.val()?.applicantEmail || '', role: 'faculty' }
      });
    } catch (e) {}

    return { success: true }
  } catch (error: any) {
    console.error('[updateEquipmentBooking] Error:', error)
    return { success: false, error: error.message }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EQUIPMENT CATALOG ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch all equipment from the catalog (public within the portal).
 */
export async function fetchEquipmentCatalog(): Promise<{
  success: boolean
  data?: EquipmentCatalogItem[]
  error?: string
}> {
  try {
    const snapshot = await adminDb.collection('equipmentCatalog').orderBy('order', 'asc').get()
    const data = snapshot.docs.map((doc) => serializeCatalogItem(doc.id, doc.data()))
    return { success: true, data }
  } catch (error: any) {
    console.error('[fetchEquipmentCatalog] Error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Admin/Super-admin: Add new equipment to the catalog.
 */
export async function addEquipmentToCatalog(
  formData: EquipmentCatalogFormData
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const docRef = await adminDb.collection('equipmentCatalog').add({
      ...formData,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    return { success: true, id: docRef.id }
  } catch (error: any) {
    console.error('[addEquipmentToCatalog] Error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Admin/Super-admin: Update existing equipment in the catalog.
 */
export async function updateEquipmentInCatalog(
  id: string,
  updates: Partial<EquipmentCatalogFormData>
): Promise<{ success: boolean; error?: string }> {
  try {
    await adminDb.collection('equipmentCatalog').doc(id).update({
      ...updates,
      updatedAt: FieldValue.serverTimestamp(),
    })
    return { success: true }
  } catch (error: any) {
    console.error('[updateEquipmentInCatalog] Error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Super-admin: Delete equipment from catalog.
 */
export async function deleteEquipmentFromCatalog(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await adminDb.collection('equipmentCatalog').doc(id).delete()
    return { success: true }
  } catch (error: any) {
    console.error('[deleteEquipmentFromCatalog] Error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * User: Complete payment for an assigned equipment booking request.
 */
export async function payEquipmentBooking(
  bookingId: string,
  amount: number
): Promise<{ success: boolean; receiptNo?: string; error?: string }> {
  try {
    const bookingRef = adminRtdb.ref(`equipmentBookings/${bookingId}`)
    const snap = await bookingRef.once('value')
    if (!snap.exists()) return { success: false, error: 'Booking not found.' }

    const receiptNo = `RDC/REC/${Date.now().toString().slice(-6)}`
    
    // Format current IST date and time as YYYY-MM-DD HH:mm:ss
    const now = new Date()
    const offset = 5.5 * 60 * 60 * 1000 // IST offset
    const istTime = new Date(now.getTime() + offset)
    const formattedDate = istTime.toISOString().replace('T', ' ').substring(0, 19)

    await bookingRef.update({
      paymentStatus: 'Paid',
      receiptNo,
      easebuzzTxnId: receiptNo,
      paymentMode: 'Manual',
      paymentDate: formattedDate,
      totalAmount: amount,
      updatedAt: new Date().toISOString(),
    })

    try {
      const { logEvent } = await import('@/lib/logger');
      await logEvent('WORKFLOW', 'Equipment booking payment processed', {
        metadata: { bookingId, action: 'PAY_BOOKING', from: snap.val()?.paymentStatus || 'Pending', to: 'Paid', submissionId: bookingId, receiptNo },
        user: { uid: snap.val()?.uid || '', email: snap.val()?.applicantEmail || '', role: 'faculty' }
      });
    } catch (e) {}

    return { success: true, receiptNo }
  } catch (error: any) {
    console.error('[payEquipmentBooking] Error:', error)
    return { success: false, error: error.message }
  }
}
