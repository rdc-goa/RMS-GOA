"use client"

import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import type { User, IncentiveClaim, Author } from "@/types"
import { fetchWosDataByUrl } from "@/app/wos-actions";
import { fetchScopusDataByUrl } from "@/app/scopus-actions";
import { Loader2, AlertCircle, Info, ChevronDown, Upload, FileText, CheckCircle2, Copy, Globe, Calendar, Award, Search, BookOpen, Edit, Trash2 } from "lucide-react"
import { uploadFileToApi } from "@/lib/upload-client"
import { submitIncentiveClaimViaApi } from "@/lib/incentive-claim-client"
import { calculateBookIncentive } from "@/app/incentive-calculation"
import { getIncentiveClaimByIdAction } from "@/app/actions"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { AuthorSearch } from "./author-search"
import { extractBookIQACParams } from "@/lib/iqac-autofill"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

const bookSchema = z
  .object({
    bookApplicationType: z.enum(["Book Chapter", "Book"], { required_error: "Please specify whether you are claiming for a 'Book Chapter' or a 'Full Book'." }),
    publicationTitle: z.string().min(3, "Please enter the complete title of your publication or chapter (must be at least 3 characters long)."),
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
    bookTitleForChapter: z.string().optional(),
    bookEditor: z.string().optional(),
    totalPuStudents: z.coerce.number().nonnegative("The count of university students involved cannot be a negative value.").optional(),
    puStudentNames: z.string().optional(),
    bookChapterPages: z.coerce.number().nonnegative("The chapter page count cannot be a negative value.").optional(),
    bookTotalPages: z.coerce.number().nonnegative("The total book page count cannot be a negative value.").optional(),
    bookTotalChapters: z.coerce.number().nonnegative("The total book chapter count cannot be a negative value.").optional(),
    chaptersInSameBook: z.coerce.number().nonnegative("The count of chapters in the same book cannot be a negative value.").optional(),
    publicationYear: z.coerce.number().min(1900, "Please enter a valid four-digit publication year (1900 or later).").max(new Date().getFullYear(), "The publication year cannot be in the future."),
    publisherName: z.string().min(2, "Please enter the full, official name of the publishing house."),
    publisherCity: z.string().optional(),
    publisherCountry: z.string().optional(),
    publisherType: z.enum(["National", "International"], { required_error: "Please specify whether this is a 'National' or 'International' publisher." }),
    isScopusIndexed: z.boolean().optional(),
    indexType: z.enum(["wos", "scopus", "both", "sci", "other", "esci"]).optional(),
    wosLink: z.string().url("Please enter the full, valid URL link to the Web of Science record of your chapter.").optional().or(z.literal("")),
    scopusLink: z.string()
      .url("Please enter the full, valid URL link to the Scopus record of your chapter.")
      .refine(
        (val) => {
          if (!val) return true;
          try {
            const url = new URL(val);
            return (
              url.hostname === "www.scopus.com" ||
              url.hostname === "scopus.com" ||
              url.hostname.endsWith(".scopus.com") ||
              (url.hostname.includes("scopus") && url.hostname.endsWith("knimbus.com"))
            );
          } catch {
            return false;
          }
        },
        { message: "Please enter a valid link of your chapter from Scopus Database (or Scopus Knimbus proxy URL)." }
      )
      .refine(
        (val) => {
          if (!val) return true;
          try {
            const url = new URL(val);
            const path = url.pathname.toLowerCase();
            const search = url.search.toLowerCase();
            const isAuthorProfile =
              path.includes('/authid/') ||
              path.includes('/author/') ||
              path.includes('authid') ||
              search.includes('authorid=') ||
              search.includes('authid=');
            return !isAuthorProfile;
          } catch {
            const lower = val.toLowerCase();
            return !lower.includes('/authid/') && !lower.includes('authorid=') && !lower.includes('/author/');
          }
        },
        { message: "This is a Scopus Author profile link. Link should be of format: https://www.scopus.com/pages/publications/..." }
      )
      .refine(
        (val) => {
          if (!val) return true;
          try {
            const url = new URL(val);
            const path = url.pathname.toLowerCase();
            return path.includes('/pages/publications/') || path.includes('/record/display.uri');
          } catch {
            const lower = val.toLowerCase();
            return lower.includes('/pages/publications/') || lower.includes('/record/display.uri');
          }
        },
        { message: "Link should be of this format: https://www.scopus.com/pages/publications/..." }
      )
      .optional()
      .or(z.literal("")),
    authorRole: z.enum(["Editor", "Author"], { required_error: "Please select your role in this book project (either 'Author' or 'Editor')." }),
    publicationMode: z.enum(["Print Only", "Electronic Only", "Print & Electronic"]).optional(),
    isbnPrint: z.string().optional(),
    isbnElectronic: z.string().optional(),
    publisherWebsite: z.string().url("Please enter a valid website address (starting with http:// or https://).").min(1, "Publication link (URL) is required."),
    bookProof: z.any().optional().refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, "The uploaded proof file size exceeds the 10 MB limit."),
    bookAiReportProof: z.any().optional().refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, "The uploaded AI report proof file size exceeds the 10 MB limit."),
    scopusProof: z.any().optional().refine((files) => !files?.[0] || files?.[0]?.size <= 2 * 1024 * 1024, "The uploaded Scopus proof file size exceeds the 2 MB limit."),
    publicationOrderInYear: z.enum(["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth"], { required_error: "Please select the publication order in the current year." }),
    bookType: z.enum(["Textbook", "Reference Book"], { required_error: "Please select a valid category for your book (either 'Textbook' or 'Reference Book')." }),
    bookSelfDeclaration: z.boolean().refine((val) => val === true, { message: "You must read and check the self-declaration box to confirm you have not claimed incentives elsewhere." }),
    doi: z.string().optional(),
    authorPosition: z.enum(["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"], { required_error: "Please select your position." }),
    bookProofUrl: z.string().optional(),
    bookAiReportProofUrl: z.string().optional(),
    scopusProofUrl: z.string().optional(),
  })
  .refine((data) => !(data.bookApplicationType === "Book Chapter") || (!!data.bookTitleForChapter && data.bookTitleForChapter.length > 2), {
    message: "Please enter the source book title where your chapter is published.",
    path: ["bookTitleForChapter"],
  })

  .refine((data) => !(data.bookApplicationType === "Book") || (!data.publisherCity || data.publisherCity.length > 0), {
    message: "Please enter a valid city name for the publisher.",
    path: ["publisherCity"],
  })
  .refine((data) => !(data.bookApplicationType === "Book") || (!data.publisherCountry || data.publisherCountry.length > 0), {
    message: "Please enter a valid country name for the publisher.",
    path: ["publisherCountry"],
  })
  .refine((data) => !(data.bookApplicationType === "Book") || !!data.publicationMode, {
    message: "Please select the mode of publication (Print, Electronic, or Both).",
    path: ["publicationMode"],
  })
  .refine((data) => !(data.bookApplicationType === "Book" && (data.publicationMode === "Print Only" || data.publicationMode === "Print & Electronic")) || (!!data.isbnPrint && data.isbnPrint.length >= 10), {
    message: "Please enter a valid Print ISBN (at least 10 digits/characters long).",
    path: ["isbnPrint"],
  })
  .refine((data) => !(data.bookApplicationType === "Book" && (data.publicationMode === "Electronic Only" || data.publicationMode === "Print & Electronic")) || (!!data.isbnElectronic && data.isbnElectronic.length >= 10), {
    message: "Please enter a valid Electronic ISBN (at least 10 digits/characters long).",
    path: ["isbnElectronic"],
  })

  .refine((data) => !(data.bookApplicationType === "Book") || (data.bookTotalChapters === undefined || data.bookTotalChapters >= 0), {
    message: "The total number of Chapters must be a valid positive number.",
    path: ["bookTotalChapters"],
  })
  .refine(data => data.bookProofUrl || (data.bookProof && data.bookProof.length > 0), {
    message: "Please upload a high-quality PDF or image showing the book cover, title page, and table of contents to serve as proof of publication.",
    path: ["bookProof"],
  })
  .refine(
    (data) => {
      return !!data.indexType;
    },
    { message: "Please select the indexing/listing status of your publication.", path: ["indexType"] }
  )
  .refine(data => {
    const isScopus = data.indexType === 'scopus' || data.indexType === 'both';
    return !isScopus || data.scopusProofUrl || (data.scopusProof && data.scopusProof.length > 0);
  }, {
    message: "You marked this book as Scopus-indexed. Please upload a screenshot or PDF showing the active Scopus listing as proof.",
    path: ["scopusProof"],
  })
  .refine(data => {
    const isWos = data.indexType === 'wos' || data.indexType === 'both';
    const isChapter = data.bookApplicationType === 'Book Chapter';
    return !(isChapter && isWos) || (!!data.wosLink && data.wosLink.length > 0);
  }, {
    message: "Please enter the Web of Science record URL.",
    path: ["wosLink"]
  })
  .refine(data => {
    const isScopus = data.indexType === 'scopus' || data.indexType === 'both';
    const isChapter = data.bookApplicationType === 'Book Chapter';
    return !(isChapter && isScopus) || (!!data.scopusLink && data.scopusLink.length > 0);
  }, {
    message: "Please enter the Scopus record URL.",
    path: ["scopusLink"]
  })
  .refine(data => !(data.bookApplicationType === "Book Chapter") || (!!data.doi && data.doi.trim().length > 0), {
    message: "DOI is mandatory for Book Chapters.",
    path: ["doi"]
  })
  .refine(
    (data) => !(data.bookApplicationType === "Book Chapter") || (data.chaptersInSameBook !== undefined && data.chaptersInSameBook > 0),
    { message: "Chapters in same book count is required and must be a positive number.", path: ["chaptersInSameBook"] }
  )
  .refine(
    (data) => !(data.bookApplicationType === "Book Chapter") || (data.bookChapterPages !== undefined && data.bookChapterPages > 0),
    { message: "Chapter page count is required and must be a positive number.", path: ["bookChapterPages"] }
  )
  .refine(data => {
    if (data.publisherType === "National") {
      return !!data.bookAiReportProofUrl || (!!data.bookAiReportProof && data.bookAiReportProof.length > 0);
    }
    return true;
  }, {
    message: "For National publishers, uploading the AI Reports of the Book (routed via Library) is mandatory.",
    path: ["bookAiReportProof"],
  });

