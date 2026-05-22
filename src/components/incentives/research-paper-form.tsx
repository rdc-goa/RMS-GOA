

"use client"

import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import Link from "next/link"
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useToast } from '@/hooks/use-toast'
import type { User, IncentiveClaim, Author, SystemSettings } from '@/types'
import { uploadFileToApi } from '@/lib/upload-client'
import { getSystemSettings } from "@/app/actions";
import { getIncentiveClaimByIdAction, checkDuplicateResearchPaperClaimAction } from "@/app/incentive-actions";
import { fetchScopusDataByUrl } from "@/app/scopus-actions";
import { fetchWosDataByUrl } from "@/app/wos-actions";
import { fetchScienceDirectData } from "@/app/sciencedirect-actions";
import { Loader2, AlertCircle, Bot, ChevronDown, Trash2, Plus, Search, UserPlus, Edit, Info, FileText, CheckCircle2, X, ChevronLeft, ChevronRight, Wand2, Globe } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Checkbox } from "../ui/checkbox"
import { calculateResearchPaperIncentive } from "@/app/incentive-calculation"
import { submitIncentiveClaimViaApi } from "@/lib/incentive-claim-client"
import { RichTextEditor } from "@/components/ui/rich-text-editor"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { Badge } from "../ui/badge"
import { isEligibleForFinancialDisbursement } from "@/lib/incentive-eligibility"
import { AuthorSearch } from "./author-search"


const MAX_FILES = 10
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ACCEPTED_FILE_TYPES = ["application/pdf"]

const researchPaperSchema = z
  .object({
    publicationType: z.string({ required_error: "Please select a publication type." }),
    indexType: z.enum(["wos", "scopus", "both", "sci", "other", "esci"]).optional(),
    doi: z.string().optional().or(z.literal('')),
    wosAccessionNumber: z.string().optional().or(z.literal('')),
    relevantLink: z.string().optional().or(z.literal('')),
    scopusLink: z.string().url("Please enter a valid URL.").optional().or(z.literal("")),
    wosLink: z.string().url("Please enter a valid URL.").optional().or(z.literal("")),
    journalClassification: z.enum(["Q1", "Q2", "Q3", "Q4", "Nature/Science/Lancet", "Top 1% Journals"]).optional(),
    wosType: z.enum(["SCIE", "SSCI", "A&HCI"]).optional(),
    journalName: z.string().min(3, "Journal name is required."),
    journalWebsite: z.string().url("Please enter a valid URL.").optional().or(z.literal("")),
    paperTitle: z.string().min(5, "Paper title is required."),
    locale: z.enum(["National", "International"], { required_error: "Locale is required." }),
    printIssn: z.string().optional(),
    electronicIssn: z.string().optional(),
    publicationMonth: z.string({ required_error: "Publication month is required." }),
    publicationYear: z.string({ required_error: "Publication year is required." }),
    sdgGoals: z.array(z.string()).refine((value) => value.length > 0, { message: "Please select at least one SDG." }),
    publicationProof: z
      .any()
      .optional()
      .refine(
        (files) => !files || Array.from(files as FileList).every((file) => file.size <= MAX_FILE_SIZE),
        'File must be less than 10 MB.'
      ),
    isPuNameInPublication: z
      .boolean()
      .default(true),
    wasApcPaidByUniversity: z.boolean().default(false),
    authorPosition: z.enum(['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'], { required_error: 'Please select your author position.' }),
    authors: z
      .array(
        z
          .object({
            name: z.string(),
            email: z.string().email('Invalid email format.').or(z.literal('')),
            uid: z.string().optional().nullable(),
            role: z.enum(["First Author", "Corresponding Author", "Co-Author", "First & Corresponding Author", "Presenting Author", "First & Presenting Author"]),
            isExternal: z.boolean(),
            status: z.enum(['approved', 'pending', 'Applied'])
          })
          .refine((data) => data.isExternal || !!data.email, {
            message: 'Email is required for internal authors.',
            path: ['email'],
          }),
      )
      .min(1, "At least one author is required.").refine(data => {
        const firstAuthors = data.filter(author => author.role === 'First Author' || author.role === 'First & Corresponding Author');
        return firstAuthors.length <= 1;
      }, { message: 'Only one author can be designated as the First Author.', path: ["authors"] }),
    totalPuStudentAuthors: z.coerce.number().nonnegative("Number of students cannot be negative.").optional(),
    puStudentNames: z.string().optional(),
    autoFetchedFields: z.array(z.string()).optional(),
  })
  .refine(
    (data) => {
      if (data.indexType === 'other') {
        return !!data.relevantLink && data.relevantLink.length > 5 && data.relevantLink.startsWith('https://');
      }
      return true;
    }, {
    message: 'A valid article link is required for "Other" indexing type.',
    path: ['relevantLink'],
  }
  )
  .refine(
    (data) => {
      // DOI is not required if the type is WoS and an accession number is provided
      if (data.indexType === 'wos' && data.wosAccessionNumber) {
        return true;
      }
      // For other scopus/wos/both types, DOI is required
      if (data.indexType !== 'other') {
        return !!data.doi && data.doi.length >= 5;
      }
      return true;
    }, {
    message: 'A valid DOI is required for this indexing type.',
    path: ['doi'],
  }
  )
  .refine(
    (data) => {
      if (data.indexType === "wos" || data.indexType === "both") {
        return !!data.wosType;
      }
      return true;
    },
    { message: "For WoS or Both, you must select a WoS Type.", path: ["wosType"] },
  )
  .refine(
    (data) => {
      if (data.indexType === 'scopus' || data.indexType === 'both') {
        return !!data.scopusLink && data.scopusLink.length > 0;
      }
      return true;
    },
    { message: 'Scopus URL is required when Scopus or Both is selected.', path: ['scopusLink'] }
  )
  .refine(
    (data) => {
      if (data.indexType === 'wos' || data.indexType === 'both') {
        return !!data.wosLink && data.wosLink.length > 0;
      }
      return true;
    },
    { message: 'Web of Science URL is required when WoS or Both is selected.', path: ['wosLink'] }
  )
  .refine(
    (data) => {
      if (data.indexType === 'wos' || data.indexType === 'both') {
        return !!data.wosAccessionNumber && data.wosAccessionNumber.length > 0;
      }
      return true;
    },
    { message: 'Web of Science Accession Number is required when WoS or Both is selected.', path: ['wosAccessionNumber'] }
  )
  .refine(
    (data) => {
      if (data.publicationType === 'Scopus Indexed Conference Proceedings') {
        const presentingAuthors = data.authors.filter(author => author.role === 'Presenting Author' || author.role === 'First & Presenting Author');
        return presentingAuthors.length <= 1;
      }
      return true;
    },
    { message: "Only one author can be the Presenting Author for a conference proceeding.", path: ["authors"] }
  )
  .refine(
    (data) => {
      const currentYear = new Date().getFullYear().toString()
      const currentMonthIndex = new Date().getMonth() // 0-indexed
      const selectedYear = data.publicationYear
      const selectedMonth = data.publicationMonth
      const monthIndex = months.indexOf(selectedMonth)

      if (selectedYear === currentYear) {
        return monthIndex <= currentMonthIndex
      }
      return true
    },
    { message: "Publication date cannot be in the future.", path: ["publicationMonth"] }
  );

