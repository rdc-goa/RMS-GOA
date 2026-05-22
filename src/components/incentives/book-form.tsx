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
import { useState, useEffect, useCallback } from "react"
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

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

const bookSchema = z
  .object({
    bookApplicationType: z.enum(["Book Chapter", "Book"], { required_error: "Please select an application type." }),
    publicationTitle: z.string().min(3, "Title is required."),
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
    bookTitleForChapter: z.string().optional(),
    bookEditor: z.string().optional(),
    totalPuStudents: z.coerce.number().nonnegative("Number of students cannot be negative.").optional(),
    puStudentNames: z.string().optional(),
    bookChapterPages: z.coerce.number().nonnegative("Page count cannot be negative.").optional(),
    bookTotalPages: z.coerce.number().nonnegative("Page count cannot be negative.").optional(),
    bookTotalChapters: z.coerce.number().nonnegative("Chapter count cannot be negative.").optional(),
    chaptersInSameBook: z.coerce.number().nonnegative("Chapter count cannot be negative.").optional(),
    publicationYear: z.coerce.number().min(1900, "Please enter a valid year.").max(new Date().getFullYear(), "Year cannot be in the future."),
    publisherName: z.string().min(2, "Publisher name is required."),
    publisherCity: z.string().optional(),
    publisherCountry: z.string().optional(),
    publisherType: z.enum(["National", "International"], { required_error: "Publisher type is required." }),
    isScopusIndexed: z.boolean().optional(),
    authorRole: z.enum(["Editor", "Author"]).optional(),
    publicationMode: z.enum(["Print Only", "Electronic Only", "Print & Electronic"]).optional(),
    isbnPrint: z.string().optional(),
    isbnElectronic: z.string().optional(),
    publisherWebsite: z.string().url("Please enter a valid URL.").optional().or(z.literal("")),
    bookProof: z.any().optional().refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, "File must be less than 10 MB."),
    scopusProof: z.any().optional().refine((files) => !files?.[0] || files?.[0]?.size <= 2 * 1024 * 1024, "File must be less than 2 MB."),
    publicationOrderInYear: z.enum(["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth"]).optional(),
    bookType: z.enum(["Textbook", "Reference Book"], { required_error: "Please select the book type." }),
    bookSelfDeclaration: z.boolean().refine((val) => val === true, { message: "You must agree to the self-declaration." }),
    doi: z.string().optional(),
    authorPosition: z.enum(["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"]).optional(),
    bookProofUrl: z.string().optional(),
    scopusProofUrl: z.string().optional(),
  })
  .refine((data) => !(data.bookApplicationType === "Book Chapter") || (!!data.bookTitleForChapter && data.bookTitleForChapter.length > 2), {
    message: "Book title is required for a book chapter.",
    path: ["bookTitleForChapter"],
  })

  .refine((data) => !(data.bookApplicationType === "Book") || (!data.publisherCity || data.publisherCity.length > 0), {
    message: "Publisher city must be valid if provided.",
    path: ["publisherCity"],
  })
  .refine((data) => !(data.bookApplicationType === "Book") || (!data.publisherCountry || data.publisherCountry.length > 0), {
    message: "Publisher country must be valid if provided.",
    path: ["publisherCountry"],
  })
  .refine((data) => !(data.bookApplicationType === "Book") || !!data.publicationMode, {
    message: "Mode of publication is required for book publications.",
    path: ["publicationMode"],
  })
  .refine((data) => !(data.bookApplicationType === "Book" && (data.publicationMode === "Print Only" || data.publicationMode === "Print & Electronic")) || (!!data.isbnPrint && data.isbnPrint.length >= 10), {
    message: "A valid Print ISBN is required.",
    path: ["isbnPrint"],
  })
  .refine((data) => !(data.bookApplicationType === "Book" && (data.publicationMode === "Electronic Only" || data.publicationMode === "Print & Electronic")) || (!!data.isbnElectronic && data.isbnElectronic.length >= 10), {
    message: "A valid Electronic ISBN is required.",
    path: ["isbnElectronic"],
  })
  .refine((data) => !(data.bookApplicationType === "Book") || (!data.authorRole || data.authorRole.length > 0), {
    message: "Applicant type must be valid if provided.",
    path: ["authorRole"],
  })
  .refine((data) => !(data.bookApplicationType === "Book") || (data.bookTotalChapters === undefined || data.bookTotalChapters >= 0), {
    message: "Total chapters must be valid if provided.",
    path: ["bookTotalChapters"],
  })
  .refine(data => data.bookProofUrl || (data.bookProof && data.bookProof.length > 0), {
    message: "Proof of publication is required.",
    path: ["bookProof"],
  })
  .refine(data => !data.isScopusIndexed || data.scopusProofUrl || (data.scopusProof && data.scopusProof.length > 0), {
    message: "Proof of Scopus indexing is required if selected.",
    path: ["scopusProof"],
  });

