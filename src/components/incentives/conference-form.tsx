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
import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
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
import { extractConferenceIQACParams } from "@/lib/iqac-autofill"
import { verifyIqacSignatureAction } from "@/app/actions"
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

const workshopEventTypes = ["STTP", "Workshop", "Training Program", "FDP", "Invited Talk/Guest Speaker", "Other"]

const conferenceSchema = z
  .object({
    eventType: z.string({ required_error: "Please choose an event classification from the dropdown list." }),
    conferencePaperTitle: z.string().optional(),
    conferenceName: z.string().min(3, "Please enter the full, official name of the conference (at least 3 characters long)."),
    conferenceMode: z.enum(["Online", "Offline"], { required_error: "Please select whether you attended the conference 'Online' or 'Offline'." }),
    onlinePresentationOrder: z.enum(["First", "Second", "Third", "Additional"]).optional(),
    conferenceType: z.enum(["International", "National", "Regional/State"], { required_error: "Please specify whether the conference is 'National', 'International', or 'Regional/State'." }),
    conferenceVenue: z.enum(
      ["India", "Indian Subcontinent", "South Korea, Japan and Middle East", "Europe and Australia", "African/South American/North American", "Other"],
      { required_error: "Please select the location or region where the conference was hosted." }
    ),
    presentationType: z.enum(["Oral", "Poster", "Other"]).optional(),
    govtFundingRequestProof: z
      .any()
      .optional()
      .refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, "The uploaded government funding request proof file exceeds the 10 MB limit."),
    registrationFee: z.coerce.number().nonnegative("The registration fee amount cannot be less than zero.").optional(),
    travelFare: z.coerce.number().nonnegative("The travel fare amount cannot be less than zero.").optional(),
    wasPresentingAuthor: z.boolean().optional(),
    isPuNamePresent: z.boolean().optional(),
    abstractUpload: z
      .any()
      .refine((files) => files?.length > 0, "Please upload a PDF of the accepted abstract for your presentation.")
      .refine((files) => !files?.[0] || files?.[0]?.type === "application/pdf", "The uploaded abstract must be a PDF file.")
      .refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, "The uploaded abstract file size exceeds the 10 MB limit."),
    organizerName: z.string().min(2, "Please enter the name of the institution or organization hosting this event (at least 2 characters long)."),
    eventWebsite: z.string().url("Please enter a valid event website address starting with http:// or https://.").optional().or(z.literal("")),
    conferenceDate: z.string().min(1, "Please select the official start date of the conference."),
    conferenceEndDate: z.string().min(1, "Please select the official end date of the conference."),
    presentationDate: z.string().min(1, "Please select the date on which you made your presentation."),
    registrationFeeProof: z
      .any()
      .optional()
      .refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, "The uploaded registration fee proof file exceeds the 10 MB limit."),
    participationCertificate: z
      .any()
      .refine((files) => files?.length > 0, "Please upload your official Certificate of Presentation/Participation (as a PDF file).")
      .refine((files) => !files?.[0] || files?.[0]?.type === "application/pdf", "The uploaded presentation certificate must be a PDF file.")
      .refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, "The uploaded certificate file size exceeds the 10 MB limit."),
    wonPrize: z.boolean().optional(),
    prizeDetails: z.string().optional(),
    prizeProof: z
      .any()
      .optional()
      .refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, "The uploaded prize proof file exceeds the 10 MB limit."),
    conferenceProof: z
      .any()
      .optional()
      .refine((files) => !files || Array.from(files as FileList).every((file) => file.size <= MAX_FILE_SIZE), "The uploaded conference proof file exceeds the 10 MB limit."),
    presencePhotographs: z
      .any()
      .optional()
      .refine(
        (files) =>
          !files ||
          Array.from(files as FileList).every(
            (file) =>
              ["image/png", "image/jpeg", "image/jpg"].includes(file.type) ||
              /\.(png|jpe?g)$/i.test(file.name)
          ),
        "Only PNG, JPG, and JPEG files are allowed."
      )
      .refine((files) => !files || Array.from(files as FileList).every((file) => file.size <= MAX_FILE_SIZE), "The uploaded photographs exceed the 10 MB limit."),
    additionalDocuments: z
      .any()
      .optional()
      .refine((files) => !files || Array.from(files as FileList).every((file) => file.size <= MAX_FILE_SIZE), "The uploaded additional document size exceeds the 10 MB limit."),
    attendedOtherConference: z.boolean().optional(),
    travelPlaceVisited: z.string().optional(),
    travelMode: z.enum(["Bus", "Train", "Air", "Other"]).optional(),
    travelReceipts: z
      .any()
      .optional()
      .refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, "The uploaded travel receipts file exceeds the 10 MB limit."),
    accommodationExpense: z.coerce.number().nonnegative("The accommodation expense amount cannot be less than zero.").optional(),
    accommodationProof: z
      .any()
      .optional()
      .refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, "The uploaded accommodation bill file exceeds the 10 MB limit."),
    conferenceSelfDeclaration: z.boolean().refine((val) => val === true, { message: "You must check the self-declaration box to confirm you have not received reimbursement for this conference from other sources." }),
    authors: z
      .array(
        z
          .object({
            name: z.string().min(2, "Author name must be a complete name (at least 2 characters long)."),
            email: z.string().email("Please enter a valid email address (e.g. name@domain.com) for this author.").or(z.literal("")),
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
            message: "Internal authors must have a valid email address to verify their university affiliation.",
            path: ["email"],
          })
      )
      .min(1, "You must list at least one author (the primary claimant).")
      .refine(
        (data) => {
          const firstAuthors = data.filter((author) => author.role === "First Author" || author.role === "First & Corresponding Author")
          return firstAuthors.length <= 1
        },
        { message: "A publication can only have one primary 'First Author' or 'First & Corresponding Author'. Please adjust roles accordingly.", path: ["authors"] }
      ),
    authorType: z.string().optional(),
    totalAuthors: z.string().optional(),
    authorPosition: z.enum(['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th']).optional(),
  })
  .refine(
    (data) => {
      if (data.eventType === "Conference" && data.conferenceMode === "Online") {
        return true
      }
      return !(data.conferenceVenue && data.conferenceVenue !== "India") || (!!data.govtFundingRequestProof && data.govtFundingRequestProof.length > 0)
    },
    { message: "Since this conference was outside India, please upload the proof of your application for government travel funding.", path: ["govtFundingRequestProof"] }
  )
  .refine(
    (data) => {
      if (data.eventType === "Conference" && data.conferenceMode === "Offline") {
        const hasUrl = !!(data as any).presencePhotographsUrls && (data as any).presencePhotographsUrls.length > 0;
        const hasNewUpload = !!data.presencePhotographs && data.presencePhotographs.length > 0;
        return hasUrl || hasNewUpload;
      }
      return true;
    },
    { message: "Please upload photographs justifying your presence at the conference.", path: ["presencePhotographs"] }
  )
  .refine((data) => !data.wonPrize || (!!data.prizeDetails && data.prizeDetails.length > 2), {
    message: "You indicated that you won a prize. Please specify the prize details.",
    path: ["prizeDetails"],
  })
  .refine((data) => !data.wonPrize || (!!data.prizeProof && data.prizeProof.length > 0), {
    message: "Please upload the proof of your award or prize.",
    path: ["prizeProof"],
  })
  .refine((data) => data.conferenceMode === "Online" || !!data.presentationType, {
    message: "Please specify the presentation type (Oral, Poster, etc.) since you attended offline.",
    path: ["presentationType"],
  })
  .refine((data) => !data.conferenceDate || !data.presentationDate || new Date(data.presentationDate) >= new Date(data.conferenceDate), {
    message: "Your presentation date must be on or after the conference start date.",
    path: ["presentationDate"],
  })
  .refine((data) => !data.conferenceDate || !data.conferenceEndDate || new Date(data.conferenceEndDate) >= new Date(data.conferenceDate), {
    message: "The conference end date cannot be earlier than its start date.",
    path: ["conferenceEndDate"],
  })
  .refine(
    (data) => {
      const today = new Date().toISOString().split("T")[0];
      return !data.conferenceDate || data.conferenceDate <= today;
    },
    { message: "The conference start date cannot be in the future.", path: ["conferenceDate"] }
  )
  .refine(
    (data) => {
      const today = new Date().toISOString().split("T")[0];
      return !data.presentationDate || data.presentationDate <= today;
    },
    { message: "Your presentation date cannot be in the future.", path: ["presentationDate"] }
  )
  .refine(
    (data) => {
      if (data.conferenceMode === "Offline" && data.conferenceVenue !== "India") {
        return data.accommodationExpense !== undefined && data.accommodationExpense > 0;
      }
      return true;
    },
    { message: "Please specify the accommodation expense amount since the conference is offline and outside India.", path: ["accommodationExpense"] }
  )
  .refine(
    (data) => {
      if (data.conferenceMode === "Offline" && data.conferenceVenue !== "India") {
        const hasUrl = !!(data as any).accommodationProofUrl;
        const hasNewUpload = !!data.accommodationProof && data.accommodationProof.length > 0;
        return hasUrl || hasNewUpload;
      }
      return true;
    },
    { message: "Please upload your accommodation invoice/proof.", path: ["accommodationProof"] }
  );