type ResearchPaperFormValues = z.infer<typeof researchPaperSchema>

const publicationTypes = [
  "Research Articles/Short Communications",
  "Case Reports/Short Surveys",
  "Review Articles",
  "Letter to the Editor/Editorial",
  "Scopus Indexed Conference Proceedings",
]

const sdgGoalsList = [
  "Goal 1: No Poverty",
  "Goal 2: Zero Hunger",
  "Goal 3: Good Health and Well-being",
  "Goal 4: Quality Education",
  "Goal 5: Gender Equality",
  "Goal 6: Clean Water and Sanitation",
  "Goal 7: Affordable and Clean Energy",
  "Goal 8: Decent Work and Economic Growth",
  "Goal 9: Industry, Innovation and Infrastructure",
  "Goal 10: Reduced Inequality",
  "Goal 11: Sustainable Cities and Communities",
  "Goal 12: Responsible Consumption and Production",
  "Goal 13: Climate Action",
  "Goal 14: Life Below Water",
  "Goal 15: Life on Land",
  "Goal 16: Peace and Justice Strong Institutions",
  "Goal 17: Partnerships for the Goals",
]

const coAuthorRoles: Author['role'][] = ["First Author", "Corresponding Author", "Co-Author", "First & Corresponding Author"];


const authorPositions = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

const wosTypeOptions = [
  { value: "SCIE", label: "SCIE" },
  { value: "SSCI", label: "SSCI" },
  { value: "A&HCI", label: "A&HCI" },
]
const indexTypeOptions = [
  { value: "wos", label: "WoS" },
  { value: "scopus", label: "Scopus" },
  { value: "both", label: "Both" },
  { value: "sci", label: "SCI" },
  { value: 'other', label: 'Other' },
]
const journalClassificationOptions = [
  { value: 'Nature/Science/Lancet', label: 'Nature/Science/Lancet' },
  { value: 'Top 1% Journals', label: 'Top 1% Journals' },
  { value: 'Q1', label: 'Q1' },
  { value: 'Q2', label: 'Q2' },
  { value: 'Q3', label: 'Q3' },
  { value: 'Q4', label: 'Q4' },
];


const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]
const years = Array.from({ length: 15 }, (_, i) => (new Date().getFullYear() - i).toString())

const SPECIAL_POLICY_FACULTIES = [
  "Faculty of Applied Sciences",
  "Faculty of Medicine",
  "Faculty of Homoeopathy",
  "Faculty of Ayurved",
  "Faculty of Nursing",
  "Faculty of Pharmacy",
  "Faculty of Physiotherapy",
  "Faculty of Public Health",
  "Faculty of Engineering & Technology"
];

