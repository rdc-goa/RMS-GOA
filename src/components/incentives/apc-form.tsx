"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import Link from "next/link"
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { useRouter, useSearchParams } from 'next/navigation'
import { useToast } from '@/hooks/use-toast'
import { db } from '@/lib/config'
import type { User, IncentiveClaim, Author, SystemSettings } from '@/types'
import { getSystemSettings, getIncentiveClaimByIdAction } from '@/app/actions'
import { uploadFileToApi } from '@/lib/upload-client'
import { AuthorSearch } from './author-search'
import { Loader2, AlertCircle, Info, Trash2, Bot, CheckCircle2, FileText, X, Globe, ChevronDown } from 'lucide-react'
import { submitIncentiveClaimViaApi } from '@/lib/incentive-claim-client'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { calculateApcIncentive } from '@/app/incentive-calculation'
import { fetchAdvancedScopusData } from '@/app/scopus-actions'
import { fetchScienceDirectData } from '@/app/sciencedirect-actions'
import { fetchWosDataByUrl } from '@/app/wos-actions'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../ui/table'
import { Badge } from '../ui/badge'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

const authorSchema = z
  .object({
    name: z.string().min(2, 'Author name is required.'),
    email: z.string().email('Invalid email format.').or(z.literal('')),
    uid: z.string().optional().nullable(),
    role: z.enum(['First Author', 'Corresponding Author', 'Co-Author', 'First & Corresponding Author', "Presenting Author", "First & Presenting Author"]),
    isExternal: z.boolean(),
    status: z.enum(['approved', 'pending', 'Applied'])
  })
  .refine((data) => data.isExternal || !!data.email, {
    message: 'Email is required for internal authors.',
    path: ['email'],
  });

const apcSchema = z.object({
  apcTypeOfArticle: z.string({ required_error: 'Please select an article type.' }),
  apcOtherArticleType: z.string().optional(),
  apcIndexingStatus: z.array(z.string()).refine(value => value.some(item => item), { message: "You have to select at least one indexing status." }),
  apcQRating: z.enum(['Q1', 'Q2', 'Q3', 'Q4']).optional(),
  doi: z.string().optional(),
  apcWosAccessionNumber: z.string().optional().or(z.literal('')),
  apcPaperTitle: z.string().min(5, 'Paper title is required.'),
  authors: z.array(authorSchema).min(1, 'At least one author is required.')
    .refine(data => {
      const firstAuthors = data.filter(author => author.role === 'First Author' || author.role === 'First & Corresponding Author');
      return firstAuthors.length <= 1;
    }, { message: 'Only one author can be designated as the First Author.', path: ['authors'] }),
  apcTotalStudentAuthors: z.coerce.number().nonnegative("Number of students cannot be negative.").optional(),
  apcStudentNames: z.string().optional(),
  apcJournalDetails: z.string().min(5, 'Journal details are required.'),
  apcApcWaiverRequested: z.boolean().refine(val => val === true, {
    message: 'You must request an APC waiver and provide proof to be eligible.',
  }),
  apcApcWaiverProof: z.any().optional().refine(files => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, 'File must be less than 10 MB.'),
  apcJournalWebsite: z.string().url('Please enter a valid URL.').optional().or(z.literal('')),
  apcIssnNo: z.string().min(5, 'ISSN is required.'),
  apcSciImpactFactor: z.coerce.number().optional(),
  apcPublicationProof: z.any().optional().refine(files => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, 'File must be less than 10 MB.'),
  apcInvoiceProof: z.any().optional().refine(files => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, 'File must be less than 10 MB.'),
  apcReceiptProof: z.any().optional().refine(files => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, 'File must be less than 10 MB.'),
  apcPaymentProof: z.any().optional().refine(files => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, 'File must be less than 10 MB.'),
  apcAcceptanceMailProof: z.any().optional().refine(files => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, 'File must be less than 10 MB.'),
  apcPuNameInPublication: z.boolean().optional(),
  apcAmountClaimed: z.coerce.number().positive('Claimed amount must be positive.'),
  apcTotalAmount: z.coerce.number().positive('Total amount must be a positive number greater than 0.'),
  apcSelfDeclaration: z.boolean().refine(val => val === true, { message: 'You must agree to the self-declaration.' }),
  authorPosition: z.enum(['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th']).optional(),
  apcApcWaiverProofUrl: z.string().optional(),
  apcPublicationProofUrl: z.string().optional(),
  apcInvoiceProofUrl: z.string().optional(),
  apcReceiptProofUrl: z.string().optional(),
  apcPaymentProofUrl: z.string().optional(),
  apcAcceptanceMailProofUrl: z.string().optional(),
  apcScopusLink: z.string().url('Please enter a valid URL.').optional().or(z.literal('')),
}).refine(data => data.apcTypeOfArticle !== 'Other' || (!!data.apcOtherArticleType && data.apcOtherArticleType.length > 0), {
  message: 'Please specify the article type.',
  path: ['apcOtherArticleType'],
}).refine(data => {
  if (data.apcIndexingStatus.some(s => s.toLowerCase().includes('web of science'))) {
    return !!data.apcWosAccessionNumber && data.apcWosAccessionNumber.length > 0;
  }
  return true;
}, {
  message: 'Web of Science Accession Number is required when Web of Science is selected.',
  path: ['apcWosAccessionNumber'],
}).refine(data => data.apcApcWaiverProofUrl || (data.apcApcWaiverProof && data.apcApcWaiverProof.length > 0), {
  message: 'Proof of APC waiver request is required.',
  path: ['apcApcWaiverProof'],
}).refine(data => data.apcInvoiceProofUrl || (data.apcInvoiceProof && data.apcInvoiceProof.length > 0), {
  message: 'Invoice is required.',
  path: ['apcInvoiceProof'],
}).refine(data => data.apcReceiptProofUrl || (data.apcReceiptProof && data.apcReceiptProof.length > 0), {
  message: 'Receipt is required.',
  path: ['apcReceiptProof'],
}).refine(data => data.apcPaymentProofUrl || (data.apcPaymentProof && data.apcPaymentProof.length > 0), {
  message: 'Payment Proof is required.',
  path: ['apcPaymentProof'],
}).refine(data => data.apcAcceptanceMailProofUrl || (data.apcAcceptanceMailProof && data.apcAcceptanceMailProof.length > 0), {
  message: 'Acceptance mail is required.',
  path: ['apcAcceptanceMailProof'],
}).refine(data => {
  if (data.apcIndexingStatus.some(s => s.toLowerCase().includes('scopus'))) {
    return !!data.apcScopusLink && data.apcScopusLink.startsWith('http');
  }
  return true;
}, {
  message: 'Scopus Link of Publication is required when Scopus is selected.',
  path: ['apcScopusLink'],
});