type ConferenceFormValues = z.infer<typeof conferenceSchema>

const eventTypes = ["Conference", "Seminar", "Symposium", ...workshopEventTypes]

const conferenceVenueOptions = {
  International: ["India", "Indian Subcontinent", "South Korea, Japan and Middle East", "Europe and Australia", "African/South American/North American", "Other"],
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
                  {data.conferenceMode === "Offline" && data.conferenceVenue !== "India" && (
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">Accommodation Expense:</span>
                      <span className="font-bold font-mono">₹{data.accommodationExpense?.toLocaleString("en-IN") || 0}</span>
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

            {(data.conferenceProof || (data as any).conferenceProofUrl || data.presencePhotographs || (data as any).presencePhotographsUrls || data.accommodationProof || (data as any).accommodationProofUrl || (data.additionalDocuments && data.additionalDocuments.length > 0)) && (
              <div>
                <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Supportive Documents</p>
                <div className="flex flex-col gap-1.5">
                  {(data.conferenceProof?.[0] || (data as any).conferenceProofUrl) && (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-primary/5 shadow-sm transition-all text-xs font-medium border-primary/20">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate">Conference Proof: {data.conferenceProof?.[0]?.name || "Brochure/Invitation uploaded"}</span>
                    </div>
                  )}
                  {(data.accommodationProof?.[0] || (data as any).accommodationProofUrl) && (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-primary/5 shadow-sm transition-all text-xs font-medium border-primary/20">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate">Accommodation Bill: {data.accommodationProof?.[0]?.name || "Accommodation Invoice uploaded"}</span>
                    </div>
                  )}
                  {data.presencePhotographs && Array.from(data.presencePhotographs as FileList).map((file: File, idx: number) => (
                    <div key={`photo-file-${idx}`} className="flex items-center gap-2 p-2.5 rounded-lg border bg-primary/5 shadow-sm transition-all text-xs font-medium border-primary/20">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate">Presence Photograph {idx + 1}: {file.name}</span>
                    </div>
                  ))}
                  {!data.presencePhotographs && (data as any).presencePhotographsUrls && (data as any).presencePhotographsUrls.map((url: string, idx: number) => (
                    <div key={`photo-url-${idx}`} className="flex items-center gap-2 p-2.5 rounded-lg border bg-primary/5 shadow-sm transition-all text-xs font-medium border-primary/20">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate">Presence Photograph {idx + 1}: Photograph uploaded</span>
                    </div>
                  ))}
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
  const [eligibility, setEligibility] = useState<{ eligible: boolean; nextAvailableDate?: string; reason?: string }>({ eligible: true })
  const [isLoadingDraft, setIsLoadingDraft] = useState(true)
  const [step, setStep] = useState<"edit" | "review">("edit")
  const [calculatedIncentive, setCalculatedIncentive] = useState<number | null>(null)
  const [calculationBreakdown, setCalculationBreakdown] = useState<{ eligibleExpenses?: number; maxReimbursement?: number } | null>(null)
  const [showLogic, setShowLogic] = useState(false)
  const [rejectionComments, setRejectionComments] = useState<string | null>(null)
  const hasVerifiedIqac = useRef(false)
  const [isVerifyingIqac, setIsVerifyingIqac] = useState(false)
  const [iqacVerificationError, setIqacVerificationError] = useState<string | null>(null)
  const [isPrefilledFromIQAC, setIsPrefilledFromIQAC] = useState(false)

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
      presencePhotographs: undefined,
      additionalDocuments: undefined,
      attendedOtherConference: false,
      travelPlaceVisited: "",
      travelMode: undefined,
      travelReceipts: undefined,
      accommodationExpense: 0,
      accommodationProof: undefined,
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

  const formValues = form.watch();

  const clearLocalBackup = useCallback(() => {
    if (user) {
      localStorage.removeItem(`local_draft_conference_form_${user.uid}`);
    }
  }, [user]);

  // Auto-save form values to localStorage
  useEffect(() => {
    if (!user || isLoadingDraft) return;
    const key = `local_draft_conference_form_${user.uid}`;

    const valuesToSave = {
      ...formValues,
      govtFundingRequestProof: undefined,
      abstractUpload: undefined,
      registrationFeeProof: undefined,
      participationCertificate: undefined,
      prizeProof: undefined,
      conferenceProof: undefined,
      presencePhotographs: undefined,
      additionalDocuments: undefined,
      travelReceipts: undefined,
      accommodationProof: undefined,
    };

    localStorage.setItem(key, JSON.stringify(valuesToSave));
  }, [formValues, user, isLoadingDraft]);

  // Prompt to restore local backup on load
  useEffect(() => {
    if (!user || isLoadingDraft) return;
    const key = `local_draft_conference_form_${user.uid}`;
    const backupStr = localStorage.getItem(key);
    if (backupStr) {
      try {
        const backup = JSON.parse(backupStr);
        if (backup.conferenceName && backup.conferenceName.length > 3 && backup.conferenceName !== form.getValues('conferenceName')) {
          toast({
            title: "Unsaved Changes Found",
            description: "We found unsaved changes from your previous session. Do you want to restore them?",
            duration: 15000,
            action: (
              <Button
                variant="default"
                size="sm"
                className="bg-primary text-primary-foreground font-bold hover:bg-primary/95"
                onClick={() => {
                  form.reset(backup);
                  toast({ title: "Restored", description: "Your details have been successfully recovered." });
                }}
              >
                Restore
              </Button>
            ),
          });
        }
      } catch (e) {
        console.error("Failed to parse local backup:", e);
      }
    }
  }, [user, isLoadingDraft, form, toast]);

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

      if (value.conferenceMode === "Offline" && value.conferenceVenue && value.conferenceVenue !== "India") {
        if (value.travelMode !== "Air" && value.travelMode !== "Other") {
          form.setValue("travelMode", "Air", { shouldValidate: true })
        }
      }

      const fieldsForRecalculation = [
        "registrationFee",
        "travelFare",
        "accommodationExpense",
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
    if (user) {
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

      // Removed old PU eligibility check to use dynamic re-evaluation
    }
    const claimId = searchParams.get("claimId")
    if (!claimId) {
      setIsLoadingDraft(false)
    }
  }, [append, form, searchParams, user])

  const watchedVenue = form.watch("conferenceVenue");
  const watchedMode = form.watch("conferenceMode");
  const watchedType = form.watch("conferenceType");
  const watchedOrg = form.watch("organizerName");
  const watchedConfName = form.watch("conferenceName");

  useEffect(() => {
    if (!user) return;
    
    const checkEligibility = async () => {
      const claimsRef = collection(db, "incentiveClaims");
      const q = query(
        claimsRef,
        where("uid", "==", user.uid),
        where("claimType", "==", "Conference Presentations"),
        where("status", "in", ["Accepted", "Submitted to Accounts", "Payment Completed"]),
        orderBy("submissionDate", "desc")
      );
      const snapshot = await getDocs(q);
      
      let offlineCountLastYear = 0;
      let onlineCountLastYear = 0;
      let intlCountLast2Years = 0;
      let puCountLastYear = 0;
      
      const now = new Date();
      const oneYearAgo = addYears(now, -1);
      const twoYearsAgo = addYears(now, -2);
      
      const claimId = searchParams.get("claimId");
      
      snapshot.docs.forEach((docItem) => {
        const claim = docItem.data() as IncentiveClaim;
        if (claimId && docItem.id === claimId) return;
        
        const subDate = claim.submissionDate ? parseISO(claim.submissionDate) : null;
        if (!subDate) return;
        
        const mode = (claim.conferenceMode || "").toLowerCase().trim();
        const isPu = claim.organizerName?.toLowerCase().includes("parul university") || claim.conferenceName?.toLowerCase().includes("picet");
        
        if (isPu && subDate > oneYearAgo) {
          puCountLastYear++;
        }
        if (mode === "online" && subDate > oneYearAgo) {
          onlineCountLastYear++;
        }
        if (mode === "offline" && subDate > oneYearAgo) {
          offlineCountLastYear++;
        }
        const isIntlOutsideIndia = mode === "offline" && claim.conferenceType === "International" && claim.conferenceVenue !== "India";
        if (isIntlOutsideIndia && subDate > twoYearsAgo) {
          intlCountLast2Years++;
        }
      });
      
      form.setValue("previousOfflinePresentationsCount" as any, offlineCountLastYear);
      form.setValue("previousOnlinePresentationsCount" as any, onlineCountLastYear);
      
      let isEligible = true;
      let reason = "";
      
      const isCurrentPu = watchedOrg?.toLowerCase().includes("parul university") || watchedConfName?.toLowerCase().includes("picet");
      
      if (isCurrentPu && puCountLastYear >= 1) {
        isEligible = false;
        reason = "PU conference assistance is limited to one claim per year.";
      } else if (watchedMode === "Online" && onlineCountLastYear >= 1) {
        isEligible = false;
        reason = "Online paper presentations are limited to one claim per year.";
      } else if (watchedMode === "Offline" && watchedType === "International" && watchedVenue !== "India" && intlCountLast2Years >= 1) {
        isEligible = false;
        reason = "Financial travel support for international conferences outside India is limited to once in two years.";
      } else if (watchedMode === "Offline" && offlineCountLastYear >= 2) {
        isEligible = false;
        reason = "Physical/offline conference presentations are limited to two claims per year.";
      }
      
      setEligibility({
        eligible: isEligible,
        reason: reason,
        nextAvailableDate: undefined
      });
    };
    
    checkEligibility();
  }, [user, watchedVenue, watchedMode, watchedType, watchedOrg, watchedConfName, searchParams, form]);

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
              presencePhotographs: undefined,
              additionalDocuments: undefined,
              travelReceipts: undefined,
              accommodationProof: undefined,
            })
            // Check if there are rejection comments in approvals
            const lastApproval = draftData.approvals?.filter((a: any) => a != null).reverse().find((a: any) => a.status === 'Not Approved');
            if (lastApproval?.comments) {
              setRejectionComments(lastApproval.comments);
            }
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

  // Extract and pre-fill form fields if data is passed from IQAC Portal
  useEffect(() => {
    if (!user || isLoadingDraft) return;
    if (hasVerifiedIqac.current) return;

    const claimId = searchParams.get('claimId');
    if (claimId) return; // Do not overwrite when opening an existing draft

    const iqacData = extractConferenceIQACParams(searchParams);
    if (!iqacData) return; // No prefill parameters are present, no verification needed

    hasVerifiedIqac.current = true;

    const sig = searchParams.get('sig');
    const ts = searchParams.get('ts');

    const verifyIqac = async () => {
      setIqacVerificationError(null);

      // MIS ID comparison check
      const urlMisId = searchParams.get('misCode') || searchParams.get('misId');
      const userMisId = user.misId;

      if (!urlMisId) {
        setIqacVerificationError("Security verification failed: Missing MIS ID (misCode) in the redirect URL.");
        return;
      }

      if (urlMisId !== userMisId) {
        setIqacVerificationError(`Security verification failed: MIS ID mismatch. This link was generated for MIS ID ${urlMisId}, but your current session is logged in as MIS ID ${userMisId || 'None'}.`);
        return;
      }

      // 1. Reject if sig or ts is missing
      if (!sig || !ts) {
        setIqacVerificationError("Security verification failed: Missing signature (sig) or timestamp (ts).");
        return;
      }

      setIsVerifyingIqac(true);
      // Build a record of query params
      const paramsRecord: Record<string, string> = {};
      searchParams.forEach((val, key) => {
        paramsRecord[key] = val;
      });

      const verificationResult = await verifyIqacSignatureAction(paramsRecord);
      setIsVerifyingIqac(false);

      if (verificationResult.isValid) {
        const iqacData = extractConferenceIQACParams(searchParams);
        if (iqacData) {
          const currentValues = form.getValues();
          const newValues: any = {
            ...currentValues,
            ...iqacData,
          };

          let mergedAuthors = [...(iqacData.authors || [])];

          // Keep current logged-in user or other authors already in form unless duplicate
          const existingAuthors = currentValues.authors || [];
          existingAuthors.forEach(ea => {
            const exists = mergedAuthors.some(a => a.email.toLowerCase() === ea.email.toLowerCase());
            if (!exists) {
              mergedAuthors.push(ea);
            }
          });

          // Append resolved PU co-authors from MIS IDs
          if (verificationResult.coAuthors && verificationResult.coAuthors.length > 0) {
            verificationResult.coAuthors.forEach((coAuthor: any) => {
              const exists = mergedAuthors.some(a => a.email.toLowerCase() === coAuthor.email.toLowerCase());
              if (!exists) {
                mergedAuthors.push(coAuthor);
              }
            });
          }

          // Map roles: claimant = Presenting Author, others = Co-Author
          newValues.authors = mergedAuthors.map(author => {
            const isSelf = author.email.toLowerCase() === user.email.toLowerCase();
            return {
              ...author,
              role: isSelf ? "Presenting Author" : "Co-Author"
            };
          });

          form.reset(newValues);
          setIsPrefilledFromIQAC(true);
          toast({
            title: "IQAC Integration",
            description: "Conference details have been pre-filled from IQAC Portal.",
          });
        }
      } else {
        setIqacVerificationError(verificationResult.error || "Security verification failed: Invalid signature.");
      }
    };

    verifyIqac();
  }, [searchParams, user, isLoadingDraft, form, toast]);

  const checkDuplicateClaim = async (paperTitle?: string | null): Promise<{ isDuplicate: boolean; appliedBy?: string }> => {
    return { isDuplicate: false };
  };

  const handleProceedToReview = async () => {
    const isValid = await form.trigger()
    if (isValid) {
      // Validate that Your Author Category matches user's role in Authorship & Disclosure
      const authors = form.getValues("authors")
      const authorType = form.getValues("authorType")
      const currentUserAuthor = authors.find(a => a.email?.toLowerCase() === user.email.toLowerCase())
      if (currentUserAuthor && currentUserAuthor.role !== authorType) {
        form.setError("authorType", {
          type: "custom",
          message: "Your Author Category must match your role in the Authorship & Disclosure section."
        })
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: "Your Author Category must match your role in the Authorship & Disclosure section."
        })
        return
      }

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
      console.error("FORM VALIDATION ERRORS:", JSON.stringify(form.formState.errors, null, 2))
      const errorKeys = Object.keys(form.formState.errors);

      const getReadableFieldName = (key: string) => {
        const mapping: Record<string, string> = {
          eventType: "Event Classification",
          conferenceMode: "Presentation Mode",
          onlinePresentationOrder: "Online Presentation Order",
          conferencePaperTitle: "Paper Title",
          conferenceName: "Conference Name",
          eventWebsite: "Event Website URL",
          organizerName: "Organizing Body",
          presentationType: "Presentation Category",
          conferenceType: "Global Scale",
          conferenceVenue: "Physical Location",
          authors: "Authors List"
        };
        return mapping[key] || key;
      };

      const getErrorMessage = (err: any): string => {
        if (!err) return "Invalid value";
        if (err.message) return err.message;
        if (Array.isArray(err)) {
          for (const subErr of err) {
            if (subErr) {
              const messages: string[] = [];
              for (const [subKey, subVal] of Object.entries(subErr)) {
                if (subVal && typeof subVal === 'object' && 'message' in subVal) {
                  messages.push((subVal as any).message);
                }
              }
              if (messages.length > 0) return messages.join(", ");
            }
          }
        }
        return "Invalid value";
      };

      const errorMessages = Object.entries(form.formState.errors)
        .map(([key, err]: [string, any]) => {
          const fieldName = getReadableFieldName(key);
          const msg = getErrorMessage(err);
          return `${fieldName}: ${msg}`;
        })
        .slice(0, 3)
        .join("\n");

      const toastDescription = errorMessages
        ? `Please correct the following fields:\n${errorMessages}${errorKeys.length > 3 ? `\n...and ${errorKeys.length - 3} more field(s).` : ''}`
        : "Please review the highlighted fields in the form and correct the validation errors before proceeding.";

      toast({
        variant: "destructive",
        title: "Validation Error",
        description: toastDescription,
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

    if (status === "Pending") {
      const authors = form.getValues("authors")
      const authorType = form.getValues("authorType")
      const currentUserAuthor = authors.find(a => a.email?.toLowerCase() === user.email.toLowerCase())
      if (currentUserAuthor && currentUserAuthor.role !== authorType) {
        form.setError("authorType", {
          type: "custom",
          message: "Your Author Category must match your role in the Authorship & Disclosure section."
        })
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: "Your Author Category must match your role in the Authorship & Disclosure section."
        })
        return
      }
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

      const { govtFundingRequestProof, abstractUpload, registrationFeeProof, participationCertificate, prizeProof, travelReceipts, conferenceProof, presencePhotographs, additionalDocuments, accommodationProof, ...restOfData } =
        data

      const [
        govtFundingRequestProofUrl,
        abstractUrl,
        registrationFeeProofUrl,
        participationCertificateUrl,
        prizeProofUrl,
        travelReceiptsUrl,
        conferenceProofUrl,
        accommodationProofUrl,
      ] = await Promise.all([
        uploadFileHelper(govtFundingRequestProof?.[0], "conference-funding-proof"),
        uploadFileHelper(abstractUpload?.[0], "conference-abstract"),
        uploadFileHelper(registrationFeeProof?.[0], "conference-reg-proof"),
        uploadFileHelper(participationCertificate?.[0], "conference-cert"),
        uploadFileHelper(prizeProof?.[0], "conference-prize-proof"),
        uploadFileHelper(travelReceipts?.[0], "conference-travel-receipts"),
        uploadFileHelper(conferenceProof?.[0], "conference-proof"),
        uploadFileHelper(accommodationProof?.[0], "conference-accommodation-proof"),
      ])

      const additionalDocumentsUrlsRaw = additionalDocuments && additionalDocuments.length > 0
        ? await Promise.all(Array.from(additionalDocuments as FileList).map(file => uploadFileHelper(file as File, "conference-additional-docs")))
        : []

      const additionalDocumentsUrls = additionalDocumentsUrlsRaw.filter(Boolean) as string[]

      const presencePhotographsUrlsRaw = presencePhotographs && presencePhotographs.length > 0
        ? await Promise.all(Array.from(presencePhotographs as FileList).map(file => uploadFileHelper(file as File, "conference-presence-photographs")))
        : []

      const presencePhotographsUrls = presencePhotographsUrlsRaw.length > 0
        ? presencePhotographsUrlsRaw.filter(Boolean) as string[]
        : (data as any).presencePhotographsUrls || []

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
        accommodationProofUrl: accommodationProofUrl ?? undefined,
        conferenceProofUrl: conferenceProofUrl ?? undefined,
        presencePhotographsUrls: presencePhotographsUrls.length > 0 ? presencePhotographsUrls : undefined,
        additionalDocumentsUrls: additionalDocumentsUrls.length > 0 ? additionalDocumentsUrls : undefined,
        calculatedIncentive: calculatedIncentive ?? undefined,
        conferenceDuration: autoDuration ?? (restOfData as any).conferenceDuration,
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
        externalId: searchParams.get('externalId') || (form.getValues() as any).externalId || undefined,
        source: searchParams.get('source') || (form.getValues() as any).source || undefined,
        iqacClaimType: searchParams.get('claimType') || (form.getValues() as any).claimType || undefined,
        paperProofLink: searchParams.get('paperProofLink') || (form.getValues() as any).paperProofLink || undefined,
      }

      const claimId = searchParams.get("claimId")
      const result = await submitIncentiveClaimViaApi(claimData, claimId || undefined)

      if (!result.success) throw new Error(result.error)

      toast({
        title: status === "Draft" ? "Draft Saved!" : "Success",
        description: status === "Draft" ? "You can continue editing later." : "Your incentive claim has been submitted.",
      })
      clearLocalBackup()
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
    if (authors[index].email.toLowerCase() === user.email.toLowerCase()) {
      form.setValue("authorType", role, { shouldValidate: true })
    }
  }

  const { conferenceMode, conferenceType, wonPrize, organizerName, conferenceName, conferenceVenue, conferenceDate, eventType: watchedEventType } = form.watch()
  const isPuConference = organizerName?.toLowerCase().includes("parul university") || conferenceName?.toLowerCase().includes("picet")
  const isFormDisabled = !eligibility.eligible || isSubmitting
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

            {rejectionComments && (
              <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive rounded-xl ring-1 ring-destructive/10">
                <AlertCircle className="h-5 w-5" />
                <AlertTitle className="font-bold">Prior Rejection Comments</AlertTitle>
                <AlertDescription className="mt-1">
                  This claim was previously not approved with reviewer comments: <strong>"{rejectionComments}"</strong>. Please address these comments before resubmitting.
                </AlertDescription>
              </Alert>
            )}

            {isVerifyingIqac && (
              <Alert className="bg-primary/5 border-primary/20 rounded-xl ring-1 ring-primary/10">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <AlertTitle className="font-bold">Verifying IQAC Signature</AlertTitle>
                <AlertDescription className="mt-1">
                  Verifying security signature and pre-filling details from the IQAC Portal...
                </AlertDescription>
              </Alert>
            )}

            {iqacVerificationError && (
              <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive rounded-xl ring-1 ring-destructive/10">
                <AlertCircle className="h-5 w-5" />
                <AlertTitle className="font-bold">Security Verification Failed</AlertTitle>
                <AlertDescription className="mt-1">
                  {iqacVerificationError} Prefill data from IQAC is disabled. You can still fill the form manually.
                </AlertDescription>
              </Alert>
            )}

            {isPrefilledFromIQAC && (
              <Alert className="bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 rounded-xl">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <AlertTitle className="font-bold">IQAC Integration: Data Pre-filled</AlertTitle>
                <AlertDescription className="mt-1">
                  This form has been automatically populated with conference data passed from the IQAC Portal. Please review all details before submitting.
                </AlertDescription>
              </Alert>
            )}

            {!eligibility.eligible && (
              <Alert className="bg-destructive/5 border-destructive text-destructive rounded-2xl">
                <AlertCircle className="h-5 w-5" />
                <AlertTitle className="font-bold">Ineligible for Claim</AlertTitle>
                <AlertDescription>
                  {eligibility.reason || "You are not eligible to claim conference assistance at this time under the R&D policy."}
                </AlertDescription>
              </Alert>
            )}

            <Alert className="bg-primary/5 border-primary/20 rounded-2xl ring-1 ring-primary/10">
              <Info className="h-5 w-5 text-primary" />
              <AlertTitle className="text-primary font-bold">Assistance Highlights (August 2026 Revision)</AlertTitle>
              <AlertDescription className="text-[11px] leading-relaxed space-y-1 mt-1">
                <p>• <strong>Offline / Physical</strong>: Max 2 claims per year. The 2nd claim is capped at ₹5,000.</p>
                <p>• <strong>International (Outside India)</strong>: Max once in 2 years. Pre-approval & government funding application required.</p>
                <p>• <strong>Online Presentations</strong>: Max 1 claim per year (75% registration fee, cap ₹6,000).</p>
                <p>• <strong>PU Conferences</strong>: 75% reimbursement of registration fee (One claim/year).</p>
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
                    <FormLabel className="text-base font-semibold">Event Classification <span className="text-destructive font-black">*</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isFormDisabled}>
                      <FormControl><SelectTrigger className="h-12 shadow-sm"><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                      <SelectContent>{eventTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField name="conferenceMode" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">Presentation Mode <span className="text-destructive font-black">*</span></FormLabel>
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
                    <FormLabel className="text-base font-semibold">Title of the Research Paper <span className="text-destructive font-black">*</span></FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Exact title as per certificate"
                        {...field}
                        onBlur={async (e) => {
                          field.onBlur();
                          const title = e.target.value;
                          if (title) {
                            const dup = await checkDuplicateClaim(title);
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
                    <FormLabel className="text-base font-semibold">Conference Full Name <span className="text-destructive font-black">*</span></FormLabel>
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
                  <FormItem><FormLabel className="text-base font-semibold">Organizing Body <span className="text-destructive font-black">*</span></FormLabel><FormControl><Input placeholder="e.g. Parul Institute of Engineering..." {...field} disabled={isFormDisabled} className="h-12 shadow-sm" /></FormControl><FormMessage /></FormItem>
                )} />
                {conferenceMode === "Offline" && (
                  <FormField name="presentationType" control={form.control} render={({ field }) => (
                    <FormItem className="animate-in slide-in-from-top-2 duration-300">
                      <FormLabel className="text-base font-semibold">Presentation Category <span className="text-destructive font-black">*</span></FormLabel>
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
                    <FormLabel className="text-base font-semibold">Global Scale <span className="text-destructive font-black">*</span></FormLabel>
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
                    <FormLabel className="text-base font-semibold">Physical Location <span className="text-destructive font-black">*</span></FormLabel>
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
                  <FormItem><FormLabel className="text-base font-semibold flex items-center gap-2"><Calendar className="h-4 w-4" /> Start Date <span className="text-destructive font-black">*</span></FormLabel><FormControl><Input type="date" {...field} max={new Date().toISOString().split("T")[0]} disabled={isFormDisabled} className="h-12 shadow-sm cursor-pointer" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="conferenceEndDate" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel className="text-base font-semibold flex items-center gap-2"><Calendar className="h-4 w-4" /> End Date <span className="text-destructive font-black">*</span></FormLabel><FormControl><Input type="date" {...field} min={conferenceDate || undefined} max={new Date().toISOString().split("T")[0]} disabled={isFormDisabled} className="h-12 shadow-sm cursor-pointer" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="presentationDate" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel className="text-base font-semibold flex items-center gap-2"><Calendar className="h-4 w-4" /> Presentation Date <span className="text-destructive font-black">*</span></FormLabel><FormControl><Input type="date" {...field} min={conferenceDate || undefined} max={new Date().toISOString().split("T")[0]} disabled={isFormDisabled} className="h-12 shadow-sm cursor-pointer" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <FormField name="abstractUpload" control={form.control} render={({ field: { value, onChange, ...rest } }) => (
                  <FormItem className="space-y-3"><FormLabel className="font-bold flex items-center gap-2 underline decoration-primary decoration-2"><FileText className="h-4 w-4" /> Full Abstract <span className="text-destructive font-black">*</span></FormLabel><FormControl><Input type="file" accept=".pdf" className="h-12 border-dashed border-2 bg-muted/20" onChange={e => onChange(e.target.files)} disabled={isFormDisabled} {...rest} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="participationCertificate" control={form.control} render={({ field: { value, onChange, ...rest } }) => (
                  <FormItem className="space-y-3"><FormLabel className="font-bold flex items-center gap-2 underline decoration-primary decoration-2"><Award className="h-4 w-4" /> Participation Certificate <span className="text-destructive font-black">*</span></FormLabel><FormControl><Input type="file" accept=".pdf" className="h-12 border-dashed border-2 bg-muted/20" onChange={e => onChange(e.target.files)} disabled={isFormDisabled} {...rest} /></FormControl><FormMessage /></FormItem>
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

              {watchedEventType === "Conference" && conferenceMode === "Offline" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                  <FormField name="presencePhotographs" control={form.control} render={({ field: { value, onChange, ...rest } }) => (
                    <FormItem className="space-y-3">
                      <FormLabel className="font-bold flex items-center gap-2 underline decoration-primary decoration-2">
                        <FileText className="h-4 w-4 text-primary" /> Presence Photographs <span className="text-destructive font-black">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="file"
                          multiple
                          accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                          className="h-12 border-dashed border-2 bg-muted/20 hover:bg-muted/30 transition-colors"
                          onChange={e => onChange(e.target.files)}
                          disabled={isFormDisabled}
                          {...rest}
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Upload photographs justifying your presence at the conference (PNG, JPG, or JPEG format).
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              )}
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
                      <FormLabel className="text-sm font-semibold">Your Author Category <span className="text-destructive font-black">*</span></FormLabel>
                      <Select
                        onValueChange={(val) => {
                          const authors = form.getValues("authors")
                          const userIdx = authors.findIndex((a) => a.email?.toLowerCase() === user.email.toLowerCase())
                          if (userIdx !== -1) {
                            const isTryingToBeFirst = val === "First Author" || val === "First & Corresponding Author"
                            const isAnotherFirst = authors.some((a, i) => i !== userIdx && (a.role === "First Author" || a.role === "First & Corresponding Author"))

                            if (isTryingToBeFirst && isAnotherFirst) {
                              toast({ title: "Conflict", description: "Another author is already the First Author.", variant: "destructive" })
                              return
                            }

                            update(userIdx, { ...authors[userIdx], role: val as Author["role"] })
                          }
                          field.onChange(val)
                        }}
                        value={field.value}
                      >
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
                      <FormLabel className="text-sm font-semibold">Total Author Count <span className="text-destructive font-black">*</span></FormLabel>
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
                      <FormLabel className="text-sm font-semibold">Your Author Position <span className="text-destructive font-black">*</span></FormLabel>
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
                        <FormDescription className="text-[10px]">Is "Parul University" mentioned?</FormDescription>
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
                    <FormLabel className="text-base font-semibold">Registration Fee (INR) <span className="text-destructive font-black">*</span></FormLabel>
                    <FormControl><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">₹</span><Input type="number" {...field} min="0" disabled={isFormDisabled} className="h-12 pl-8 text-lg font-black shadow-sm" /></div></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField name="registrationFeeProof" control={form.control} render={({ field: { value, onChange, ...rest } }) => (
                  <FormItem className="pt-2">
                    <FormLabel className="font-bold flex items-center gap-2 text-xs">Proof of Payment <span className="text-destructive font-black">*</span></FormLabel>
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
                      <FormItem><FormLabel className="text-xs font-bold uppercase tracking-tight">Destination <span className="text-destructive font-black">*</span></FormLabel><FormControl><Input placeholder="City, Country" {...field} disabled={isFormDisabled} className="h-10 bg-background" /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField name="travelMode" control={form.control} render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold uppercase tracking-tight">Transport Mode <span className="text-destructive font-black">*</span></FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={isFormDisabled}>
                          <FormControl>
                            <SelectTrigger className="h-10 bg-background">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {["Bus", "Train", "Air", "Other"].map(mode => {
                              const isDisabled = (mode === "Bus" || mode === "Train") && (conferenceMode === "Offline" && conferenceVenue !== "India");
                              return (
                                <SelectItem key={mode} value={mode} disabled={isDisabled}>
                                  {mode}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <FormField name="travelFare" control={form.control} render={({ field }) => (
                      <FormItem><FormLabel className="text-xs font-bold uppercase tracking-tight">Fare Incurred (INR) <span className="text-destructive font-black">*</span></FormLabel><FormControl><Input type="number" {...field} disabled={isFormDisabled} className="h-10 bg-background" /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField name="travelReceipts" control={form.control} render={({ field: { value, onChange, ...rest } }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-bold uppercase tracking-tight">Tickets / Receipts <span className="text-destructive font-black">*</span></FormLabel>
                        <FormControl><Input type="file" accept=".pdf" onChange={e => onChange(e.target.files)} disabled={isFormDisabled} className="h-10 bg-background" {...rest} /></FormControl>
                        {form.watch("travelMode") === "Train" && (
                          <p className="text-[11px] text-amber-600 dark:text-amber-400 font-bold mt-1">
                            We prefer tickets/receipts showing 2 Tier AC class.
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  {conferenceVenue && conferenceVenue !== "India" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-muted-foreground/10 animate-in slide-in-from-top-2">
                      <FormField name="accommodationExpense" control={form.control} render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold uppercase tracking-tight">Accommodation Expense (INR) <span className="text-destructive font-black">*</span></FormLabel>
                          <FormControl><Input type="number" {...field} disabled={isFormDisabled} className="h-10 bg-background" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField name="accommodationProof" control={form.control} render={({ field: { value, onChange, ...rest } }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold uppercase tracking-tight">Accommodation Bill <span className="text-destructive font-black">*</span></FormLabel>
                          <FormControl><Input type="file" accept=".pdf" onChange={e => onChange(e.target.files)} disabled={isFormDisabled} className="h-10 bg-background" {...rest} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  )}
                </div>
              )}

              {conferenceVenue && conferenceVenue !== "India" && !(watchedEventType === "Conference" && conferenceMode === "Online") && (
                <FormField name="govtFundingRequestProof" control={form.control} render={({ field: { value, onChange, ...rest } }) => (
                  <FormItem className="bg-amber-50 dark:bg-amber-950/20 p-6 rounded-3xl border border-amber-200 dark:border-amber-900 shadow-inner">
                    <FormLabel className="text-sm font-black text-amber-900 dark:text-amber-400">Government Travel Grant Inquiry (Mandatory for International) <span className="text-destructive font-black">*</span></FormLabel>
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
                          <FormItem><FormLabel className="text-xs font-black uppercase text-amber-700">Prize Description <span className="text-destructive font-black">*</span></FormLabel><FormControl><Input placeholder="e.g. Best Researcher Award (PICET 2026)" {...field} disabled={isFormDisabled} className="bg-background border-amber-200" /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField name="prizeProof" control={form.control} render={({ field: { value, onChange, ...rest } }) => (
                          <FormItem><FormLabel className="text-xs font-black uppercase text-amber-700">Upload Award Copy <span className="text-destructive font-black">*</span></FormLabel><FormControl><Input type="file" accept=".pdf" onChange={e => onChange(e.target.files)} disabled={isFormDisabled} className="bg-background border-amber-200" {...rest} /></FormControl><FormMessage /></FormItem>
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
                  <FormLabel className="text-base font-black tracking-tight">Final Declaration of Integrity <span className="text-destructive font-black">*</span></FormLabel>
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