function ReviewDetails({ data, onEdit, calculatedIncentive, user }: { data: ResearchPaperFormValues; onEdit: () => void; calculatedIncentive: number | null; user: User }) {
  const renderItem = (label: string, value?: string | number | boolean | string[] | Author[], icon?: React.ReactNode) => {
    if (!value && value !== 0 && value !== false) return null;

    let displayValue: React.ReactNode = String(value);
    
    // Check if value is a string containing formatting tags and render safely if so
    if (typeof value === 'string' && (value.includes('<sub>') || value.includes('<sup>') || value.includes('<i>') || value.includes('<b>'))) {
      displayValue = <span dangerouslySetInnerHTML={{ __html: value }} />;
    }

    if (typeof value === 'boolean') {
      displayValue = value ? (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Yes</Badge>
      ) : (
        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">No</Badge>
      );
    }
    if (Array.isArray(value)) {
      if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null && 'name' in value[0]) {
        return null; // Handle authors separately
      } else {
        displayValue = (
          <div className="flex flex-wrap gap-1 mt-1">
            {(value as string[]).map((v, i) => (
              <Badge key={i} variant="secondary" className="text-[10px] py-0">{v}</Badge>
            ))}
          </div>
        );
      }
    }

    return (
      <div className="space-y-1.5 p-3 rounded-xl hover:bg-muted/30 transition-colors">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 flex items-center gap-1.5">
          {icon}
          {label}
        </p>
        <div className="text-sm font-semibold leading-tight text-foreground/90">{displayValue}</div>
      </div>
    );
  };

  const authors = data.authors as Author[];

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-primary/5 p-6 rounded-3xl border border-primary/10">
        <div className="space-y-1">
          <h2 className="text-2xl font-black tracking-tight text-primary flex items-center gap-2">
            <CheckCircle2 className="h-7 w-7" />
            Review Application
          </h2>
          <p className="text-sm text-muted-foreground font-medium">Verify your research publication details before final submission.</p>
        </div>
        <Button variant="outline" onClick={onEdit} className="h-11 px-6 rounded-xl border-primary/20 hover:bg-primary/5 gap-2 font-bold transition-all hover:scale-105 active:scale-95">
          <Edit className="h-4 w-4" /> Edit Details
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-sm rounded-3xl border-muted/40 overflow-hidden">
          <CardHeader className="bg-muted/20 pb-4">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-muted-foreground">
              <FileText className="h-4 w-4" /> Publication Identity
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="md:col-span-2">
              {renderItem("Paper Title", data.paperTitle)}
            </div>
            {renderItem("Type", data.publicationType)}
            {renderItem("Indexing", data.indexType?.toUpperCase())}
            {renderItem("DOI", data.doi)}
            {renderItem("Locale", data.locale)}
          </CardContent>
        </Card>

        <Card className="shadow-sm rounded-3xl border-muted/40 overflow-hidden">
          <CardHeader className="bg-primary/5 pb-4">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-primary">
              <Info className="h-4 w-4" /> Journal & Impact
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-2">
            {renderItem("Journal Name", data.journalName)}
            {renderItem("Classification", data.journalClassification)}
            {renderItem("Publication Date", `${data.publicationMonth} ${data.publicationYear}`)}
            {renderItem("Print ISSN", data.printIssn)}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm rounded-3xl border-muted/40 overflow-hidden">
        <CardHeader className="bg-muted/20 pb-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold flex items-center gap-2 text-muted-foreground">
            <UserPlus className="h-4 w-4" /> Author Details
          </CardTitle>
          <Badge variant="outline" className="text-[10px] font-bold">{authors.length} Authors Listed</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/10">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="text-[10px] font-black uppercase tracking-widest pl-6">Author Name</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest">Email Address</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-right pr-6">Contribution Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {authors.map((author, idx) => (
                <TableRow key={idx} className="hover:bg-muted/5 transition-colors border-muted/20">
                  <TableCell className="py-4 pl-6 font-bold text-sm">
                    {author.name}
                    {author.isExternal && <Badge variant="outline" className="ml-2 text-[8px] h-4 uppercase tracking-tighter bg-amber-50 text-amber-700 border-amber-200">External</Badge>}
                    {author.email.toLowerCase() === (user?.email || '').toLowerCase() && <Badge variant="secondary" className="ml-2 text-[8px] h-4 uppercase tracking-tighter bg-primary/10 text-primary border-none font-black">You</Badge>}
                  </TableCell>
                  <TableCell className="text-xs font-medium text-muted-foreground">{author.email}</TableCell>
                  <TableCell className="text-right pr-6">
                    <Badge variant="secondary" className="font-bold text-[10px] px-3 py-0.5 rounded-full">{author.role}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="shadow-sm rounded-3xl border-muted/40 overflow-hidden">
          <CardHeader className="bg-muted/20 pb-4">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-muted-foreground">
              <FileText className="h-4 w-4" /> Submission Metadata
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 grid grid-cols-2 gap-2">
            {renderItem("Author Position", data.authorPosition)}
            {renderItem("PU Affiliation", data.isPuNameInPublication)}
            {renderItem("SDG Goals", data.sdgGoals)}
            {renderItem("Student Authors", data.totalPuStudentAuthors)}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          {data.indexType !== 'other' && (
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
          )}

          <div className="bg-muted/30 p-5 rounded-[2rem] border border-dashed border-muted-foreground/30 flex items-center gap-4">
            <div className="bg-background p-3 rounded-2xl border shadow-sm">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">Attachment</p>
              <p className="text-sm font-bold truncate">
                {data.publicationProof && (data.publicationProof as FileList).length > 0
                  ? (data.publicationProof as FileList)[0].name
                  : "Proof document uploaded"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ResearchPaperForm() {
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isFetching, setIsFetching] = useState(false);
  const [bankDetailsMissing, setBankDetailsMissing] = useState(false)
  const [orcidOrMisIdMissing, setOrcidOrMisIdMissing] = useState(false)
  const [calculatedIncentive, setCalculatedIncentive] = useState<number | null>(null);
  const [calculationBreakdown, setCalculationBreakdown] = useState<any>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoadingDraft, setIsLoadingDraft] = useState(true);
  const [showWosAccession, setShowWosAccession] = useState(false);
  const [showLogic, setShowLogic] = useState(false);
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  useEffect(() => {
    async function fetchSettings() {
      const settings = await getSystemSettings();
      setSystemSettings(settings);
    }
    fetchSettings();
  }, []);

  const getPaperLogicBreakdown = (data: any) => {
    if (calculationBreakdown) {
      const { baseAmount, adjustedAmount, publicationTypeAdjustment, deductions, deductedAmount, authorShare, finalAmount, poolAmount, poolPercentage, sharingAuthorsCount } = calculationBreakdown;

      const steps = [
        { label: '1. Base Amount (by Q-Rating)', value: `₹${baseAmount.toLocaleString('en-IN')}` },
        { label: `2. Adjusted Base (${publicationTypeAdjustment})`, value: `₹${Math.round(adjustedAmount).toLocaleString('en-IN')}` }
      ];

      if (deductions.length > 0) {
        steps.push({ label: `3. After PU Deductions`, value: `₹${Math.round(deductedAmount).toLocaleString('en-IN')}` });
      } else {
        steps.push({ label: `3. University Deductions`, value: 'None' });
      }

      if (authorShare.includes('Ineligible')) {
        steps.push({ label: '4. Eligibility Check', value: 'Ineligible' });
        steps.push({ label: '5. Reason', value: authorShare.split(': ')[1] || authorShare });
      } else {
        // Mapping technical shorthand to friendly text
        let friendlyShare = authorShare;
        if (authorShare.includes('Mixed')) {
          const isMain = authorShare.includes('Main (70%');
          friendlyShare = `Mixed Roles (${isMain ? 'Main' : 'Co-Author'} ${poolPercentage}% Pool Share)`;
        } else if (authorShare.includes('Sole')) {
          friendlyShare = authorShare.replace('Sole', 'Sole Author').replace('(', '').replace(')', '');
        } else if (authorShare.includes('Multiple')) {
          friendlyShare = authorShare.replace('Multiple', 'Shared').replace('(', '').replace(')', '');
        }

        steps.push({ label: '4. Author Sharing Policy', value: friendlyShare });

        // Show the explicit pool math
        if (poolAmount !== undefined && poolAmount !== adjustedAmount) {
          steps.push({ label: '5. Your Group Pool Amount', value: `₹${poolAmount.toLocaleString('en-IN')} (${poolPercentage}% of ₹${Math.round(deductedAmount).toLocaleString('en-IN')})` });
        }

        // Show the final division if multiple authors
        if (sharingAuthorsCount && sharingAuthorsCount > 1) {
          steps.push({ label: '6. Internal Members (Sharing)', value: `${sharingAuthorsCount} Authors` });
          steps.push({ label: 'Final Individual Share', value: `₹${Math.round(finalAmount).toLocaleString('en-IN')} (₹${poolAmount?.toLocaleString('en-IN')} / ${sharingAuthorsCount})` });
        } else {
          steps.push({ label: 'Final Individual Share', value: `₹${Math.round(finalAmount).toLocaleString('en-IN')} (100% Allocation)` });
        }
      }

      return steps;
    }

    // Fallback if breakdown not yet calculated
    return [
      { label: '1. Calculation Pending', value: '...' },
      { label: '2. Please wait', value: '...' }
    ];
  }

  const form = useForm<ResearchPaperFormValues>({
    resolver: zodResolver(researchPaperSchema),
    defaultValues: {
      publicationType: '',
      indexType: undefined,
      doi: '',
      scopusLink: '',
      wosLink: '',
      journalClassification: undefined,
      wosType: undefined,
      journalName: '',
      journalWebsite: '',
      paperTitle: '',
      locale: 'International',
      printIssn: '',
      electronicIssn: '',
      publicationMonth: '',
      publicationYear: '',
      sdgGoals: [],
      authors: [],
      isPuNameInPublication: true,
      wasApcPaidByUniversity: false,
      totalPuStudentAuthors: 0,
      puStudentNames: '',
      autoFetchedFields: [],
      authorPosition: '1st',
    },
  })

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "authors",
  })

  const formValues = form.watch();

  const isPhdScholar = user?.designation === 'Ph.D. Scholar';

  const calculate = useCallback(async () => {
    if (!user || !user.faculty) return;
    setIsCalculating(true);
    const formValues = form.getValues();

    // Server-side calculation
    const result = await calculateResearchPaperIncentive({ ...formValues, userEmail: user.email } as any, user.faculty, user.designation);

    setIsCalculating(false);
    if (result.success && result.amount !== undefined) {
      const finalAmount = result.amount;
      (form as any).setValue('calculatedIncentive', finalAmount);
      setCalculatedIncentive(finalAmount);
      setCalculationBreakdown(result.breakdown);
    } else {
      console.error("Incentive calculation failed:", result.error);
      (form as any).setValue('calculatedIncentive', 0);
      setCalculatedIncentive(0);
      setCalculationBreakdown(null);
    }
  }, [user, form]);

  useEffect(() => {
    const timer = setTimeout(() => {
      calculate();
    }, 400); // 400ms debounce
    return () => clearTimeout(timer);
  }, [calculate, formValues]);


  useEffect(() => {
    const storedUser = localStorage.getItem("user")
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser)
      setUser(parsedUser)
      setBankDetailsMissing(!parsedUser.bankDetails)
      setOrcidOrMisIdMissing(!parsedUser.orcidId || !parsedUser.misId)

      const isUserAlreadyAdded = form.getValues('authors').some(field => field.email.toLowerCase() === parsedUser.email.toLowerCase());
      if (!isUserAlreadyAdded) {
        append({
          name: parsedUser.name,
          email: parsedUser.email,
          uid: parsedUser.uid,
          role: "First Author",
          isExternal: false,
          status: 'approved'
        })
      }
    }
    const claimId = searchParams.get('claimId');
    if (!claimId) {
      setIsLoadingDraft(false);
    }
  }, [append, form, searchParams])

  useEffect(() => {
    const claimId = searchParams.get('claimId');
    if (claimId && user) {
      const fetchDraft = async () => {
        setIsLoadingDraft(true);
        try {
          const result = await getIncentiveClaimByIdAction(claimId);
          if (result.success && result.data) {
            const draftData = result.data as any;
            form.reset({
              ...draftData,
              authors: draftData.authors || [],
              publicationProof: undefined,
            });
          } else {
            toast({ variant: 'destructive', title: result.error || 'Draft Not Found' });
          }
        } catch (error) {
          console.error("Error fetching draft:", error);
          toast({ variant: 'destructive', title: 'Error Loading Draft' });
        } finally {
          setIsLoadingDraft(false);
        }
      };
      fetchDraft();
    }
  }, [searchParams, user, form, toast]);

  const indexType = form.watch("indexType")
  const publicationType = form.watch("publicationType");

  const isSpecialFaculty = useMemo(
    () => (user?.faculty ? SPECIAL_POLICY_FACULTIES.includes(user.faculty) : false),
    [user?.faculty],
  )

  const availableIndexTypes = useMemo(() => {
    let types = indexTypeOptions;
    if (isSpecialFaculty) {
      types = types.filter(o => o.value !== 'esci');
    }
    return types;
  }, [isSpecialFaculty]);

  const availableClassifications = useMemo(() => {
    let options = journalClassificationOptions;
    if (isPhdScholar) {
      options = options.filter(o => o.value === 'Q1' || o.value === 'Q2');
    }
    // Only filter for WoS if it's a special faculty, not for 'both'
    if (isSpecialFaculty && indexType === "wos") {
      options = options.filter((o) => o.value === "Q1" || o.value === "Q2");
    }
    return options;
  }, [isSpecialFaculty, indexType, isPhdScholar]);

  const watchAuthors = form.watch('authors');
  const firstAuthorExists = useMemo(() =>
    watchAuthors.some(author => author.role === 'First Author' || author.role === 'First & Corresponding Author'),
    [watchAuthors]
  );

  const presentingAuthorExists = useMemo(() =>
    watchAuthors.some(author => author.role === 'Presenting Author' || author.role === 'First & Presenting Author'),
    [watchAuthors]
  );

  const getAvailableRoles = (currentAuthor?: Author) => {
    const isCurrentAuthorFirst = currentAuthor && (currentAuthor.role === 'First Author' || currentAuthor.role === 'First & Corresponding Author');
    if (firstAuthorExists && !isCurrentAuthorFirst) {
      return coAuthorRoles.filter(role => role !== 'First Author' && role !== 'First & Corresponding Author');
    }
    return coAuthorRoles;
  };

  useEffect(() => {
    const currentClassification = form.getValues("journalClassification")
    if (currentClassification && !availableClassifications.find((o) => o.value === currentClassification)) {
      form.setValue("journalClassification", undefined, { shouldValidate: true })
    }
  }, [availableClassifications, form])

  useEffect(() => {
    const currentIndexType = form.getValues("indexType")
    if (currentIndexType && !availableIndexTypes.find((o) => o.value === currentIndexType)) {
      form.setValue("indexType", undefined, { shouldValidate: true })
    }
  }, [availableIndexTypes, form])

  useEffect(() => {
    if (publicationType === 'Scopus Indexed Conference Proceedings') {
      form.setValue('journalClassification', undefined);
    }
  }, [publicationType, form]);

  const handleFetchData = async (source: 'scopus' | 'wos' | 'sciencedirect') => {
    const doi = form.getValues('doi');
    const wosId = form.getValues('wosAccessionNumber');
    let identifier = source === 'wos' ? (wosId || doi) : doi;

    if (!identifier) {
      toast({ variant: 'destructive', title: 'No Identifier Provided', description: `Please enter a DOI${source === 'wos' ? ' or WoS Accession Number' : ''} to fetch data.` });
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
        result = await fetchScopusDataByUrl(identifier, user.name, user.uid);
      } else if (source === 'wos') {
        result = await fetchWosDataByUrl(identifier, user.name, user.uid);
        if (!result.success) {
          setShowWosAccession(true); // Show fallback on failure
        }
      } else {
        result = await fetchScienceDirectData(identifier, user.name, user.uid);
      }

      if (result.success && result.data) {
        const autoFetched: (keyof ResearchPaperFormValues)[] = [];

        Object.entries(result.data).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            form.setValue(key as keyof ResearchPaperFormValues, value, { shouldValidate: true });
            autoFetched.push(key as keyof ResearchPaperFormValues);
          }
        });

        form.setValue('autoFetchedFields', autoFetched);

        toast({ title: 'Success', description: `Form fields have been pre-filled from ${source.toUpperCase()}.` });

        if ('warning' in result && result.warning) {
          toast({
            variant: 'default',
            title: 'Heads Up',
            description: result.warning,
            duration: 7000,
          });
        }

      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.error || `Failed to fetch data from ${source.toUpperCase()}.` });
        if (source === 'wos') {
          setShowWosAccession(true);
        }
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'An unexpected error occurred.' });
      if (source === 'wos') {
        setShowWosAccession(true);
      }
    } finally {
      setIsFetching(false);
    }
  };



  const removeAuthor = (index: number) => {
    const authorToRemove = fields[index];
    if (authorToRemove.email === user?.email) {
      toast({ variant: 'destructive', title: 'Action not allowed', description: 'You cannot remove yourself as the primary author.' });
      return;
    }
    remove(index);
  };

  const updateAuthorRole = (index: number, role: Author['role']) => {
    const currentAuthors = form.getValues('authors');
    const author = currentAuthors[index];
    const isTryingToBeFirst = role === 'First Author' || role === 'First & Corresponding Author';
    const isAnotherFirst = currentAuthors.some((a, i) => i !== index && (a.role === 'First Author' || a.role === 'First & Corresponding Author'));

    if (isTryingToBeFirst && isAnotherFirst) {
      toast({ title: 'Conflict', description: 'Another author is already the First Author.', variant: 'destructive' });
      return;
    }

    // Auto-fill author position if applicant is made First Author
    if (author.email === user?.email && isTryingToBeFirst) {
      form.setValue('authorPosition', '1st');
    }

    update(index, { ...author, role });
  };

  const checkDuplicateClaim = async (doi: string) => {
    console.log("🔍 [Client] checkDuplicateClaim triggered with DOI:", doi);
    if (!doi) {
      console.log("🔍 [Client] Missing DOI, skipping check.");
      return { isDuplicate: false };
    }

    try {
      const claimId = searchParams.get("claimId");
      console.log("🔍 [Client] Current claimId (from URL):", claimId);
      console.log("🔍 [Client] Logged in user UID:", user?.uid);

      console.log("🔍 [Client] Invoking server action checkDuplicateResearchPaperClaimAction...");
      const result = await checkDuplicateResearchPaperClaimAction(
        doi,
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

  async function handleSave(status: "Draft" | "Pending") {
    const claimId = searchParams.get('claimId');
    if (status === 'Draft' && !form.getValues('paperTitle')) {
      toast({
        variant: 'destructive',
        title: 'Title Required',
        description: 'Please enter a paper title before saving a draft.',
      });
      return;
    }

    if (status === 'Pending') {
      const isValid = await form.trigger();
      if (!isValid) {
        toast({
          variant: 'destructive',
          title: 'Validation Error',
          description: 'Please correct the errors before submitting.',
        });
        return;
      }
    }

    if (!user || !user.faculty) {
      toast({ variant: "destructive", title: "Error", description: "User information not found. Please log in again." })
      return
    }
    if (status === "Pending" && (!user.bankDetails || !user.orcidId || !user.misId)) {
      toast({
        variant: "destructive",
        title: "Profile Incomplete",
        description: "Please add your bank details, ORCID iD, and MIS ID in Settings before submitting a claim.",
      })
      return
    }

    const doi = form.getValues("doi");
    setIsSubmitting(true);
    const dup = await checkDuplicateClaim(doi || "");
    if (dup && dup.isDuplicate) {
      setIsSubmitting(false);
      form.setError("doi", {
        type: "custom",
        message: `${dup.appliedBy} has already applied for the incentive claim for this paper DOI.`
      });
      toast({
        variant: "destructive",
        title: "Duplicate Claim Error",
        description: `${dup.appliedBy} has already applied for the incentive claim for this paper DOI.`,
      });
      return;
    }

    try {
      const data = form.getValues()

      const publicationProofFiles = data.publicationProof ? Array.from(data.publicationProof as FileList) : [];

      if (status === 'Pending' && publicationProofFiles.length === 0 && !claimId) {
        form.setError('publicationProof', { type: 'manual', message: 'Proof of publication is required for submission.' });
        setIsSubmitting(false);
        return;
      }

      const publicationProofUrls = await Promise.all(
        publicationProofFiles.map(async (file, index) => {
          const path = `incentive-proofs/${user.uid}/publication-proof/${new Date().toISOString()}-${index}-${file.name}`;
          const result = await uploadFileToApi(file, { path });
          if (!result.success || !result.url) {
            throw new Error(result.error || `Failed to upload file ${file.name}`);
          }
          return result.url;
        })
      );

      const { publicationProof, ...restOfData } = data;

      const claimData: Omit<IncentiveClaim, 'id' | 'claimId'> = {
        ...restOfData,
        publicationProofUrls,
        calculatedIncentive: calculatedIncentive ?? undefined,
        misId: user.misId || undefined,
        orcidId: user.orcidId || undefined,
        claimType: "Research Papers",
        benefitMode: "incentives",
        uid: user.uid,
        userName: user.name,
        userEmail: user.email,
        faculty: user.faculty,
        status,
        submissionDate: new Date().toISOString(),
        bankDetails: user.bankDetails || undefined,
        autoFetchedFields: data.autoFetchedFields as any,
        authorType: data.authors.find(a => a.email.toLowerCase() === user.email.toLowerCase())?.role || 'Co-Author',
      };

      const result = await submitIncentiveClaimViaApi(claimData, claimId || undefined);

      if (!result.success) {
        throw new Error(result.error)
      }

      const newClaimId = result.claimId;

      if (status === "Draft") {
        toast({ title: "Draft Saved!", description: "You can continue editing from the 'Incentive Claim' page." })
        if (!claimId) { // Only redirect if it's a new draft
          router.push(`/dashboard/incentive-claim/research-paper?claimId=${newClaimId}`);
        }
      } else {
        toast({ title: "Success", description: "Your incentive claim has been submitted." })
        router.push("/dashboard/incentive-claim")
      }
    } catch (error: any) {
      console.error("Error submitting claim: ", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to submit claim. Please try again.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleProceedToReview = async () => {
    const isValid = await form.trigger();
    if (isValid) {
      const doi = form.getValues("doi");
      setIsSubmitting(true);
      const dup = await checkDuplicateClaim(doi || "");
      setIsSubmitting(false);

      if (dup && dup.isDuplicate) {
        form.setError("doi", {
          type: "custom",
          message: `${dup.appliedBy} has already applied for the incentive claim for this paper DOI.`
        });
        toast({
          variant: "destructive",
          title: "Duplicate Claim Error",
          description: `${dup.appliedBy} has already applied for the incentive claim for this paper DOI.`,
        });
        return;
      }
      setCurrentStep(2);
    } else {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Please correct the errors on the form before proceeding.',
      });
    }
  };

  const onFinalSubmit = () => handleSave('Pending');

  if (isLoadingDraft || !user) {
    return (
      <Card className="p-8 flex justify-center items-center h-64">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground">Loading session details...</p>
        </div>
      </Card>
    );
  }

  if (currentStep === 2) {
    return (
      <div className="w-full max-w-5xl mx-auto pb-20 animate-in fade-in duration-700">
        <form onSubmit={form.handleSubmit(onFinalSubmit)}>
          <ReviewDetails data={form.getValues()} onEdit={() => setCurrentStep(1)} calculatedIncentive={calculatedIncentive} user={user} />
          <div className="max-w-4xl mx-auto mt-10 flex flex-col md:flex-row items-center justify-between gap-6 bg-card p-8 rounded-[2.5rem] border shadow-xl border-primary/10">
            <div className="space-y-1 text-center md:text-left">
              <p className="text-sm font-bold text-muted-foreground">Ready to submit?</p>
              <p className="text-[10px] text-muted-foreground/60 max-w-[200px]">By submitting, you confirm all details are accurate.</p>
            </div>
            <Button type="submit" size="lg" disabled={isSubmitting || bankDetailsMissing || orcidOrMisIdMissing} className="w-full md:w-auto rounded-2xl h-16 px-12 font-black shadow-2xl shadow-primary/20 hover:shadow-primary/40 transition-all hover:scale-[1.02] active:scale-[0.98] text-xl group">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-3 h-6 w-6 animate-spin" />
                  Finalizing...
                </>
              ) : (
                <>
                  Submit Application <CheckCircle2 className="ml-3 h-6 w-6 group-hover:rotate-12 transition-transform" />
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto pb-20">
      <Card className="shadow-2xl border-t-4 border-t-primary overflow-hidden">
        <CardHeader className="bg-primary/5 pb-8">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-3xl font-bold tracking-tight text-primary">Research Paper Incentive Claim</CardTitle>
              <CardDescription className="text-base text-muted-foreground/80">Submit your application for incentive claim on high-impact research publications.</CardDescription>
            </div>
            <div className="bg-primary/10 p-3 rounded-2xl hidden md:block">
              <FileText className="h-10 w-10 text-primary" />
            </div>
          </div>
        </CardHeader>

        <Form {...form}>
          <form className="space-y-0">
            <CardContent className="space-y-10 pt-8 bg-card">
              {(bankDetailsMissing || orcidOrMisIdMissing) && (
                <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive rounded-xl ring-1 ring-destructive/10">
                  <AlertCircle className="h-5 w-5" />
                  <AlertTitle className="font-bold">Action Required: Profile Incomplete</AlertTitle>
                  <AlertDescription className="mt-1">
                    Please add your {bankDetailsMissing && "bank details"}{bankDetailsMissing && orcidOrMisIdMissing && " and "}{orcidOrMisIdMissing && "ORCID iD / MIS ID"} in <Link href="/dashboard/settings" className="font-extrabold underline hover:text-destructive/80 transition-colors">Settings</Link> before submitting.
                  </AlertDescription>
                </Alert>
              )}

              {isPhdScholar && (
                <Alert className="bg-primary/5 border-primary/20 text-primary rounded-xl">
                  <Info className="h-5 w-5" />
                  <AlertTitle className="font-bold">Ph.D. Scholar Policy</AlertTitle>
                  <AlertDescription>
                    As a Ph.D. Scholar, you are eligible for incentives only for publications in Q1 or Q2 journals.
                  </AlertDescription>
                </Alert>
              )}

              <section className="space-y-6">
                <div className="flex items-center gap-2 text-primary font-bold text-lg mb-4">
                  <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                  Publication Type
                </div>

                <FormField
                  control={form.control}
                  name="publicationType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">Type of Publication</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
                        <FormControl>
                          <SelectTrigger className="h-12 text-lg shadow-sm focus:ring-primary rounded-xl">
                            <SelectValue placeholder="Select publication type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="rounded-xl">
                          {publicationTypes.map((o) => (
                            <SelectItem key={o} value={o}>
                              {o}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>

              <Separator />

              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-primary font-bold text-lg">
                    <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                    Article Identification
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">Step 1 of 2</Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="indexType"
                      render={({ field }) => (
                        <FormItem className="space-y-3">
                          <FormLabel className="text-base font-semibold">Indexing / Listing Status</FormLabel>
                          <FormControl>
                            <div>
                              <RadioGroup
                                onValueChange={field.onChange}
                                value={field.value}
                                className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2"
                              >
                                {availableIndexTypes.map((option) => (
                                  <Label
                                    key={option.value}
                                    htmlFor={option.value}
                                    className="flex items-center space-x-3 bg-muted/30 px-3 py-3 rounded-xl border hover:bg-muted transition-all cursor-pointer [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5 shadow-sm"
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
                  </div>

                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="doi"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base font-semibold">DOI (Digital Object Identifier)</FormLabel>
                          <FormControl>
                            <div className="flex gap-2">
                              <Input
                                placeholder="e.g. 10.1145/334252.334253"
                                {...field}
                                onBlur={async (e) => {
                                  field.onBlur();
                                  const doi = e.target.value;
                                  if (doi) {
                                    const dup = await checkDuplicateClaim(doi);
                                    if (dup && dup.isDuplicate) {
                                      form.setError("doi", {
                                        type: "custom",
                                        message: `${dup.appliedBy} has already applied for the incentive claim for this paper DOI.`
                                      });
                                      toast({
                                        variant: "destructive",
                                        title: "Duplicate Claim Error",
                                        description: `${dup.appliedBy} has already applied for the incentive claim for this paper DOI.`
                                      });
                                    } else {
                                      form.clearErrors("doi");
                                    }
                                  }
                                }}
                                disabled={isSubmitting || isFetching}
                                className="h-12 shadow-sm focus-visible:ring-primary rounded-xl"
                              />
                              <div className="flex gap-1">
                                {(!indexType || indexType === 'scopus' || indexType === 'both' || indexType === 'sci') && systemSettings?.apiIntegrations?.scopus !== false && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-12 px-3 hover:bg-primary/10 transition-colors rounded-xl font-bold"
                                    onClick={() => handleFetchData('scopus')}
                                    disabled={isSubmitting || isFetching || !form.getValues('doi')}
                                  >
                                    Scopus
                                  </Button>
                                )}
                                {(!indexType || indexType === 'wos' || indexType === 'both' || indexType === 'sci') && systemSettings?.apiIntegrations?.wos !== false && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-12 px-3 hover:bg-primary/10 transition-colors rounded-xl font-bold"
                                    onClick={() => handleFetchData('wos')}
                                    disabled={isSubmitting || isFetching || !form.getValues('doi')}
                                  >
                                    WoS
                                  </Button>
                                )}
                              </div>
                            </div>
                          </FormControl>
                          <FormDescription className="text-xs">Primary way we verify publication details.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {(indexType === 'wos' || indexType === 'both' || showWosAccession) && (
                      <FormField
                        control={form.control}
                        name="wosAccessionNumber"
                        render={({ field }) => (
                          <FormItem className="animate-in slide-in-from-top-2">
                            <FormLabel className="text-base font-semibold text-primary">WoS Accession Number (Mandatory)</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g. WOS:000123456700001"
                                {...field}
                                disabled={isSubmitting || isFetching}
                                className="h-12 shadow-sm border-primary/30 focus-visible:ring-primary rounded-xl"
                              />
                            </FormControl>
                            <FormDescription className="text-xs">Unique identifier for your paper in the Web of Science Core Collection.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="paperTitle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">Title of the Research Paper</FormLabel>
                      <FormControl>
                        <div className="space-y-3">
                          <Textarea
                            placeholder="Full title as published"
                            {...field}
                            disabled={isSubmitting}
                            className="min-h-[80px] text-lg shadow-sm rounded-xl focus-visible:ring-primary font-medium"
                          />
                          {field.value && (field.value.includes('<sub>') || field.value.includes('<sup>')) && (
                            <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 animate-in fade-in slide-in-from-top-1">
                              <p className="text-[10px] font-black uppercase tracking-widest text-primary/70 mb-1.5 flex items-center gap-2">
                                <Bot className="h-3 w-3" /> Title Preview
                              </p>
                              <div className="text-sm font-bold leading-tight text-foreground/80" dangerouslySetInnerHTML={{ __html: field.value }} />
                            </div>
                          )}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>

              <Separator />

              <section className="space-y-6">
                <div className="flex items-center gap-2 text-primary font-bold text-lg mb-4">
                  <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                  Journal & Publication Information
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="journalName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">Journal/Proceedings Name</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Full name of journal"
                            {...field}
                            disabled={isSubmitting}
                            className="h-12 shadow-sm rounded-xl"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="journalWebsite"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">Official Website</FormLabel>
                        <FormControl>
                          <Input placeholder="https://..." {...field} disabled={isSubmitting} className="h-12 shadow-sm rounded-xl" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="printIssn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-semibold">Print ISSN</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 1234-5678" {...field} className="h-10 shadow-sm rounded-lg" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="electronicIssn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-semibold">e-ISSN</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 8765-4321" {...field} className="h-10 shadow-sm rounded-lg" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="publicationMonth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-semibold">Month</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-10 shadow-sm rounded-lg">
                              <SelectValue placeholder="Select month" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="rounded-xl">
                            {months.map((m) => (
                              <SelectItem key={m} value={m}>{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="publicationYear"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-semibold">Year</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-10 shadow-sm rounded-lg">
                              <SelectValue placeholder="Select year" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="rounded-xl">
                            {years.map((y) => (
                              <SelectItem key={y} value={y}>{y}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="locale"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel className="text-sm font-semibold">Publication Locale</FormLabel>
                        <FormControl>
                          <div>
                            <RadioGroup
                              onValueChange={field.onChange}
                              value={field.value}
                              className="flex items-center space-x-6 h-10"
                            >
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="National" id="locale-national" />
                                <Label htmlFor="locale-national" className="font-normal">National</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="International" id="locale-international" />
                                <Label htmlFor="locale-international" className="font-normal">International</Label>
                              </div>
                            </RadioGroup>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-4 pt-2">
                  {indexType === 'other' && (
                    <FormField
                      control={form.control}
                      name="relevantLink"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-semibold text-primary">Article Link (Mandatory for 'Other')</FormLabel>
                          <FormControl>
                            <Input placeholder="https://www.journal.com/article/123" {...field} disabled={isSubmitting} className="h-10 border-primary/30 shadow-sm transition-all focus-visible:ring-primary rounded-lg" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {(indexType === 'scopus' || indexType === 'both') && (
                    <FormField
                      control={form.control}
                      name="scopusLink"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-semibold">Scopus URL</FormLabel>
                          <FormControl>
                            <Input placeholder="https://www.scopus.com/pages/publications/..." {...field} disabled={isSubmitting} className="h-10 shadow-sm rounded-lg" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {(indexType === 'wos' || indexType === 'both') && (
                    <FormField
                      control={form.control}
                      name="wosLink"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-semibold">Web of Science URL</FormLabel>
                          <FormControl>
                            <Input placeholder="https://www.webofscience.com/wos/woscc/full-record/WOS:..." {...field} disabled={isSubmitting} className="h-10 shadow-sm rounded-lg" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                {(indexType === 'scopus' || indexType === 'wos' || indexType === 'both' || indexType === 'sci') && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {(indexType === 'wos' || indexType === 'both') && (
                      <FormField
                        control={form.control}
                        name="wosType"
                        render={({ field }) => (
                          <FormItem className="space-y-3">
                            <FormLabel className="text-base font-semibold">Web of Science Type</FormLabel>
                            <FormControl>
                              <RadioGroup
                                onValueChange={field.onChange}
                                value={field.value}
                                className="flex flex-wrap gap-3 mt-2"
                                disabled={isSubmitting}
                              >
                                {wosTypeOptions.map((option) => (
                                  <Label
                                    key={option.value}
                                    htmlFor={`wos-${option.value}`}
                                    className="flex items-center space-x-2 bg-muted/30 px-4 py-2.5 rounded-xl border hover:bg-muted cursor-pointer [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5 shadow-sm transition-all whitespace-nowrap"
                                  >
                                    <RadioGroupItem value={option.value} id={`wos-${option.value}`} />
                                    <span className="font-medium text-xs">{option.label}</span>
                                  </Label>
                                ))}
                              </RadioGroup>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {publicationType !== 'Scopus Indexed Conference Proceedings' && (
                       <FormField
                        control={form.control}
                        name="journalClassification"
                        render={({ field }) => (
                          <FormItem className="space-y-3">
                            <FormLabel className="text-base font-semibold">Classification (Q-rating)</FormLabel>
                            <FormControl>
                              <div>
                                <RadioGroup
                                  onValueChange={field.onChange}
                                  value={field.value}
                                  className="flex flex-wrap sm:flex-nowrap gap-1.5 mt-2"
                                  disabled={isSubmitting}
                                >
                                  {availableClassifications.map((option) => (
                                    <Label 
                                      key={option.value}
                                      htmlFor={`q-${option.value}`} 
                                      className="flex items-center space-x-1.5 bg-muted/30 px-3 py-2 rounded-lg border hover:bg-muted cursor-pointer [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5 shadow-sm transition-all whitespace-nowrap"
                                    >
                                      <RadioGroupItem value={option.value} id={`q-${option.value}`} />
                                      <span className="font-medium text-[11px]">{option.label}</span>
                                    </Label>
                                  ))}
                                </RadioGroup>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                )}
              </section>

              <Separator />

              <section className="space-y-6">
                <div className="flex items-center gap-2 text-primary font-bold text-lg mb-4">
                  <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                  Authorship & Disclosure
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
                    {fields.map((field, index) => (
                      <div key={field.id} className="flex flex-col md:flex-row items-start md:items-center gap-4 bg-background p-4 rounded-xl border shadow-sm animate-in slide-in-from-left-2">
                        <div className="flex-1 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-sm">{field.name}</p>
                            {field.isExternal && <Badge variant="outline" className="text-[9px] h-4">External</Badge>}
                            {field.email.toLowerCase() === user?.email.toLowerCase() && <Badge variant="secondary" className="text-[9px] h-4 bg-primary/10 text-primary border-none">You</Badge>}
                            {publicationType === 'Scopus Indexed Conference Proceedings' && field.role === 'Co-Author' && (
                              <Badge variant="outline" className="text-[8px] h-3.5 bg-yellow-50 text-yellow-700 border-yellow-200 uppercase font-black tracking-tighter">Ineligible to Claim</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{field.email}</p>
                        </div>
                        <div className="flex items-center gap-3 w-full md:w-auto">
                          <Select onValueChange={(value) => updateAuthorRole(index, value as Author['role'])} value={field.role}>
                            <SelectTrigger className="h-10 w-full md:w-[220px] rounded-lg text-xs font-semibold shadow-sm">
                              <SelectValue placeholder="Role" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              {getAvailableRoles(form.getValues(`authors.${index}`)).map(role => (
                                <SelectItem key={role} value={role} className="text-xs">{role}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {field.email.toLowerCase() !== user?.email.toLowerCase() && (
                            <Button variant="ghost" size="icon" onClick={() => removeAuthor(index)} className="text-destructive hover:bg-destructive/10 h-10 w-10">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <AuthorSearch
                    authors={fields}
                    onAdd={(author) => append(author)}
                    availableRoles={getAvailableRoles()}
                    currentUserEmail={user?.email}
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
                            {authorPositions.map((pos) => (
                              <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isPuNameInPublication"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-xl border border-primary/10 bg-primary/5 p-4 shadow-sm hover:bg-primary/10 transition-all">
                        <div className="space-y-0.5">
                          <FormLabel className="text-sm font-bold">PU Affiliation Present?</FormLabel>
                          <FormDescription className="text-[10px]">Is "Parul University Goa" mentioned?</FormDescription>
                        </div>
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </section>

              {indexType !== 'other' && calculatedIncentive !== null && (
                <Alert className="bg-primary/5 border-primary/20 py-6 rounded-3xl transition-all animate-in zoom-in-95 border-l-4 border-l-primary shadow-sm hover:shadow-md">
                  <div className="flex flex-col gap-1.5 relative">
                    <p className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Estimated Incentive Amount
                    </p>
                    <h4 className="text-4xl font-black text-foreground tracking-tight py-1">
                      ₹{calculatedIncentive.toLocaleString('en-IN')}
                    </h4>
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
                          {getPaperLogicBreakdown(form.getValues()).map((step, idx) => (
                            <div key={idx} className="flex justify-between items-center py-1 border-b last:border-0 border-muted">
                              <span className="text-muted-foreground">{step.label}</span>
                              <span className={idx === 4 ? "font-bold text-green-600" : "font-semibold"}>{step.value}</span>
                            </div>
                          ))}
                          <div className="text-[9px] text-muted-foreground italic mt-2 !pt-2 text-center border-t border-muted opacity-70">
                            *Logic matches official policy matrix evaluated by approvers during technical audit. If author position &gt; 5th, final eligible amount is ₹0.
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </Alert>
              )}

              <Separator />

              <section className="space-y-6">
                <div className="flex items-center gap-2 text-primary font-bold text-lg mb-4">
                  <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                  Student Details & SDG Goals
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="totalPuStudentAuthors"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-semibold">No. of Student Authors (PU)</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} min="0" className="h-10 shadow-sm rounded-lg" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="puStudentNames"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-semibold">Student Name(s)</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Comma separated..." {...field} className="min-h-[40px] shadow-sm rounded-lg" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="sdgGoals"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-semibold">Select SDG Goals</FormLabel>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" className="w-full justify-between h-10 font-medium shadow-sm rounded-lg">
                            {field.value?.length > 0 ? (
                              <Badge variant="secondary" className="px-2 py-0 text-xs">{field.value.length} selected</Badge>
                            ) : "Select goals"}
                            <ChevronDown className="h-4 w-4 opacity-50" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] max-h-64 overflow-y-auto rounded-xl">
                          <DropdownMenuLabel className="text-[10px] uppercase font-bold text-muted-foreground p-3">Sustainable Development Goals</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {sdgGoalsList.map((goal) => (
                            <DropdownMenuCheckboxItem
                              key={goal}
                              checked={field.value?.includes(goal)}
                              onCheckedChange={(checked) => {
                                return checked
                                  ? field.onChange([...(field.value || []), goal])
                                  : field.onChange(field.value?.filter((value) => value !== goal))
                              }}
                              className="text-xs py-2"
                              onSelect={(e) => e.preventDefault()}
                            >
                              {goal}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>

              <Separator />

              <section className="space-y-6">
                <div className="flex items-center gap-2 text-primary font-bold text-lg mb-4">
                  <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                  Documentation & Proof
                </div>

                <FormField
                  control={form.control}
                  name="publicationProof"
                  render={({ field: { onChange, value, ...rest } }) => (
                    <FormItem className="space-y-3">
                      <FormLabel className="text-base font-semibold text-primary">Upload Proof (PDF)</FormLabel>
                      <FormControl>
                        <div className="relative flex flex-col items-center justify-center p-8 border-2 border-dashed border-primary/20 rounded-2xl bg-muted/20 hover:bg-muted/30 transition-all cursor-pointer group">
                          <FileText className="h-12 w-12 text-primary/40 group-hover:text-primary transition-colors mb-2" />
                          <p className="text-sm font-bold text-primary mb-1">Click or drag to upload PDF</p>
                          <p className="text-[10px] text-muted-foreground">Select the published paper (Max 10MB)</p>
                          <input
                            key={(value as FileList)?.[0]?.name || 'empty-upload'}
                            type="file"
                            accept=".pdf"
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            onChange={(e) => onChange(e.target.files)}
                            {...rest}
                          />
                        </div>
                      </FormControl>
                      {value && (value as FileList).length > 0 && (
                        <div className="flex items-center gap-2 text-xs font-bold text-green-700 bg-green-50 p-2 rounded-lg border border-green-200 mt-3 relative pr-8 animate-in fade-in duration-300">
                          <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate flex-1">{(value as FileList)[0].name} successfully selected</span>
                          <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 text-green-700/60 hover:text-green-700 hover:bg-green-100/50" onClick={(e) => { e.preventDefault(); onChange(undefined); }}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>
            </CardContent>

            <CardFooter className="flex flex-col md:flex-row justify-between items-center p-8 bg-muted/10 border-t gap-4">
              <div className="flex items-center gap-2 w-full md:w-auto">
                <Button variant="ghost" type="button" onClick={() => router.back()} className="flex-1 md:flex-none rounded-xl h-12 font-semibold hover:bg-muted">Cancel</Button>
                <Button variant="outline" type="button" onClick={() => handleSave('Draft')} disabled={isSubmitting} className="flex-1 md:flex-none rounded-xl h-12 border-primary/30 text-primary hover:bg-primary/5">Save for later</Button>
              </div>
              <Button type="button" size="lg" onClick={handleProceedToReview} disabled={isSubmitting || bankDetailsMissing || orcidOrMisIdMissing} className="w-full md:w-auto rounded-xl h-12 px-12 font-black shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all">
                Review Application
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  )
}
