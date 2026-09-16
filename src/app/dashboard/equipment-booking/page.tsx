'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { auth, db } from '@/lib/config'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { fetchEquipmentCatalog, submitEquipmentBooking } from '@/app/equipment-booking-actions'
import type { EquipmentCatalogItem, BookingFormData, UserCategory } from '@/types/equipment-booking'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  FlaskConical,
  Microscope,
  CheckCircle2,
  AlertCircle,
  Info,
  Loader2,
  ExternalLink,
  Search,
} from 'lucide-react'
import Image from 'next/image'

// ─────────────────────────────────────────────────────────────────
// Equipment Card Component
// ─────────────────────────────────────────────────────────────────
function EquipmentCard({
  item,
  onBook,
}: {
  item: EquipmentCatalogItem
  onBook: (item: EquipmentCatalogItem) => void
}) {
  const [appsDialogOpen, setAppsDialogOpen] = useState(false)

  return (
    <>
      <Card className="group flex flex-col h-full transition-all duration-300 hover:shadow-xl hover:-translate-y-1.5 bg-card/30 backdrop-blur-md border-none rounded-2xl p-4">
        {/* Equipment Image Container */}
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
              <Microscope className="h-12 w-12 text-primary/30" />
            </div>
          )}
          <div className="absolute top-3 right-3">
            <Badge variant={item.isAvailable ? 'default' : 'secondary'} className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 shadow-sm">
              {item.isAvailable ? 'Available' : 'Unavailable'}
            </Badge>
          </div>
        </div>

        {/* Card Details */}
        <div className="flex flex-col flex-1 gap-4 pt-4">
          <div>
            <h3 className="text-[17px] font-bold text-foreground leading-snug group-hover:text-primary transition-colors duration-200 line-clamp-2 h-[50px]" title={item.name}>
              {item.name}
            </h3>
            {item.make ? (
              <p className="text-xs text-muted-foreground mt-1 font-medium truncate h-4">
                Make: {item.make} {item.modelNumber ? `· Model: ${item.modelNumber}` : ''}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1 font-medium truncate h-4">
                &nbsp;
              </p>
            )}
          </div>

          <p className="text-sm text-muted-foreground/85 line-clamp-3 leading-relaxed h-[68px]">{item.description}</p>

          {/* Pricing */}
          <div className="rounded-lg bg-primary/5 dark:bg-primary/10 px-3 py-2 flex justify-between items-center text-sm border border-primary/5">
            <span className="text-muted-foreground font-medium">Price per sample</span>
            <span className="font-semibold text-primary">₹{item.prices.internal}</span>
          </div>

          {/* Applications */}
          <div className="flex flex-wrap gap-1.5 min-h-[24px]">
            {item.applications && item.applications.length > 0 ? (
              <>
                {item.applications.slice(0, 2).map((app, i) => (
                  <Badge key={i} variant="secondary" className="text-[11px] font-normal border-none bg-secondary/60 hover:bg-secondary/60 text-secondary-foreground px-2 py-0.5 rounded-md">
                    {app}
                  </Badge>
                ))}
                {item.applications.length > 2 && (
                  <Badge
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation()
                      setAppsDialogOpen(true)
                    }}
                    className="text-[11px] font-normal border-none bg-muted hover:bg-muted/80 text-muted-foreground px-2 py-0.5 rounded-md cursor-pointer transition-colors"
                  >
                    +{item.applications.length - 2} more
                  </Badge>
                )}
              </>
            ) : (
              <div className="h-6" />
            )}
          </div>

          <Button
            onClick={() => onBook(item)}
            disabled={!item.isAvailable}
            className="mt-auto w-full font-semibold transition-all duration-200 bg-primary hover:bg-primary/95 text-primary-foreground shadow-sm hover:shadow-md py-2 rounded-xl"
            size="sm"
          >
            <FlaskConical className="mr-2 h-4 w-4" />
            {item.isAvailable ? 'Book This Equipment' : 'Currently Unavailable'}
          </Button>
        </div>
      </Card>

      <Dialog open={appsDialogOpen} onOpenChange={setAppsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-primary" />
              Applications for {item.name}
            </DialogTitle>
            <DialogDescription>
              All key research, testing, and industrial applications supported by this equipment.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2 py-4">
            {item.applications?.map((app, i) => (
              <Badge key={i} variant="secondary" className="text-xs font-normal border-none bg-secondary/80 text-secondary-foreground px-3 py-1.5 rounded-md">
                {app}
              </Badge>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────
// Booking Form Dialog
// ─────────────────────────────────────────────────────────────────
function BookingFormDialog({
  equipment,
  open,
  onClose,
  user,
  onSuccess,
}: {
  equipment: EquipmentCatalogItem | null
  open: boolean
  onClose: () => void
  user: User | null
  onSuccess: (refNo: string) => void
}) {
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)

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

  const [form, setForm] = useState<{
    preferredDate: string
    preferredTimeSlot: string
    alternateDate: string
    noOfSamples: string
    purpose: string
    userCategory: UserCategory | ''
    specialRequirements: string
  }>({
    preferredDate: '',
    preferredTimeSlot: '',
    alternateDate: '',
    noOfSamples: '',
    purpose: '',
    userCategory: 'Internal',
    specialRequirements: '',
  })

  // Auto-detect category based on user role
  useEffect(() => {
    if (user) {
      setForm((f) => ({ ...f, userCategory: 'Internal' }))
    }
  }, [user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!equipment || !user) return

    if (!form.preferredDate || !form.preferredTimeSlot || !form.noOfSamples || !form.purpose || !form.userCategory) {
      toast({ variant: 'destructive', title: 'Validation Error', description: 'Please fill in all required fields.' })
      return
    }

    const noOfSamples = parseInt(form.noOfSamples)
    if (isNaN(noOfSamples) || noOfSamples < 1) {
      toast({ variant: 'destructive', title: 'Invalid Input', description: 'Number of samples must be at least 1.' })
      return
    }

    setSubmitting(true)
    try {
      const formData: BookingFormData = {
        equipmentId: equipment.id,
        equipmentName: equipment.name,
        preferredDate: form.preferredDate,
        preferredTimeSlot: form.preferredTimeSlot,
        alternateDate: form.alternateDate && form.alternateDate !== 'none' ? form.alternateDate : undefined,
        noOfSamples,
        purpose: form.purpose,
        userCategory: form.userCategory as UserCategory,
        specialRequirements: form.specialRequirements || undefined,
      }

      const result = await submitEquipmentBooking(formData, {
        uid: user.uid,
        name: user.name,
        email: user.email,
        phone: user.phoneNumber,
        department: user.department,
        institute: user.institute,
        designation: user.designation,
        misId: user.misId,
        faculty: user.faculty,
      })

      if (result.success && result.refNo) {
        onSuccess(result.refNo)
        onClose()
        setForm({
          preferredDate: '',
          preferredTimeSlot: '',
          alternateDate: '',
          noOfSamples: '',
          purpose: '',
          userCategory: 'Internal',
          specialRequirements: '',
        })
      } else {
        toast({ variant: 'destructive', title: 'Submission Failed', description: result.error || 'Please try again.' })
      }
    } finally {
      setSubmitting(false)
    }
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            Book Equipment: {equipment?.name}
          </DialogTitle>
          <DialogDescription>
            Fill in the details below to submit your booking request. An admin will confirm your slot.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          {/* Applicant Info (read-only) */}
          <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5" /> Your Profile (auto-filled)
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Name: </span>
                <span className="font-medium">{user?.name}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Email: </span>
                <span className="font-medium">{user?.email}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Institute: </span>
                <span className="font-medium">{user?.institute || '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Department: </span>
                <span className="font-medium">{user?.department || '—'}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Preferred Date */}
            <div className="space-y-1.5">
              <Label htmlFor="booking-preferred-date">
                Preferred Date <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.preferredDate}
                onValueChange={(v) => setForm((f) => ({ ...f, preferredDate: v }))}
              >
                <SelectTrigger id="booking-preferred-date">
                  <SelectValue placeholder="Select date (Mon-Sat)" />
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

            {/* Preferred Slot */}
            <div className="space-y-1.5">
              <Label htmlFor="booking-preferred-slot">
                Preferred Time Slot <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.preferredTimeSlot}
                onValueChange={(v) => setForm((f) => ({ ...f, preferredTimeSlot: v }))}
              >
                <SelectTrigger id="booking-preferred-slot">
                  <SelectValue placeholder="Select a slot" />
                </SelectTrigger>
                <SelectContent>
                  {(equipment?.availableSlots || []).map((slot) => (
                    <SelectItem key={slot} value={slot}>
                      {slot}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Alternate Date */}
            <div className="space-y-1.5">
              <Label htmlFor="booking-alternate-date">Alternate Date (optional)</Label>
              <Select
                value={form.alternateDate}
                onValueChange={(v) => setForm((f) => ({ ...f, alternateDate: v }))}
              >
                <SelectTrigger id="booking-alternate-date">
                  <SelectValue placeholder="Select alternate date (Mon-Sat)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {availableDates.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Number of Samples */}
            <div className="space-y-1.5">
              <Label htmlFor="booking-samples">
                No. of Samples <span className="text-destructive">*</span>
              </Label>
              <Input
                id="booking-samples"
                type="number"
                min={1}
                placeholder="e.g. 5"
                value={form.noOfSamples}
                onChange={(e) => setForm((f) => ({ ...f, noOfSamples: e.target.value }))}
                required
              />
            </div>
          </div>

          {/* Purpose */}
          <div className="space-y-1.5">
            <Label htmlFor="booking-purpose">
              Purpose / Experiment Description <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="booking-purpose"
              placeholder="Briefly describe the experiment or research purpose..."
              rows={3}
              value={form.purpose}
              onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
              required
            />
          </div>

          {/* Special Requirements */}
          <div className="space-y-1.5">
            <Label htmlFor="booking-special-req">Special Requirements (optional)</Label>
            <Textarea
              id="booking-special-req"
              placeholder="Any special sample preparation, conditions, or other requirements..."
              rows={2}
              value={form.specialRequirements}
              onChange={(e) => setForm((f) => ({ ...f, specialRequirements: e.target.value }))}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <FlaskConical className="mr-2 h-4 w-4" />
                  Submit Request
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────
// Success Banner Component
// ─────────────────────────────────────────────────────────────────
function SuccessBanner({ refNo, onDismiss }: { refNo: string; onDismiss: () => void }) {
  return (
    <div className="mb-6 rounded-xl border border-green-500/30 bg-green-500/10 p-5 flex items-start gap-4">
      <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="font-semibold text-green-700 dark:text-green-400">Booking Request Submitted!</p>
        <p className="text-sm text-muted-foreground mt-0.5">
          Your reference number is <strong className="text-foreground">{refNo}</strong>. A confirmation email has been sent to you. An admin will assign your slot shortly.
        </p>
      </div>
      <Button variant="ghost" size="sm" onClick={onDismiss} className="text-muted-foreground">
        Dismiss
      </Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────

export default function EquipmentBookingPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [user, setUser] = useState<User | null>(null)
  const [catalog, setCatalog] = useState<EquipmentCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentCatalogItem | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [successRefNo, setSuccessRefNo] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Load user
  useEffect(() => {
    const storedUser = localStorage.getItem('user')
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser) as User
      const allowedModules = parsedUser.allowedModules || getDefaultModulesForRole(parsedUser.role, parsedUser.designation)
      if (!allowedModules.includes('equipment-booking')) {
        toast({
          title: 'Access Denied',
          description: "You don't have permission to view this page.",
          variant: 'destructive',
        })
        router.replace('/dashboard')
        return
      }
      setUser(parsedUser)
    } else {
      router.replace('/login')
    }
  }, [router, toast])

  // Load catalog
  useEffect(() => {
    fetchEquipmentCatalog().then((res) => {
      if (res.success && res.data) setCatalog(res.data)
      setLoading(false)
    })
  }, [])

  const handleBook = (item: EquipmentCatalogItem) => {
    setSelectedEquipment(item)
    setDialogOpen(true)
  }

  const handleSuccess = (refNo: string) => {
    setSuccessRefNo(refNo)
    toast({
      title: 'Request Submitted',
      description: `Your booking ${refNo} has been submitted. Check your email for confirmation.`,
    })
  }

  const filteredCatalog = catalog.filter((item) => {
    const query = searchQuery.toLowerCase()
    return (
      item.name.toLowerCase().includes(query) ||
      (item.make || '').toLowerCase().includes(query) ||
      (item.modelNumber || '').toLowerCase().includes(query) ||
      (item.description || '').toLowerCase().includes(query) ||
      (item.applications || []).some((app) => app.toLowerCase().includes(query))
    )
  })

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-primary" />
            Equipment Booking
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Browse our Central Instrumentation Facility (CIF) equipment and submit a booking request.
            An admin will confirm your slot.
          </p>
        </div>
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search equipment, make, applications..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-muted/40 border-none shadow-inner focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-offset-0"
          />
        </div>
      </div>

      {/* Success Banner */}
      {successRefNo && (
        <SuccessBanner refNo={successRefNo} onDismiss={() => setSuccessRefNo(null)} />
      )}

      {/* Info Banner */}
      <div className="rounded-xl bg-blue-500/10 dark:bg-blue-500/5 px-4 py-3.5 flex items-start gap-3 text-sm shadow-sm border border-blue-500/5">
        <Info className="h-4.5 w-4.5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-muted-foreground leading-relaxed">
          <span className="font-semibold text-foreground">How it works:</span> Select an equipment →
          Fill the booking form → Admin reviews &amp; assigns a confirmed slot → You receive an email
          with the confirmed date and time. Track your requests in{' '}
          <button
            onClick={() => router.push('/dashboard/my-equipment-bookings')}
            className="underline text-primary hover:text-primary/80 hover:no-underline font-medium bg-transparent border-none p-0 m-0 inline cursor-pointer outline-none focus:outline-none"
          >
            My Equipment Bookings
          </button>
          .
        </div>
      </div>

      {/* Catalog Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-56 w-full rounded-xl" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      ) : catalog.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <Microscope className="h-16 w-16 text-muted-foreground/30" />
          <div>
            <p className="font-semibold text-muted-foreground">No equipment available</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              The equipment catalog is currently empty. Please check back later.
            </p>
          </div>
        </div>
      ) : filteredCatalog.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <Search className="h-16 w-16 text-muted-foreground/30 animate-pulse" />
          <div>
            <p className="font-semibold text-muted-foreground">No matching equipment found</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              We couldn't find any equipment matching "{searchQuery}". Try searching for another name, brand, or application.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCatalog.map((item) => (
            <EquipmentCard key={item.id} item={item} onBook={handleBook} />
          ))}
        </div>
      )}

      {/* Booking Form Dialog */}
      <BookingFormDialog
        equipment={selectedEquipment}
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false)
          setSelectedEquipment(null)
        }}
        user={user}
        onSuccess={handleSuccess}
      />
    </div>
  )
}
