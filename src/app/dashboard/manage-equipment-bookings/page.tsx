'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { auth, db } from '@/lib/config'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import {
  fetchAllEquipmentBookings,
  approveEquipmentBooking,
  rejectEquipmentBooking,
  completeEquipmentBooking,
  updateEquipmentBooking,
  fetchEquipmentCatalog,
  addEquipmentToCatalog,
  updateEquipmentInCatalog,
  deleteEquipmentFromCatalog,
} from '@/app/equipment-booking-actions'
import type {
  EquipmentBooking,
  BookingStatus,
  EquipmentCatalogItem,
  EquipmentCatalogFormData,
  UserCategory,
  PaymentStatus,
} from '@/types/equipment-booking'
import type { User } from '@/types'
import { getDefaultModulesForRole } from '@/lib/modules'
import { useToast } from '@/hooks/use-toast'
import { uploadFileToApi } from '@/lib/upload-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ClipboardList,
  CheckCircle2,
  XCircle,
  Clock,
  CalendarCheck,
  PackageCheck,
  RefreshCw,
  Loader2,
  Eye,
  User as UserIcon,
  FlaskConical,
  Search,
  Download,
  Edit,
  Plus,
  Trash2,
  Image as ImageIcon,
  AlertCircle,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'

// ─────────────────────────────────────────────────────────────────
// Status Badge
// ─────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<BookingStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType }> = {
  Pending: { label: 'Pending', variant: 'outline', icon: Clock },
  Approved: { label: 'Approved', variant: 'default', icon: CheckCircle2 },
  'Slot Assigned': { label: 'Slot Assigned', variant: 'default', icon: CalendarCheck },
  Rejected: { label: 'Rejected', variant: 'destructive', icon: XCircle },
  Completed: { label: 'Completed', variant: 'secondary', icon: PackageCheck },
  Cancelled: { label: 'Cancelled', variant: 'secondary', icon: XCircle },
}

