

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
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useToast } from '@/hooks/use-toast'
import { db } from '@/lib/config'
import { collection, doc, getDoc, setDoc } from 'firebase/firestore'
import type { User, IncentiveClaim, Author } from '@/types'
import { uploadFileToApi } from '@/lib/upload-client'
import { fetchAdvancedScopusData } from "@/app/scopus-actions";
import { fetchWosDataByUrl } from "@/app/wos-actions";
import { fetchScienceDirectData } from "@/app/sciencedirect-actions";
import { Loader2, AlertCircle, Bot, ChevronDown, Trash2, Plus, Search, UserPlus, Edit, Info } from 'lucide-react'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { Badge } from "../ui/badge"
import { findUserByMisId } from "@/app/userfinding"
import { isEligibleForFinancialDisbursement } from "@/lib/incentive-eligibility"


const MAX_FILES = 10
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ACCEPTED_FILE_TYPES = ["application/pdf"]

const researchPaperSchema = z
  .object({
    publicationType: z.string({ required_error: "Please select a publication type." }),
    indexType: z.enum(["wos", "scopus", "both", "sci", "other"]).optional(),
    doi: z.string().optional().or(z.literal('')),
    wosAccessionNumber: z.string().optional().or(z.literal('')),
    relevantLink: z.string().optional().or(z.literal('')),
    scopusLink: z.string().url("Please enter a valid URL.").optional().or(z.literal("")),
    wosLink: z.string().url("Please enter a valid URL.").optional().or(z.literal("")),
    journalClassification: z.enum(["Q1", "Q2", "Q3", "Q4", "Nature/Science/Lancet", "Top 1% Journals"], { required_error: 'Journal Classification (Q-rating) is required for Scopus/WoS indexed papers.' }),
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
      if (data.publicationType === 'Scopus Indexed Conference Proceedings') {
        const presentingAuthors = data.authors.filter(author => author.role === 'Presenting Author' || author.role === 'First & Presenting Author');
        return presentingAuthors.length <= 1;
      }
      return true;
    },
    { message: "Only one author can be the Presenting Author for a conference proceeding.", path: ["authors"] }
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
const conferenceAuthorRoles: Author['role'][] = ['Presenting Author', 'First & Presenting Author', 'Co-Author'];

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
  { value: 'other', label: 'Other'},
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
const years = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString())

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