type BookFormValues = z.infer<typeof bookSchema>

const coAuthorRoles: Author["role"][] = [
  "First Author",
  "Corresponding Author",
  "Co-Author",
  "First & Corresponding Author",
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

            {data.isScopusIndexed && (
              <div className="bg-primary/5 p-3 rounded-xl border border-primary/10">
                <p className="text-primary font-bold flex items-center gap-1.5 text-xs mb-0.5">
                  <Award className="h-3.5 w-3.5" /> Scopus Indexed
                </p>
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
      authorRole: undefined,
      publicationMode: undefined,
      isbnPrint: "",
      isbnElectronic: "",
      doi: "",
      bookProof: undefined,
      scopusProof: undefined,
      publicationOrderInYear: "",
      bookType: undefined,
      bookSelfDeclaration: false,
      authorPosition: "1st" as any,
    },
  })

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "authors",
  })

  const calculate = useCallback(async () => {
    const formValues = form.getValues()
    const result = await calculateBookIncentive(formValues as any)
    if (result.success) {
      setCalculatedIncentive(result.amount ?? null)
    } else {
      setCalculatedIncentive(null)
    }
  }, [form])

  const handleFetchData = async (source: 'scopus' | 'wos') => {
    const doi = form.getValues('doi');
    if (!doi) {
      toast({ variant: 'destructive', title: 'No DOI Provided', description: 'Please enter a DOI first.' });
      return;
    }

    if (!user) {
      toast({ variant: 'destructive', title: 'Not Logged In', description: 'Could not identify the claimant.' });
      return;
    }

    setIsFetching(true);
    toast({ title: `Fetching ${source.toUpperCase()} Data`, description: 'Please wait, this may take a moment...' });

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

        // Auto-detect Scopus indexing if fetched via Scopus
        if (source === 'scopus') {
          form.setValue('isScopusIndexed', true, { shouldValidate: true });
        }

        toast({ title: 'Success', description: `Book chapter fields have been pre-filled from ${source.toUpperCase()}.` });
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.error || `Failed to fetch data from ${source.toUpperCase()}.` });
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'An unexpected error occurred.' });
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
              scopusProof: undefined,
            })
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

  const bookApplicationType = form.watch("bookApplicationType")
  const publicationMode = form.watch("publicationMode")
  const isScopusIndexed = form.watch("isScopusIndexed")

  const handleProceedToReview = async () => {
    const isValid = await form.trigger()
    if (isValid) {
      setStep("review")
    } else {
      console.error("FORM VALIDATION ERRORS:", form.formState.errors)
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please correct the errors before proceeding. Check the console for details.",
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
      const scopusProofFile = data.scopusProof?.[0]

      const bookProofUrl = await uploadFileHelper(bookProofFile, "book-proof") || data.bookProofUrl
      const scopusProofUrl = await uploadFileHelper(scopusProofFile, "book-scopus-proof") || data.scopusProofUrl

      const { bookProof, scopusProof, ...restOfData } = data

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
      if (scopusProofUrl) claimData.scopusProofUrl = scopusProofUrl

      const claimId = searchParams.get("claimId")
      const result = await submitIncentiveClaimViaApi(claimData as Omit<IncentiveClaim, "id" | "claimId">, claimId || undefined)
      if (!result.success || !result.claimId) throw new Error(result.error)

      toast({
        title: status === "Draft" ? "Draft Saved!" : "Success",
        description: status === "Draft" ? "You can continue editing later." : "Your book incentive claim has been submitted.",
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
                  control={form.control}
                  render={({ field }) => (
                    <FormItem className="space-y-4">
                      <FormLabel className="text-base font-semibold">Application Type</FormLabel>
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
                  name="publicationTitle"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">Title of the {bookApplicationType === "Book Chapter" ? "Chapter" : "Publication"}</FormLabel>
                      <FormControl><Input placeholder="Exact title as per book cover" {...field} className="h-12 text-lg shadow-sm" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                  {bookApplicationType === "Book Chapter" ? (
                    <>
                      <FormField
                        name="bookTitleForChapter"
                        control={form.control}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base font-semibold">Title of the Source Book</FormLabel>
                            <FormControl><Input placeholder="Enter the full book name" {...field} className="h-12 shadow-sm" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        name="doi"
                        control={form.control}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base font-semibold">DOI (Digital Object Identifier)</FormLabel>
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
                    </>
                  ) : (
                    <FormField
                      name="doi"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel className="text-base font-semibold">DOI (Digital Object Identifier)</FormLabel>
                          <FormControl>
                            <div className="flex gap-2">
                              <Input
                                placeholder="e.g. 10.1007/978-3-030-12345-6"
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
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <FormField
                    name="bookType"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">Book Category</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl><SelectTrigger className="h-12"><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                          <SelectContent><SelectItem value="Textbook">Textbook</SelectItem><SelectItem value="Reference Book">Reference Book</SelectItem></SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="publicationYear"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">Year of Publication</FormLabel>
                        <FormControl><Input type="number" {...field} value={field.value ?? ""} className="h-12 shadow-sm" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="publicationOrderInYear"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">Publication Order in Year</FormLabel>
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
                        control={form.control}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base font-semibold">Chapter Pages (Count)</FormLabel>
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
                        control={form.control}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base font-semibold">Chapters in Same Book</FormLabel>
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
                        control={form.control}
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
                        control={form.control}
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
                  <FormField name="authorPosition" control={form.control} render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">Your Position</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl><SelectTrigger className="h-12"><SelectValue placeholder="Select position" /></SelectTrigger></FormControl>
                        <SelectContent className="rounded-xl">
                          {["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField name="isScopusIndexed" control={form.control} render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-xl border border-primary/10 bg-primary/5 p-4 shadow-sm hover:bg-primary/10 transition-all">
                      <div className="space-y-0.5"><FormLabel className="text-sm font-bold">Scopus Indexed?</FormLabel></div>
                      <FormControl><Checkbox checked={field.value || false} onCheckedChange={field.onChange} className="h-6 w-6 rounded-lg" /></FormControl>
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
                  <FormField name="publisherName" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel className="text-base font-semibold">Publisher Name</FormLabel><FormControl><Input placeholder="Full name of publishing house" {...field} className="h-12 shadow-sm" /></FormControl><FormMessage /></FormItem>
                  )} />

                  <FormField name="publisherWebsite" control={form.control} render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">Publication Link (URL)</FormLabel>
                      <FormControl><Input placeholder="e.g. https://www.springer.com/book/..." {...field} value={field.value ?? ""} className="h-12 shadow-sm" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <FormField name="publisherType" control={form.control} render={({ field }) => (
                      <FormItem className={`space-y-4 ${bookApplicationType !== "Book" ? "col-span-2" : ""}`}>
                        <FormLabel className="text-base font-semibold">Publisher Scope</FormLabel>
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
                      <FormField name="publicationMode" control={form.control} render={({ field }) => (
                        <FormItem className="animate-in slide-in-from-top-2 duration-300">
                          <FormLabel className="text-base font-semibold">Publication Mode</FormLabel>
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
                        <FormField name="isbnPrint" control={form.control} render={({ field }) => (<FormItem><FormLabel className="text-base font-semibold">ISBN (Print)</FormLabel><FormControl><Input placeholder="Digit ISBN" {...field} value={field.value ?? ""} className="h-12 shadow-sm" /></FormControl><FormMessage /></FormItem>)} />
                      )}
                      {(publicationMode === "Electronic Only" || publicationMode === "Print & Electronic") && (
                        <FormField name="isbnElectronic" control={form.control} render={({ field }) => (<FormItem><FormLabel className="text-base font-semibold">ISBN (Electronic)</FormLabel><FormControl><Input placeholder="Digit ISBN" {...field} value={field.value ?? ""} className="h-12 shadow-sm" /></FormControl><FormMessage /></FormItem>)} />
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
                      control={form.control}
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
                          <FormDescription className="text-xs">Number of Parul University Goa students who contributed.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      name="puStudentNames"
                      control={form.control}
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

                <FormField name="bookProof" control={form.control} render={({ field: { value, onChange, ...field } }) => (
                  <FormItem className="pt-6">
                    <FormLabel className="text-base font-semibold">Publication Proof (PDF Binder)</FormLabel>
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

                {isScopusIndexed && (
                  <FormField name="scopusProof" control={form.control} render={({ field: { value, onChange, ...field } }) => (
                    <FormItem className="pt-6 animate-in slide-in-from-top-2">
                      <FormLabel className="text-base font-semibold">Scopus Indexing Proof</FormLabel>
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

                <FormField name="bookSelfDeclaration" control={form.control} render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-5 space-y-0 rounded-3xl border border-primary/10 bg-primary/5 p-8 transition-all hover:bg-primary/10 ring-1 ring-primary/5">
                    <FormControl><Checkbox checked={field.value || false} onCheckedChange={field.onChange} className="h-6 w-6 rounded-lg shadow-inner data-[state=checked]:bg-primary" /></FormControl>
                    <div className="space-y-1.5 leading-tight">
                      <FormLabel className="text-sm font-bold text-primary italic uppercase tracking-wider">Applicant Declaration</FormLabel>
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