type ApcFormValues = z.infer<typeof apcSchema>;

const articleTypes = ['Research Paper Publication', 'Review Article', 'Letter to Editor', 'Other'];
const coAuthorRoles: Author['role'][] = ['First Author', 'Corresponding Author', 'Co-Author', 'First & Corresponding Author'];

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

function ReviewDetails({ data, onEdit, isSubmitting, totalIncentive }: { data: ApcFormValues; onEdit: () => void; isSubmitting: boolean; totalIncentive: number | null }) {
  const apcWaiverProofFile = data.apcApcWaiverProof?.[0] as File | undefined;
  const apcInvoiceProofFile = data.apcInvoiceProof?.[0] as File | undefined;
  const apcReceiptProofFile = data.apcReceiptProof?.[0] as File | undefined;
  const apcPaymentProofFile = data.apcPaymentProof?.[0] as File | undefined;
  const apcAcceptanceMailProofFile = data.apcAcceptanceMailProof?.[0] as File | undefined;

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
          <Button variant="outline" onClick={onEdit} disabled={isSubmitting}>Edit Form</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6 text-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Article Type</p>
              <p className="font-medium text-base">{data.apcTypeOfArticle === 'Other' ? data.apcOtherArticleType : data.apcTypeOfArticle}</p>
            </div>
            <div>
              <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Indexing Status</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {data.apcIndexingStatus.map((status, i) => (
                  <Badge key={i} variant="secondary">{status}</Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Paper Title</p>
              <p className="font-medium">{data.apcPaperTitle}</p>
            </div>
            <div>
              <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Journal & ISSN</p>
              <p className="font-medium">{data.apcJournalDetails}</p>
              <p className="text-xs text-muted-foreground mt-0.5">ISSN: {data.apcIssnNo}</p>
            </div>
            {data.apcScopusLink && (
              <div>
                <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Scopus Link</p>
                <a href={data.apcScopusLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium text-xs break-all">
                  {data.apcScopusLink}
                </a>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Financial Summary</p>
              <div className="bg-muted/50 p-3 rounded-xl border space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total Paid:</span>
                  <span className="font-bold">₹{data.apcTotalAmount.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Amount Claimed:</span>
                  <span className="font-bold">₹{data.apcAmountClaimed.toLocaleString('en-IN')}</span>
                </div>
                {totalIncentive !== null && (
                  <div className="flex justify-between items-center pt-2 border-t border-muted-foreground/20">
                    <span className="text-primary font-semibold">Tentative Share:</span>
                    <span className="font-black text-primary text-base">₹{totalIncentive.toLocaleString('en-IN')}</span>
                  </div>
                )}
              </div>
            </div>
            <div>
              <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Uploaded Proofs</p>
              <div className="flex flex-col gap-1.5 mt-1">
                {data.apcApcWaiverRequested && (
                  <div className="flex items-center gap-2 bg-background p-2 rounded-lg border text-xs">
                    <FileText className="h-3.5 w-3.5 text-primary" />
                    <span className="truncate flex-1">Waiver Proof: {apcWaiverProofFile?.name || (data.apcApcWaiverProofUrl ? "Attached" : "Not Provided")}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 bg-background p-2 rounded-lg border text-xs">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  <span className="truncate flex-1">Invoice: {apcInvoiceProofFile?.name || (data.apcInvoiceProofUrl ? "Attached" : "Not Provided")}</span>
                </div>
                <div className="flex items-center gap-2 bg-background p-2 rounded-lg border text-xs">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  <span className="truncate flex-1">Receipt: {apcReceiptProofFile?.name || (data.apcReceiptProofUrl ? "Attached" : "Not Provided")}</span>
                </div>
                <div className="flex items-center gap-2 bg-background p-2 rounded-lg border text-xs">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  <span className="truncate flex-1">Payment Proof: {apcPaymentProofFile?.name || (data.apcPaymentProofUrl ? "Attached" : "Not Provided")}</span>
                </div>
                <div className="flex items-center gap-2 bg-background p-2 rounded-lg border text-xs">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  <span className="truncate flex-1">Acceptance Mail: {apcAcceptanceMailProofFile?.name || (data.apcAcceptanceMailProofUrl ? "Attached" : "Not Provided")}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-3">Author Details</p>
          <div className="border rounded-xl overflow-hidden shadow-sm">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="py-2">Name</TableHead>
                  <TableHead className="py-2">Role</TableHead>
                  <TableHead className="py-2">Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.authors.map((author, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{author.name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] py-0">{author.role}</Badge></TableCell>
                    <TableCell>{author.isExternal ? <Badge variant="destructive" className="text-[10px] py-0">External</Badge> : <Badge className="text-[10px] py-0 bg-green-500 hover:bg-green-600">Internal</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ApcForm({ user }: { user: User }) {
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isFetching, setIsFetching] = useState(false)
  const [bankDetailsMissing, setBankDetailsMissing] = useState(false)
  const [orcidOrMisIdMissing, setOrcidOrMisIdMissing] = useState(false)
  const [calculatedIncentive, setCalculatedIncentive] = useState<number | null>(null)
  const [isLoadingDraft, setIsLoadingDraft] = useState(true)
  const [step, setStep] = useState<'edit' | 'review'>('edit')
  const [showLogic, setShowLogic] = useState(false)
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);

  useEffect(() => {
    async function fetchSettings() {
      const settings = await getSystemSettings();
      setSystemSettings(settings);
    }
    fetchSettings();
  }, []);

  const getApcLogicBreakdown = (data: any) => {
    const { apcIndexingStatus = [], apcQRating, apcTotalAmount, authors = [] } = data;
    const internalAuthorsCount = authors.filter((a: any) => !a.isExternal).length || 1;
    let actualPaid = 0;
    if (apcTotalAmount) {
      actualPaid = parseFloat(String(apcTotalAmount).replace(/[^0-9.]/g, '')) || 0;
    }

    let maxLimit = 0;
    const hasScopus = apcIndexingStatus.some((s: string) => s.toLowerCase().includes('scopus') || s.toLowerCase().includes('web of science') || s.toLowerCase().includes('sci'));
    if (hasScopus && apcQRating) {
      switch (apcQRating) {
        case 'Q1': maxLimit = 40000; break;
        case 'Q2': maxLimit = 30000; break;
        case 'Q3': maxLimit = 20000; break;
        case 'Q4': maxLimit = 15000; break;
      }
    } else if (apcIndexingStatus.some((s: string) => s.includes('Web of Science indexed journals (ESCI)'))) {
      maxLimit = 8000;
    } else if (apcIndexingStatus.some((s: string) => s.includes('UGC-CARE Group-I'))) {
      maxLimit = 5000;
    }

    const admissible = maxLimit > 0 ? Math.min(actualPaid, maxLimit) : actualPaid;
    const finalAmount = Math.round(admissible / internalAuthorsCount);

    return [
      { label: '1. Max Policy Limit (by Indexing/Q-Rating)', value: `₹${maxLimit.toLocaleString('en-IN')}` },
      { label: '2. Actual APC Amount Paid', value: `₹${actualPaid.toLocaleString('en-IN')}` },
      { label: '3. Admissible Amount (Lesser of above)', value: `₹${admissible.toLocaleString('en-IN')}` },
      { label: '4. Total Internal PU Authors', value: internalAuthorsCount },
      { label: '5. Final Individual Share', value: `₹${finalAmount.toLocaleString('en-IN')}` }
    ];
  };

  const form = useForm<ApcFormValues>({
    resolver: zodResolver(apcSchema),
    defaultValues: {
      apcTypeOfArticle: '',
      apcOtherArticleType: '',
      apcIndexingStatus: [],
      apcQRating: undefined,
      doi: '',
      apcScopusLink: '',
      apcPaperTitle: '',
      authors: [],
      apcTotalStudentAuthors: 0,
      apcStudentNames: '',
      apcJournalDetails: '',
      apcApcWaiverRequested: false,
      apcJournalWebsite: '',
      apcIssnNo: '',
      apcSciImpactFactor: 0,
      apcPuNameInPublication: false,
      apcAmountClaimed: 0,
      apcTotalAmount: 0,
      apcSelfDeclaration: false,
      authorPosition: '1st',
    },
  })

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "authors",
  });

  const isSpecialFaculty = useMemo(() =>
    user.faculty ? SPECIAL_POLICY_FACULTIES.includes(user.faculty) : false,
    [user.faculty]
  );

  const availableIndexingStatuses = useMemo(() => {
    let statuses = ['Scopus', 'Web of science'];
    if (!isSpecialFaculty) {
      statuses.push('Web of Science indexed journals (ESCI)', 'UGC-CARE Group-I');
    }
    return statuses;
  }, [isSpecialFaculty]);

  const calculate = useCallback(async () => {
    const currentValues = form.getValues();
    if (user && user.faculty) {
      const dataForCalc = { ...currentValues, userEmail: user.email };
      const result = await calculateApcIncentive(dataForCalc, isSpecialFaculty);
      if (result.success) {
        setCalculatedIncentive(result.amount ?? null);
      } else {
        setCalculatedIncentive(null);
      }
    }
  }, [user, isSpecialFaculty, form]);

  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const subscription = form.watch((value, { name, type }) => {
      const fieldsForRecalculation = ['apcTotalAmount', 'apcIndexingStatus', 'apcQRating', 'authors'];
      if (type === 'change' && fieldsForRecalculation.some(field => name?.includes(field))) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => calculate(), 300);
      }
    });
    return () => {
      subscription.unsubscribe();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [form, calculate]);

  useEffect(() => {
    if (user) {
      setBankDetailsMissing(!user.bankDetails);
      setOrcidOrMisIdMissing(!user.orcidId || !user.misId);
      const isUserAlreadyAdded = form.getValues('authors').some(field => field.email.toLowerCase() === user.email.toLowerCase());
      if (!isUserAlreadyAdded) {
        append({
          name: user.name,
          email: user.email,
          uid: user.uid,
          role: 'First Author',
          isExternal: false,
          status: 'approved',
        });
      }
    }
    const claimId = searchParams.get('claimId');
    if (!claimId) setIsLoadingDraft(false);
  }, [append, form, searchParams, user]);

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
              apcApcWaiverProof: undefined,
              apcInvoiceProof: undefined,
              apcReceiptProof: undefined,
              apcPaymentProof: undefined,
              apcAcceptanceMailProof: undefined,
            });
            setStep('edit');
          } else {
            toast({ variant: 'destructive', title: result.error || 'Draft Not Found' });
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

  const removeAuthor = (index: number) => {
    if (fields[index].email.toLowerCase() === user.email.toLowerCase()) {
      toast({ variant: 'destructive', title: 'Action blocked', description: 'You cannot remove yourself from the author list.' });
      return;
    }
    remove(index);
  };

  const updateAuthorRole = (index: number, role: Author['role']) => {
    const authors = form.getValues('authors');
    const isTryingToBeFirst = role === 'First Author' || role === 'First & Corresponding Author';
    const isAnotherFirst = authors.some((a, i) => i !== index && (a.role === 'First Author' || a.role === 'First & Corresponding Author'));
    if (isTryingToBeFirst && isAnotherFirst) {
      toast({ title: 'Role Conflict', description: 'There can be only one First Author.', variant: 'destructive' });
      return;
    }
    update(index, { ...authors[index], role });
  };

  const watchArticleType = form.watch('apcTypeOfArticle');
  const watchWaiverRequested = form.watch('apcApcWaiverRequested');
  const apcIndexingStatus = form.watch('apcIndexingStatus') || [];

  const handleFetchData = async (source: 'scopus' | 'wos' | 'sciencedirect') => {
    const doi = form.getValues('doi');
    if (!doi) {
      toast({ variant: 'destructive', title: 'Missing DOI', description: 'Please enter a DOI first.' });
      return;
    }
    setIsFetching(true);
    toast({ title: `Connecting to ${source.toUpperCase()}`, description: 'Retrieving article metadata...' });
    try {
      let result;
      if (source === 'scopus') result = await fetchAdvancedScopusData(doi, user.name, user.uid);
      else if (source === 'wos') result = await fetchWosDataByUrl(doi, user.name, user.uid);
      else result = await fetchScienceDirectData(doi, user.name, user.uid);

      if (result.success && result.data) {
        form.setValue('apcPaperTitle', result.data.paperTitle || '');
        form.setValue('apcJournalDetails', result.data.journalName || '');
        form.setValue('apcJournalWebsite', (result.data && 'journalWebsite' in result.data) ? (result.data as any).journalWebsite : '');
        form.setValue('apcIssnNo', result.data.printIssn || result.data.electronicIssn || '');
        toast({ title: 'Auto-fill Complete', description: 'Form data updated successfully.' });
      } else {
        toast({ variant: 'destructive', title: 'Fetch Failed', description: result.error || 'Server did not return data.' });
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Connection Error', description: error.message });
    } finally {
      setIsFetching(false);
    }
  };

  async function handleSave(status: 'Draft' | 'Pending') {
    if (status === 'Pending' && (bankDetailsMissing || orcidOrMisIdMissing)) {
      toast({ variant: 'destructive', title: 'Profile Incomplete', description: 'Update bank details and IDs in Settings first.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const data = form.getValues();
      const upload = async (file: File | undefined, name: string) => {
        if (!file) return undefined;
        const result = await uploadFileToApi(file, { path: `incentive-proofs/${user.uid}/${name}` });
        if (!result.success || !result.url) throw new Error(result.error || `Upload failed for ${name}`);
        return result.url;
      };

      const [waiver, invoiceUrl, receiptUrl, paymentUrl, acceptanceUrl] = await Promise.all([
        upload(data.apcApcWaiverProof?.[0], 'apc-waiver'),
        upload(data.apcInvoiceProof?.[0], 'apc-invoice'),
        upload(data.apcReceiptProof?.[0], 'apc-receipt'),
        upload(data.apcPaymentProof?.[0], 'apc-payment'),
        upload(data.apcAcceptanceMailProof?.[0], 'apc-acceptance'),
      ]);

      const claimData: Omit<IncentiveClaim, 'id' | 'claimId'> = {
        ...data,
        calculatedIncentive: calculatedIncentive ?? undefined,
        misId: user.misId || undefined,
        orcidId: user.orcidId || undefined,
        claimType: 'Seed Money for APC',
        benefitMode: 'reimbursement',
        uid: user.uid,
        userName: user.name,
        userEmail: user.email,
        faculty: user.faculty || "N/A",
        status,
        submissionDate: new Date().toISOString(),
        bankDetails: user.bankDetails || undefined,
        apcApcWaiverProofUrl: waiver || data.apcApcWaiverProofUrl,
        apcInvoiceProofUrl: invoiceUrl || data.apcInvoiceProofUrl,
        apcReceiptProofUrl: receiptUrl || data.apcReceiptProofUrl,
        apcPaymentProofUrl: paymentUrl || data.apcPaymentProofUrl,
        apcAcceptanceMailProofUrl: acceptanceUrl || data.apcAcceptanceMailProofUrl,
      };

      const result = await submitIncentiveClaimViaApi(claimData, searchParams.get('claimId') || undefined);
      if (!result.success) throw new Error(result.error);

      toast({ title: status === 'Draft' ? 'Draft Saved' : 'Claim Submitted', description: 'Process completed successfully.' });
      router.push('/dashboard/incentive-claim' + (status === 'Pending' ? '?tab=my-claims' : ''));
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Action Failed', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoadingDraft) return <div className="flex justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;

  if (step === 'review') {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <ReviewDetails
          data={form.getValues()}
          onEdit={() => setStep('edit')}
          isSubmitting={isSubmitting}
          totalIncentive={calculatedIncentive}
        />
        <div className="flex justify-end max-w-4xl mx-auto gap-4">
          <Button variant="ghost" onClick={() => setStep('edit')} disabled={isSubmitting}>Modify Details</Button>
          <Button size="lg" onClick={() => handleSave('Pending')} disabled={isSubmitting} className="px-10 font-bold shadow-lg shadow-primary/20">
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Finalize Submission
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card className="max-w-4xl mx-auto shadow-2xl border-t-4 border-t-primary overflow-hidden">
      <CardHeader className="bg-primary/5 pb-8">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-3xl font-bold tracking-tight text-primary uppercase">Seed Money for APC</CardTitle>
            <CardDescription className="text-base">Apply for reimbursement of Article Processing Charges for high-impact journals.</CardDescription>
          </div>
          <div className="bg-primary/10 p-3 rounded-2xl shadow-inner">
            <Globe className="h-10 w-10 text-primary" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-8 bg-card">
        <Form {...form}>
          <form className="space-y-10">
            {(bankDetailsMissing || orcidOrMisIdMissing) && (
              <Alert variant="destructive" className="rounded-2xl border-2 animate-pulse">
                <AlertCircle className="h-5 w-5" />
                <AlertTitle className="font-bold">Profile Data Missing</AlertTitle>
                <AlertDescription className="flex items-center justify-between">
                  <span>ORCID, MIS ID, and Bank Details are required to process payments.</span>
                  <Button asChild variant="link" className="text-destructive font-black underline p-0 h-auto">
                    <Link href="/dashboard/settings">Update Profile</Link>
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <Alert className="bg-primary/5 border-primary/20 rounded-2xl ring-1 ring-primary/10">
              <Info className="h-5 w-5 text-primary" />
              <AlertTitle className="text-primary font-bold">Policy Reminder</AlertTitle>
              <AlertDescription className="text-xs space-y-1 mt-1">
                <p>• Reimbursement is calculated based on the admissible APC or the max policy limit, whichever is lesser.</p>
                <p>• You <strong>must</strong> have requested an APC waiver from the journal editor to be eligible.</p>
              </AlertDescription>
            </Alert>

            <section className="space-y-6">
              <div className="flex items-center gap-2 text-primary font-bold text-lg mb-4">
                <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                Journal & Metadata
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <FormField control={form.control} name="apcTypeOfArticle" render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="text-base font-semibold">Article Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl><SelectTrigger className="h-12 shadow-sm"><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                      <SelectContent>{articleTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="apcQRating" render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="text-base font-semibold">Journal Q-Rating (Derive from Scopus/WoS)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl><SelectTrigger className="h-12 shadow-sm"><SelectValue placeholder="Select Quartile" /></SelectTrigger></FormControl>
                      <SelectContent>{['Q1', 'Q2', 'Q3', 'Q4'].map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="apcIndexingStatus" render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel className="text-base font-semibold">Indexing Status</FormLabel>
                  <div className="flex flex-wrap gap-4 mt-2">
                    {availableIndexingStatuses.map(status => (
                      <Label key={status} className="flex items-center space-x-3 bg-muted/40 px-4 py-2.5 rounded-xl border border-muted-foreground/10 hover:bg-muted transition-all cursor-pointer [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                        <Checkbox checked={field.value?.includes(status)} onCheckedChange={(c) => c ? field.onChange([...(field.value || []), status]) : field.onChange(field.value?.filter(v => v !== status))} />
                        <span className="text-sm font-medium">{status}</span>
                      </Label>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="doi" render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="text-base font-semibold">Digital Object Identifier (DOI)</FormLabel>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <FormControl><Input placeholder="e.g. 10.1016/j.procbio.2023..." {...field} className="h-12 text-lg font-mono shadow-sm flex-1" /></FormControl>
                    <div className="flex gap-2">
                      {(apcIndexingStatus.length === 0 || apcIndexingStatus.some(s => s.toLowerCase().includes('scopus'))) && systemSettings?.apiIntegrations?.scopus !== false && (
                        <Button type="button" variant="outline" size="icon" className="h-12 w-12 rounded-xl group" onClick={() => handleFetchData('scopus')} disabled={isFetching || !field.value} title="Fetch Scopus Data"><Bot className="h-6 w-6 group-hover:text-primary transition-colors" /></Button>
                      )}
                      {(apcIndexingStatus.length === 0 || apcIndexingStatus.some(s => s.toLowerCase().includes('web of science'))) && systemSettings?.apiIntegrations?.wos !== false && (
                        <Button type="button" variant="outline" size="icon" className="h-12 w-12 rounded-xl group" onClick={() => handleFetchData('wos')} disabled={isFetching || !field.value} title="Fetch WoS Data"><Bot className="h-6 w-6 group-hover:text-amber-600 transition-colors" /></Button>
                      )}
                    </div>
                  </div>
                </FormItem>
              )} />

              {apcIndexingStatus.some(s => s.toLowerCase().includes('web of science')) && (
                <FormField control={form.control} name="apcWosAccessionNumber" render={({ field }) => (
                  <FormItem className="space-y-2 animate-in slide-in-from-top-2">
                    <FormLabel className="text-base font-semibold text-primary">WoS Accession Number (Mandatory)</FormLabel>
                    <FormControl><Input placeholder="e.g. WOS:000123456700001" {...field} className="h-12 shadow-sm border-primary/30 focus-visible:ring-primary rounded-xl" /></FormControl>
                    <FormDescription className="text-xs">Unique identifier for your paper in the Web of Science Core Collection.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              <FormField control={form.control} name="apcScopusLink" render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="text-base font-semibold flex items-center gap-1.5">
                    Scopus Link of Publication 
                    {apcIndexingStatus.some(s => s.toLowerCase().includes('scopus')) && (
                      <span className="text-destructive font-bold">*</span>
                    )}
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. https://www.scopus.com/record/display.uri?eid=..." {...field} className="h-12 shadow-sm rounded-xl focus-visible:ring-primary" />
                  </FormControl>
                  <FormDescription className="text-xs">Direct link to the Scopus abstract page for this publication.</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField name="apcPaperTitle" control={form.control} render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="text-base font-semibold">Final Published Title</FormLabel>
                  <FormControl><Textarea placeholder="As it appears on the publication" {...field} className="min-h-[100px] text-lg leading-relaxed shadow-sm rounded-xl focus-visible:ring-primary" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <FormField name="apcJournalDetails" control={form.control} render={({ field }) => (
                  <FormItem className="space-y-2"><FormLabel className="text-base font-semibold">Full Journal Name</FormLabel><FormControl><Input {...field} className="h-12 shadow-sm" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="apcIssnNo" control={form.control} render={({ field }) => (
                  <FormItem className="space-y-2"><FormLabel className="text-base font-semibold">ISSN / eISSN Number</FormLabel><FormControl><Input {...field} className="h-12 shadow-sm font-mono" /></FormControl><FormMessage /></FormItem>
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
                    <div key={f.id} className="group flex items-center justify-between bg-background p-4 rounded-xl border shadow-sm animate-in slide-in-from-left-2 transition-all hover:border-primary/30">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{f.name}</span>
                          {f.isExternal && <Badge variant="outline" className="text-[9px] h-4">External</Badge>}
                          {f.email.toLowerCase() === user.email.toLowerCase() && <Badge variant="secondary" className="text-[9px] h-4 bg-primary/10 text-primary border-none">You</Badge>}
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium">{f.email}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Select value={f.role} onValueChange={(r) => updateAuthorRole(i, r as Author['role'])}>
                          <SelectTrigger className="h-9 w-[180px] bg-background shadow-sm rounded-lg text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{coAuthorRoles.map(r => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}</SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" onClick={() => removeAuthor(i)} className="h-9 w-9 text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
                <AuthorSearch authors={fields} onAdd={append} availableRoles={coAuthorRoles} currentUserEmail={user.email} />
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
                  control={form.control}
                  name="apcPuNameInPublication"
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

            <Separator className="my-10" />

            <section className="space-y-8">
              <div className="flex items-center gap-2 text-primary font-bold text-lg mb-4">
                <div className="h-8 w-1.5 bg-primary rounded-full"></div> Financial Claim Details
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <FormField name="apcTotalAmount" control={form.control} render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="text-base font-semibold">Total Paid to Journal (INR)</FormLabel>
                    <FormControl><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold italic">₹</span><Input type="number" onWheel={(e) => (e.target as HTMLInputElement).blur()} {...field} className="h-12 pl-8 text-lg font-black shadow-sm" /></div></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField name="apcAmountClaimed" control={form.control} render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="text-base font-semibold">Amount to Reimburse (INR)</FormLabel>
                    <FormControl><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold italic">₹</span><Input type="number" onWheel={(e) => (e.target as HTMLInputElement).blur()} {...field} className="h-12 pl-8 text-lg font-black shadow-sm" /></div></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {calculatedIncentive !== null && (
                <Alert className="bg-primary/5 border-primary/20 py-6 rounded-3xl transition-all animate-in zoom-in-95 border-l-4 border-l-primary shadow-sm hover:shadow-md">
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" /> Estimated Incentive Amount
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
                          {getApcLogicBreakdown(form.getValues()).map((step, idx) => (
                            <div key={idx} className="flex justify-between items-center py-1 border-b last:border-0 border-muted">
                              <span className="text-muted-foreground">{step.label}</span>
                              <span className={idx === 4 ? "font-bold text-green-600" : "font-semibold"}>{step.value}</span>
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

              <Separator className="my-4 border-dashed" />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <FormField name="apcInvoiceProof" control={form.control} render={({ field: { value, onChange, ...rest } }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="font-bold flex items-center gap-2 underline decoration-primary decoration-2">
                      <FileText className="h-4 w-4" /> Invoice (Mandatory)
                    </FormLabel>
                    <FormControl>
                      <Input type="file" accept=".pdf" className="h-12 border-dashed border-2 bg-muted/20 font-medium" onChange={e => onChange(e.target.files)} {...rest} />
                    </FormControl>
                    <FormDescription className="text-[10px] text-muted-foreground">PDF format only. Max file size allowed: 10 MB.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField name="apcReceiptProof" control={form.control} render={({ field: { value, onChange, ...rest } }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="font-bold flex items-center gap-2 underline decoration-primary decoration-2">
                      <FileText className="h-4 w-4" /> Receipt (Mandatory)
                    </FormLabel>
                    <FormControl>
                      <Input type="file" accept=".pdf" className="h-12 border-dashed border-2 bg-muted/20 font-medium" onChange={e => onChange(e.target.files)} {...rest} />
                    </FormControl>
                    <FormDescription className="text-[10px] text-muted-foreground">PDF format only. Max file size allowed: 10 MB.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField name="apcPaymentProof" control={form.control} render={({ field: { value, onChange, ...rest } }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="font-bold flex items-center gap-2 underline decoration-primary decoration-2">
                      <FileText className="h-4 w-4" /> Payment Proof (Mandatory)
                    </FormLabel>
                    <FormControl>
                      <Input type="file" accept=".pdf" className="h-12 border-dashed border-2 bg-muted/20 font-medium" onChange={e => onChange(e.target.files)} {...rest} />
                    </FormControl>
                    <FormDescription className="text-[10px] text-muted-foreground">PDF format only. Max file size allowed: 10 MB.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField name="apcAcceptanceMailProof" control={form.control} render={({ field: { value, onChange, ...rest } }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="font-bold flex items-center gap-2 underline decoration-primary decoration-2">
                      <FileText className="h-4 w-4" /> Acceptance Mail (Mandatory)
                    </FormLabel>
                    <FormControl>
                      <Input type="file" accept=".pdf" className="h-12 border-dashed border-2 bg-muted/20 font-medium" onChange={e => onChange(e.target.files)} {...rest} />
                    </FormControl>
                    <FormDescription className="text-[10px] text-muted-foreground">PDF format only. Max file size allowed: 10 MB.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <Separator className="my-4 border-dashed" />

              <FormField name="apcApcWaiverRequested" control={form.control} render={({ field }) => (
                <FormItem className="flex items-start space-x-4 space-y-0 p-6 bg-muted/40 rounded-3xl border border-dashed border-muted-foreground/30 ring-1 ring-inset ring-muted-foreground/5">
                  <FormControl className="mt-1"><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  <div className="space-y-2">
                    <FormLabel className="text-sm font-black leading-tight">I have requested an APC waiver from the editor as per policy guidelines.</FormLabel>
                    {field.value && (
                      <div className="mt-4 animate-in slide-in-from-top-2">
                        <FormField name="apcApcWaiverProof" control={form.control} render={({ field: { value, onChange, ...rest } }) => (
                          <FormItem className="space-y-2">
                            <FormDescription className="text-xs text-primary font-bold">
                              Upload the email thread/confirmation of waiver inquiry:
                            </FormDescription>
                            <FormControl>
                              <Input type="file" accept=".pdf" className="h-10 border-primary/30" onChange={e => onChange(e.target.files)} {...rest} />
                            </FormControl>
                            <FormDescription className="text-[10px] text-muted-foreground">PDF format only. Max file size allowed: 10 MB.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                    )}
                  </div>
                </FormItem>
              )} />
            </section>

            <Separator className="my-10" />

            <FormField control={form.control} name="apcSelfDeclaration" render={({ field }) => (
              <FormItem className="flex flex-row items-center space-x-3 space-y-0 bg-primary/5 p-6 rounded-3xl border border-primary/20 shadow-sm">
                <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                <div className="space-y-1">
                  <FormLabel className="text-sm font-bold">Standard Self-Declaration</FormLabel>
                  <p className="text-[10px] text-muted-foreground italic">I confirm that I have not applied for dual incentives for this publication under any other category or portal.</p>
                  <FormMessage />
                </div>
              </FormItem>
            )} />
          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex justify-between p-8 bg-muted/30 border-t border-muted/50 gap-4">
        <Button variant="ghost" size="lg" onClick={() => handleSave('Draft')} disabled={isSubmitting} className="rounded-2xl px-8 h-12 font-bold hover:bg-primary/5 text-primary">Save to Draft</Button>
        <div className="flex gap-4">
          <Button variant="outline" size="lg" onClick={() => router.back()} disabled={isSubmitting} className="rounded-2xl px-6 h-12">Cancel</Button>
          <Button size="lg" onClick={form.handleSubmit(() => setStep('review'), (errors) => console.error("FORM ERRORS:", JSON.stringify(errors, null, 2)))} disabled={isSubmitting} className="rounded-2xl px-12 h-12 font-black shadow-xl shadow-primary/30 hover:shadow-primary/50 transition-all hover:scale-[1.02]">
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
            Review Application
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