function ReviewDetails({ data, onEdit }: { data: ResearchPaperFormValues; onEdit: () => void }) {
    const renderDetail = (label: string, value?: string | number | boolean | string[] | Author[]) => {
        if (!value && value !== 0 && value !== false) return null;
        
        let displayValue: React.ReactNode = String(value);
        if (typeof value === 'boolean') {
            displayValue = value ? 'Yes' : 'No';
        }
        if (Array.isArray(value)) {
            if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null && 'name' in value[0]) {
                 displayValue = (
                    <div className="border rounded-lg overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Author Name</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Email</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(value as Author[]).map((author, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell>{author.name}</TableCell>
                                        <TableCell><Badge variant="secondary">{author.role}</Badge></TableCell>
                                        <TableCell>{author.email}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                );
            } else {
                displayValue = (value as string[]).join(', ');
            }
        }

        return (
            <div className="grid grid-cols-3 gap-2 py-1.5 items-start">
                <dt className="font-semibold text-muted-foreground col-span-1">{label}</dt>
                <dd className="col-span-2">{displayValue}</dd>
            </div>
        );
    };

    const fileList = data.publicationProof ? Array.from(data.publicationProof as FileList).map(f => f.name).join(', ') : 'No file selected';

    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>Review Your Application</CardTitle>
                        <CardDescription>Please review the details below before final submission.</CardDescription>
                    </div>
                    <Button variant="outline" onClick={onEdit}><Edit className="h-4 w-4 mr-2" /> Edit</Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {renderDetail("Publication Type", data.publicationType)}
                {renderDetail("Indexing Status", data.indexType)}
                {renderDetail("Paper Title", data.paperTitle)}
                {renderDetail("Authors", data.authors)}
                {renderDetail("Journal Name", data.journalName)}
                {renderDetail("Journal Website", data.journalWebsite)}
                {renderDetail("DOI", data.doi)}
                {renderDetail("WoS Accession No.", data.wosAccessionNumber)}
                {renderDetail("Article Link", data.relevantLink)}
                {renderDetail("Scopus URL", data.scopusLink)}
                {renderDetail("WoS URL", data.wosLink)}
                {renderDetail("Journal Classification", data.journalClassification)}
                {renderDetail("WoS Type", data.wosType)}
                {renderDetail("Locale", data.locale)}
                {renderDetail("Print ISSN", data.printIssn)}
                {renderDetail("Electronic ISSN", data.electronicIssn)}
                {renderDetail("Publication Month/Year", `${data.publicationMonth}, ${data.publicationYear}`)}
                {renderDetail("Your Author Position", data.authorPosition)}
                {renderDetail("PU Name in Publication", data.isPuNameInPublication)}
                {renderDetail("APC Paid by University", data.wasApcPaidByUniversity)}
                {renderDetail("Total PU Student Authors", data.totalPuStudentAuthors)}
                {renderDetail("PU Student Names", data.puStudentNames)}
                {renderDetail("SDGs", data.sdgGoals)}
                {renderDetail("Publication Proof", fileList)}
            </CardContent>
        </Card>
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
  const [coPiSearchTerm, setCoPiSearchTerm] = useState("")
  const [foundCoPis, setFoundCoPis] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false)
  const [calculatedIncentive, setCalculatedIncentive] = useState<number | null>(null);
  const [externalAuthorName, setExternalAuthorName] = useState('');
  const [externalAuthorEmail, setExternalAuthorEmail] = useState('');
  const [externalAuthorRole, setExternalAuthorRole] = useState<Author['role']>('Co-Author');
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoadingDraft, setIsLoadingDraft] = useState(true);
  const [showWosAccession, setShowWosAccession] = useState(false);


  const form = useForm<ResearchPaperFormValues>({
    resolver: zodResolver(researchPaperSchema),
    defaultValues: {
      publicationType: '',
      indexType: undefined,
      doi: '',
      scopusLink: 'https://www.scopus.com/pages/publications/',
      wosLink: 'https://www.webofscience.com/wos/woscc/full-record/WOS:',
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
    const result = await calculateResearchPaperIncentive({ ...formValues, userEmail: user.email }, user.faculty, user.designation);
    if (result.success) {
        // Apply eligibility policy check: if co-author beyond 5th position, set to 0
        let finalAmount = result.amount ?? null;
        
        // Build claim object for eligibility check
        const claimForEligibility: Partial<IncentiveClaim> = {
          claimType: 'Research Papers',
          userEmail: user.email,
          authors: formValues.authors,
          authorType: formValues.authors.find(a => a.email.toLowerCase() === user.email.toLowerCase())?.role as any,
          authorPosition: formValues.authorPosition,
        };
        
        if (!isEligibleForFinancialDisbursement(claimForEligibility as IncentiveClaim)) {
          finalAmount = 0;
        }
        setCalculatedIncentive(finalAmount);
    } else {
        console.error("Incentive calculation failed:", result.error);
        setCalculatedIncentive(null);
    }
  }, [formValues, user]);

  useEffect(() => {
    calculate();
  }, [calculate]);


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
                const claimRef = doc(db, 'incentiveClaims', claimId);
                const claimSnap = await getDoc(claimRef);
                if (claimSnap.exists()) {
                    const draftData = claimSnap.data() as IncentiveClaim;
                    form.reset({
                        ...draftData,
                        publicationProof: undefined, // Files can't be pre-filled
                    });
                } else {
                    toast({ variant: 'destructive', title: 'Draft Not Found' });
                }
            } catch (error) {
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
    if (publicationType === 'Scopus Indexed Conference Proceedings') {
        const isCurrentAuthorPresenting = currentAuthor && (currentAuthor.role === 'Presenting Author' || currentAuthor.role === 'First & Presenting Author');
        if (presentingAuthorExists && !isCurrentAuthorPresenting) {
            return conferenceAuthorRoles.filter(role => role !== 'Presenting Author' && role !== 'First & Presenting Author');
        }
        return conferenceAuthorRoles;
    }
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
            result = await fetchAdvancedScopusData(identifier, user.name);
        } else if (source === 'wos') {
            result = await fetchWosDataByUrl(identifier, user.name);
            if (!result.success) {
                setShowWosAccession(true); // Show fallback on failure
            }
        } else {
            result = await fetchScienceDirectData(identifier, user.name);
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


  const handleSearchCoPi = async (searchTerm: string) => {
    if (searchTerm.length < 2) {
      setFoundCoPis([]);
      return;
    }
    setIsSearching(true);
    try {
        // Check if search term looks like a MIS ID (numeric or alphanumeric)
        const isMisIdSearch = /^[a-zA-Z0-9]+$/.test(searchTerm) && searchTerm.length <= 10;
        
        let url = '';
        if (isMisIdSearch) {
            url = `/api/find-users-by-name?misId=${encodeURIComponent(searchTerm)}`;
        } else {
            url = `/api/find-users-by-name?name=${encodeURIComponent(searchTerm)}`;
        }
        
        const res = await fetch(url);
        const result = await res.json();
        if (result.success && result.users) {
            setFoundCoPis(result.users);
        } else {
            setFoundCoPis([]);
        }
    } catch (error) {
        toast({ variant: "destructive", title: "Search Failed", description: "An error occurred while searching." });
    } finally {
        setIsSearching(false);
    }
  };

  const handleAddCoPi = (coPi: { uid: string; name: string; email: string; misId: string; }) => {
    if (coPi && !fields.some((field) => field.email.toLowerCase() === coPi.email.toLowerCase())) {
      if (user && coPi.email.toLowerCase() === user.email.toLowerCase()) {
        toast({ variant: "destructive", title: "Cannot Add Self", description: "You cannot add yourself again." })
        return
      }
      append({
        name: coPi.name,
        email: coPi.email,
        uid: coPi.uid,
        role: "Co-Author",
        isExternal: false,
        status: 'pending'
      })
    }
    setFoundCoPis([])
    setCoPiSearchTerm("")
  }

  const addExternalAuthor = () => {
    const name = externalAuthorName.trim();
    const email = externalAuthorEmail.trim().toLowerCase();
    if (!name) {
        toast({ title: 'Name is required for external authors', variant: 'destructive' });
        return;
    }
    if (email && fields.some(a => a.email?.toLowerCase() === email)) {
        toast({ title: 'Author already added', variant: 'destructive' });
        return;
    }
    append({ name, email: email || '', role: externalAuthorRole, isExternal: true, uid: null, status: 'pending' });
    setExternalAuthorName('');
    setExternalAuthorEmail('');
    setExternalAuthorRole('Co-Author'); // Reset role selector
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
        toast({ title: 'Conflict', description: 'Another author is already the First Author.', variant: 'destructive'});
        return;
    }
    
    // Auto-fill author position if applicant is made First Author
    if (author.email === user?.email && isTryingToBeFirst) {
        form.setValue('authorPosition', '1st');
    }

    update(index, { ...author, role });
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

    setIsSubmitting(true)
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
          calculatedIncentive,
          misId: user.misId || null,
          orcidId: user.orcidId || null,
          claimType: "Research Papers",
          benefitMode: "incentives",
          uid: user.uid,
          userName: user.name,
          userEmail: user.email,
          faculty: user.faculty,
          status,
          submissionDate: new Date().toISOString(),
          bankDetails: user.bankDetails || null,
          authorType: data.authors.find(a => a.email.toLowerCase() === user.email.toLowerCase())?.role || 'Co-Author',
      };

      const result = await submitIncentiveClaimViaApi(claimData);

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

  if (isLoadingDraft) {
    return <Card className="p-8 flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></Card>;
  }

  if (currentStep === 2) {
    return (
        <Card>
            <form onSubmit={form.handleSubmit(onFinalSubmit)}>
                <CardContent className="pt-6">
                    <ReviewDetails data={form.getValues()} onEdit={() => setCurrentStep(1)} />
                </CardContent>
                <CardFooter>
                    <Button type="submit" disabled={isSubmitting || bankDetailsMissing || orcidOrMisIdMissing}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isSubmitting ? 'Submitting...' : 'Submit Claim'}
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
  }

  return (
    <div className="w-full">
      <Card>
        <Form {...form}>
          <form>
            <CardContent className="space-y-6 pt-6">
              {(bankDetailsMissing || orcidOrMisIdMissing) && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Profile Incomplete</AlertTitle>
                  <AlertDescription>
                    An ORCID iD, MIS ID, and bank details are mandatory for submitting incentive claims. Please add them
                    to your profile.
                    <Button asChild variant="link" className="p-1 h-auto">
                      <Link href="/dashboard/settings">Go to Settings</Link>
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              {isPhdScholar && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Ph.D. Scholar Policy</AlertTitle>
                  <AlertDescription>
                    As a Ph.D. Scholar, you are eligible for incentives only for publications in Q1 or Q2 journals.
                  </AlertDescription>
                </Alert>
              )}
              <div className="space-y-6 animate-in fade-in-0">
                <h3 className="font-semibold text-sm">RESEARCH PAPER DETAILS</h3>
                
                <FormField
                  control={form.control}
                  name="indexType"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Indexing/Listing status of the Journal</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
                          className="flex flex-wrap items-center gap-x-6 gap-y-2"
                          disabled={isSubmitting}
                        >
                          {availableIndexTypes.map((option) => (
                            <FormItem key={option.value} className="flex items-center space-x-2 space-y-0">
                              <FormControl>
                                <RadioGroupItem value={option.value} />
                              </FormControl>
                              <FormLabel className="font-normal">{option.label}</FormLabel>
                            </FormItem>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 {indexType !== 'other' && (
                    <FormField
                        control={form.control}
                        name="doi"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>DOI (Digital Object Identifier)</FormLabel>
                            <div className="flex items-center gap-2">
                                <FormControl>
                                    <Input placeholder="Enter DOI (e.g., 10.1038/nature12345)" {...field} disabled={isSubmitting} />
                                </FormControl>
                                <Button type="button" variant="outline" onClick={() => handleFetchData('scopus')} disabled={isSubmitting || isFetching || !form.getValues('doi')} title="Fetch from Scopus"><Bot className="h-4 w-4" /> Scopus</Button>
                                <Button type="button" variant="outline" onClick={() => handleFetchData('wos')} disabled={isSubmitting || isFetching || !form.getValues('doi')} title="Fetch from WoS"><Bot className="h-4 w-4" /> WoS</Button>
                            </div>
                            <FormDescription>This is the primary way we fetch and verify your publication details.</FormDescription>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                 )}
                 <FormField
                  control={form.control}
                  name="paperTitle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title of the Paper published</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Enter the full title of your paper" {...field} disabled={isSubmitting} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 {(indexType === 'wos' || indexType === 'both') && showWosAccession && (
                     <FormField
                        control={form.control}
                        name="wosAccessionNumber"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Web of Science Accession Number</FormLabel>
                                <div className="flex items-center gap-2">
                                    <FormControl>
                                        <Input placeholder="e.g., WOS:000581634500008" {...field} disabled={isSubmitting} />
                                    </FormControl>
                                    <Button type="button" variant="outline" onClick={() => handleFetchData('wos')} disabled={isSubmitting || isFetching || !form.getValues('wosAccessionNumber')} title="Fetch data from Web of Science"><Bot className="h-4 w-4" /> WoS</Button>
                                </div>
                                <FormDescription>
                                  WOS URl can be found using this:{" "}
                                  <a href="https://www.webofscience.com/wos/woscc/smart-search" target="_blank" rel="noopener noreferrer" className="underline">
                                    https://www.webofscience.com/wos/woscc/smart-search
                                  </a>
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                 )}
                 {indexType === 'other' && (
                     <FormField
                        control={form.control}
                        name="relevantLink"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Link for Article</FormLabel>
                             <FormControl>
                                <Input placeholder="https://www.journal.com/article/123" {...field} disabled={isSubmitting} />
                             </FormControl>
                            <FormDescription>Please provide a direct link to the published article.</FormDescription>
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
                        <FormLabel>Scopus URL</FormLabel>
                        <FormControl>
                            <Input placeholder="https://www.scopus.com/pages/publications/" {...field} disabled={isSubmitting} />
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
                        <FormLabel>WoS URL</FormLabel>
                         <FormControl>
                            <Input placeholder="https://www.webofscience.com/wos/woscc/full-record/WOS:" {...field} disabled={isSubmitting} />
                         </FormControl>
                        <FormDescription>
                          WOS URL can be found using this:{" "}
                          <a href="https://www.webofscience.com/wos/woscc/smart-search?embedded=0" target="_blank" rel="noopener noreferrer" className="underline">
                            https://www.webofscience.com/wos/woscc/smart-search?embedded=0
                          </a>
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {(indexType === 'scopus' || indexType === 'wos' || indexType === 'both' || indexType === 'sci') && (
                    <FormField
                        control={form.control}
                        name="journalClassification"
                        render={({ field }) => (
                            <FormItem className="space-y-3">
                            <FormLabel>Journal Classification (Q-rating)</FormLabel>
                            <FormControl>
                                <RadioGroup onValueChange={field.onChange} value={field.value} className="flex flex-wrap items-center gap-x-6 gap-y-2" disabled={isSubmitting}>
                                {availableClassifications.map((option) => (<FormItem key={option.value} className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value={option.value} /></FormControl><FormLabel className="font-normal">{option.label}</FormLabel></FormItem>))}
                                </RadioGroup>
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                )}


                {(indexType === "wos" || indexType === "both") && (
                  <FormField
                    control={form.control}
                    name="wosType"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel>Type of WoS</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value}
                            className="flex items-center space-x-6"
                          >
                            <FormItem key="SCIE" className="flex items-center space-x-2 space-y-0">
                              <FormControl>
                                <RadioGroupItem value="SCIE" />
                              </FormControl>
                              <FormLabel className="font-normal">SCIE</FormLabel>
                            </FormItem>
                            <FormItem key="SSCI" className="flex items-center space-x-2 space-y-0">
                              <FormControl>
                                <RadioGroupItem value="SSCI" />
                              </FormControl>
                              <FormLabel className="font-normal">SSCI</FormLabel>
                            </FormItem>
                            <FormItem key="A&HCI" className="flex items-center space-x-2 space-y-0">
                              <FormControl>
                                <RadioGroupItem value="A&HCI" />
                              </FormControl>
                              <FormLabel className="font-normal">A&HCI</FormLabel>
                            </FormItem>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                
                <FormField
                  control={form.control}
                  name="publicationType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type of Publication</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select publication type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
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
                <FormField
                  control={form.control}
                  name="journalName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name of Journal/Proceedings</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter the full name of the journal or proceedings"
                          {...field}
                          disabled={isSubmitting}
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
                      <FormLabel>Journal Website Link</FormLabel>
                      <FormControl>
                        <Input placeholder="https://www.examplejournal.com" {...field} disabled={isSubmitting} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="locale"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Locale</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
                          className="flex items-center space-x-6"
                        >
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="National" />
                            </FormControl>
                            <FormLabel className="font-normal">National</FormLabel>
                          </FormItem>
                          <FormItem className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <RadioGroupItem value="International" />
                            </FormControl>
                            <FormLabel className="font-normal">International</FormLabel>
                          </FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="printIssn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Print ISSN</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 1234-5678" {...field} />
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
                        <FormLabel>Electronic ISSN</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 8765-4321" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="publicationMonth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Publication Month</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select month" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {months.map((m) => (
                              <SelectItem key={m} value={m}>
                                {m}
                              </SelectItem>
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
                        <FormLabel>Publication Year</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select year" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {years.map((y) => (
                              <SelectItem key={y} value={y}>
                                {y}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="space-y-4 pt-4">
                  <FormLabel>Author(s) & Roles</FormLabel>
                  {publicationType === 'Scopus Indexed Conference Proceedings' && (
                    <Alert variant="default">
                        <Info className="h-4 w-4" />
                        <AlertTitle>Conference Proceedings Policy</AlertTitle>
                        <AlertDescription>
                            Only authors with the role of 'Presenting Author' or 'First & Presenting Author' are eligible for an incentive for this publication type. Other co-authors can be added for record-keeping.
                        </AlertDescription>
                    </Alert>
                  )}
                  {fields.map((field, index) => (
                    <div
                      key={field.id}
                      className="flex flex-col md:flex-row items-start md:items-center gap-4 p-3 bg-muted/50 rounded-md"
                    >
                      <div className="flex-grow">
                        <p className="font-medium text-sm">
                          {field.name} {field.isExternal && <span className="text-xs text-muted-foreground">(External)</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{field.email}</p>
                      </div>
                      <div className="flex items-center gap-2 w-full md:w-auto">
                        <Select onValueChange={(value) => updateAuthorRole(index, value as Author['role'])} value={field.role}>
                            <SelectTrigger className="w-full md:w-[180px] h-9 text-xs"><SelectValue placeholder="Select role" /></SelectTrigger>
                            <SelectContent>{getAvailableRoles(form.getValues(`authors.${index}`)).map(role => (<SelectItem key={role} value={role}>{role}</SelectItem>))}</SelectContent>
                        </Select>
                        {field.email.toLowerCase() !== user?.email.toLowerCase() && (
                          <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeAuthor(index)}><Trash2 className="h-4 w-4" /></Button>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="space-y-4">
                    <div className="space-y-2 p-3">
                        <FormLabel className="text-sm">Add Internal Co-Author</FormLabel>
                         <div className="relative">
                            <Input
                                placeholder="Search by Co-Author's Name or MIS ID"
                                value={coPiSearchTerm}
                                onChange={(e) => {
                                    setCoPiSearchTerm(e.target.value);
                                    handleSearchCoPi(e.target.value);
                                }}
                            />
                            {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />}
                        </div>
                        {foundCoPis.length > 0 && (
                            <div className="relative">
                                <div className="absolute w-full bg-background border rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
                                    {foundCoPis.map(coPi => (
                                        <div key={coPi.uid} className="p-2 hover:bg-muted cursor-pointer" onClick={() => handleAddCoPi(coPi)}>
                                            {coPi.name} ({coPi.misId})
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                     <div className="space-y-2 p-3">
                        <FormLabel className="text-sm">Add External Co-Author</FormLabel>
                         <div className="flex flex-col md:flex-row gap-2 mt-1">
                            <Input value={externalAuthorName} onChange={(e) => setExternalAuthorName(e.target.value)} placeholder="External author's name"/>
                            <Input value={externalAuthorEmail} onChange={(e) => setExternalAuthorEmail(e.target.value)} placeholder="External author's email (optional)"/>
                            <Select value={externalAuthorRole} onValueChange={(value) => setExternalAuthorRole(value as Author['role'])}>
                                <SelectTrigger><SelectValue/></SelectTrigger>
                                <SelectContent>{getAvailableRoles(undefined).map(role => (<SelectItem key={role} value={role}>{role}</SelectItem>))}</SelectContent>
                            </Select>
                            <Button type="button" onClick={addExternalAuthor} variant="outline" size="icon" disabled={!externalAuthorName.trim()}><UserPlus className="h-4 w-4"/></Button>
                        </div>
                    </div>
                  </div>
                  <FormMessage>
                    {form.formState.errors.authors?.message || form.formState.errors.authors?.root?.message}
                  </FormMessage>
                </div>
                
                <FormField
                    control={form.control}
                    name="authorPosition"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Your Author Position</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select your position" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {authorPositions.map((pos) => (
                              <SelectItem key={pos} value={pos}>
                                {pos}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="totalPuStudentAuthors"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Total No. of Student Authors from PU</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} min="0" />
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
                        <FormLabel>Name(s) of Student Author(s)</FormLabel>
                        <FormControl>
                          <Textarea {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormField
                  control={form.control}
                  name="isPuNameInPublication"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Is "Parul University" name present in the publication?
                        </FormLabel>
                         <FormDescription>If not, the final incentive amount will be reduced by 50%.</FormDescription>
                      </div>
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="wasApcPaidByUniversity"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Was the Article Processing Charge (APC) paid by the University?
                        </FormLabel>
                         <FormDescription>If yes, the final incentive amount will be reduced by 50%.</FormDescription>
                      </div>
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {calculatedIncentive !== null && (
                    <div className={`p-4 rounded-md ${calculatedIncentive === 0 ? 'bg-yellow-100 dark:bg-yellow-900/30' : 'bg-secondary'}`}>
                        <p className="text-sm font-medium">Tentative Eligible Incentive Amount: <span className="font-bold text-lg text-primary">₹{calculatedIncentive.toLocaleString('en-IN')}</span></p>
                        {calculatedIncentive === 0 && formValues.authorPosition && ['6th', '7th', '8th', '9th', '10th'].includes(formValues.authorPosition) && (
                            (() => {
                              const userRole = formValues.authors.find(a => a.email.toLowerCase() === user?.email.toLowerCase())?.role;
                              if (userRole === 'Co-Author') {
                                return <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-2">As a co-author beyond the 5th position, this claim qualifies for ARPS score but not monetary incentive.</p>;
                              }
                              return null;
                            })()
                        )}
                        {!(calculatedIncentive === 0 && formValues.authorPosition && ['6th', '7th', '8th', '9th', '10th'].includes(formValues.authorPosition) && formValues.authors.find(a => a.email.toLowerCase() === user?.email.toLowerCase())?.role === 'Co-Author') && (
                            <p className="text-xs text-muted-foreground">This is your individual share based on the policy, publication type, and author roles.</p>
                        )}
                    </div>
                )}
                
                <FormField
                  control={form.control}
                  name="sdgGoals"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>UN Sustainable Development Goals (SDGs)</FormLabel>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" className="w-full justify-between font-normal">
                            {field.value?.length > 0 ? `${field.value.length} selected` : "Select relevant goals"}
                            <ChevronDown className="h-4 w-4 opacity-50" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] max-h-60 overflow-y-auto">
                          <DropdownMenuLabel>Select all that apply</DropdownMenuLabel>
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
                <FormField
                  control={form.control}
                  name="publicationProof"
                  render={({ field: { value, onChange, ...fieldProps } }) => (
                    <FormItem>
                      <FormLabel>
                        Attach Proof of Publication: Copy of paper, title of the paper details with PU Name. [Max 10 MB]*
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...fieldProps}
                          type="file"
                          multiple
                          onChange={(e) => onChange(e.target.files)}
                          accept="application/pdf"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleSave("Draft")}
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save as Draft
              </Button>
               <Button type="button" onClick={handleProceedToReview} disabled={isSubmitting || bankDetailsMissing || orcidOrMisIdMissing}>
                Proceed to Review
            </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  )
}
