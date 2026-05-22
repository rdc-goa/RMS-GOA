"use client"

import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { useAuth as useClientAuth } from '../contexts/AuthContext'
import { db } from "@/lib/config"
import { collection, query, where, getDocs, orderBy } from "firebase/firestore"
import type { User, IncentiveClaim, Author } from "@/types"
import { uploadFileToApi } from "@/lib/upload-client"
import { Loader2, AlertCircle, Info, Edit, Trash2, CheckCircle2, FileText, X, Globe, MapPin, Calendar, Award, Bot, ChevronDown } from "lucide-react"
import { parseISO, addYears, format } from "date-fns"
import { calculateConferenceIncentive } from "@/app/incentive-calculation"
import { WorkshopForm } from "@/components/incentives/workshop-form"
import { AuthorSearch } from "./author-search"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { submitIncentiveClaimViaApi } from "@/lib/incentive-claim-client"
import { getIncentiveClaimByIdAction, checkDuplicateConferenceClaimAction } from "@/app/incentive-actions"
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

const workshopEventTypes = ["STTP", "Workshop", "Training Program", "FDP", "Other"]

const conferenceSchema = z
  .object({
    eventType: z.string({ required_error: "Please select an event type." }),
    conferencePaperTitle: z.string().optional(),
    conferenceName: z.string().min(3, "Conference name is required."),
    conferenceMode: z.enum(["Online", "Offline"], { required_error: "Presentation mode is required." }),
    onlinePresentationOrder: z.enum(["First", "Second", "Third", "Additional"]).optional(),
    conferenceType: z.enum(["International", "National", "Regional/State"], { required_error: "Conference type is required." }),
    conferenceVenue: z.enum(
      ["India", "Indian Subcontinent", "South Korea, Japan, Australia and Middle East", "Europe", "African/South American/North American", "Other"],
      { required_error: "Conference venue is required." }
    ),
    presentationType: z.enum(["Oral", "Poster", "Other"]).optional(),
    govtFundingRequestProof: z
      .any()
      .optional()
      .refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, "File must be less than 10 MB."),
    registrationFee: z.coerce.number().nonnegative("Fee cannot be negative.").optional(),
    travelFare: z.coerce.number().nonnegative("Fare cannot be negative.").optional(),
    wasPresentingAuthor: z.boolean().optional(),
    isPuNamePresent: z.boolean().optional(),
    abstractUpload: z
      .any()
      .refine((files) => files?.length > 0, "An abstract is required.")
      .refine((files) => !files?.[0] || files?.[0]?.type === "application/pdf", "Abstract must be a PDF file.")
      .refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, "File must be less than 10 MB."),
    organizerName: z.string().min(2, "Organizer name is required."),
    eventWebsite: z.string().url("Please enter a valid URL.").optional().or(z.literal("")),
    conferenceDate: z.string().min(1, "Conference start date is required."),
    conferenceEndDate: z.string().min(1, "Conference end date is required."),
    presentationDate: z.string().min(1, "Presentation date is required."),
    registrationFeeProof: z
      .any()
      .optional()
      .refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, "File must be less than 10 MB."),
    participationCertificate: z
      .any()
      .refine((files) => files?.length > 0, "Participation certificate is required.")
      .refine((files) => !files?.[0] || files?.[0]?.type === "application/pdf", "File must be a PDF.")
      .refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, "File must be less than 10 MB."),
    wonPrize: z.boolean().optional(),
    prizeDetails: z.string().optional(),
    prizeProof: z
      .any()
      .optional()
      .refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, "File must be less than 10 MB."),
    conferenceProof: z
      .any()
      .optional()
      .refine((files) => !files || Array.from(files as FileList).every((file) => file.size <= MAX_FILE_SIZE), "File must be less than 10 MB."),
    additionalDocuments: z
      .any()
      .optional()
      .refine((files) => !files || Array.from(files as FileList).every((file) => file.size <= MAX_FILE_SIZE), "File must be less than 10 MB."),
    attendedOtherConference: z.boolean().optional(),
    travelPlaceVisited: z.string().optional(),
    travelMode: z.enum(["Bus", "Train", "Air", "Other"]).optional(),
    travelReceipts: z
      .any()
      .optional()
      .refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, "File must be less than 10 MB."),
    conferenceSelfDeclaration: z.boolean().refine((val) => val === true, { message: "You must agree to the self-declaration." }),
    authors: z
      .array(
        z
          .object({
            name: z.string().min(2, "Author name is required."),
            email: z.string().email("Invalid email format.").or(z.literal("")),
            uid: z.string().optional().nullable(),
            role: z.enum([
              "First Author",
              "Corresponding Author",
              "Co-Author",
              "First & Corresponding Author",
              "Presenting Author",
              "First & Presenting Author",
            ]),
            isExternal: z.boolean(),
            status: z.enum(["approved", "pending", "Applied"]),
          })
          .refine((data) => data.isExternal || !!data.email, {
            message: "Email is required for internal authors.",
            path: ["email"],
          })
      )
      .min(1, "At least one author is required.")
      .refine(
        (data) => {
          const firstAuthors = data.filter((author) => author.role === "First Author" || author.role === "First & Corresponding Author")
          return firstAuthors.length <= 1
        },
        { message: "Only one author can be designated as the First Author.", path: ["authors"] }
      ),
    authorType: z.string().optional(),
    totalAuthors: z.string().optional(),
    authorPosition: z.enum(['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th']).optional(),
  })
  .refine(
    (data) => !(data.conferenceVenue && data.conferenceVenue !== "India") || (!!data.govtFundingRequestProof && data.govtFundingRequestProof.length > 0),
    { message: "Proof of government funding request is required for conferences outside India.", path: ["govtFundingRequestProof"] }
  )
  .refine((data) => !data.wonPrize || (!!data.prizeDetails && data.prizeDetails.length > 2), {
    message: "Prize details are required if you won a prize.",
    path: ["prizeDetails"],
  })
  .refine((data) => !data.wonPrize || (!!data.prizeProof && data.prizeProof.length > 0), {
    message: "Proof of prize is required if you won a prize.",
    path: ["prizeProof"],
  })
  .refine((data) => data.conferenceMode === "Online" || !!data.presentationType, {
    message: "Presentation type is required for offline conferences.",
    path: ["presentationType"],
  })
  .refine((data) => !data.conferenceDate || !data.presentationDate || new Date(data.presentationDate) >= new Date(data.conferenceDate), {
    message: "Presentation date must be on or after the conference start date.",
    path: ["presentationDate"],
  })
  .refine((data) => !data.conferenceDate || !data.conferenceEndDate || new Date(data.conferenceEndDate) >= new Date(data.conferenceDate), {
    message: "End date must be on or after the start date.",
    path: ["conferenceEndDate"],
  })
  .refine(
    (data) => {
      const today = new Date().toISOString().split("T")[0];
      return !data.conferenceDate || data.conferenceDate <= today;
    },
    { message: "Conference start date cannot be in the future.", path: ["conferenceDate"] }
  )
  .refine(
    (data) => {
      const today = new Date().toISOString().split("T")[0];
      return !data.presentationDate || data.presentationDate <= today;
    },
    { message: "Presentation date cannot be in the future.", path: ["presentationDate"] }
  );