type BookFormValues = z.infer<typeof bookSchema>

const coAuthorRoles: Author["role"][] = [
  "First Author",
  "Corresponding Author",
  "Co-Author",
  "First & Corresponding Author",
]

const indexTypeOptions = [
  { value: "wos", label: "WoS" },
  { value: "scopus", label: "Scopus" },
  { value: "both", label: "Both" },
  { value: 'other', label: 'Other' },
]

function ReviewDetails({
  data,
  onEdit,
  isSubmitting,
  calculatedIncentive,
}: {
  data: BookFormValues
  onEdit: () => void
  isSubmitting: boolean
  calculatedIncentive: number | null
}) {
  const bookProofFile = data.bookProof?.[0] as File | undefined;
  const scopusProofFile = data.scopusProof?.[0] as File | undefined;

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
              <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Application Type & Info</p>
              <div className="space-y-1">
                <p className="font-medium text-base">
                  {data.bookApplicationType} ({data.bookType})
                </p>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" />
                  <span>
                    {data.publisherType}
                    {data.bookApplicationType === "Book" && data.publicationMode && ` - ${data.publicationMode}`}
                  </span>
                </div>
              </div>
            </div>
            <div>
              <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Publication Title</p>
              <p className="font-medium">{data.publicationTitle}</p>
              {data.bookApplicationType === "Book Chapter" && (
                <>
                  <p className="text-xs text-muted-foreground mt-0.5">In Book: {data.bookTitleForChapter}</p>
                  {data.doi && <p className="text-xs text-muted-foreground mt-0.5 font-mono">DOI: {data.doi}</p>}
                </>
              )}
            </div>
            <div>
              <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Publisher Details</p>
              <p className="font-medium">{data.publisherName}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Year: {data.publicationYear}</p>
            </div>
            {data.bookApplicationType === "Book" && (data.isbnPrint || data.isbnElectronic) && (
              <div className="flex gap-6">
                {data.isbnPrint && (
                  <div>
                    <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">ISBN (Print)</p>
                    <p className="font-medium font-mono text-xs">{data.isbnPrint}</p>
                  </div>
                )}
                {data.isbnElectronic && (
                  <div>
                    <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">ISBN (Elec)</p>
                    <p className="font-medium font-mono text-xs">{data.isbnElectronic}</p>
                  </div>
                )}
              </div>
            )}

            {((data.bookApplicationType === "Book Chapter" && data.bookChapterPages) || (data.bookApplicationType === "Book" && data.bookTotalPages)) && (
              <div>
                <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Volume Details</p>
                <div className="flex gap-4">
                  {data.bookChapterPages && <span className="text-xs font-medium bg-muted p-1.5 rounded-md">Chapter Pages: {data.bookChapterPages}</span>}
                  {data.bookTotalPages && <span className="text-xs font-medium bg-muted p-1.5 rounded-md">Total Pages: {data.bookTotalPages}</span>}
                  {data.bookTotalChapters && <span className="text-xs font-medium bg-muted p-1.5 rounded-md">Total Chapters: {data.bookTotalChapters}</span>}
                </div>
              </div>
            )}

            {data.publicationOrderInYear && (
              <div>
                <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Publication Order</p>
                <p className="font-medium text-xs">{data.publicationOrderInYear} Book/Chapter of the calendar year</p>
              </div>
            )}

            {(data.publisherCity || data.publisherCountry || data.publisherWebsite) && (
              <div>
                <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Publisher Extras</p>
                <p className="font-medium text-xs">
                  {[data.publisherCity, data.publisherCountry].filter(Boolean).join(', ')}
                </p>
                {data.publisherWebsite && <p className="text-xs text-muted-foreground truncate">{data.publisherWebsite}</p>}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Financial Summary</p>
              <div className="bg-primary p-6 rounded-[2rem] text-primary-foreground shadow-xl shadow-primary/20 relative overflow-hidden group">
                <div className="absolute -right-4 -top-4 bg-white/10 w-24 h-24 rounded-full blur-3xl group-hover:bg-white/20 transition-all duration-500"></div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-2">Estimated Incentive</p>
                <p className="text-[11px] opacity-70 mb-4 leading-tight font-medium">Based on the provided details, your tentative incentive claim will be:</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black tracking-tighter">₹{calculatedIncentive?.toLocaleString('en-IN') || '0'}</span>
                  <span className="text-xs font-medium opacity-60">INR*</span>
                </div>
                <p className="text-[10px] mt-4 font-medium opacity-70 italic">*Subject to final verification by the technical committee.</p>
              </div>
            </div>

            <div>
              <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Author Details</p>
              <div className="border rounded-xl overflow-hidden shadow-sm bg-background/50">
                <Table>
                  <TableBody>
                    {data.authors.map((author, idx) => (
                      <TableRow key={idx} className="hover:bg-transparent">
                        <TableCell className="py-2.5 font-medium text-xs">{author.name}</TableCell>
                        <TableCell className="py-2.5">
                          <Badge variant="outline" className="text-[9px] py-0 h-4 border-primary/20 bg-primary/5 text-primary">
                            {author.role}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {data.indexType && (
              <div className="bg-primary/5 p-3 rounded-xl border border-primary/10">
                <p className="text-primary font-bold flex items-center gap-1.5 text-xs mb-0.5">
                  <Award className="h-3.5 w-3.5" /> Indexing Status: {data.indexType.toUpperCase()}
                </p>
                {data.wosLink && (
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    <strong>WoS URL:</strong> <a href={data.wosLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{data.wosLink}</a>
                  </p>
                )}
                {data.scopusLink && (
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    <strong>Scopus URL:</strong> <a href={data.scopusLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{data.scopusLink}</a>
                  </p>
                )}
              </div>
            )}

            <div>
              <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Applicant Metadata</p>
              <div className="flex flex-col gap-1 mt-1 text-xs font-medium">
                {data.authorPosition && <p>Your Position: <Badge variant="secondary" className="text-[10px] scale-90 origin-left">{data.authorPosition}</Badge></p>}
                {data.authorRole && <p>Designated Role: <Badge variant="secondary" className="text-[10px] scale-90 origin-left">{data.authorRole}</Badge></p>}
                {data.totalPuStudents ? <p>PU Students Involved: {data.totalPuStudents}</p> : null}
                {data.puStudentNames ? <p>Student Names: {data.puStudentNames}</p> : null}
              </div>
            </div>

            <div>
              <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Uploaded Proofs</p>
              <div className="flex flex-col gap-1.5 mt-1">
                <div className="flex items-center gap-2 bg-background p-2 rounded-lg border text-xs shadow-sm">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  <span className="truncate flex-1">Book Proof: {bookProofFile?.name || "Attached (Draft URL)"}</span>
                </div>
                {data.publisherType === "National" && (data.bookAiReportProof?.[0] || data.bookAiReportProofUrl) && (
                  <div className="flex items-center gap-2 bg-background p-2 rounded-lg border text-xs shadow-sm">
                    <FileText className="h-3.5 w-3.5 text-primary" />
                    <span className="truncate flex-1">AI Report Proof: {(data.bookAiReportProof?.[0] as File)?.name || "Attached (Draft URL)"}</span>
                  </div>
                )}
                {(scopusProofFile || data.scopusProofUrl) && (
                  <div className="flex items-center gap-2 bg-background p-2 rounded-lg border text-xs shadow-sm">
                    <FileText className="h-3.5 w-3.5 text-primary" />
                    <span className="truncate flex-1">Scopus: {scopusProofFile?.name || "Attached (Draft URL)"}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function BookForm() {
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [user, setUser] = useState<User | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [bankDetailsMissing, setBankDetailsMissing] = useState(false)
  const [orcidOrMisIdMissing, setOrcidOrMisIdMissing] = useState(false)

  const [step, setStep] = useState<"edit" | "review">("edit")
  const [calculatedIncentive, setCalculatedIncentive] = useState<number | null>(null)
  const [isLoadingDraft, setIsLoadingDraft] = useState(true)
  const [showLogic, setShowLogic] = useState(false)
  const [isFetching, setIsFetching] = useState(false)
  const [rejectionComments, setRejectionComments] = useState<string | null>(null)
  const [isPrefilledFromIQAC, setIsPrefilledFromIQAC] = useState(false)
  const lastAutoFetchedRef = useRef<string>('')

  const getBookLogicBreakdown = (data: any) => {
    try {
      const isChapter = data.bookApplicationType === 'Book Chapter';
      const isScopus = data.isScopusIndexed === true;
      const pubType = data.publisherType;
      const pages = isChapter ? (data.bookChapterPages || 0) : (data.bookTotalPages || 0);

      let baseIncentive = 0;
      let baseReason = '';

      if (isChapter) {
        if (isScopus) { baseIncentive = 6000; baseReason = 'Scopus Chapter'; }
        else if (pubType === 'National') {
          if (pages > 20) { baseIncentive = 2500; baseReason = 'National Chapter (>20 pages)'; }
          else if (pages >= 10) { baseIncentive = 1500; baseReason = 'National Chapter (10-20 pages)'; }
          else if (pages >= 5) { baseIncentive = 500; baseReason = 'National Chapter (5-9 pages)'; }
        } else if (pubType === 'International') {
          if (pages > 20) { baseIncentive = 3000; baseReason = 'Intl. Chapter (>20 pages)'; }
          else if (pages >= 10) { baseIncentive = 2000; baseReason = 'Intl. Chapter (10-20 pages)'; }
          else if (pages >= 5) { baseIncentive = 1000; baseReason = 'Intl. Chapter (5-9 pages)'; }
        }
      } else {
        if (isScopus) { baseIncentive = 18000; baseReason = 'Scopus Book'; }
        else if (pubType === 'National') {
          if (pages > 350) { baseIncentive = 3000; baseReason = 'National Book (>350 pages)'; }
          else if (pages >= 200) { baseIncentive = 2500; baseReason = 'National Book (200-350 pages)'; }
          else if (pages >= 100) { baseIncentive = 2000; baseReason = 'National Book (100-199 pages)'; }
          else if (pages > 0) { baseIncentive = 1000; baseReason = 'National Book (<100 pages)'; }
        } else if (pubType === 'International') {
          if (pages > 350) { baseIncentive = 6000; baseReason = 'Intl. Book (>350 pages)'; }
          else if (pages >= 200) { baseIncentive = 3500; baseReason = 'Intl. Book (200-350 pages)'; }
          else if (pages > 0) { baseIncentive = 2000; baseReason = 'Intl. Book (<200 pages)'; }
        }
      }

      const steps = [];
      steps.push({ label: `1. Policy Base Value (${baseReason || 'Condition not met'})`, value: `₹${baseIncentive.toLocaleString('en-IN')}` });

      if (data.authorRole === 'Editor') {
        baseIncentive *= 0.5;
        steps.push({ label: '2. Editor Role Adjustment (-50%)', value: `₹${baseIncentive.toLocaleString('en-IN')}` });
      } else {
        steps.push({ label: '2. Author Role Adjustment', value: 'Author (100%)' });
      }

      let totalIncentive = baseIncentive;
      if (isChapter && data.chaptersInSameBook && data.chaptersInSameBook > 1) {
        const n = data.chaptersInSameBook;
        let fullBookIncentive = 0;
        if (isScopus) fullBookIncentive = 18000;
        else if (pubType === 'National') fullBookIncentive = 3000;
        else if (pubType === 'International') fullBookIncentive = 6000;

        let sum = 0;
        for (let k = 1; k <= n; k++) {
          sum += baseIncentive / k;
        }
        totalIncentive = Math.min(sum, fullBookIncentive);
        steps.push({ label: `3. Multi-Chapter Cap (${n} chapters, max full book limit)`, value: `₹${Math.round(totalIncentive).toLocaleString('en-IN')}` });
      }

      const internalCount = data.authors?.filter((a: any) => !a.isExternal).length || 1;
      steps.push({ label: '4. Internal PU Authors', value: `${internalCount}` });

      const finalShare = totalIncentive / internalCount;
      steps.push({ label: '5. Final Individual Share', value: `₹${Math.round(finalShare).toLocaleString('en-IN')}` });

      return steps;
    } catch (e) {
      return [];
    }
  }

  const form = useForm<BookFormValues>({
    resolver: zodResolver(bookSchema),
    defaultValues: {
      bookApplicationType: undefined,
      publicationTitle: "",
      authors: [],
      indexType: undefined,
      wosLink: "",
      scopusLink: "",
      bookTitleForChapter: "",
      bookEditor: "",
      totalPuStudents: 0,
      puStudentNames: "",
      bookChapterPages: 0,
      bookTotalPages: 0,
      bookTotalChapters: 0,
      chaptersInSameBook: 1,
      publicationYear: new Date().getFullYear(),
      publisherName: "",
      publisherCity: "",
      publisherCountry: "",
      publisherType: undefined,
      isScopusIndexed: false,
      authorRole: "Author" as any,
      publicationMode: undefined,
      isbnPrint: "",
      isbnElectronic: "",
      doi: "",
      bookProof: undefined,
      bookAiReportProof: undefined,
      scopusProof: undefined,
      publicationOrderInYear: undefined,
      bookType: undefined,
      bookSelfDeclaration: false,
      authorPosition: "1st" as any,
      bookProofUrl: "",
      bookAiReportProofUrl: "",
      scopusProofUrl: "",
    },
  })

  const formControl = form.control as any;

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "authors",
  })

  const formValues = form.watch();

  const clearLocalBackup = useCallback(() => {
    if (user) {
      localStorage.removeItem(`local_draft_book_form_${user.uid}`);
    }
  }, [user]);

  // Auto-save form values to localStorage
  useEffect(() => {
    if (!user || isLoadingDraft) return;
    const key = `local_draft_book_form_${user.uid}`;

    const valuesToSave = {
      ...formValues,
      bookProof: undefined,
      scopusProof: undefined,
    };

    localStorage.setItem(key, JSON.stringify(valuesToSave));
  }, [formValues, user, isLoadingDraft]);

  // Prompt to restore local backup on load
  useEffect(() => {
    if (!user || isLoadingDraft) return;
    const key = `local_draft_book_form_${user.uid}`;
    const backupStr = localStorage.getItem(key);
    if (backupStr) {
      try {
        const backup = JSON.parse(backupStr);
        if (backup.publicationTitle && backup.publicationTitle.length > 3 && backup.publicationTitle !== form.getValues('publicationTitle')) {
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

  const calculate = useCallback(async () => {
    const formValues = form.getValues()
    const result = await calculateBookIncentive(formValues as any)
    if (result.success) {
      setCalculatedIncentive(result.amount ?? null)
    } else {
      setCalculatedIncentive(null)
    }
  }, [form])

  const handleFetchData = async (source: 'scopus' | 'wos', isAuto: boolean = false): Promise<boolean> => {
    const doi = form.getValues('doi');
    if (!doi) {
      if (!isAuto) toast({ variant: 'destructive', title: 'No DOI Provided', description: 'Please enter a DOI first.' });
      return false;
    }

    if (!user) {
      if (!isAuto) toast({ variant: 'destructive', title: 'Not Logged In', description: 'Could not identify the claimant.' });
      return false;
    }

    lastAutoFetchedRef.current = `${source}:${doi.trim().toLowerCase()}`;
    setIsFetching(true);
    toast({
      title: isAuto ? `Auto-Fetching ${source.toUpperCase()} Data` : `Fetching ${source.toUpperCase()} Data`,
      description: isAuto ? 'Indexing and DOI detected. Retrieving chapter details...' : 'Please wait, this may take a moment...'
    });

    try {
      let result;
      if (source === 'scopus') {
        result = await fetchScopusDataByUrl(doi, user.name, user.uid);
      } else {
        result = await fetchWosDataByUrl(doi, user.name, user.uid);
      }

      if (result.success && result.data) {
        const data = result.data as any;

        // Map fetched fields to Book chapter fields
        if (data.paperTitle || data.title) {
          form.setValue('publicationTitle', data.paperTitle || data.title, { shouldValidate: true });
        }
        if (data.journalName || data.bookTitle) {
          form.setValue('bookTitleForChapter', data.journalName || data.bookTitle, { shouldValidate: true });
        }
        if (data.publisher) {
          form.setValue('publisherName', data.publisher, { shouldValidate: true });
        }
        if (data.publicationYear || data.year) {
          const year = parseInt(data.publicationYear || data.year, 10);
          if (!isNaN(year)) {
            form.setValue('publicationYear', year, { shouldValidate: true });
          }
        }
        if (data.printIssn || data.isbn) {
          form.setValue('isbnPrint', data.printIssn || data.isbn, { shouldValidate: true });
        }
        if (data.electronicIssn || data.isbnElectronic) {
          form.setValue('isbnElectronic', data.electronicIssn || data.isbnElectronic, { shouldValidate: true });
        }

        // Auto-detect indexing if fetched via API
        if (source === 'scopus') {
          form.setValue('indexType', 'scopus', { shouldValidate: true });
          form.setValue('isScopusIndexed', true, { shouldValidate: true });
          if (form.getValues('bookApplicationType') === 'Book Chapter') {
            form.setValue('publisherType', 'International', { shouldValidate: true });
          }
        } else if (source === 'wos') {
          form.setValue('indexType', 'wos', { shouldValidate: true });
          form.setValue('isScopusIndexed', false, { shouldValidate: true });
        }

        toast({ title: 'Success', description: `Book chapter fields have been pre-filled from ${source.toUpperCase()}.` });
        return true;
      } else {
        if (!isAuto) toast({ variant: 'destructive', title: 'Error', description: result.error || `Failed to fetch data from ${source.toUpperCase()}.` });
        return false;
      }
    } catch (error: any) {
      if (!isAuto) toast({ variant: 'destructive', title: 'Error', description: error.message || 'An unexpected error occurred.' });
      return false;
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    const subscription = form.watch((value, { name, type }) => {
      if (type === "change") calculate()
    })
    return () => subscription.unsubscribe()
  }, [form, calculate])

  useEffect(() => {
    const storedUser = localStorage.getItem("user")
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser)
      setUser(parsedUser)
      setBankDetailsMissing(!parsedUser.bankDetails)
      setOrcidOrMisIdMissing(!parsedUser.orcidId || !parsedUser.misId)

      const isUserAlreadyAdded = form.getValues("authors").some((field) => field.email.toLowerCase() === parsedUser.email.toLowerCase())
      if (!isUserAlreadyAdded) {
        append({
          name: parsedUser.name,
          email: parsedUser.email,
          uid: parsedUser.uid,
          role: "First Author",
          isExternal: false,
          status: "approved",
        })
      }
    }
    const claimId = searchParams.get("claimId")
    if (!claimId) {
      setIsLoadingDraft(false)
    }
  }, [append, form, searchParams])

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
              indexType: draftData.indexType || undefined,
              wosLink: draftData.wosLink || "",
              scopusLink: draftData.scopusLink || "",
              publicationYear: draftData.bookPublicationYear || new Date().getFullYear(),
              authors: draftData.authors || [],
              doi: draftData.doi || "",
              puStudentNames: draftData.puStudentNames || "",
              totalPuStudents: draftData.totalPuStudents || 0,
              publicationOrderInYear: draftData.publicationOrderInYear || "",
              publisherWebsite: draftData.publisherWebsite || "",
              bookChapterPages: draftData.bookChapterPages ?? 0,
              bookTotalPages: draftData.bookTotalPages ?? 0,
              bookTotalChapters: draftData.bookTotalChapters ?? 0,
              chaptersInSameBook: draftData.chaptersInSameBook ?? 1,
              bookProof: undefined,
              bookAiReportProof: undefined,
              bookAiReportProofUrl: draftData.bookAiReportProofUrl || "",
              scopusProof: undefined,
            })
            if (draftData.doi && draftData.indexType) {
              lastAutoFetchedRef.current = `${draftData.indexType}:${draftData.doi.trim().toLowerCase()}`;
            }
            // Check if there are rejection comments in approvals
            const lastApproval = draftData.approvals?.filter((a: any) => a != null).reverse().find((a: any) => a.status === 'Not Approved');
            if (lastApproval?.comments) {
              setRejectionComments(lastApproval.comments);
            }
          } else {
            toast({ variant: "destructive", title: result.error || "Draft Not Found" })
          }
        } catch (error) {
          console.error("DRAFT LOADING ERROR:", error)
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
    if (!user || isLoadingDraft) return
    const claimId = searchParams.get('claimId')
    if (claimId) return

    const iqacData = extractBookIQACParams(searchParams)
    if (iqacData) {
      const currentValues = form.getValues()
      const newValues: any = {
        ...currentValues,
        ...iqacData,
      }

      if (iqacData.authors && iqacData.authors.length > 0) {
        newValues.authors = iqacData.authors
      }

      form.reset(newValues)
      setIsPrefilledFromIQAC(true)
      toast({
        title: "IQAC Integration",
        description: "Book details have been pre-filled from IQAC Portal.",
      })
    }
  }, [user, isLoadingDraft, searchParams, form, toast])

  const bookApplicationType = form.watch("bookApplicationType")
  const publicationMode = form.watch("publicationMode")
  const indexType = form.watch("indexType")
  const isScopusIndexed = form.watch("isScopusIndexed")
  const publisherType = form.watch("publisherType")
  const watchedDoi = form.watch("doi")

  // Auto-run fetching from Scopus/WoS as soon as Indexing and DOI are available for Book Chapter
  useEffect(() => {
    if (isLoadingDraft || isFetching || !user) return;
    if (bookApplicationType !== 'Book Chapter') return;
    if (!watchedDoi || !indexType || indexType === 'other') return;

    const trimmedDoi = watchedDoi.trim();
    const isValidDoi = trimmedDoi.length >= 7 && (trimmedDoi.startsWith('10.') || /10\.\d{4,9}\//i.test(trimmedDoi) || trimmedDoi.includes('doi.org/10.'));
    if (!isValidDoi) return;

    let targetSource: 'scopus' | 'wos' | 'both' | null = null;
    if (indexType === 'scopus') targetSource = 'scopus';
    else if (indexType === 'wos') targetSource = 'wos';
    else if (indexType === 'both') targetSource = 'both';

    if (!targetSource) return;

    const key = `${targetSource}:${trimmedDoi.toLowerCase()}`;
    if (lastAutoFetchedRef.current === key) return;

    const timer = setTimeout(async () => {
      lastAutoFetchedRef.current = key;
      if (targetSource === 'scopus') {
        await handleFetchData('scopus', true);
      } else if (targetSource === 'wos') {
        await handleFetchData('wos', true);
      } else if (targetSource === 'both') {
        const scopusOk = await handleFetchData('scopus', true);
        if (!scopusOk) {
          await handleFetchData('wos', true);
        }
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [watchedDoi, indexType, bookApplicationType, isLoadingDraft, isFetching, user]);

  useEffect(() => {
    const isScopus = indexType === 'scopus' || indexType === 'both';
    if (form.getValues('isScopusIndexed') !== isScopus) {
      form.setValue('isScopusIndexed', isScopus, { shouldValidate: true });
    }
  }, [indexType, form]);

  const handleProceedToReview = async () => {
    const isValid = await form.trigger()
    if (isValid) {
      setStep("review")
    } else {
      console.error("FORM VALIDATION ERRORS:", JSON.stringify(form.formState.errors, null, 2))

      const errorKeys = Object.keys(form.formState.errors);
      const getReadableFieldName = (key: string) => {
        const mapping: Record<string, string> = {
          bookApplicationType: "Application Type",
          publicationTitle: "Title of the Publication/Chapter",
          bookTitleForChapter: "Source Book Title",
          bookEditor: "Book Editor",
          totalPuStudents: "Total PU Students",
          puStudentNames: "Student Names",
          bookChapterPages: "Chapter Pages",
          bookTotalPages: "Total Book Pages",
          bookTotalChapters: "Total Book Chapters",
          chaptersInSameBook: "Chapters in Same Book",
          publicationYear: "Year of Publication",
          publisherName: "Publisher Name",
          publisherCity: "Publisher City",
          publisherCountry: "Publisher Country",
          publisherType: "Publisher Type",
          isScopusIndexed: "Scopus Indexed",
          indexType: "Indexing / Listing Status",
          wosLink: "Web of Science URL",
          scopusLink: "Scopus URL",
          authorRole: "Your Role (Author/Editor)",
          publicationMode: "Mode of Publication",
          isbnPrint: "Print ISBN",
          isbnElectronic: "Electronic ISBN",
          publisherWebsite: "Publication Link (URL)",
          bookProof: "Proof of Publication File",
          scopusProof: "Proof of Scopus Indexing File",
          publicationOrderInYear: "Publication Order in Year",
          bookType: "Book Category",
          bookSelfDeclaration: "Self Declaration",
          doi: "DOI",
          authorPosition: "Your Author Position",
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
    if (!user || !user.faculty) {
      toast({ variant: "destructive", title: "Error", description: "User information not found. Please log in again." })
      return
    }
    if (status === "Pending" && (bankDetailsMissing || orcidOrMisIdMissing)) {
      toast({
        variant: "destructive",
        title: "Profile Incomplete",
        description: "Please update your profile details in Settings before submitting a claim.",
      })
      return
    }
    setIsSubmitting(true)
    try {
      const data = form.getValues()
      const calculationResult = await calculateBookIncentive(data as any)

      const uploadFileHelper = async (file: File | undefined, folderName: string): Promise<string | undefined> => {
        if (!file || !user) return undefined
        const path = `incentive-proofs/${user.uid}/${folderName}/${new Date().toISOString()}-${file.name}`
        const result = await uploadFileToApi(file, { path })
        if (!result.success || !result.url) {
          throw new Error(result.error || `File upload failed for ${folderName}`)
        }
        return result.url
      }

      const bookProofFile = data.bookProof?.[0]
      const bookAiReportProofFile = data.bookAiReportProof?.[0]
      const scopusProofFile = data.scopusProof?.[0]

      const bookProofUrl = await uploadFileHelper(bookProofFile, "book-proof") || data.bookProofUrl
      const bookAiReportProofUrl = await uploadFileHelper(bookAiReportProofFile, "book-ai-report-proof") || data.bookAiReportProofUrl
      const scopusProofUrl = await uploadFileHelper(scopusProofFile, "book-scopus-proof") || data.scopusProofUrl

      const { bookProof, bookAiReportProof, scopusProof, ...restOfData } = data

      const optimizedAuthors = (data.authors || []).map((author) => ({
        name: author.name,
        email: author.email,
        uid: author.uid || null,
        role: author.role,
        isExternal: author.isExternal,
        status: author.status,
      }))

      const claimData: Partial<IncentiveClaim> = {
        bookApplicationType: data.bookApplicationType,
        publicationTitle: data.publicationTitle,
        authors: optimizedAuthors,
        bookTitleForChapter: data.bookTitleForChapter,
        bookEditor: data.bookEditor,
        totalPuStudents: data.totalPuStudents,
        puStudentNames: data.puStudentNames,
        bookChapterPages: data.bookChapterPages,
        bookTotalPages: data.bookTotalPages,
        bookTotalChapters: data.bookTotalChapters,
        chaptersInSameBook: data.chaptersInSameBook,
        bookPublicationYear: data.publicationYear,
        authorRole: data.authorRole,
        isScopusIndexed: data.isScopusIndexed,
        indexType: data.indexType,
        wosLink: data.wosLink || undefined,
        scopusLink: data.scopusLink || undefined,
        publicationMode: data.publicationMode,
        isbnPrint: data.isbnPrint,
        isbnElectronic: data.isbnElectronic,
        publisherWebsite: data.publisherWebsite,
        publicationOrderInYear: data.publicationOrderInYear,
        publisherName: data.publisherName,
        publisherCity: data.publisherCity,
        publisherCountry: data.publisherCountry,
        publisherType: data.publisherType,
        authorPosition: data.authorPosition,
        bookType: data.bookType,
        bookSelfDeclaration: data.bookSelfDeclaration,
        doi: data.doi,
        calculatedIncentive: calculationResult.success ? calculationResult.amount : 0,
        misId: user.misId,
        orcidId: user.orcidId,
        claimType: "Books",
        benefitMode: "incentives",
        uid: user.uid,
        userName: user.name,
        userEmail: user.email,
        faculty: user.faculty,
        status,
        submissionDate: new Date().toISOString(),
        bankDetails: user.bankDetails || undefined,
      }

      if (bookProofUrl) claimData.bookProofUrl = bookProofUrl
      if (bookAiReportProofUrl) claimData.bookAiReportProofUrl = bookAiReportProofUrl
      if (scopusProofUrl) claimData.scopusProofUrl = scopusProofUrl

      const claimId = searchParams.get("claimId")
      const result = await submitIncentiveClaimViaApi(claimData as Omit<IncentiveClaim, "id" | "claimId">, claimId || undefined)
      if (!result.success || !result.claimId) throw new Error(result.error)

      toast({
        title: status === "Draft" ? "Draft Saved!" : "Success",
        description: status === "Draft" ? "You can continue editing later." : "Your book incentive claim has been submitted.",
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
    const isCurrentAuthorFirst = currentAuthor && (currentAuthor.role === "First Author" || currentAuthor.role === "First & Corresponding Author")
    if (firstAuthorExists && !isCurrentAuthorFirst) {
      return coAuthorRoles.filter((role) => role !== "First Author" && role !== "First & Corresponding Author")
    }
    return coAuthorRoles
  }

  const removeAuthor = (index: number) => {
    if (fields[index].email.toLowerCase() === user?.email.toLowerCase()) {
      toast({ variant: "destructive", title: "Action blocked", description: "You cannot remove yourself from the list." })
      return
    }
    remove(index)
  }

  const updateAuthorRole = (index: number, role: Author["role"]) => {
    const isTryingToBeFirst = role === "First Author" || role === "First & Corresponding Author"
    const isAnotherFirst = fields.some((a, i) => i !== index && (a.role === "First Author" || a.role === "First & Corresponding Author"))

    if (isTryingToBeFirst && isAnotherFirst) {
      toast({ title: "Conflict", description: "Another author is already the First Author.", variant: "destructive" })
      return
    }

    update(index, { ...fields[index], role })
  }

  if (isLoadingDraft) return <div className="flex justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>

  if (step === "review") {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <ReviewDetails
          data={form.getValues()}
          onEdit={() => setStep("edit")}
          isSubmitting={isSubmitting}
          calculatedIncentive={calculatedIncentive}
        />
        <div className="flex justify-end max-w-4xl mx-auto gap-4">
          <Button variant="ghost" onClick={() => setStep("edit")} disabled={isSubmitting}>Modify Details</Button>
          <Button size="lg" onClick={() => handleSave("Pending")} disabled={isSubmitting} className="px-10 font-bold shadow-lg shadow-primary/25">
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Confirm Submission
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-4xl mx-auto pb-20">
      <Card className="shadow-2xl border-t-4 border-t-primary overflow-hidden">
        <CardHeader className="bg-primary/5 pb-8">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-3xl font-bold tracking-tight text-primary uppercase">Book Assistance</CardTitle>
            </div>
            <div className="bg-primary/10 p-3 rounded-2xl shadow-inner">
              <Calendar className="h-10 w-10 text-primary" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-8 bg-card">
          <Form {...form}>
            <form className="space-y-10">
              {isPrefilledFromIQAC && (
                <Alert className="bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 rounded-xl">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <AlertTitle className="font-bold">IQAC Integration: Data Pre-filled</AlertTitle>
                  <AlertDescription className="mt-1">
                    This form has been automatically populated with book data passed from the IQAC Portal. Please review all details before submitting.
                  </AlertDescription>
                </Alert>
              )}

              {(bankDetailsMissing || orcidOrMisIdMissing) && (
                <Alert variant="destructive" className="rounded-2xl border-2">
                  <AlertCircle className="h-5 w-5" />
                  <AlertTitle className="font-bold">Profile Update Required</AlertTitle>
                  <AlertDescription>
                    <div className="flex items-center justify-between">
                      <span>Your Profile details (Bank, ORCID, MIS) must be complete to apply.</span>
                      <Button asChild variant="link" className="text-destructive font-black underline p-0 h-auto">
                        <Link href="/dashboard/settings">Settings</Link>
                      </Button>
                    </div>
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

              <Alert className="bg-primary/5 border-primary/20 rounded-2xl ring-1 ring-primary/10">
                <Info className="h-5 w-5 text-primary" />
                <AlertTitle className="text-primary font-bold">Assistance Highlights</AlertTitle>
                <AlertDescription>
                  <div className="text-[11px] leading-relaxed space-y-1 mt-1">
                    <p>• <strong>Verification</strong>: Policy requires full disclosure of all authors and contributors.</p>
                    <p>• <strong>Eligibility</strong>: Only Textbook or Reference books with valid ISBN are considered.</p>
                    <p>• <strong>Documentation</strong>: Upload high-quality PDFs of the book cover and ISBN page.</p>
                  </div>
                </AlertDescription>
              </Alert>

              <section className="space-y-6">
                <div className="flex items-center justify-between py-2 border-b">
                  <div className="flex items-center gap-2 text-primary font-bold text-lg">
                    <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                    Book / Chapter Identification
                  </div>
                </div>

                <FormField
                  name="bookApplicationType"
                  control={formControl}
                  render={({ field }) => (
                    <FormItem className="space-y-4">
                      <FormLabel className="text-base font-semibold">Application Type <span className="text-destructive font-black">*</span></FormLabel>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} value={field.value || ""} className="flex gap-6">
                          <Label htmlFor="type-chap" className="flex items-center space-x-3 bg-muted/40 px-5 py-3 rounded-xl border border-muted-foreground/10 hover:bg-muted transition-all cursor-pointer [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                            <RadioGroupItem value="Book Chapter" id="type-chap" />
                            <span className="font-bold text-sm">Book Chapter</span>
                          </Label>
                          <Label htmlFor="type-book" className="flex items-center space-x-3 bg-muted/40 px-5 py-3 rounded-xl border border-muted-foreground/10 hover:bg-muted transition-all cursor-pointer [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                            <RadioGroupItem value="Book" id="type-book" />
                            <span className="font-bold text-sm">Full Book</span>
                          </Label>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  name="indexType"
                  control={formControl}
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel className="text-base font-semibold">Indexing / Listing Status <span className="text-destructive font-black">*</span></FormLabel>
                      <FormControl>
                        <div>
                          <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value || ""}
                            className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2"
                            disabled={isSubmitting}
                          >
                            {indexTypeOptions.map((option) => (
                              <Label
                                key={option.value}
                                htmlFor={option.value}
                                className="flex items-center space-x-3 bg-muted/30 px-3 py-3 rounded-xl border hover:bg-muted transition-all cursor-pointer [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5 shadow-sm animate-in fade-in duration-200"
                              >
                                <RadioGroupItem value={option.value} id={option.value} />
                                <span className="font-medium text-sm flex-1">{option.label}</span>
                              </Label>
                            ))}
                          </RadioGroup>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {bookApplicationType === "Book Chapter" && (indexType === "wos" || indexType === "both") && (
                  <FormField
                    name="wosLink"
                    control={formControl}
                    render={({ field }) => (
                      <FormItem className="space-y-2 animate-in slide-in-from-top-2">
                        <FormLabel className="text-base font-semibold">Web of Science URL <span className="text-destructive font-black">*</span></FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://www.webofscience.com/wos/woscc/full-record/WOS:..."
                            {...field}
                            value={field.value || ""}
                            disabled={isSubmitting}
                            className="h-12 shadow-sm rounded-lg"
                          />
                        </FormControl>
                        <FormDescription className="text-xs">Please provide the complete Web of Science URL for this book chapter.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {bookApplicationType === "Book Chapter" && (indexType === "scopus" || indexType === "both") && (
                  <FormField
                    name="scopusLink"
                    control={formControl}
                    render={({ field }) => (
                      <FormItem className="space-y-2 animate-in slide-in-from-top-2">
                        <FormLabel className="text-base font-semibold">Link of your publication from Scopus Database <span className="text-destructive font-black">*</span></FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://www.scopus.com/pages/publications/..."
                            {...field}
                            value={field.value || ""}
                            onChange={(e) => {
                              field.onChange(e);
                              form.trigger("scopusLink");
                            }}
                            disabled={isSubmitting}
                            className="h-12 shadow-sm rounded-lg"
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Link should be of this format: <span className="font-mono text-primary font-semibold">https://www.scopus.com/pages/publications/...</span>. Do not provide an author profile link. Search for it on{" "}
                          <a
                            href="https://www.scopus.com/pages/home#basic"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline font-semibold"
                          >
                            Scopus Home
                          </a>{" "}
                          if you do not have the link.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  name="publicationTitle"
                  control={formControl}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">Title of the {bookApplicationType === "Book Chapter" ? "Chapter" : "Publication"} <span className="text-destructive font-black">*</span></FormLabel>
                      <FormControl><Input placeholder="Exact title as per book cover" {...field} className="h-12 text-lg shadow-sm" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {bookApplicationType === "Book Chapter" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                    <FormField
                      name="bookTitleForChapter"
                      control={formControl}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base font-semibold">Title of the Source Book {bookApplicationType === "Book Chapter" && <span className="text-destructive font-black">*</span>}</FormLabel>
                          <FormControl><Input placeholder="Enter the full book name" {...field} className="h-12 shadow-sm" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      name="doi"
                      control={formControl}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base font-semibold">DOI (Digital Object Identifier) {bookApplicationType === "Book Chapter" && <span className="text-destructive font-black">*</span>}</FormLabel>
                          <FormControl>
                            <div className="flex gap-2">
                              <Input
                                placeholder="e.g. 10.1007/978-3-030-12345-6_7"
                                {...field}
                                value={field.value ?? ""}
                                disabled={isSubmitting || isFetching}
                                className="h-12 shadow-sm"
                              />
                              <div className="flex gap-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-12 px-3 hover:bg-primary/10 transition-colors rounded-xl font-bold"
                                  onClick={() => handleFetchData('scopus')}
                                  disabled={isSubmitting || isFetching || !form.getValues('doi')}
                                >
                                  Scopus
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-12 px-3 hover:bg-primary/10 transition-colors rounded-xl font-bold"
                                  onClick={() => handleFetchData('wos')}
                                  disabled={isSubmitting || isFetching || !form.getValues('doi')}
                                >
                                  WoS
                                </Button>
                              </div>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    name="bookType"
                    control={formControl}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">Book Category <span className="text-destructive font-black">*</span></FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl><SelectTrigger className="h-12"><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                          <SelectContent><SelectItem value="Textbook">Textbook</SelectItem><SelectItem value="Reference Book">Reference Book</SelectItem></SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="authorRole"
                    control={formControl}
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-4 space-y-0 rounded-2xl border border-primary/10 bg-primary/5 p-5 transition-all hover:bg-primary/10 ring-1 ring-primary/5 col-span-1">
                        <FormControl>
                          <Checkbox
                            checked={field.value === "Editor"}
                            onCheckedChange={(checked) => field.onChange(checked ? "Editor" : "Author")}
                            className="h-6 w-6 rounded-lg shadow-inner data-[state=checked]:bg-primary"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-tight">
                          <FormLabel className="text-sm font-bold text-primary uppercase tracking-wider cursor-pointer select-none">
                            Is Editor
                          </FormLabel>
                          <p className="text-xs font-medium text-muted-foreground/80 leading-relaxed">
                            Check if you acted as an Editor for this publication (reduces base incentive by 50%).
                          </p>
                          <FormMessage />
                        </div>
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="publicationYear"
                    control={formControl}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">Year of Publication <span className="text-destructive font-black">*</span></FormLabel>
                        <FormControl><Input type="number" {...field} value={field.value ?? ""} className="h-12 shadow-sm" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="publicationOrderInYear"
                    control={formControl}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">Publication Order in Year <span className="text-destructive font-black">*</span></FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl><SelectTrigger className="h-12"><SelectValue placeholder="Select order" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="First">First Book/Chapter</SelectItem>
                            <SelectItem value="Second">Second Book/Chapter</SelectItem>
                            <SelectItem value="Third">Third Book/Chapter</SelectItem>
                            <SelectItem value="Fourth">Fourth Book/Chapter</SelectItem>
                            <SelectItem value="Fifth">Fifth Book/Chapter</SelectItem>
                            <SelectItem value="Sixth">Sixth Book/Chapter</SelectItem>
                            <SelectItem value="Seventh">Seventh Book/Chapter</SelectItem>
                            <SelectItem value="Eighth">Eighth Book/Chapter</SelectItem>
                            <SelectItem value="Ninth">Ninth Book/Chapter</SelectItem>
                            <SelectItem value="Tenth">Tenth Book/Chapter</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>

              <Separator className="bg-muted-foreground/5" />

              <section className="space-y-6 animate-in slide-in-from-top-2 duration-300">
                <div className="flex items-center justify-between py-2 border-b">
                  <div className="flex items-center gap-2 text-primary font-bold text-lg">
                    <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                    Volume & Page Details
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {bookApplicationType === "Book Chapter" ? (
                    <>
                      <FormField
                        name="bookChapterPages"
                        control={formControl}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base font-semibold">Chapter Pages (Count) <span className="text-destructive font-black">*</span></FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="1"
                                placeholder="e.g. 15"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value === '' ? '' : Number(e.target.value))}
                                className="h-12 shadow-sm"
                              />
                            </FormControl>
                            <FormDescription className="text-xs">Number of pages of your chapter in the source book.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        name="chaptersInSameBook"
                        control={formControl}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base font-semibold">Chapters in Same Book <span className="text-destructive font-black">*</span></FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="1"
                                placeholder="e.g. 1"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value === '' ? '' : Number(e.target.value))}
                                className="h-12 shadow-sm"
                              />
                            </FormControl>
                            <FormDescription className="text-xs">Number of chapters claiming in this same book (defaults to 1).</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  ) : (
                    <>
                      <FormField
                        name="bookTotalPages"
                        control={formControl}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base font-semibold">Total Pages in Book</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="1"
                                placeholder="e.g. 250"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value === '' ? '' : Number(e.target.value))}
                                className="h-12 shadow-sm"
                              />
                            </FormControl>
                            <FormDescription className="text-xs">Total count of pages in the full book.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        name="bookTotalChapters"
                        control={formControl}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base font-semibold">Total Chapters (Optional)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="1"
                                placeholder="e.g. 12"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value === '' ? '' : Number(e.target.value))}
                                className="h-12 shadow-sm"
                              />
                            </FormControl>
                            <FormDescription className="text-xs">Total number of chapters in the full book.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}
                </div>
              </section>

              <Separator className="bg-muted-foreground/5" />

              <section className="space-y-6">
                <div className="flex items-center justify-between py-2 border-b">
                  <div className="flex items-center gap-2 text-primary font-bold text-lg">
                    <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                    Authorship & Disclosure
                  </div>
                </div>

                <Alert className="bg-destructive/5 border-destructive/20 py-4 rounded-2xl ring-1 ring-destructive/10">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  <AlertTitle className="text-destructive font-bold uppercase text-xs">Disclosure Policy</AlertTitle>
                  <AlertDescription className="text-xs italic leading-relaxed">
                    You must list ALL internal and external authors involved. Failure to disclose complete authorship will result in immediate disqualification.
                  </AlertDescription>
                </Alert>

                <div className="bg-muted/20 p-6 rounded-2xl border border-dashed border-primary/30 space-y-4">
                  <div className="grid gap-3">
                    {fields.map((field, idx) => (
                      <div key={field.id} className="group flex items-center justify-between bg-background p-4 rounded-xl border shadow-sm transition-all hover:border-primary/30">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm">{field.name}</span>
                            {field.isExternal && <Badge variant="outline" className="text-[9px] h-4">External</Badge>}
                            {field.email.toLowerCase() === user?.email.toLowerCase() && <Badge variant="secondary" className="text-[9px] h-4 bg-primary/10 text-primary border-none font-bold uppercase">You</Badge>}
                          </div>
                          <span className="text-[10px] text-muted-foreground italic mt-0.5">{field.email}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Select value={field.role} onValueChange={(v) => updateAuthorRole(idx, v as Author["role"])}>
                            <SelectTrigger className="h-9 w-[180px] text-xs font-semibold focus:ring-primary/20"><SelectValue /></SelectTrigger>
                            <SelectContent className="rounded-xl border shadow-xl">
                              {getAvailableRoles(fields[idx]).map(r => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {field.email.toLowerCase() !== user?.email.toLowerCase() && (
                            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive/40 hover:text-destructive hover:bg-destructive/10 rounded-lg" onClick={() => removeAuthor(idx)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <AuthorSearch authors={fields} onAdd={(a) => append(a)} availableRoles={getAvailableRoles()} currentUserEmail={user?.email} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                  <FormField name="authorPosition" control={formControl} render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">Your Position <span className="text-destructive font-black">*</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl><SelectTrigger className="h-12"><SelectValue placeholder="Select position" /></SelectTrigger></FormControl>
                        <SelectContent className="rounded-xl">
                          {["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                </div>
              </section>

              <Separator className="bg-muted-foreground/5" />

              <section className="space-y-6">
                <div className="flex items-center justify-between py-2 border-b">
                  <div className="flex items-center gap-2 text-primary font-bold text-lg">
                    <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                    Publisher Metadata
                  </div>
                </div>

                <div className="space-y-6">
                  <FormField name="publisherName" control={formControl} render={({ field }) => (
                    <FormItem><FormLabel className="text-base font-semibold">Publisher Name <span className="text-destructive font-black">*</span></FormLabel><FormControl><Input placeholder="Full name of publishing house" {...field} className="h-12 shadow-sm" /></FormControl><FormMessage /></FormItem>
                  )} />

                  <FormField name="publisherWebsite" control={formControl} render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">Publication Link (URL) <span className="text-destructive font-black">*</span></FormLabel>
                      <FormControl><Input placeholder="e.g. https://www.springer.com/book/..." {...field} value={field.value ?? ""} className="h-12 shadow-sm" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <FormField name="publisherType" control={formControl} render={({ field }) => (
                      <FormItem className={`space-y-4 ${bookApplicationType !== "Book" ? "col-span-2" : ""}`}>
                        <FormLabel className="text-base font-semibold">Publisher Scope <span className="text-destructive font-black">*</span></FormLabel>
                        <FormControl>
                          <RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-6">
                            <Label htmlFor="pub-nat" className="flex items-center space-x-3 bg-muted/40 px-5 py-2.5 rounded-xl border border-muted-foreground/10 hover:bg-muted transition-all cursor-pointer [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                              <RadioGroupItem value="National" id="pub-nat" />
                              <span className="font-bold text-sm">National</span>
                            </Label>
                            <Label htmlFor="pub-int" className="flex items-center space-x-3 bg-muted/40 px-5 py-2.5 rounded-xl border border-muted-foreground/10 hover:bg-muted transition-all cursor-pointer [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                              <RadioGroupItem value="International" id="pub-int" />
                              <span className="font-bold text-sm">International</span>
                            </Label>
                          </RadioGroup>
                        </FormControl>
                      </FormItem>
                    )} />

                    {bookApplicationType === "Book" && (
                      <FormField name="publicationMode" control={formControl} render={({ field }) => (
                        <FormItem className="animate-in slide-in-from-top-2 duration-300">
                          <FormLabel className="text-base font-semibold">Publication Mode <span className="text-destructive font-black">*</span></FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl><SelectTrigger className="h-12"><SelectValue placeholder="Select mode" /></SelectTrigger></FormControl>
                            <SelectContent><SelectItem value="Print Only">Print Only</SelectItem><SelectItem value="Electronic Only">Electronic Only</SelectItem><SelectItem value="Print & Electronic">Print & Electronic</SelectItem></SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                    )}
                  </div>

                  {bookApplicationType === "Book" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-top-2 duration-300">
                      {(publicationMode === "Print Only" || publicationMode === "Print & Electronic") && (
                        <FormField name="isbnPrint" control={formControl} render={({ field }) => (<FormItem><FormLabel className="text-base font-semibold">ISBN (Print) <span className="text-destructive font-black">*</span></FormLabel><FormControl><Input placeholder="Digit ISBN" {...field} value={field.value ?? ""} className="h-12 shadow-sm" /></FormControl><FormMessage /></FormItem>)} />
                      )}
                      {(publicationMode === "Electronic Only" || publicationMode === "Print & Electronic") && (
                        <FormField name="isbnElectronic" control={formControl} render={({ field }) => (<FormItem><FormLabel className="text-base font-semibold">ISBN (Electronic) <span className="text-destructive font-black">*</span></FormLabel><FormControl><Input placeholder="Digit ISBN" {...field} value={field.value ?? ""} className="h-12 shadow-sm" /></FormControl><FormMessage /></FormItem>)} />
                      )}
                    </div>
                  )}
                </div>

                {calculatedIncentive !== null && (
                  <Alert className="bg-primary/5 border-primary/20 py-6 rounded-3xl transition-all animate-in zoom-in-95 border-l-4 border-l-primary shadow-sm hover:shadow-md mb-8">
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

                        {showLogic && (
                          <div className="mt-3 p-4 bg-background rounded-xl border shadow-inner space-y-2 text-xs font-medium animate-in slide-in-from-top-2">
                            {getBookLogicBreakdown(form.getValues()).map((step, idx) => (
                              <div key={idx} className="flex justify-between items-center py-1 border-b last:border-0 border-muted">
                                <span className="text-muted-foreground">{step.label}</span>
                                <span className={idx === (getBookLogicBreakdown(form.getValues()).length - 1) ? "font-bold text-green-600" : "font-semibold"}>{step.value}</span>
                              </div>
                            ))}
                            <div className="text-[9px] text-muted-foreground italic mt-2 !pt-2 text-center border-t border-muted opacity-70">
                              *Logic matches official policy matrix evaluated by approvers during technical audit.
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </Alert>
                )}

                <Separator className="bg-muted-foreground/5" />

                <section className="space-y-6">
                  <div className="flex items-center gap-2 text-primary font-bold text-lg mb-4">
                    <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                    Student Involvement (Optional)
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <FormField
                      name="totalPuStudents"
                      control={formControl}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base font-semibold">No. of Students Involved</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="0"
                              {...field}
                              value={field.value ?? 0}
                              onChange={(e) => field.onChange(e.target.value === '' ? '' : Number(e.target.value))}
                              className="h-12 shadow-sm"
                            />
                          </FormControl>
                          <FormDescription className="text-xs">Number of Parul University students who contributed.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      name="puStudentNames"
                      control={formControl}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base font-semibold">Student Name(s)</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Comma-separated student names (e.g. John Doe, Jane Smith)"
                              {...field}
                              value={field.value ?? ""}
                              className="min-h-[48px] shadow-sm rounded-lg"
                            />
                          </FormControl>
                          <FormDescription className="text-xs">List student names separated by commas.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </section>

                <Separator className="bg-muted-foreground/5" />

                <FormField name="bookProof" control={formControl} render={({ field: { value, onChange, ...field } }) => (
                  <FormItem className="pt-6">
                    <FormLabel className="text-base font-semibold">Publication Proof (PDF Binder) <span className="text-destructive font-black">*</span></FormLabel>
                    <FormControl>
                      <Input
                        type="file"
                        accept=".pdf"
                        className="h-20 border-dashed border-2 cursor-pointer bg-muted/10 hover:bg-muted/20 file:bg-primary/10 file:text-primary file:border-none file:h-12 file:px-6 file:mr-6 file:rounded-xl group transition-all"
                        onChange={(e) => onChange(e.target.files)}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="text-[10px] italic">Combine and upload coverage and ISBN pages as a single PDF (Max 10MB).</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />

                {publisherType === "National" && (
                  <FormField name="bookAiReportProof" control={formControl} render={({ field: { value, onChange, ...field } }) => (
                    <FormItem className="pt-6 animate-in slide-in-from-top-2">
                      <FormLabel className="text-base font-semibold">AI Reports of the Book (routed via Library) <span className="text-destructive font-black">*</span></FormLabel>
                      <FormControl>
                        <Input
                          type="file"
                          accept=".pdf"
                          className="h-20 border-dashed border-2 cursor-pointer bg-muted/10 hover:bg-muted/20 file:bg-primary/10 file:text-primary file:border-none file:h-12 file:px-6 file:mr-6 file:rounded-xl group transition-all"
                          onChange={(e) => onChange(e.target.files)}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="text-[10px] italic">Upload the PDF of AI reports routed via Library (Max 10MB).</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}

                {isScopusIndexed && (
                  <FormField name="scopusProof" control={formControl} render={({ field: { value, onChange, ...field } }) => (
                    <FormItem className="pt-6 animate-in slide-in-from-top-2">
                      <FormLabel className="text-base font-semibold">Scopus Indexing Proof <span className="text-destructive font-black">*</span></FormLabel>
                      <FormControl>
                        <Input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          className="h-20 border-dashed border-2 cursor-pointer bg-muted/10 hover:bg-muted/20 file:bg-primary/10 file:text-primary file:border-none file:h-12 file:px-6 file:mr-6 file:rounded-xl group transition-all"
                          onChange={(e) => onChange(e.target.files)}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="text-[10px] italic">Upload verification of Scopus indexing. Allows jpg, png, max 2 mb.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}

                <FormField name="bookSelfDeclaration" control={formControl} render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-5 space-y-0 rounded-3xl border border-primary/10 bg-primary/5 p-8 transition-all hover:bg-primary/10 ring-1 ring-primary/5">
                    <FormControl><Checkbox checked={field.value || false} onCheckedChange={field.onChange} className="h-6 w-6 rounded-lg shadow-inner data-[state=checked]:bg-primary" /></FormControl>
                    <div className="space-y-1.5 leading-tight">
                      <FormLabel className="text-sm font-bold text-primary italic uppercase tracking-wider">Applicant Declaration <span className="text-destructive font-black">*</span></FormLabel>
                      <p className="text-xs font-medium text-muted-foreground/80 leading-relaxed italic">
                        I hereby declare that I am genuinely one of the authors for this {bookApplicationType || "work"} and have not previously claimed any university incentives for this specific publication.
                      </p>
                      <FormMessage />
                    </div>
                  </FormItem>
                )} />
              </section>
            </form>
          </Form>
        </CardContent>

        <div className="p-8 bg-muted/10 border-t flex flex-col md:flex-row items-center justify-between gap-6 backdrop-blur-xl bg-background/50 sticky bottom-0 z-50">
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleSave("Draft")}
            disabled={isSubmitting}
            className="rounded-2xl h-14 px-10 font-black uppercase tracking-widest hover:bg-primary/5 hover:text-primary transition-all group"
          >
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Edit className="mr-2 h-4 w-4 group-hover:-rotate-12 transition-transform" />}
            Save Progress
          </Button>
          <div className="flex w-full md:w-auto gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              className="flex-1 md:flex-none rounded-2xl h-14 px-10 font-bold border-muted-foreground/10 hover:bg-muted transition-all"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleProceedToReview}
              disabled={isSubmitting || bankDetailsMissing}
              className="flex-1 md:flex-none rounded-2xl h-14 px-14 shadow-2xl shadow-primary/30 font-black uppercase tracking-widest bg-primary hover:bg-primary/90 transition-all active:scale-95 group"
            >
              Proceed to Review
              <Search className="ml-2 h-5 w-5 group-hover:scale-110 transition-transform" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

