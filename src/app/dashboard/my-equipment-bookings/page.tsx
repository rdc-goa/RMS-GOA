'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/config'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { fetchMyEquipmentBookings, cancelEquipmentBooking, payEquipmentBooking, fetchEquipmentCatalog } from '@/app/equipment-booking-actions'
import type { EquipmentBooking, BookingStatus, PaymentStatus, EquipmentCatalogItem } from '@/types/equipment-booking'
import type { User } from '@/types'
import { getDefaultModulesForRole } from '@/lib/modules'
import { useToast } from '@/hooks/use-toast'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ClipboardList,
  FlaskConical,
  CheckCircle2,
  Clock,
  XCircle,
  CalendarCheck,
  PackageCheck,
  RefreshCw,
  PlusCircle,
  CreditCard,
  Loader2,
  ExternalLink,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'

// ─────────────────────────────────────────────────────────────────
// Status Badge Helper
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
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.Pending
  const Icon = config.icon
  return (
    <Badge variant={config.variant} className="gap-1 text-xs">
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  )
}

// ─────────────────────────────────────────────────────────────────
// Booking Detail Card (mobile-friendly)
// ─────────────────────────────────────────────────────────────────
function BookingDetailCard({
  booking,
  onCancel,
  onPay,
}: {
  booking: EquipmentBooking
  onCancel: (id: string) => void
  onPay: (booking: EquipmentBooking) => void
}) {
  const createdDate = (() => {
    try { return format(parseISO(booking.createdAt), 'dd MMM yyyy') } catch { return booking.createdAt }
  })()

  // Calculate final amount
  const finalAmount = booking.totalAmount || 0

  return (
    <Card className="group transition-all duration-300 hover:shadow-2xl bg-card/20 dark:bg-card/15 backdrop-blur-md border-none rounded-2xl p-5 shadow-md overflow-hidden flex flex-col gap-4">
      {/* Top Section: Title, Ref, Status & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
        <div className="flex items-start sm:items-center gap-3">
          <div className="flex flex-col">
            <span className="text-[11px] font-mono text-primary font-bold tracking-wider">{booking.refNo}</span>
            <h3 className="font-extrabold text-foreground mt-0.5 text-[15px] sm:text-base leading-snug tracking-tight group-hover:text-primary transition-colors duration-200">
              {booking.equipmentName}
            </h3>
          </div>
          <div className="flex items-center mt-1 sm:mt-0 shrink-0">
            <StatusBadge status={booking.status} />
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {['Slot Assigned', 'Approved', 'Completed'].includes(booking.status) && booking.paymentStatus !== 'Paid' && finalAmount > 0 && (
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/95 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-md hover:shadow-lg transition-all duration-200"
              onClick={() => onPay(booking)}
            >
              <CreditCard className="h-4 w-4" /> Pay Now
            </Button>
          )}

          {booking.status === 'Pending' && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-white border-destructive/20 hover:bg-destructive/95 rounded-xl font-medium transition-colors duration-200"
              onClick={() => onCancel(booking.id)}
            >
              <XCircle className="mr-1.5 h-4 w-4" /> Cancel Request
            </Button>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-border/5 w-full" />

      {/* Bottom Section: Info Grid/Row */}
      <div className="flex flex-col gap-3 text-xs w-full">
        {/* Row 1: Booking Preferences */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex lg:flex-wrap gap-x-10 gap-y-4 bg-muted/10 dark:bg-muted/5 p-4 rounded-xl w-full">
          <div className="flex flex-col gap-1 min-w-[100px]">
            <span className="text-[10px] font-bold text-muted-foreground/75 uppercase tracking-wider">Pref. Date</span>
            <span className="text-[13px] font-semibold text-foreground">{booking.preferredDate}</span>
          </div>
          <div className="flex flex-col gap-1 min-w-[100px]">
            <span className="text-[10px] font-bold text-muted-foreground/75 uppercase tracking-wider">Slot</span>
            <span className="text-[13px] font-semibold text-foreground">{booking.preferredTimeSlot}</span>
          </div>
          <div className="flex flex-col gap-1 min-w-[70px]">
            <span className="text-[10px] font-bold text-muted-foreground/75 uppercase tracking-wider">Samples</span>
            <span className="text-[13px] font-semibold text-foreground">{booking.noOfSamples}</span>
          </div>
          <div className="flex flex-col gap-1 min-w-[90px]">
            <span className="text-[10px] font-bold text-muted-foreground/75 uppercase tracking-wider">Category</span>
            <span className="text-[13px] font-semibold text-foreground font-mono">{booking.userCategory}</span>
          </div>
          <div className="flex flex-col gap-1 min-w-[100px]">
            <span className="text-[10px] font-bold text-muted-foreground/75 uppercase tracking-wider">Submitted</span>
            <span className="text-[13px] font-semibold text-foreground">{createdDate}</span>
          </div>
          {finalAmount > 0 && (
            <div className="flex flex-col gap-1 min-w-[90px]">
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Total Amount</span>
              <span className="text-[13px] font-bold text-primary">₹{finalAmount.toLocaleString('en-IN')}</span>
            </div>
          )}
        </div>

        {/* Row 2: Assignment & Payment Details */}
        {booking.status === 'Rejected' && booking.adminRemarks ? (
          <div className="rounded-xl bg-destructive/10 dark:bg-destructive/5 p-4 flex flex-col gap-1 w-full border border-destructive/10">
            <span className="text-[10px] font-bold text-destructive uppercase tracking-wider">Rejection Reason</span>
            <p className="text-sm font-semibold text-foreground">{booking.adminRemarks}</p>
          </div>
        ) : booking.assignedDate ? (
          <div className={`rounded-xl p-4 grid grid-cols-2 sm:grid-cols-3 lg:flex lg:flex-wrap gap-x-10 gap-y-4 w-full border-none ${booking.paymentStatus === 'Paid' ? 'bg-emerald-500/10 dark:bg-emerald-500/5 text-emerald-900 dark:text-emerald-100' : 'bg-amber-500/10 dark:bg-amber-500/5 text-amber-900 dark:text-amber-100'}`}>
            <div className="flex flex-col gap-1 min-w-[100px]">
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">Date</span>
              <span className="text-[13px] font-semibold">{booking.assignedDate}</span>
            </div>
            <div className="flex flex-col gap-1 min-w-[100px]">
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">Slot</span>
              <span className="text-[13px] font-semibold">{booking.assignedSlot}</span>
            </div>
            <div className="flex flex-col gap-1 min-w-[110px]">
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">Payment Status</span>
              <span className={`text-[13px] font-bold ${booking.paymentStatus === 'Paid' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {booking.paymentStatus || 'Pending'}
              </span>
            </div>

            {booking.paymentStatus === 'Paid' ? (
              <>
                <div className="flex flex-col gap-1 min-w-[100px]">
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">Payment Mode</span>
                  <span className="text-[13px] font-semibold">
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
                </div>
                <div className="flex flex-col gap-1 min-w-[140px]">
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">Transaction ID</span>
                  <code className="text-[11px] font-mono font-bold bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded mt-0.5 self-start">
                    {booking.easebuzzTxnId || booking.easepayid || booking.receiptNo || 'N/A'}
                  </code>
                </div>
                <div className="flex flex-col gap-1 min-w-[120px]">
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">Date and Time</span>
                  <span className="text-[13px] font-semibold">{booking.paymentDate || 'N/A'}</span>
                </div>
              </>
            ) : finalAmount > 0 ? (
              <div className="flex flex-col gap-1 min-w-[90px]">
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">Amount</span>
                <span className="text-[13px] font-bold text-amber-600 dark:text-amber-400">₹{finalAmount.toLocaleString('en-IN')}</span>
              </div>
            ) : (
              <div className="flex flex-col gap-1 min-w-[120px]">
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">Payment</span>
                <span className="text-[13px] font-semibold">No Payment Required</span>
              </div>
            )}

            {booking.adminRemarks && (
              <div className="flex flex-col gap-1 col-span-full w-full border-t border-current/10 pt-3 mt-1">
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">Remarks</span>
                <span className="text-[13px] italic font-normal">"{booking.adminRemarks}"</span>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/20 bg-muted/5 py-3 px-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 text-muted-foreground/60 animate-pulse" />
            <span className="italic font-semibold">Schedule assignment pending</span>
          </div>
        )}
      </div>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────
// Stats Summary Row
// ─────────────────────────────────────────────────────────────────
function StatsRow({ bookings }: { bookings: EquipmentBooking[] }) {
  const counts = bookings.reduce(
    (acc, b) => {
      acc[b.status] = (acc[b.status] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  const stats = [
    { label: 'Total Bookings', value: bookings.length, icon: ClipboardList, color: 'text-primary bg-primary/10 border-primary/20' },
    { label: 'Pending Requests', value: counts['Pending'] || 0, icon: Clock, color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
    { label: 'Approved Slots', value: (counts['Approved'] || 0) + (counts['Slot Assigned'] || 0), icon: CalendarCheck, color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' },
    { label: 'Completed', value: counts['Completed'] || 0, icon: PackageCheck, color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {stats.map((s) => {
        const Icon = s.icon
        return (
          <Card key={s.label} className="border-none bg-card/20 dark:bg-card/15 backdrop-blur-md rounded-2xl transition-all duration-300 hover:scale-[1.02] hover:shadow-lg">
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`p-2.5 rounded-xl ${s.color.split(' ')[1]}`}>
                <Icon className={`h-5 w-5 ${s.color.split(' ')[0]}`} />
              </div>
              <div>
                <p className="text-2xl font-black text-foreground tracking-tight">{s.value}</p>
                <p className="text-xs font-medium text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────
export default function MyEquipmentBookingsPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [user, setUser] = useState<User | null>(null)
  const [bookings, setBookings] = useState<EquipmentBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)

  // Payment integration states
  const [payBooking, setPayBooking] = useState<EquipmentBooking | null>(null)
  const [paying, setPaying] = useState(false)


  const handlePaymentSubmit = async () => {
    if (!payBooking) return
    setPaying(true)

    try {
      const response = await fetch('/api/easebuzz/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bookingId: payBooking.id }),
      })

      const res = await response.json()
      if (res.success && res.payUrl) {
        // Redirect the user to Easebuzz payment portal
        window.location.href = res.payUrl
      } else {
        toast({
          variant: 'destructive',
          title: 'Failed to initiate payment',
          description: res.error || 'Server error occurred.',
        })
        setPaying(false)
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Payment Error',
        description: error.message || 'An unexpected error occurred.',
      })
      setPaying(false)
    }
  }

  // Handle redirected callback response toast
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const payment = params.get('payment')
      if (payment) {
        if (payment === 'success') {
          toast({
            title: 'Payment Successful',
            description: `Your payment was completed successfully. Transaction ID: ${params.get('txnid') || ''}`,
          })
        } else if (payment === 'failed') {
          toast({
            variant: 'destructive',
            title: 'Payment Failed',
            description: params.get('message') || 'The transaction could not be completed.',
          })
        } else if (payment === 'error') {
          toast({
            variant: 'destructive',
            title: 'Payment Error',
            description: params.get('message') || 'An unexpected error occurred.',
          })
        }
        router.replace('/dashboard/my-equipment-bookings')
      }
    }
  }, [router, toast])

  const loadBookings = async (uid: string) => {
    setLoading(true)
    const [bookingsRes, catalogRes] = await Promise.all([
      fetchMyEquipmentBookings(uid),
      fetchEquipmentCatalog()
    ])

    if (bookingsRes.success && bookingsRes.data) {
      const catalogItems = catalogRes.success && catalogRes.data ? catalogRes.data : []
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
    } else {
      toast({
        variant: 'destructive',
        title: 'Failed to load bookings',
        description: bookingsRes.error || 'Please try again later.',
      })
    }
    setLoading(false)
  }

  useEffect(() => {
    const storedUser = localStorage.getItem('user')
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser) as User
      const allowedModules = parsedUser.allowedModules || getDefaultModulesForRole(parsedUser.role, parsedUser.designation)
      if (!allowedModules.includes('my-equipment-bookings')) {
        toast({
          title: 'Access Denied',
          description: "You don't have permission to view this page.",
          variant: 'destructive',
        })
        router.replace('/dashboard')
        return
      }
      setUser(parsedUser)
      loadBookings(parsedUser.uid)
    } else {
      router.replace('/login')
    }
  }, [router, toast])

  const handleCancelConfirm = async () => {
    if (!cancelId || !user) return
    setCancelling(true)
    const res = await cancelEquipmentBooking(cancelId, user.uid)
    if (res.success) {
      toast({ title: 'Booking Cancelled', description: 'Your booking request has been cancelled.' })
      setBookings((prev) => prev.map((b) => b.id === cancelId ? { ...b, status: 'Cancelled' as BookingStatus } : b))
    } else {
      toast({ variant: 'destructive', title: 'Error', description: res.error })
    }
    setCancelling(false)
    setCancelId(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            My Equipment Bookings
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Track the status of your equipment booking requests.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => user && loadBookings(user.uid)}
            disabled={loading}
          >
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => router.push('/dashboard/equipment-booking')}>
            <PlusCircle className="mr-1.5 h-4 w-4" />
            New Booking
          </Button>
        </div>
      </div>

      {/* Stats */}
      {!loading && bookings.length > 0 && <StatsRow bookings={bookings} />}

      {/* Loading */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
        </div>
      ) : bookings.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <FlaskConical className="h-16 w-16 text-muted-foreground/30" />
          <div>
            <p className="font-semibold text-muted-foreground">No bookings yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              You haven&apos;t submitted any equipment booking requests.
            </p>
          </div>
          <Button onClick={() => router.push('/dashboard/equipment-booking')} size="sm">
            <FlaskConical className="mr-1.5 h-4 w-4" />
            Browse Equipment
          </Button>
        </div>
      ) : (
        /* Bookings List */
        <div className="flex flex-col gap-4">
          {bookings.map((booking) => (
            <BookingDetailCard
              key={booking.id}
              booking={booking}
              onCancel={(id) => setCancelId(id)}
              onPay={(b) => setPayBooking(b)}
            />
          ))}
        </div>
      )}

      {/* Cancel Confirm Dialog */}
      <AlertDialog open={!!cancelId} onOpenChange={(o) => !o && setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Booking Request?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel your pending booking request. This action cannot be undone. You can submit a new request at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep Booking</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelConfirm}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? 'Cancelling…' : 'Yes, Cancel'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Payment Dialog */}
      <Dialog
        open={!!payBooking}
        onOpenChange={(open) => {
          if (!open) {
            setPayBooking(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-[450px] bg-background border border-border rounded-2xl overflow-hidden p-6 shadow-2xl space-y-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Secure Checkout
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Pay for equipment booking request {payBooking?.refNo}.
            </DialogDescription>
          </DialogHeader>

          {/* Booking Summary */}
          <div className="bg-card/40 rounded-xl p-4 border border-border/10 text-sm space-y-2">
            <div className="flex justify-between font-semibold"><span className="text-foreground">{payBooking?.equipmentName}</span></div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Samples: {payBooking?.noOfSamples} × ₹{(payBooking ? (payBooking.totalAmount ? Math.round(payBooking.totalAmount / payBooking.noOfSamples) : 0) : 0).toLocaleString('en-IN')}</span>
              <span className="font-bold text-foreground">
                ₹{(payBooking ? (payBooking.totalAmount || 0) : 0).toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          <div className="text-sm text-muted-foreground leading-relaxed">
            You will be redirected to the secure <strong>Easebuzz Payment Gateway</strong> to complete your transaction. You can pay using UPI, Credit/Debit Card, Net Banking, or Wallet options.
          </div>

          {/* Submit */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={() => setPayBooking(null)}
              disabled={paying}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 rounded-xl bg-primary text-white font-medium flex items-center justify-center gap-1.5 hover:bg-primary/95 transition-colors"
              onClick={handlePaymentSubmit}
              disabled={paying}
            >
              {paying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Redirecting...
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4" />
                  Pay Now
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