type ConferenceFormValues = z.infer<typeof conferenceSchema>

const eventTypes = ["Conference", "Seminar", "Symposium", "Invited Talk/Guest Speaker", ...workshopEventTypes]

const conferenceVenueOptions = {
  International: ["India", "Indian Subcontinent", "South Korea, Japan, Australia and Middle East", "Europe", "African/South American/North American", "Other"],
  National: ["India"],
  "Regional/State": ["India"],
}

const authorCountOptions = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10+"]
const authorTypeOptions = ["First Author", "Corresponding Author", "Co-Author", "Presenting Author", "First & Presenting Author"]
const coAuthorRoles: Author["role"][] = ["First Author", "Corresponding Author", "Co-Author", "Presenting Author", "First & Presenting Author"]

function ReviewDetails({
  data,
  onEdit,
  isSubmitting,
  calculatedIncentive,
  breakdown,
  showLogic,
  setShowLogic,
}: {
  data: ConferenceFormValues
  onEdit: () => void
  isSubmitting: boolean
  calculatedIncentive: number | null
  breakdown: { eligibleExpenses?: number; maxReimbursement?: number } | null
  showLogic: boolean
  setShowLogic: (val: boolean) => void
}) {
  return (
    <Card className="max-w-4xl mx-auto shadow-xl border-t-4 border-t-primary">
      <CardHeader className="bg-muted/30">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-2xl flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-primary" /> Review Your Application
            </CardTitle>
            <CardDescription>Please verify all details before final submission.</CardDescription>
          </div>
          <Button variant="outline" onClick={onEdit} disabled={isSubmitting}>
            Edit Form
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6 text-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div>
              <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Event Type & Info</p>
              <div className="space-y-1">
                <p className="font-medium text-base">
                  {data.eventType} ({data.conferenceMode})
                  {data.presentationType && <span className="ml-2 opacity-70">[{data.presentationType}]</span>}
                </p>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" />
                  <span>
                    {data.conferenceType} - {data.conferenceVenue}
                  </span>
                  {data.eventWebsite && (
                    <Link href={data.eventWebsite} target="_blank" className="text-primary hover:underline flex items-center gap-1 ml-2">
                      <Globe className="h-3 w-3" /> Website
                    </Link>
                  )}
                </div>
              </div>
            </div>
            <div>
              <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Paper Title</p>
              <p className="font-medium">{data.conferencePaperTitle}</p>
            </div>
            <div>
              <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Conference/Event</p>
              <p className="font-medium">{data.conferenceName}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Organized by: {data.organizerName}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Total Authors</p>
                <p className="font-medium">{data.totalAuthors || 'N/A'}</p>
              </div>
              <div>
                <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Your Category</p>
                <p className="font-medium">{data.authorType || 'N/A'}</p>
              </div>
            </div>
            <div className="flex gap-6">
              <div>
                <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Start Date</p>
                <p className="font-medium">{data.conferenceDate}</p>
              </div>
              <div>
                <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">End Date</p>
                <p className="font-medium">{data.conferenceEndDate}</p>
              </div>
              <div>
                <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Presentation Date</p>
                <p className="font-medium">{data.presentationDate}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Financial Summary</p>
              <div className="space-y-4">
                <div className="bg-muted/30 p-4 rounded-xl border border-muted-foreground/10 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Registration Fee:</span>
                    <span className="font-bold font-mono">₹{data.registrationFee?.toLocaleString("en-IN") || 0}</span>
                  </div>
                  {data.conferenceMode === "Offline" && (
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">Travel Fare:</span>
                      <span className="font-bold font-mono">₹{data.travelFare?.toLocaleString("en-IN") || 0}</span>
                    </div>
                  )}
                </div>

                <div className="bg-primary p-6 rounded-[2rem] text-primary-foreground shadow-xl shadow-primary/20 relative overflow-hidden group">
                  <div className="absolute -right-4 -top-4 bg-white/10 w-24 h-24 rounded-full blur-3xl group-hover:bg-white/20 transition-all duration-500"></div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-2">Estimated Incentive</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black tracking-tighter">₹{calculatedIncentive?.toLocaleString('en-IN') || '0'}</span>
                    <span className="text-xs font-medium opacity-60">INR*</span>
                  </div>


                  <div className="mt-4 border-t border-primary/10 pt-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs font-bold w-full flex justify-between items-center text-primary hover:bg-primary/10"
                      onClick={() => setShowLogic(!showLogic)}
                      type="button"
                    >
                      View Calculation Logic
                      <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showLogic ? 'rotate-180' : ''}`} />
                    </Button>

                    {showLogic && breakdown && (
                      <div className="mt-3 p-4 bg-background rounded-xl border shadow-inner space-y-2 text-xs font-medium animate-in slide-in-from-top-2 flex flex-col gap-1">
                        <div className="flex justify-between items-start py-1 border-b border-muted">
                          <span className="text-muted-foreground pr-2">1. Incurred Expenses (Reg. Fee + Travel)</span>
                          <span className="font-semibold shrink-0">₹{breakdown.eligibleExpenses?.toLocaleString('en-IN') || 0}</span>
                        </div>
                        <div className="flex justify-between items-start py-1 border-b border-muted">
                          <span className="text-muted-foreground pr-2">2. Maximum Policy Limit</span>
                          <span className="font-semibold shrink-0">₹{breakdown.maxReimbursement?.toLocaleString('en-IN') || 0}</span>
                        </div>
                        <div className="flex justify-between items-start py-1 border-b border-muted">
                          <span className="text-muted-foreground pr-2">3. Final Admissible Amount</span>
                          <span className="font-bold text-green-600 shrink-0">₹{calculatedIncentive?.toLocaleString('en-IN') || '0'}</span>
                        </div>

                        <div className="text-[9px] text-muted-foreground italic mt-2 !pt-2 text-center border-t border-muted opacity-70">
                          *Logic matches official policy matrix evaluated by approvers during technical audit. Reimbursement is min(expenses, limit).
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Author Details</p>
              <div className="border rounded-xl overflow-hidden shadow-sm">
                <Table>
                  <TableBody>
                    {data.authors.map((author, idx) => (
                      <TableRow key={idx} className="hover:bg-transparent">
                        <TableCell className="py-2.5 font-medium">{author.name}</TableCell>
                        <TableCell className="py-2.5">
                          <Badge variant="outline" className="text-[9px] py-0 h-4">
                            {author.role}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {data.wonPrize && (
              <div className="bg-amber-50 dark:bg-amber-950/20 p-3 rounded-xl border border-amber-200 dark:border-amber-800">
                <p className="text-amber-800 dark:text-amber-400 font-bold flex items-center gap-1.5 text-xs mb-1">
                  <Award className="h-3.5 w-3.5" /> Prize Secured
                </p>
                <p className="text-xs font-medium">{data.prizeDetails}</p>
              </div>
            )}

            {(data.conferenceProof || (data.additionalDocuments && data.additionalDocuments.length > 0)) && (
              <div>
                <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Supportive Documents</p>
                <div className="flex flex-col gap-1.5">
                  {data.conferenceProof?.[0] && (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-primary/5 shadow-sm transition-all text-xs font-medium border-primary/20">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate">Conference Proof: {data.conferenceProof[0].name}</span>
                    </div>
                  )}
                  {data.additionalDocuments && Array.from(data.additionalDocuments as FileList).map((file: File, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 p-2.5 rounded-lg border bg-muted/30 shadow-sm transition-all text-xs font-medium">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate">{file.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function ConferenceForm({ user }: { user: User }) {
  const searchParams = useSearchParams()
  const [selectedEventType, setSelectedEventType] = useState<string | null>(null)
  const [isLoadingDraft, setIsLoadingDraft] = useState(true)
  const clientAuth = useClientAuth();

  useEffect(() => {
    const claimId = searchParams.get("claimId")
    if (claimId) {
      const fetchDraft = async () => {
        try {
          const result = await getIncentiveClaimByIdAction(claimId)
          if (result.success && result.data) {
            const draftData = result.data as any
            const eventType = draftData.eventType || null
            setSelectedEventType(eventType)
          }
        } catch (error) {
          console.error("Error fetching draft:", error)
        } finally {
          setIsLoadingDraft(false)
        }
      }
      fetchDraft()
    } else {
      setIsLoadingDraft(false)
    }
  }, [searchParams])

  if (isLoadingDraft) {
    return (
      <Card className="max-w-4xl mx-auto p-12 flex justify-center items-center shadow-lg border-t-4 border-t-primary">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </Card>
    )
  }

  if (selectedEventType && workshopEventTypes.includes(selectedEventType)) {
    return <WorkshopForm initialEventType={selectedEventType} onEventTypeChange={setSelectedEventType} />
  }

  return <ConferenceFormContent user={user} onEventTypeChange={setSelectedEventType} />
}

function ConferenceFormContent({ user, onEventTypeChange }: { user: User; onEventTypeChange?: (eventType: string | null) => void }) {
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [bankDetailsMissing, setBankDetailsMissing] = useState(false)
  const [orcidOrMisIdMissing, setOrcidOrMisIdMissing] = useState(false)
  const [eligibility, setEligibility] = useState<{ eligible: boolean; nextAvailableDate?: string }>({ eligible: true })
  const [isLoadingDraft, setIsLoadingDraft] = useState(true)
  const [step, setStep] = useState<"edit" | "review">("edit")
  const [calculatedIncentive, setCalculatedIncentive] = useState<number | null>(null)
  const [calculationBreakdown, setCalculationBreakdown] = useState<{ eligibleExpenses?: number; maxReimbursement?: number } | null>(null)
  const [showLogic, setShowLogic] = useState(false)

  const form = useForm<ConferenceFormValues>({
    resolver: zodResolver(conferenceSchema),
    defaultValues: {
      eventType: "",
      conferenceName: "",
      conferencePaperTitle: "",
      authors: [],
      conferenceType: undefined,
      conferenceVenue: undefined,
      presentationType: undefined,
      govtFundingRequestProof: undefined,
      registrationFee: 0,
      travelFare: 0,
      conferenceMode: undefined,
      onlinePresentationOrder: undefined,
      wasPresentingAuthor: false,
      isPuNamePresent: false,
      abstractUpload: undefined,
      organizerName: "",
      eventWebsite: "",
      conferenceDate: "",
      conferenceEndDate: "",
      presentationDate: "",
      registrationFeeProof: undefined,
      participationCertificate: undefined,
      wonPrize: false,
      prizeDetails: "",
      prizeProof: undefined,
      conferenceProof: undefined,
      additionalDocuments: undefined,
      attendedOtherConference: false,
      travelPlaceVisited: "",
      travelMode: undefined,
      travelReceipts: undefined,
      conferenceSelfDeclaration: false,
      authorType: "",
      totalAuthors: "",
      authorPosition: "1st" as any,
    },
  })

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "authors",
  })

  const selectedEventType = form.watch("eventType")

  useEffect(() => {
    if (selectedEventType && workshopEventTypes.includes(selectedEventType)) {
      onEventTypeChange?.(selectedEventType)
    }
  }, [selectedEventType, onEventTypeChange])

  const calculate = useCallback(async () => {
    const dataForCalc = form.getValues()
    if (dataForCalc.conferenceMode) {
      const result = await calculateConferenceIncentive(dataForCalc)
      if (result.success) {
        setCalculatedIncentive(result.amount ?? null)
        setCalculationBreakdown({
          eligibleExpenses: result.eligibleExpenses,
          maxReimbursement: result.maxReimbursement,
        })
      } else {
        setCalculatedIncentive(null)
        setCalculationBreakdown(null)
      }
    } else {
      setCalculatedIncentive(null)
      setCalculationBreakdown(null)
    }
  }, [form])

  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === "conferenceType" && value.conferenceType === "National") {
        form.setValue("conferenceVenue", "India", { shouldValidate: true })
      }

      const fieldsForRecalculation = [
        "registrationFee",
        "travelFare",
        "conferenceMode",
        "onlinePresentationOrder",
        "conferenceType",
        "presentationType",
        "conferenceVenue",
        "organizerName",
        "conferenceName",
      ]
      if (fieldsForRecalculation.includes(name as string)) {
        calculate()
      }
    })
    return () => subscription.unsubscribe()
  }, [form, calculate])

  useEffect(() => {
    if (user && clientAuth.initialLoadComplete) {
      setBankDetailsMissing(!user.bankDetails)
      setOrcidOrMisIdMissing(!user.orcidId || !user.misId)

      const isUserAlreadyAdded = form.getValues("authors").some((field) => field.email.toLowerCase() === user.email.toLowerCase())
      if (!isUserAlreadyAdded) {
        append({
          name: user.name,
          email: user.email,
          uid: user.uid,
          role: "Presenting Author",
          isExternal: false,
          status: "approved",
        })
      }

      const checkEligibility = async () => {
        const claimsRef = collection(db, "incentiveClaims")
        const q = query(
          claimsRef,
          where("uid", "==", user.uid),
          where("claimType", "==", "Conference Presentations"),
          where("status", "in", ["Accepted", "Submitted to Accounts", "Payment Completed"]),
          orderBy("submissionDate", "desc")
        )
        const snapshot = await getDocs(q)
        if (!snapshot.empty) {
          const lastPuConferenceClaim = snapshot.docs
            .map((docItem) => docItem.data() as IncentiveClaim)
            .find(
              (claim) => claim.organizerName?.toLowerCase().includes("parul university") || claim.conferenceName?.toLowerCase().includes("picet")
            )

          if (lastPuConferenceClaim) {
            const lastClaimDate = parseISO(lastPuConferenceClaim.submissionDate)
            const oneYearAgo = addYears(new Date(), -1)

            if (lastClaimDate > oneYearAgo) {
              const nextDate = addYears(lastClaimDate, 1)
              setEligibility({
                eligible: false,
                nextAvailableDate: format(nextDate, "PPP"),
              })
            }
          }
        }
      }
      checkEligibility()
    }
    const claimId = searchParams.get("claimId")
    if (!claimId) {
      setIsLoadingDraft(false)
    }
  }, [append, form, searchParams, user])

  useEffect(() => {
    const claimId = searchParams.get("claimId")
    if (claimId && user) {
      const fetchDraft = async () => {
        setIsLoadingDraft(true)
        try {
          const result = await getIncentiveClaimByIdAction(claimId)
          if (result.success && result.data) {
            const draftData = result.data as any
            form.reset({
              ...draftData,
              authors: draftData.authors || [],
              govtFundingRequestProof: undefined,
              abstractUpload: undefined,
              registrationFeeProof: undefined,
              participationCertificate: undefined,
              prizeProof: undefined,
              conferenceProof: undefined,
              additionalDocuments: undefined,
              travelReceipts: undefined,
            })
          } else {
            toast({ variant: "destructive", title: result.error || "Draft Not Found" })
          }
        } catch (error) {
          toast({ variant: "destructive", title: "Error Loading Draft" })
        } finally {
          setIsLoadingDraft(false)
        }
      }
      fetchDraft()
    }
  }, [searchParams, user, form, toast])

  const checkDuplicateClaim = async (paperTitle: string) => {
    console.log("🔍 [Client] checkDuplicateClaim triggered with:", { paperTitle });
    if (!paperTitle) {
      console.log("🔍 [Client] Missing paperTitle, skipping check.");
      return { isDuplicate: false };
    }

    try {
      const claimId = searchParams.get("claimId");
      console.log("🔍 [Client] Current claimId (from URL):", claimId);
      console.log("🔍 [Client] Logged in user UID:", user?.uid);

      console.log("🔍 [Client] Invoking server action checkDuplicateConferenceClaimAction...");
      const result = await checkDuplicateConferenceClaimAction(
        paperTitle,
        "dummy-conf",
        claimId,
        user?.uid
      );
      console.log("🔍 [Client] Server action returned result:", result);

      if (result.success && result.isDuplicate) {
        console.log("🔍 [Client] Duplicate detected! Applied by:", result.appliedBy);
        return {
          isDuplicate: true,
          appliedBy: result.appliedBy || "Another researcher"
        };
      } else {
        console.log("🔍 [Client] No duplicate found.");
      }
    } catch (error) {
      console.error("❌ [Client] Error checking duplicate claim:", error);
    }
    return { isDuplicate: false };
  };

  const handleProceedToReview = async () => {
    const isValid = await form.trigger()
    if (isValid) {
      const title = form.getValues("conferencePaperTitle");
      setIsSubmitting(true);
      const dup = await checkDuplicateClaim(title);
      setIsSubmitting(false);

      if (dup && dup.isDuplicate) {
        form.setError("conferencePaperTitle", {
          type: "custom",
          message: `${dup.appliedBy} has already applied for the incentive claim for this paper title under Conference Incentive Claim Category.`
        });
        toast({
          variant: "destructive",
          title: "Duplicate Claim Error",
          description: `${dup.appliedBy} has already applied for the incentive claim for this paper title under Conference Incentive Claim Category.`,
        });
        return;
      }

      setStep("review")
    } else {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please correct the errors before proceeding.",
      })
    }
  }

  async function handleSave(status: "Draft" | "Pending") {
    if (status === "Pending" && (bankDetailsMissing || orcidOrMisIdMissing)) {
      toast({
        variant: "destructive",
        title: "Profile Incomplete",
        description: "Please add your bank details, ORCID iD, and MIS ID in Settings before submitting a claim.",
      })
      return
    }

    const title = form.getValues("conferencePaperTitle");
    setIsSubmitting(true);
    const dup = await checkDuplicateClaim(title);
    if (dup && dup.isDuplicate) {
      setIsSubmitting(false);
      form.setError("conferencePaperTitle", {
        type: "custom",
        message: `${dup.appliedBy} has already applied for the incentive claim for this paper title under Conference Incentive Claim Category.`
      });
      toast({
        variant: "destructive",
        title: "Duplicate Claim Error",
        description: `${dup.appliedBy} has already applied for the incentive claim for this paper title under Conference Incentive Claim Category.`,
      });
      return;
    }
    try {
      const data = form.getValues()
      const uploadFileHelper = async (file: File | undefined, folderName: string): Promise<string | undefined> => {
        if (!file || !user) return undefined
        const path = `incentive-proofs/${user.uid}/${folderName}/${new Date().toISOString()}-${file.name}`
        const result = await uploadFileToApi(file, { path })
        if (!result.success || !result.url) {
          throw new Error(result.error || `File upload failed for ${folderName}`)
        }
        return result.url
      }

      const { govtFundingRequestProof, abstractUpload, registrationFeeProof, participationCertificate, prizeProof, travelReceipts, conferenceProof, additionalDocuments, ...restOfData } =
        data

      const [
        govtFundingRequestProofUrl,
        abstractUrl,
        registrationFeeProofUrl,
        participationCertificateUrl,
        prizeProofUrl,
        travelReceiptsUrl,
        conferenceProofUrl,
      ] = await Promise.all([
        uploadFileHelper(govtFundingRequestProof?.[0], "conference-funding-proof"),
        uploadFileHelper(abstractUpload?.[0], "conference-abstract"),
        uploadFileHelper(registrationFeeProof?.[0], "conference-reg-proof"),
        uploadFileHelper(participationCertificate?.[0], "conference-cert"),
        uploadFileHelper(prizeProof?.[0], "conference-prize-proof"),
        uploadFileHelper(travelReceipts?.[0], "conference-travel-receipts"),
        uploadFileHelper(conferenceProof?.[0], "conference-proof"),
      ])

      const additionalDocumentsUrlsRaw = additionalDocuments && additionalDocuments.length > 0
        ? await Promise.all(Array.from(additionalDocuments as FileList).map(file => uploadFileHelper(file as File, "conference-additional-docs")))
        : []

      const additionalDocumentsUrls = additionalDocumentsUrlsRaw.filter(Boolean) as string[]

      const autoDuration = (() => {
        if (restOfData.conferenceDate && (restOfData as any).conferenceEndDate) {
          const start = new Date(restOfData.conferenceDate);
          const end = new Date((restOfData as any).conferenceEndDate);
          const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          return diff > 0 ? String(diff) : undefined;
        }
        return undefined;
      })();

      const claimData: Omit<IncentiveClaim, "id" | "claimId"> = {
        ...restOfData,
        govtFundingRequestProofUrl: govtFundingRequestProofUrl ?? undefined,
        abstractUrl: abstractUrl ?? undefined,
        registrationFeeProofUrl: registrationFeeProofUrl ?? undefined,
        participationCertificateUrl: participationCertificateUrl ?? undefined,
        prizeProofUrl: prizeProofUrl ?? undefined,
        travelReceiptsUrl: travelReceiptsUrl ?? undefined,
        conferenceProofUrl: conferenceProofUrl ?? undefined,
        additionalDocumentsUrls: additionalDocumentsUrls.length > 0 ? additionalDocumentsUrls : undefined,
        calculatedIncentive: calculatedIncentive ?? undefined,
        conferenceDuration: autoDuration ?? restOfData.conferenceDuration,
        misId: user.misId ?? undefined,
        orcidId: user.orcidId ?? undefined,
        bankDetails: user.bankDetails ?? undefined,
        claimType: "Conference Presentations",
        benefitMode: "reimbursement",
        uid: user.uid,
        userName: user.name,
        userEmail: user.email,
        faculty: user.faculty || "N/A",
        status,
        submissionDate: new Date().toISOString(),
        authorType: data.authorType,
        totalAuthors: data.totalAuthors,
      }

      const claimId = searchParams.get("claimId")
      const result = await submitIncentiveClaimViaApi(claimData, claimId || undefined)

      if (!result.success) throw new Error(result.error)

      toast({
        title: status === "Draft" ? "Draft Saved!" : "Success",
        description: status === "Draft" ? "You can continue editing later." : "Your incentive claim has been submitted.",
      })
      router.push("/dashboard/incentive-claim" + (status === "Pending" ? "?tab=my-claims" : ""))
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to submit claim. Please try again." })
    } finally {
      setIsSubmitting(false)
    }
  }

  const firstAuthorExists = fields.some((author) => author.role === "First Author" || author.role === "First & Corresponding Author")

  const getAvailableRoles = (currentAuthor?: Author) => {
    const isCurrentAuthorFirst =
      currentAuthor && (currentAuthor.role === "First Author" || currentAuthor.role === "First & Corresponding Author")
    if (firstAuthorExists && !isCurrentAuthorFirst) {
      return coAuthorRoles.filter((role) => role !== "First Author" && role !== "First & Corresponding Author")
    }
    return coAuthorRoles
  }

  const removeAuthor = (index: number) => {
    if (fields[index].email.toLowerCase() === user.email.toLowerCase()) {
      toast({ variant: "destructive", title: "Action blocked", description: "You cannot remove yourself from the list." })
      return
    }
    remove(index)
  }

  const updateAuthorRole = (index: number, role: Author["role"]) => {
    const authors = form.getValues("authors")
    const isTryingToBeFirst = role === "First Author" || role === "First & Corresponding Author"
    const isAnotherFirst = authors.some((a, i) => i !== index && (a.role === "First Author" || a.role === "First & Corresponding Author"))

    if (isTryingToBeFirst && isAnotherFirst) {
      toast({ title: "Conflict", description: "Another author is already the First Author.", variant: "destructive" })
      return
    }

    update(index, { ...authors[index], role })
  }

  const { conferenceMode, conferenceType, wonPrize, organizerName, conferenceName, conferenceVenue, conferenceDate, eventType: watchedEventType } = form.watch()
  const isPuConference = organizerName?.toLowerCase().includes("parul university") || conferenceName?.toLowerCase().includes("picet")
  const isFormDisabled = (!eligibility.eligible && isPuConference) || isSubmitting
  const isNonPaperEvent = watchedEventType === "Invited Talk/Guest Speaker"

  if (isLoadingDraft) return <div className="flex justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>

  if (step === "review") {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <ReviewDetails
          data={form.getValues()}
          onEdit={() => setStep("edit")}
          isSubmitting={isSubmitting}
          calculatedIncentive={calculatedIncentive}
          breakdown={calculationBreakdown}
          showLogic={showLogic}
          setShowLogic={setShowLogic}
        />
        <div className="flex justify-end max-w-4xl mx-auto gap-4">
          <Button variant="ghost" onClick={() => setStep("edit")} disabled={isSubmitting}>Modify Details</Button>
          <Button size="lg" onClick={() => handleSave("Pending")} disabled={isFormDisabled} className="px-10 font-bold shadow-lg shadow-primary/25">
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Confirm Submission
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Card className="max-w-4xl mx-auto shadow-2xl border-t-4 border-t-primary overflow-hidden">
      <CardHeader className="bg-primary/5 pb-8">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-3xl font-bold tracking-tight text-primary uppercase">Event Assistance</CardTitle>
          </div>
          <div className="bg-primary/10 p-3 rounded-2xl shadow-inner">
            <Calendar className="h-10 w-10 text-primary" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-8 bg-card">
        <Form {...form}>
          <form className="space-y-10">
            {(bankDetailsMissing || orcidOrMisIdMissing) && (
              <Alert variant="destructive" className="rounded-2xl border-2">
                <AlertCircle className="h-5 w-5" />
                <AlertTitle className="font-bold">Profile Update Required</AlertTitle>
                <AlertDescription className="flex items-center justify-between">
                  <span>Your Profile details (Bank, ORCID, MIS) must be complete to apply.</span>
                  <Button asChild variant="link" className="text-destructive font-black underline p-0 h-auto">
                    <Link href="/dashboard/settings">Settings</Link>
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {!eligibility.eligible && isPuConference && (
              <Alert className="bg-destructive/5 border-destructive text-destructive rounded-2xl">
                <AlertCircle className="h-5 w-5" />
                <AlertTitle className="font-bold">Wait Period Active</AlertTitle>
                <AlertDescription>
                  PU conference assistance allows one claim per academic year. Next eligibility starts: <strong>{eligibility.nextAvailableDate}</strong>.
                </AlertDescription>
              </Alert>
            )}

            <Alert className="bg-primary/5 border-primary/20 rounded-2xl ring-1 ring-primary/10">
              <Info className="h-5 w-5 text-primary" />
              <AlertTitle className="text-primary font-bold">Assistance Highlights</AlertTitle>
              <AlertDescription className="text-[11px] leading-relaxed space-y-1 mt-1">
                <p>• <strong>Offline</strong> travel assistance is eligible ONCE every TWO academic years.</p>
                <p>• <strong>PU Conferences</strong>: 75% reimbursement of registration fee (One claim/year).</p>
                <p>• <strong>International</strong>: Mandatory proof of Government travel grant application for offline travel.</p>
              </AlertDescription>
            </Alert>

            <section className="space-y-6">
              <div className="flex items-center gap-2 text-primary font-bold text-lg mb-4">
                <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                Event Specification
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <FormField name="eventType" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">Event Classification</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isFormDisabled}>
                      <FormControl><SelectTrigger className="h-12 shadow-sm"><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                      <SelectContent>{eventTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField name="conferenceMode" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">Presentation Mode</FormLabel>
                    <FormControl>
                      <RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-6 pt-2">
                        <Label htmlFor="mode-on" className="flex items-center space-x-3 bg-muted/40 px-5 py-2.5 rounded-xl border border-muted-foreground/10 hover:bg-muted transition-all cursor-pointer [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                          <RadioGroupItem value="Online" id="mode-on" disabled={isSubmitting} />
                          <span className="font-bold text-sm">Online</span>
                        </Label>
                        <Label htmlFor="mode-off" className="flex items-center space-x-3 bg-muted/40 px-5 py-2.5 rounded-xl border border-muted-foreground/10 hover:bg-muted transition-all cursor-pointer [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                          <RadioGroupItem value="Offline" id="mode-off" disabled={isFormDisabled} />
                          <span className="font-bold text-sm">Offline</span>
                        </Label>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {conferenceMode === "Online" && (
                <FormField name="onlinePresentationOrder" control={form.control} render={({ field }) => (
                  <FormItem className="animate-in slide-in-from-top-2 duration-300">
                    <FormLabel className="text-base font-semibold">Order of Presentation (Online)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isFormDisabled}>
                      <FormControl><SelectTrigger className="h-12 shadow-sm"><SelectValue placeholder="Select rank" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {["First", "Second", "Third", "Additional"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              {!isNonPaperEvent && (
                <FormField name="conferencePaperTitle" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">Title of the Research Paper</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Exact title as per certificate"
                        {...field}
                        onBlur={async (e) => {
                          field.onBlur();
                          const title = e.target.value;
                          if (title) {
                            const dup = await checkDuplicateClaim(title, "dummy-conf");
                            if (dup && dup.isDuplicate) {
                              form.setError("conferencePaperTitle", {
                                type: "custom",
                                message: `${dup.appliedBy} has already applied for the incentive claim for this paper title under Conference Incentive Claim Category.`
                              });
                              toast({
                                variant: "destructive",
                                title: "Duplicate Claim Detected",
                                description: `${dup.appliedBy} has already applied for the incentive claim for this paper title under Conference Incentive Claim Category.`
                              });
                            } else {
                              form.clearErrors("conferencePaperTitle");
                            }
                          }
                        }}
                        disabled={isFormDisabled}
                        className="h-12 text-lg shadow-sm"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <FormField name="conferenceName" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">Conference Full Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. IEEE World Congress..."
                        {...field}
                        disabled={isFormDisabled}
                        className="h-12 shadow-sm"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField name="eventWebsite" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel className="text-base font-semibold">Event Website URL</FormLabel><FormControl><Input placeholder="https://..." {...field} disabled={isFormDisabled} className="h-12 shadow-sm" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <FormField name="organizerName" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel className="text-base font-semibold">Organizing Body</FormLabel><FormControl><Input placeholder="e.g. Parul Institute of Engineering..." {...field} disabled={isFormDisabled} className="h-12 shadow-sm" /></FormControl><FormMessage /></FormItem>
                )} />
                {conferenceMode === "Offline" && (
                  <FormField name="presentationType" control={form.control} render={({ field }) => (
                    <FormItem className="animate-in slide-in-from-top-2 duration-300">
                      <FormLabel className="text-base font-semibold">Presentation Category</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={isFormDisabled}>
                        <FormControl><SelectTrigger className="h-12 shadow-sm"><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {["Oral", "Poster", "Other"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}
              </div>
            </section>

            <Separator className="my-10" />

            <section className="space-y-6">
              <div className="flex items-center gap-2 text-primary font-bold text-lg mb-4">
                <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                Venue & Timeline
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <FormField name="conferenceType" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">Global Scale</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isFormDisabled}>
                      <FormControl><SelectTrigger className="h-12 shadow-sm"><SelectValue placeholder="Select scope" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {Object.keys(conferenceVenueOptions).map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField name="conferenceVenue" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">Physical Location</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={!conferenceType || isFormDisabled}>
                      <FormControl><SelectTrigger className="h-12 shadow-sm"><SelectValue placeholder="Select region" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {(conferenceVenueOptions[conferenceType as keyof typeof conferenceVenueOptions] || []).map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <FormField name="conferenceDate" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel className="text-base font-semibold flex items-center gap-2"><Calendar className="h-4 w-4" /> Start Date</FormLabel><FormControl><Input type="date" {...field} max={new Date().toISOString().split("T")[0]} disabled={isFormDisabled} className="h-12 shadow-sm cursor-pointer" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="conferenceEndDate" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel className="text-base font-semibold flex items-center gap-2"><Calendar className="h-4 w-4" /> End Date</FormLabel><FormControl><Input type="date" {...field} min={conferenceDate || undefined} max={new Date().toISOString().split("T")[0]} disabled={isFormDisabled} className="h-12 shadow-sm cursor-pointer" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="presentationDate" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel className="text-base font-semibold flex items-center gap-2"><Calendar className="h-4 w-4" /> Presentation Date</FormLabel><FormControl><Input type="date" {...field} min={conferenceDate || undefined} max={new Date().toISOString().split("T")[0]} disabled={isFormDisabled} className="h-12 shadow-sm cursor-pointer" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                <FormField name="abstractUpload" control={form.control} render={({ field: { value, onChange, ...rest } }) => (
                  <FormItem className="space-y-3"><FormLabel className="font-bold flex items-center gap-2 underline decoration-primary decoration-2"><FileText className="h-4 w-4" /> Full Abstract</FormLabel><FormControl><Input type="file" accept=".pdf" className="h-12 border-dashed border-2 bg-muted/20" onChange={e => onChange(e.target.files)} disabled={isFormDisabled} {...rest} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="participationCertificate" control={form.control} render={({ field: { value, onChange, ...rest } }) => (
                  <FormItem className="space-y-3"><FormLabel className="font-bold flex items-center gap-2 underline decoration-primary decoration-2"><Award className="h-4 w-4" /> Participation Certificate</FormLabel><FormControl><Input type="file" accept=".pdf" className="h-12 border-dashed border-2 bg-muted/20" onChange={e => onChange(e.target.files)} disabled={isFormDisabled} {...rest} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                <FormField name="conferenceProof" control={form.control} render={({ field: { value, onChange, ...rest } }) => (
                  <FormItem className="space-y-3"><FormLabel className="font-bold flex items-center gap-2 text-muted-foreground underline decoration-muted-foreground/30"><Globe className="h-4 w-4" /> Conference Proof (Brochure/Invitation)</FormLabel><FormControl><Input type="file" accept=".pdf" className="h-12 border-dashed border-2 bg-muted/5" onChange={e => onChange(e.target.files)} disabled={isFormDisabled} {...rest} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="additionalDocuments" control={form.control} render={({ field: { value, onChange, ...rest } }) => (
                  <FormItem className="space-y-3"><FormLabel className="font-bold flex items-center gap-2 text-muted-foreground"><FileText className="h-4 w-4" /> Additional Supportive Documents (Optional)</FormLabel><FormControl><Input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.zip" className="h-12 border-dashed border-2 bg-muted/5 hover:bg-muted/10 transition-colors" onChange={e => onChange(e.target.files)} disabled={isFormDisabled} {...rest} /></FormControl><FormDescription className="text-xs">Upload any other relevant files, letters, or bills here.</FormDescription><FormMessage /></FormItem>
                )} />
              </div>
            </section>

            <Separator className="my-10" />

            <section className="space-y-6">
              <div className="flex items-center gap-2 text-primary font-bold text-lg mb-4">
                <div className="h-8 w-1.5 bg-primary rounded-full"></div> Authorship & Disclosure
              </div>

              <Alert className="bg-destructive/5 border-destructive/20 py-4 rounded-2xl ring-1 ring-destructive/10">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <AlertTitle className="text-destructive font-black uppercase text-xs tracking-widest">Mandatory Authors Disclosure</AlertTitle>
                <AlertDescription className="mt-2 text-sm font-medium">
                  All authors must be listed. Missing authors discovered during verification will result in <span className="underline font-bold text-destructive">rejection</span>.
                </AlertDescription>
              </Alert>

              <div className="bg-muted/20 p-6 rounded-2xl border border-dashed border-primary/30 space-y-4">
                <div className="space-y-2">
                  {fields.map((f, i) => (
                    <div key={f.id} className="group flex items-center justify-between bg-background p-4 rounded-xl border shadow-sm animate-in slide-in-from-right-2 transition-all hover:border-primary/30">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{f.name}</span>
                          {f.isExternal && <Badge variant="outline" className="text-[9px] h-4">External</Badge>}
                          {f.email.toLowerCase() === user.email.toLowerCase() && <Badge variant="secondary" className="text-[9px] h-4 bg-primary/10 text-primary border-none">You</Badge>}
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium italic">{f.email}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Select value={f.role} onValueChange={(r) => updateAuthorRole(i, r as Author["role"])}>
                          <SelectTrigger className="h-9 w-[180px] bg-background shadow-sm rounded-lg text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{coAuthorRoles.map(r => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}</SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" onClick={() => removeAuthor(i)} className="h-9 w-9 text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
                <AuthorSearch authors={fields} onAdd={append} availableRoles={coAuthorRoles} currentUserEmail={user.email} />
                {form.formState.errors.authors && (
                  <p className="text-xs font-medium text-destructive mt-2">{form.formState.errors.authors.message}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                <FormField
                  control={form.control}
                  name="authorType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold">Your Author Category</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-10 shadow-sm rounded-lg">
                            <SelectValue placeholder="Select Category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="rounded-xl">
                          {authorTypeOptions.map((type) => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="totalAuthors"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold">Total Author Count</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-10 shadow-sm rounded-lg">
                            <SelectValue placeholder="Count" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="rounded-xl">
                          {authorCountOptions.map((count) => (
                            <SelectItem key={count} value={count}>{count}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                <FormField
                  control={form.control}
                  name="authorPosition"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold">Your Author Position</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-10 shadow-sm rounded-lg">
                            <SelectValue placeholder="Position" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="rounded-xl">
                          {['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'].map((pos) => (
                            <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  name="wasPresentingAuthor"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-xl border border-primary/10 bg-primary/5 p-4 shadow-sm hover:bg-primary/10 transition-all">
                      <div className="space-y-0.5">
                        <FormLabel className="text-sm font-bold">Presenting Author Role</FormLabel>
                        <FormDescription className="text-[10px]">Did you present at the event?</FormDescription>
                      </div>
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isFormDisabled} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  name="isPuNamePresent"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-xl border border-primary/10 bg-primary/5 p-4 shadow-sm hover:bg-primary/10 transition-all">
                      <div className="space-y-0.5">
                        <FormLabel className="text-sm font-bold">PU Affiliation Present?</FormLabel>
                        <FormDescription className="text-[10px]">Is "Parul University Goa" mentioned?</FormDescription>
                      </div>
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isFormDisabled} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            <Separator className="my-10" />

            <section className="space-y-8">
              <div className="flex items-center gap-2 text-primary font-bold text-lg mb-4">
                <div className="h-8 w-1.5 bg-primary rounded-full"></div> Financial Data & Claims
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <FormField name="registrationFee" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">Registration Fee (INR)</FormLabel>
                    <FormControl><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">₹</span><Input type="number" {...field} min="0" disabled={isFormDisabled} className="h-12 pl-8 text-lg font-black shadow-sm" /></div></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField name="registrationFeeProof" control={form.control} render={({ field: { value, onChange, ...rest } }) => (
                  <FormItem className="pt-2">
                    <FormLabel className="font-bold flex items-center gap-2 text-xs"><FileText className="h-3 w-3" /> Proof of Payment</FormLabel>
                    <FormControl><Input type="file" accept=".pdf" className="h-9 text-xs" onChange={e => onChange(e.target.files)} disabled={isFormDisabled} {...rest} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {conferenceMode === "Offline" && (
                <div className="p-6 bg-muted/40 rounded-3xl space-y-6 border border-muted-foreground/10 animate-in slide-in-from-left-2">
                  <p className="text-xs font-black uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                    <MapPin className="h-4 w-4" /> Travel Logistics
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <FormField name="travelPlaceVisited" control={form.control} render={({ field }) => (
                      <FormItem><FormLabel className="text-xs font-bold uppercase tracking-tight">Destination</FormLabel><FormControl><Input placeholder="City, Country" {...field} disabled={isFormDisabled} className="h-10 bg-background" /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField name="travelMode" control={form.control} render={({ field }) => (
                      <FormItem><FormLabel className="text-xs font-bold uppercase tracking-tight">Transport Mode</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={isFormDisabled}><FormControl><SelectTrigger className="h-10 bg-background"><SelectValue placeholder="Select" /></SelectTrigger></FormControl><SelectContent>{["Bus", "Train", "Air", "Other"].map(mode => <SelectItem key={mode} value={mode}>{mode}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <FormField name="travelFare" control={form.control} render={({ field }) => (
                      <FormItem><FormLabel className="text-xs font-bold uppercase tracking-tight">Fare Incurred (INR)</FormLabel><FormControl><Input type="number" {...field} disabled={isFormDisabled} className="h-10 bg-background" /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField name="travelReceipts" control={form.control} render={({ field: { value, onChange, ...rest } }) => (
                      <FormItem><FormLabel className="text-xs font-bold uppercase tracking-tight">Tickets / Receipts</FormLabel><FormControl><Input type="file" accept=".pdf" onChange={e => onChange(e.target.files)} disabled={isFormDisabled} className="h-10 bg-background" {...rest} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                </div>
              )}

              {conferenceVenue && conferenceVenue !== "India" && (
                <FormField name="govtFundingRequestProof" control={form.control} render={({ field: { value, onChange, ...rest } }) => (
                  <FormItem className="bg-amber-50 dark:bg-amber-950/20 p-6 rounded-3xl border border-amber-200 dark:border-amber-900 shadow-inner">
                    <FormLabel className="text-sm font-black text-amber-900 dark:text-amber-400">Government Travel Grant Inquiry (Mandatory for International)</FormLabel>
                    <p className="text-[10px] text-amber-800 dark:text-amber-500 mb-4 italic">You must provide proof of application for external funding (e.g. DST, SERB, ICMR) for international journeys.</p>
                    <FormControl><Input type="file" accept=".pdf" className="bg-background border-amber-300 dark:border-amber-800 h-12" onChange={e => onChange(e.target.files)} disabled={isFormDisabled} {...rest} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              {calculatedIncentive !== null && (
                <Alert className="bg-primary/5 border-primary/20 py-6 rounded-3xl transition-all animate-in zoom-in-95 border-l-4 border-l-primary shadow-sm hover:shadow-md">
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> Estimated Incentive Amount
                    </p>
                    <h4 className="text-4xl font-black text-foreground tracking-tight py-1">₹{calculatedIncentive.toLocaleString('en-IN')}</h4>
                    <p className="text-[10px] text-muted-foreground font-medium italic">Tentative individual share*</p>

                    <div className="mt-4 border-t border-primary/10 pt-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs font-bold w-full flex justify-between items-center text-primary hover:bg-primary/10"
                        onClick={() => setShowLogic(!showLogic)}
                        type="button"
                      >
                        View Calculation Logic
                        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showLogic ? 'rotate-180' : ''}`} />
                      </Button>

                      {showLogic && calculationBreakdown && (
                        <div className="mt-3 p-4 bg-background rounded-xl border shadow-inner space-y-2 text-xs font-medium animate-in slide-in-from-top-2 flex flex-col gap-1">
                          <div className="flex justify-between items-start py-1 border-b border-muted">
                            <span className="text-muted-foreground pr-2">1. Incurred Expenses (Reg. Fee + Travel)</span>
                            <span className="font-semibold shrink-0">₹{calculationBreakdown.eligibleExpenses?.toLocaleString('en-IN') || 0}</span>
                          </div>
                          <div className="flex justify-between items-start py-1 border-b border-muted">
                            <span className="text-muted-foreground pr-2">2. Maximum Policy Limit</span>
                            <span className="font-semibold shrink-0">₹{calculationBreakdown.maxReimbursement?.toLocaleString('en-IN') || 0}</span>
                          </div>
                          <div className="flex justify-between items-start py-1 border-b border-muted">
                            <span className="text-muted-foreground pr-2">3. Final Admissible Amount</span>
                            <span className="font-bold text-green-600 shrink-0">₹{calculatedIncentive.toLocaleString('en-IN')}</span>
                          </div>

                          <div className="text-[9px] text-muted-foreground italic mt-2 !pt-2 text-center border-t border-muted opacity-70">
                            *Logic matches official policy matrix evaluated by approvers during technical audit. Reimbursement is min(expenses, limit).
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </Alert>
              )}
            </section>

            <Separator className="my-10" />

            <section className="space-y-6">
              <div className="flex items-center gap-2 text-primary font-bold text-lg mb-4">
                <div className="h-8 w-1.5 bg-primary rounded-full"></div> Achievements & Declarations
              </div>

              <div className="bg-muted/30 p-8 rounded-[2rem] border space-y-6">
                <FormField name="wonPrize" control={form.control} render={({ field }) => (
                  <div className="space-y-4">
                    <FormItem className="flex items-center justify-between p-2"><FormLabel className="font-black text-amber-600 dark:text-amber-500 uppercase tracking-tight flex items-center gap-2">Won a prize / Best paper award? <Award className="h-5 w-5" /></FormLabel><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isFormDisabled} className="scale-125 border-amber-500 data-[state=checked]:bg-amber-500" /></FormControl></FormItem>
                    {field.value && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 animate-in slide-in-from-top-4">
                        <FormField name="prizeDetails" control={form.control} render={({ field }) => (
                          <FormItem><FormLabel className="text-xs font-black uppercase text-amber-700">Prize Description</FormLabel><FormControl><Input placeholder="e.g. Best Researcher Award (PICET 2026)" {...field} disabled={isFormDisabled} className="bg-background border-amber-200" /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField name="prizeProof" control={form.control} render={({ field: { value, onChange, ...rest } }) => (
                          <FormItem><FormLabel className="text-xs font-black uppercase text-amber-700">Upload Award Copy</FormLabel><FormControl><Input type="file" accept=".pdf" onChange={e => onChange(e.target.files)} disabled={isFormDisabled} className="bg-background border-amber-200" {...rest} /></FormControl><FormMessage /></FormItem>
                        )} />
                      </div>
                    )}
                  </div>
                )} />
              </div>
            </section>

            <Separator className="my-10" />

            <FormField control={form.control} name="conferenceSelfDeclaration" render={({ field }) => (
              <FormItem className="flex flex-row items-center space-x-4 space-y-0 bg-primary/5 p-8 rounded-[2rem] border border-primary/20 shadow-sm ring-1 ring-inset ring-primary/5">
                <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isFormDisabled} className="h-6 w-6 rounded-lg" /></FormControl>
                <div className="space-y-2 leading-none">
                  <FormLabel className="text-base font-black tracking-tight">Final Declaration of Integrity</FormLabel>
                  <FormMessage />
                  <p className="text-xs text-muted-foreground italic leading-relaxed">
                    I hereby certify that I have only availed of the conference incentive assistance policy as per the specified frequency limits. I further confirm that I am eligible for this claim under university regulations.
                  </p>
                </div>
              </FormItem>
            )} />
          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex justify-between p-8 bg-muted/20 border-t border-muted/30 gap-4">
        <Button variant="ghost" size="lg" onClick={() => handleSave("Draft")} disabled={isSubmitting} className="rounded-2xl px-8 h-12 font-bold hover:bg-primary/5 text-primary">Save as Draft</Button>
        <div className="flex gap-4">
          <Button variant="outline" size="lg" onClick={() => router.back()} disabled={isSubmitting} className="rounded-2xl px-6 h-12">Cancel</Button>
          <Button size="lg" onClick={handleProceedToReview} disabled={isFormDisabled} className="rounded-2xl px-12 h-12 font-black shadow-xl shadow-primary/30 hover:shadow-primary/50 transition-all hover:scale-[1.02]">
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
            Review Application
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