function StatusBadge({ status }: { status: BookingStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.Pending
  const Icon = config.icon
  return (
    <Badge variant={config.variant} className="gap-1 text-xs whitespace-nowrap">
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  )
}

const fmtDate = (iso: string) => {
  try { return format(parseISO(iso), 'dd MMM yyyy') } catch { return iso }
}

// ─────────────────────────────────────────────────────────────────
// Approve Dialog
// ─────────────────────────────────────────────────────────────────
function ApproveDialog({
  booking,
  open,
  onClose,
  onDone,
}: {
  booking: EquipmentBooking | null
  open: boolean
  onClose: () => void
  onDone: (id: string) => void
}) {
  const { toast } = useToast()
  const [assignedDate, setAssignedDate] = useState('')
  const [assignedSlot, setAssignedSlot] = useState('')
  const [remarks, setRemarks] = useState('')
  const [loading, setLoading] = useState(false)

  const availableDates = useMemo(() => {
    const dates: { value: string; label: string }[] = []
    const start = new Date()
    for (let i = 0; i < 30; i++) {
      const d = new Date()
      d.setDate(start.getDate() + i)
      if (d.getDay() !== 0) { // 0 is Sunday, so only Mon-Sat
        const yyyy = d.getFullYear()
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        dates.push({
          value: `${yyyy}-${mm}-${dd}`,
          label: d.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          })
        })
      }
    }
    return dates
  }, [])

  useEffect(() => {
    if (booking) {
      setAssignedDate(booking.preferredDate || '')
      setAssignedSlot(booking.preferredTimeSlot || '')
      setRemarks('')
    }
  }, [booking])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!booking || !assignedDate || !assignedSlot) {
      toast({ variant: 'destructive', title: 'Required', description: 'Please fill in the confirmed date and slot.' })
      return
    }
    setLoading(true)
    const res = await approveEquipmentBooking(booking.id, assignedDate, assignedSlot, remarks || undefined)
    if (res.success) {
      toast({ title: 'Booking Approved', description: `Slot confirmed. Confirmation email sent to ${booking.applicantEmail}.` })
      onDone(booking.id)
      onClose()
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error })
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <CalendarCheck className="h-5 w-5" />
            Approve &amp; Assign Slot
          </DialogTitle>
          <DialogDescription>
            Confirm the date and time slot for{' '}
            <strong>{booking?.applicantName}</strong> — {booking?.equipmentName}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="admin-assign-date">
              Confirmed Date <span className="text-destructive">*</span>
            </Label>
            <Select
              value={assignedDate}
              onValueChange={(v) => setAssignedDate(v)}
            >
              <SelectTrigger id="admin-assign-date">
                <SelectValue placeholder="Select confirmed date (Mon-Sat)" />
              </SelectTrigger>
              <SelectContent>
                {availableDates.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-assign-slot">
              Confirmed Time Slot <span className="text-destructive">*</span>
            </Label>
            <Input
              id="admin-assign-slot"
              placeholder="e.g. 09:00–11:00"
              value={assignedSlot}
              onChange={(e) => setAssignedSlot(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-assign-remarks">Admin Remarks (optional)</Label>
            <Textarea
              id="admin-assign-remarks"
              placeholder="Any instructions for the applicant..."
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" disabled={loading} className="bg-green-600 hover:bg-green-700 text-white">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Confirm Slot
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────
// Reject Dialog
// ─────────────────────────────────────────────────────────────────
function RejectDialog({
  booking,
  open,
  onClose,
  onDone,
}: {
  booking: EquipmentBooking | null
  open: boolean
  onClose: () => void
  onDone: (id: string) => void
}) {
  const { toast } = useToast()
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) setReason('')
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!booking || !reason.trim()) {
      toast({ variant: 'destructive', title: 'Required', description: 'Please provide a rejection reason.' })
      return
    }
    setLoading(true)
    const res = await rejectEquipmentBooking(booking.id, reason.trim())
    if (res.success) {
      toast({ title: 'Booking Rejected', description: 'Rejection notification sent to applicant.' })
      onDone(booking.id)
      onClose()
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error })
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <XCircle className="h-5 w-5" />
            Reject Booking
          </DialogTitle>
          <DialogDescription>
            Provide a reason for rejecting the booking from <strong>{booking?.applicantName}</strong>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="reject-reason">
              Rejection Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reject-reason"
              placeholder="e.g. Equipment under maintenance, unavailable on requested date..."
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" disabled={loading} variant="destructive">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
              Reject Booking
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────
// Detail Dialog
// ─────────────────────────────────────────────────────────────────
function DetailDialog({ booking, open, onClose }: { booking: EquipmentBooking | null; open: boolean; onClose: () => void }) {
  if (!booking) return null

  const finalAmount = booking.totalAmount || 0

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-primary">{booking.refNo}</DialogTitle>
          <DialogDescription>{booking.equipmentName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><span className="font-medium">Applicant:</span><br />{booking.applicantName}</div>
            <div><span className="font-medium">Email:</span><br />{booking.applicantEmail}</div>
            <div><span className="font-medium">Phone:</span><br />{booking.applicantPhone || '—'}</div>
            <div><span className="font-medium">MIS ID:</span><br />{booking.misId || '—'}</div>
            <div><span className="font-medium">Department:</span><br />{booking.department || '—'}</div>
            <div><span className="font-medium">Institute:</span><br />{booking.institute || '—'}</div>
            <div><span className="font-medium">Designation:</span><br />{booking.designation || '—'}</div>
            <div><span className="font-medium">User Category:</span><br />{booking.userCategory}</div>
          </div>
          <hr className="border-border/40" />
          <div className="grid grid-cols-2 gap-3">
            <div><span className="font-medium">Equipment:</span><br />{booking.equipmentName}</div>
            <div><span className="font-medium">No. of Samples:</span><br />{booking.noOfSamples}</div>
            <div><span className="font-medium">Pref. Date:</span><br />{booking.preferredDate}</div>
            <div><span className="font-medium">Pref. Slot:</span><br />{booking.preferredTimeSlot}</div>
            {booking.alternateDate && <div><span className="font-medium">Alt. Date:</span><br />{booking.alternateDate}</div>}
          </div>
          <div><span className="font-medium">Purpose:</span><br /><p className="text-muted-foreground mt-0.5">{booking.purpose}</p></div>
          {booking.specialRequirements && (
            <div><span className="font-medium">Special Requirements:</span><br /><p className="text-muted-foreground mt-0.5">{booking.specialRequirements}</p></div>
          )}
          {booking.assignedDate && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
              <p className="font-semibold text-green-700 dark:text-green-400 mb-1">✅ Assigned Slot</p>
              <p><span className="font-medium">Date:</span> {booking.assignedDate}</p>
              <p><span className="font-medium">Slot:</span> {booking.assignedSlot}</p>
              {booking.adminRemarks && <p><span className="font-medium">Remarks:</span> {booking.adminRemarks}</p>}
            </div>
          )}
          {booking.status === 'Rejected' && booking.adminRemarks && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
              <p className="font-semibold text-destructive mb-1">Rejection Reason</p>
              <p className="text-muted-foreground">{booking.adminRemarks}</p>
            </div>
          )}
          {finalAmount > 0 && (
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 dark:bg-blue-950/10 p-3 space-y-1.5">
              <p className="font-semibold text-foreground flex items-center gap-1.5">💳 Financial Details</p>
              <p><span className="font-medium text-muted-foreground">Total Amount:</span> <span className="font-semibold">₹{finalAmount.toLocaleString('en-IN')}</span></p>
              <p>
                <span className="font-medium text-muted-foreground">Payment Status:</span>{' '}
                <span className={`font-semibold ${booking.paymentStatus === 'Paid' ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                  {booking.paymentStatus || 'Pending'}
                </span>
              </p>
              {booking.paymentStatus === 'Paid' && (
                <>
                  <p>
                    <span className="font-medium text-muted-foreground">Payment Mode:</span>{' '}
                    <span className="font-semibold text-foreground">
                      {(() => {
                        const mode = booking.paymentMode
                        if (!mode) return 'Online'
                        switch (mode.toUpperCase()) {
                          case 'CC': return 'Credit Card'
                          case 'DC': return 'Debit Card'
                          case 'NB': return 'Net Banking'
                          case 'UPI': return 'UPI'
                          case 'WAL': return 'Wallet'
                          case 'EMI': return 'EMI'
                          default: return mode
                        }
                      })()}
                    </span>
                  </p>
                  <p>
                    <span className="font-medium text-muted-foreground">Transaction ID:</span>{' '}
                    <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                      {booking.easebuzzTxnId || booking.easepayid || booking.receiptNo || 'N/A'}
                    </code>
                  </p>
                  <p>
                    <span className="font-medium text-muted-foreground">Date and Time:</span>{' '}
                    <span className="font-semibold text-foreground">{booking.paymentDate || 'N/A'}</span>
                  </p>
                </>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <span>Submitted: {fmtDate(booking.createdAt)}</span>
            <span>·</span>
            <StatusBadge status={booking.status} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────
// Edit Booking Dialog
// ─────────────────────────────────────────────────────────────────
function EditBookingDialog({
  booking,
  open,
  onClose,
  onDone,
}: {
  booking: EquipmentBooking | null
  open: boolean
  onClose: () => void
  onDone: (updated: EquipmentBooking) => void
}) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  // Editable fields
  const [applicantName, setApplicantName] = useState('')
  const [applicantEmail, setApplicantEmail] = useState('')
  const [applicantPhone, setApplicantPhone] = useState('')
  const [misId, setMisId] = useState('')
  const [department, setDepartment] = useState('')
  const [institute, setInstitute] = useState('')
  const [designation, setDesignation] = useState('')
  const [userCategory, setUserCategory] = useState<UserCategory>('Internal')

  const [preferredDate, setPreferredDate] = useState('')
  const [preferredTimeSlot, setPreferredTimeSlot] = useState('')
  const [alternateDate, setAlternateDate] = useState('')
  const [noOfSamples, setNoOfSamples] = useState(1)
  const [purpose, setPurpose] = useState('')
  const [specialRequirements, setSpecialRequirements] = useState('')

  const [status, setStatus] = useState<BookingStatus>('Pending')
  const [assignedDate, setAssignedDate] = useState('')
  const [assignedSlot, setAssignedSlot] = useState('')
  const [adminRemarks, setAdminRemarks] = useState('')

  // Financial fields
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('Pending')
  const [receiptNo, setReceiptNo] = useState('')
  const [totalAmount, setTotalAmount] = useState<number | undefined>(undefined)

  useEffect(() => {
    if (booking) {
      setApplicantName(booking.applicantName || '')
      setApplicantEmail(booking.applicantEmail || '')
      setApplicantPhone(booking.applicantPhone || '')
      setMisId(booking.misId || '')
      setDepartment(booking.department || '')
      setInstitute(booking.institute || '')
      setDesignation(booking.designation || '')
      setUserCategory(booking.userCategory || 'Internal')

      setPreferredDate(booking.preferredDate || '')
      setPreferredTimeSlot(booking.preferredTimeSlot || '')
      setAlternateDate(booking.alternateDate || '')
      setNoOfSamples(booking.noOfSamples || 1)
      setPurpose(booking.purpose || '')
      setSpecialRequirements(booking.specialRequirements || '')

      setStatus(booking.status || 'Pending')
      setAssignedDate(booking.assignedDate || '')
      setAssignedSlot(booking.assignedSlot || '')
      setAdminRemarks(booking.adminRemarks || '')

      setPaymentStatus(booking.paymentStatus || 'Pending')
      setReceiptNo(booking.receiptNo || '')
      setTotalAmount(booking.totalAmount)
    }
  }, [booking])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!booking) return
    setLoading(true)

    const updates: Partial<EquipmentBooking> = {
      applicantName,
      applicantEmail,
      applicantPhone,
      misId,
      department,
      institute,
      designation,
      userCategory,
      preferredDate,
      preferredTimeSlot,
      alternateDate: alternateDate || undefined,
      noOfSamples: Number(noOfSamples),
      purpose,
      specialRequirements: specialRequirements || undefined,
      status,
      assignedDate: assignedDate || undefined,
      assignedSlot: assignedSlot || undefined,
      adminRemarks: adminRemarks || undefined,
      paymentStatus,
      receiptNo: receiptNo || undefined,
      totalAmount: totalAmount !== undefined ? Number(totalAmount) : undefined,
    }

    const res = await updateEquipmentBooking(booking.id, updates)
    if (res.success) {
      toast({ title: 'Booking Updated', description: 'Booking details updated successfully.' })
      onDone({ ...booking, ...updates })
      onClose()
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error })
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <Edit className="h-5 w-5" />
            Edit Booking — {booking?.refNo}
          </DialogTitle>
          <DialogDescription>
            Modify any details for this booking request. Changes will be saved to the database.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-1">
          {/* Section 1: Applicant Details */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b border-border/50 pb-1">Applicant Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-applicant-name">Applicant Name</Label>
                <Input id="edit-applicant-name" value={applicantName} onChange={(e) => setApplicantName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-applicant-email">Applicant Email</Label>
                <Input id="edit-applicant-email" type="email" value={applicantEmail} onChange={(e) => setApplicantEmail(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-applicant-phone">Applicant Phone</Label>
                <Input id="edit-applicant-phone" value={applicantPhone} onChange={(e) => setApplicantPhone(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-mis-id">MIS ID</Label>
                <Input id="edit-mis-id" value={misId} onChange={(e) => setMisId(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-department">Department</Label>
                <Input id="edit-department" value={department} onChange={(e) => setDepartment(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-institute">Institute</Label>
                <Input id="edit-institute" value={institute} onChange={(e) => setInstitute(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-designation">Designation</Label>
                <Input id="edit-designation" value={designation} onChange={(e) => setDesignation(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-user-category">User Category</Label>
                <Select value={userCategory} onValueChange={(v) => setUserCategory(v as UserCategory)}>
                  <SelectTrigger id="edit-user-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Internal">Internal</SelectItem>
                    <SelectItem value="External Academic">External Academic</SelectItem>
                    <SelectItem value="Industry">Industry</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Section 2: Booking Details */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b border-border/50 pb-1">Booking Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-pref-date">Preferred Date</Label>
                <Input id="edit-pref-date" type="date" value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-pref-slot">Preferred Slot</Label>
                <Input id="edit-pref-slot" value={preferredTimeSlot} onChange={(e) => setPreferredTimeSlot(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-alt-date">Alternate Date</Label>
                <Input id="edit-alt-date" type="date" value={alternateDate} onChange={(e) => setAlternateDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-samples">No. of Samples</Label>
                <Input id="edit-samples" type="number" min={1} value={noOfSamples} onChange={(e) => setNoOfSamples(Number(e.target.value))} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-purpose">Purpose</Label>
              <Textarea id="edit-purpose" rows={3} value={purpose} onChange={(e) => setPurpose(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-special-req">Special Requirements</Label>
              <Textarea id="edit-special-req" rows={2} value={specialRequirements} onChange={(e) => setSpecialRequirements(e.target.value)} />
            </div>
          </div>

          {/* Section 3: Admin Status & Confirmed Slot */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b border-border/50 pb-1">Admin Slot &amp; Status</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5 col-span-1">
                <Label htmlFor="edit-status">Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as BookingStatus)}>
                  <SelectTrigger id="edit-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Approved">Approved</SelectItem>
                    <SelectItem value="Slot Assigned">Slot Assigned</SelectItem>
                    <SelectItem value="Rejected">Rejected</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-1">
                <Label htmlFor="edit-assigned-date">Assigned Date</Label>
                <Input id="edit-assigned-date" type="date" value={assignedDate} onChange={(e) => setAssignedDate(e.target.value)} />
              </div>
              <div className="space-y-1.5 col-span-1">
                <Label htmlFor="edit-assigned-slot">Assigned Slot</Label>
                <Input id="edit-assigned-slot" value={assignedSlot} onChange={(e) => setAssignedSlot(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-admin-remarks">Admin Remarks / Rejection Reason</Label>
              <Textarea id="edit-admin-remarks" rows={2} value={adminRemarks} onChange={(e) => setAdminRemarks(e.target.value)} />
            </div>
          </div>

          {/* Section 4: Financial Details */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b border-border/50 pb-1">Financial Details</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-total-amount">Total Amount (₹)</Label>
                <Input
                  id="edit-total-amount"
                  type="number"
                  min={0}
                  value={totalAmount ?? ''}
                  onChange={(e) => setTotalAmount(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="e.g. 1000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-payment-status">Payment Status</Label>
                <Select value={paymentStatus} onValueChange={(v) => setPaymentStatus(v as PaymentStatus)}>
                  <SelectTrigger id="edit-payment-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Paid">Paid</SelectItem>
                    <SelectItem value="Not Required">Not Required</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-receipt-no">Receipt Number / Transaction ID</Label>
                <Input
                  id="edit-receipt-no"
                  value={receiptNo}
                  onChange={(e) => setReceiptNo(e.target.value)}
                  placeholder="e.g. RDC/REC/123456 or Txn ID"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────
// Bookings Table
// ─────────────────────────────────────────────────────────────────
function BookingsTable({
  bookings,
  onApprove,
  onReject,
  onComplete,
  onView,
  onEdit,
  showActions,
  processingIds = [],
}: {
  bookings: EquipmentBooking[]
  onApprove?: (b: EquipmentBooking) => void
  onReject?: (b: EquipmentBooking) => void
  onComplete?: (id: string) => void
  onView: (b: EquipmentBooking) => void
  onEdit?: (b: EquipmentBooking) => void
  showActions: boolean
  processingIds?: string[]
}) {
  if (bookings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <ClipboardList className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-muted-foreground text-sm">No bookings in this category.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border-none bg-card/10 backdrop-blur-sm shadow-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[120px]">Ref No.</TableHead>
            <TableHead>Applicant</TableHead>
            <TableHead>Equipment</TableHead>
            <TableHead>Pref. Date</TableHead>
            <TableHead>Samples</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((b) => (
            <TableRow key={b.id}>
              <TableCell className="font-mono text-xs text-primary">{b.refNo}</TableCell>
              <TableCell>
                <div className="font-medium text-sm">{b.applicantName}</div>
                <div className="text-xs text-muted-foreground">{b.applicantEmail}</div>
              </TableCell>
              <TableCell className="text-sm">{b.equipmentName}</TableCell>
              <TableCell className="text-sm">{b.preferredDate}</TableCell>
              <TableCell className="text-sm">{b.noOfSamples}</TableCell>
              <TableCell><StatusBadge status={b.status} /></TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onView(b)}>
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-primary hover:text-primary/80" onClick={() => onEdit?.(b)}>
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  {showActions && b.status === 'Pending' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-green-600 border-green-500/40 hover:bg-green-50 dark:hover:bg-green-950"
                        onClick={() => onApprove?.(b)}
                      >
                        <CalendarCheck className="h-3.5 w-3.5 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-destructive border-destructive/40 hover:bg-destructive/10"
                        onClick={() => onReject?.(b)}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                      </Button>
                    </>
                  )}
                  {showActions && (b.status === 'Slot Assigned' || b.status === 'Approved') && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-blue-600 border-blue-500/40 hover:bg-blue-50 dark:hover:bg-blue-950"
                      onClick={() => onComplete?.(b.id)}
                      disabled={processingIds.includes(b.id)}
                    >
                      {processingIds.includes(b.id) ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <PackageCheck className="h-3.5 w-3.5 mr-1" />
                      )}
                      Complete
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// CSV Export Helper
// ─────────────────────────────────────────────────────────────────
function exportToCSV(bookings: EquipmentBooking[]) {
  const headers = ['RefNo', 'Applicant', 'Email', 'Equipment', 'PrefDate', 'Slot', 'Samples', 'Category', 'Status', 'AssignedDate', 'AssignedSlot', 'SubmittedAt']
  const rows = bookings.map((b) => [
    b.refNo, b.applicantName, b.applicantEmail, b.equipmentName,
    b.preferredDate, b.preferredTimeSlot, b.noOfSamples, b.userCategory,
    b.status, b.assignedDate || '', b.assignedSlot || '', fmtDate(b.createdAt),
  ])
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `equipment-bookings-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─────────────────────────────────────────────────────────────────
// Add/Edit Equipment Dialog
// ─────────────────────────────────────────────────────────────────
function EquipmentFormDialog({
  item,
  open,
  onClose,
  onDone,
}: {
  item: EquipmentCatalogItem | null
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [image, setImage] = useState('')
  const [make, setMake] = useState('')
  const [modelNumber, setModelNumber] = useState('')
  const [isAvailable, setIsAvailable] = useState(true)

  const [internalPrice, setInternalPrice] = useState('0')

  const [applications, setApplications] = useState('')
  const [availableSlots, setAvailableSlots] = useState('')
  const [specificationsJson, setSpecificationsJson] = useState('{}')

  useEffect(() => {
    if (item) {
      setName(item.name || '')
      setDescription(item.description || '')
      setImage(item.image || '')
      setMake(item.make || '')
      setModelNumber(item.modelNumber || '')
      setIsAvailable(item.isAvailable !== false)

      setInternalPrice(String(item.prices?.internal || 0))

      setApplications(item.applications?.join(', ') || '')
      setAvailableSlots(item.availableSlots?.join(', ') || '')
      setSpecificationsJson(JSON.stringify(item.specifications || {}, null, 2))
    } else {
      setName('')
      setDescription('')
      setImage('')
      setMake('')
      setModelNumber('')
      setIsAvailable(true)
      setInternalPrice('0')
      setApplications('')
      setAvailableSlots('09:00–11:00, 11:00–13:00, 14:00–16:00')
      setSpecificationsJson('{}')
    }
  }, [item, open])

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Invalid File', description: 'Please select an image file.' })
      return
    }

    setUploadingImage(true)
    try {
      const res = await uploadFileToApi(file, {
        path: `equipment-images/${Date.now()}-${file.name}`
      })
      if (res.success && res.url) {
        setImage(res.url)
        toast({ title: 'Image Uploaded', description: 'Equipment image uploaded successfully.' })
      } else {
        toast({ variant: 'destructive', title: 'Upload Failed', description: res.error || 'Failed to upload image.' })
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Upload Error', description: err.message })
    } finally {
      setUploadingImage(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !description.trim()) {
      toast({ variant: 'destructive', title: 'Required', description: 'Name and description are required.' })
      return
    }

    let parsedSpecs = {}
    try {
      parsedSpecs = JSON.parse(specificationsJson)
    } catch (err) {
      toast({ variant: 'destructive', title: 'JSON Error', description: 'Specifications must be a valid JSON object.' })
      return
    }

    setLoading(true)

    const formData: EquipmentCatalogFormData = {
      name: name.trim(),
      description: description.trim(),
      image: image.trim() || undefined,
      make: make.trim() || undefined,
      modelNumber: modelNumber.trim() || undefined,
      isAvailable,
      prices: {
        internal: Number(internalPrice) || 0,
        externalAcademic: 0,
        industry: 0,
      },
      availableSlots: availableSlots.split(',').map((s) => s.trim()).filter(Boolean),
      applications: applications.split(',').map((s) => s.trim()).filter(Boolean),
      specifications: parsedSpecs,
    }

    const res = item
      ? await updateEquipmentInCatalog(item.id, formData)
      : await addEquipmentToCatalog(formData)

    if (res.success) {
      toast({
        title: item ? 'Equipment Updated' : 'Equipment Added',
        description: `Successfully ${item ? 'updated' : 'added'} ${name} in the catalog.`,
      })
      onDone()
      onClose()
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error })
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            {item ? <Edit className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
            {item ? 'Edit Equipment' : 'Add New Equipment'}
          </DialogTitle>
          <DialogDescription>
            {item
              ? 'Modify details of the equipment item in the catalog.'
              : 'Provide details to add a new equipment item to the CIF catalog.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="eq-name">Equipment Name <span className="text-destructive">*</span></Label>
              <Input id="eq-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="eq-desc">Description <span className="text-destructive">*</span></Label>
              <Textarea id="eq-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="eq-make">Make / Manufacturer</Label>
              <Input id="eq-make" placeholder="e.g. Thermo Fisher" value={make} onChange={(e) => setMake(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="eq-model">Model Number</Label>
              <Input id="eq-model" placeholder="e.g. Nicolet iS50" value={modelNumber} onChange={(e) => setModelNumber(e.target.value)} />
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label>Equipment Image</Label>
              <div className="flex gap-4 items-center">
                <div className="flex-1 space-y-1">
                  <Input
                    placeholder="Image URL (direct link) or upload below"
                    value={image}
                    onChange={(e) => setImage(e.target.value)}
                  />
                  <div className="flex items-center gap-2 mt-1.5">
                    <Input
                      id="eq-image-upload"
                      type="file"
                      accept="image/*"
                      className="cursor-pointer text-xs"
                      onChange={handleImageFileChange}
                      disabled={uploadingImage}
                    />
                  </div>
                </div>
                {image && (
                  <div className="relative h-20 w-20 border rounded overflow-hidden flex-shrink-0 bg-white">
                    <img src={image} alt="Preview" className="h-full w-full object-contain p-1" />
                  </div>
                )}
              </div>
              {uploadingImage && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" /> Uploading image...
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="eq-available">Catalog Availability</Label>
              <Select value={isAvailable ? 'yes' : 'no'} onValueChange={(v) => setIsAvailable(v === 'yes')}>
                <SelectTrigger id="eq-available">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Available</SelectItem>
                  <SelectItem value="no">Unavailable</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="eq-slots">Available Time Slots (comma-separated)</Label>
              <Input
                id="eq-slots"
                placeholder="e.g. 09:00–11:00, 11:00–13:00"
                value={availableSlots}
                onChange={(e) => setAvailableSlots(e.target.value)}
              />
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="eq-apps">Applications (comma-separated)</Label>
              <Input
                id="eq-apps"
                placeholder="e.g. Spectroscopy, Chemical Analysis"
                value={applications}
                onChange={(e) => setApplications(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b border-border/50 pb-1">Pricing</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="price-internal">Price per sample</Label>
                <Input id="price-internal" type="number" min={0} value={internalPrice} onChange={(e) => setInternalPrice(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="eq-specs">Specifications JSON (optional)</Label>
            <Textarea
              id="eq-specs"
              placeholder='e.g. { "Detector": "DTGS", "Spectral Range": "7800-350 cm-1" }'
              rows={4}
              className="font-mono text-xs"
              value={specificationsJson}
              onChange={(e) => setSpecificationsJson(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading || uploadingImage}>Cancel</Button>
            <Button type="submit" disabled={loading || uploadingImage}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {item ? 'Save Changes' : 'Add Equipment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────
export default function ManageEquipmentBookingsPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [bookings, setBookings] = useState<EquipmentBooking[]>([])
  const [catalog, setCatalog] = useState<EquipmentCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [processingIds, setProcessingIds] = useState<string[]>([])

  const [approveTarget, setApproveTarget] = useState<EquipmentBooking | null>(null)
  const [rejectTarget, setRejectTarget] = useState<EquipmentBooking | null>(null)
  const [viewTarget, setViewTarget] = useState<EquipmentBooking | null>(null)
  const [editBookingTarget, setEditBookingTarget] = useState<EquipmentBooking | null>(null)

  const [editEquipmentTarget, setEditEquipmentTarget] = useState<EquipmentCatalogItem | null>(null)
  const [equipmentDialogOpen, setEquipmentDialogOpen] = useState(false)

  const loadAll = async () => {
    setLoading(true)
    const [bookingsRes, catRes] = await Promise.all([
      fetchAllEquipmentBookings(),
      fetchEquipmentCatalog(),
    ])
    const catalogItems = catRes.success && catRes.data ? catRes.data : []
    setCatalog(catalogItems)

    if (bookingsRes.success && bookingsRes.data) {
      const enriched = bookingsRes.data.map((booking) => {
        const eq = catalogItems.find((item) => item.id === booking.equipmentId)
        const pricePerSample = eq?.prices?.internal || 0
        const calculatedAmount = pricePerSample * booking.noOfSamples
        const hasAmount = booking.totalAmount !== undefined && booking.totalAmount !== null && booking.totalAmount > 0
        return {
          ...booking,
          totalAmount: hasAmount ? booking.totalAmount : calculatedAmount
        }
      })
      setBookings(enriched)
    }

    setLoading(false)
  }

  useEffect(() => {
    const storedUser = localStorage.getItem('user')
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser) as User
      const allowedModules = parsedUser.allowedModules || getDefaultModulesForRole(parsedUser.role, parsedUser.designation)
      const hasModule = allowedModules.includes('manage-equipment-bookings')
      if (!hasModule) {
        toast({
          title: 'Access Denied',
          description: "You don't have permission to view this page.",
          variant: 'destructive',
        })
        router.replace('/dashboard')
        return
      }
      loadAll()
    } else {
      router.replace('/login')
    }
  }, [router, toast])

  const filtered = useMemo(() => {
    if (!search.trim()) return bookings
    const q = search.toLowerCase()
    return bookings.filter(
      (b) =>
        b.refNo.toLowerCase().includes(q) ||
        b.applicantName.toLowerCase().includes(q) ||
        b.applicantEmail.toLowerCase().includes(q) ||
        b.equipmentName.toLowerCase().includes(q)
    )
  }, [bookings, search])

  const filteredCatalog = useMemo(() => {
    if (!search.trim()) return catalog
    const q = search.toLowerCase()
    return catalog.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.make || '').toLowerCase().includes(q) ||
        (item.modelNumber || '').toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
    )
  }, [catalog, search])

  const pending = filtered.filter((b) => b.status === 'Pending')
  const active = filtered.filter((b) => b.status === 'Approved' || b.status === 'Slot Assigned')
  const history = filtered.filter((b) => b.status === 'Completed' || b.status === 'Rejected' || b.status === 'Cancelled')

  const updateStatus = (id: string, status: BookingStatus, extra?: Partial<EquipmentBooking>) => {
    setBookings((prev) => prev.map((b) => b.id === id ? { ...b, status, ...extra } : b))
  }

  const handleComplete = async (id: string) => {
    if (processingIds.includes(id)) return
    setProcessingIds((prev) => [...prev, id])
    try {
      const res = await completeEquipmentBooking(id)
      if (res.success) {
        toast({ title: 'Marked Complete', description: 'Booking marked as completed. Email sent to applicant.' })
        updateStatus(id, 'Completed')
      } else {
        toast({ variant: 'destructive', title: 'Error', description: res.error })
      }
    } finally {
      setProcessingIds((prev) => prev.filter((x) => x !== id))
    }
  }

  const handleDeleteEquipment = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name} from the equipment catalog? This cannot be undone.`)) return
    const res = await deleteEquipmentFromCatalog(id)
    if (res.success) {
      toast({ title: 'Equipment Deleted', description: 'Equipment has been removed from catalog.' })
      setCatalog((prev) => prev.filter((item) => item.id !== id))
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-primary" />
            Manage Equipment Bookings
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Review, approve, assign slots, and track all equipment booking requests.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportToCSV(filtered)}>
            <Download className="mr-1.5 h-4 w-4" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={loadAll} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Bookings', value: bookings.length, icon: ClipboardList, color: 'text-foreground' },
            { label: 'Pending', value: bookings.filter((b) => b.status === 'Pending').length, icon: Clock, color: 'text-yellow-500' },
            { label: 'Active', value: active.length, icon: CalendarCheck, color: 'text-blue-500' },
            { label: 'Completed', value: bookings.filter((b) => b.status === 'Completed').length, icon: PackageCheck, color: 'text-green-500' },
          ].map((s) => (
            <Card key={s.label} className="border-none bg-card/20 backdrop-blur-sm rounded-xl">
              <CardContent className="p-4 flex items-center gap-3">
                <s.icon className={`h-8 w-8 ${s.color} opacity-70`} />
                <div>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          id="booking-admin-search"
          placeholder="Search bookings or equipment catalog..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-muted/40 border-none shadow-inner focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-offset-0"
        />
      </div>

      {/* Tabs */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : (
        <Tabs defaultValue="pending">
          <TabsList className="mb-4">
            <TabsTrigger value="pending">
              Pending
              {pending.length > 0 && (
                <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive text-xs text-destructive-foreground px-1">
                  {pending.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
            <TabsTrigger value="history">History ({history.length})</TabsTrigger>
            <TabsTrigger value="catalog">Equipment Catalog ({catalog.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            <BookingsTable
              bookings={pending}
              onApprove={(b) => setApproveTarget(b)}
              onReject={(b) => setRejectTarget(b)}
              onView={(b) => setViewTarget(b)}
              onEdit={(b) => setEditBookingTarget(b)}
              showActions
              processingIds={processingIds}
            />
          </TabsContent>

          <TabsContent value="active">
            <BookingsTable
              bookings={active}
              onComplete={handleComplete}
              onView={(b) => setViewTarget(b)}
              onEdit={(b) => setEditBookingTarget(b)}
              showActions
              processingIds={processingIds}
            />
          </TabsContent>

          <TabsContent value="history">
            <BookingsTable
              bookings={history}
              onView={(b) => setViewTarget(b)}
              onEdit={(b) => setEditBookingTarget(b)}
              showActions={false}
              processingIds={processingIds}
            />
          </TabsContent>

          <TabsContent value="catalog">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Equipment Catalog</h2>
                <p className="text-xs text-muted-foreground">Manage details, images, prices, and availability of all equipment.</p>
              </div>
              <Button size="sm" onClick={() => { setEditEquipmentTarget(null); setEquipmentDialogOpen(true); }}>
                <Plus className="mr-1.5 h-4 w-4" /> Add Equipment
              </Button>
            </div>

            {filteredCatalog.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center border border-dashed rounded-lg">
                <ImageIcon className="h-12 w-12 text-muted-foreground/30" />
                <p className="text-muted-foreground text-sm">No equipment found matching search query.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredCatalog.map((item) => (
                  <Card key={item.id} className="group flex flex-col transition-all duration-300 hover:shadow-xl hover:-translate-y-1.5 bg-card/30 backdrop-blur-md border-none rounded-2xl p-4">
                    {/* Image Container */}
                    <div className="relative h-48 w-full bg-white rounded-xl overflow-hidden flex items-center justify-center p-3 shadow-md">
                      {item.image ? (
                        <div className="relative h-full w-full">
                          <Image
                            src={item.image}
                            alt={item.name}
                            fill
                            className="object-contain transition-transform duration-500 group-hover:scale-105"
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                          />
                        </div>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
                          <ImageIcon className="h-12 w-12 text-primary/30" />
                        </div>
                      )}
                      <div className="absolute top-3 right-3">
                        <Badge variant={item.isAvailable ? 'default' : 'secondary'} className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 shadow-sm">
                          {item.isAvailable ? 'Available' : 'Unavailable'}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex flex-col flex-1 gap-4 pt-4">
                      <div>
                        <h3 className="text-[17px] font-bold text-foreground leading-snug group-hover:text-primary transition-colors duration-200 line-clamp-1">{item.name}</h3>
                        {item.make && (
                          <p className="text-xs text-muted-foreground mt-1 font-medium truncate">
                            Make: {item.make} {item.modelNumber ? `· Model: ${item.modelNumber}` : ''}
                          </p>
                        )}
                      </div>

                      <p className="text-sm text-muted-foreground/85 line-clamp-2 leading-relaxed min-h-[40px]">{item.description}</p>

                      {/* Pricing */}
                      <div className="rounded-lg bg-primary/5 dark:bg-primary/10 px-3 py-2 flex justify-between items-center text-sm border border-primary/5">
                        <span className="text-muted-foreground font-medium">Price per sample</span>
                        <span className="font-semibold text-primary">₹{item.prices?.internal || 0}</span>
                      </div>

                      {/* Applications */}
                      {item.applications && item.applications.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 min-h-[24px]">
                          {item.applications.slice(0, 2).map((app, i) => (
                            <Badge key={i} variant="secondary" className="text-[11px] font-normal border-none bg-secondary/60 hover:bg-secondary/60 text-secondary-foreground px-2 py-0.5 rounded-md">
                              {app}
                            </Badge>
                          ))}
                          {item.applications.length > 2 && (
                            <Badge variant="secondary" className="text-[11px] font-normal border-none bg-muted hover:bg-muted text-muted-foreground px-2 py-0.5 rounded-md">
                              +{item.applications.length - 2} more
                            </Badge>
                          )}
                        </div>
                      )}

                      <div className="flex gap-2 mt-auto pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-primary border-primary/20 hover:bg-primary/5 rounded-xl font-medium"
                          onClick={() => {
                            setEditEquipmentTarget(item);
                            setEquipmentDialogOpen(true);
                          }}
                        >
                          <Edit className="mr-1.5 h-3.5 w-3.5" /> Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive border-destructive/20 hover:bg-destructive/10 rounded-xl"
                          onClick={() => handleDeleteEquipment(item.id, item.name)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Dialogs */}
      <ApproveDialog
        booking={approveTarget}
        open={!!approveTarget}
        onClose={() => setApproveTarget(null)}
        onDone={(id) => updateStatus(id, 'Slot Assigned', { assignedDate: approveTarget?.preferredDate, assignedSlot: approveTarget?.preferredTimeSlot })}
      />
      <RejectDialog
        booking={rejectTarget}
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onDone={(id) => updateStatus(id, 'Rejected')}
      />
      <DetailDialog
        booking={viewTarget}
        open={!!viewTarget}
        onClose={() => setViewTarget(null)}
      />
      <EditBookingDialog
        booking={editBookingTarget}
        open={!!editBookingTarget}
        onClose={() => setEditBookingTarget(null)}
        onDone={(updated) => setBookings((prev) => prev.map((b) => b.id === updated.id ? updated : b))}
      />
      <EquipmentFormDialog
        item={editEquipmentTarget}
        open={equipmentDialogOpen}
        onClose={() => { setEquipmentDialogOpen(false); setEditEquipmentTarget(null); }}
        onDone={loadAll}
      />
    </div>
  )
}
