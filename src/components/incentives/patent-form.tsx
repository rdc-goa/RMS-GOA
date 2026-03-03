'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/config';
import { collection, doc, setDoc, getDoc } from 'firebase/firestore';
import type { User, IncentiveClaim, PatentInventor } from '@/types';
import { checkPatentUniqueness } from '@/app/actions';
import { uploadFileToApi } from '@/lib/upload-client';
import { Loader2, AlertCircle, Info, Plus, Trash2, Search, Calendar as CalendarIcon, ChevronDown, Edit } from 'lucide-react';
import { submitIncentiveClaimViaApi } from '@/lib/incentive-claim-client';
import { findUserByMisId } from '@/app/userfinding';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calculatePatentIncentive } from '@/app/incentive-calculation';
import { Table, TableBody, TableCell, TableHeader, TableHead, TableRow } from '../ui/table';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const sdgGoalsList = [
  "Goal 1: No Poverty", "Goal 2: Zero Hunger", "Goal 3: Good Health and Well-being", "Goal 4: Quality Education",
  "Goal 5: Gender Equality", "Goal 6: Clean Water and Sanitation", "Goal 7: Affordable and Clean Energy",
  "Goal 8: Decent Work and Economic Growth", "Goal 9: Industry, Innovation and Infrastructure", "Goal 10: Reduced Inequality",
  "Goal 11: Sustainable Cities and Communities", "Goal 12: Responsible Consumption and Production", "Goal 13: Climate Action",
  "Goal 14: Life Below Water", "Goal 15: Life on Land", "Goal 16: Peace and Justice Strong Institutions",
  "Goal 17: Partnerships for the Goals",
];


const patentSchema = z
  .object({
    patentLocale: z.enum(['National', 'International'], { required_error: 'Locale is required.' }),
    patentCountry: z.string().optional(),
    patentTitle: z.string().min(3, 'Patent title is required.'),
    patentApplicationNumber: z.string().min(3, 'Application number is required.'),
    patentDomain: z.string().min(3, 'Domain of IPR is required.'),
    patentInventors: z.array(z.object({ name: z.string(), misId: z.string(), uid: z.string().optional().nullable() })).min(1, 'At least one inventor is required.'),
    patentCoApplicants: z.array(z.object({ name: z.string(), misId: z.string(), uid: z.string().optional().nullable() })).optional(),
    isCollaboration: z.enum(['Yes', 'No', 'NA'], { required_error: 'This field is required.' }),
    collaborationDetails: z.string().optional(),
    isIprSdg: z.enum(['Yes', 'No', 'NA'], { required_error: 'This field is required.' }),
    sdgGoals: z.array(z.string()).optional(),
    isIprDisciplinary: z.enum(['Yes', 'No', 'NA'], { required_error: 'This field is required.' }),
    disciplinaryType: z.enum(['Interdisciplinary', 'Multidisciplinary', 'Transdisciplinary']).optional(),
    filingDate: z.date({ required_error: 'Filing date is required.' }),
    publicationDate: z.date().optional(),
    grantDate: z.date().optional(),
    currentStatus: z.enum(['Filed', 'Published', 'Granted'], { required_error: 'Please select the current status.' }),
    patentForm1: z
      .any()
      .refine((files) => files?.length > 0, 'Proof (Form 1) is required.')
      .refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, 'File must be less than 10 MB.'),
    patentFiledFromIprCell: z.boolean({ required_error: 'This field is required.' }),
    patentPermissionTaken: z.boolean().optional(),
    patentApprovalProof: z
      .any()
      .optional()
      .refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, 'File must be less than 10 MB.'),
    patentGovtReceipt: z
      .any()
      .refine((files) => files?.length > 0, 'Proof (Govt. Receipt) is required.')
      .refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, 'File must be less than 10 MB.'),
    patentSelfDeclaration: z.boolean().refine(val => val === true, { message: 'You must agree to the self-declaration.' }),
    patentFiledInPuName: z.boolean({ required_error: 'This field is required.' }),
    isPuSoleApplicant: z.boolean().optional(),
    patentSpecificationType: z.enum(['Full', 'Provisional'], { required_error: 'Specification type is required.' }),
  })
  .refine(data => !(data.patentLocale === 'International') || (!!data.patentCountry && data.patentCountry.length > 0), { message: 'Country is required for international patents.', path: ['patentCountry'] })
  .refine(data => !(data.isCollaboration === 'Yes') || (!!data.collaborationDetails && data.collaborationDetails.length > 0), { message: 'Collaboration details are required.', path: ['collaborationDetails'] })
  .refine(data => !(data.isIprSdg === 'Yes') || (!!data.sdgGoals && data.sdgGoals.length > 0), { message: 'Please select at least one SDG.', path: ['sdgGoals'] })
  .refine(data => !(data.isIprDisciplinary === 'Yes') || !!data.disciplinaryType, { message: 'Please select the disciplinary type.', path: ['disciplinaryType'] })
    .refine(data => !(data.currentStatus === 'Published' || data.currentStatus === 'Granted') || !!data.publicationDate, { message: 'Publication date is required for this status.', path: ['publicationDate'] });

  type PatentFormValues = z.infer<typeof patentSchema>;

  function ReviewDetails({ data, onEdit }: { data: PatentFormValues; onEdit: () => void }) {
    const renderDetail = (label: string, value?: string | number | boolean | string[] | PatentInventor[]) => {
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
                  <TableHead>Name</TableHead>
                  <TableHead>MIS ID</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {(value as PatentInventor[]).map((p, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{p.name}</TableCell>
                    <TableCell>{p.misId}</TableCell>
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
    
    const form1File = data.patentForm1?.[0] as File | undefined;
    const approvalProofFile = data.patentApprovalProof?.[0] as File | undefined;
    const govtReceiptFile = data.patentGovtReceipt?.[0] as File | undefined;

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
          {renderDetail("Locale", data.patentLocale)}
          {renderDetail("Country", data.patentCountry)}
          {renderDetail("Patent Title", data.patentTitle)}
          {renderDetail("Application Number", data.patentApplicationNumber)}
          {renderDetail("Domain", data.patentDomain)}
          {renderDetail("Inventors", data.patentInventors)}
          {renderDetail("Co-Applicants", data.patentCoApplicants)}
          {renderDetail("Collaboration", data.isCollaboration)}
          {renderDetail("Collaboration Details", data.collaborationDetails)}
          {renderDetail("Relates to SDGs", data.isIprSdg)}
          {renderDetail("SDGs", data.sdgGoals)}
          {renderDetail("Disciplinary Type", data.disciplinaryType)}
          {renderDetail("Filing Date", data.filingDate ? format(data.filingDate, 'PPP') : 'N/A')}
          {renderDetail("Publication Date", data.publicationDate ? format(data.publicationDate, 'PPP') : 'N/A')}
          {renderDetail("Grant Date", data.grantDate ? format(data.grantDate, 'PPP') : 'N/A')}
          {renderDetail("Current Status", data.currentStatus)}
          {renderDetail("Specification Type", data.patentSpecificationType)}
          {renderDetail("Filed in PU Name", data.patentFiledInPuName)}
          {renderDetail("PU is Sole Applicant", data.isPuSoleApplicant)}
          {renderDetail("Filed from IPR Cell", data.patentFiledFromIprCell)}
          {renderDetail("Permission Taken", data.patentPermissionTaken)}
          {renderDetail("Form 1 Proof", form1File?.name)}
          {renderDetail("Approval Proof", approvalProofFile?.name)}
          {renderDetail("Govt. Receipt", govtReceiptFile?.name)}
        </CardContent>
      </Card>
    );
  }

  export function PatentForm() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bankDetailsMissing, setBankDetailsMissing] = useState(false);
  const [orcidOrMisIdMissing, setOrcidOrMisIdMissing] = useState(false);
  const [searchType, setSearchType] = useState<'inventor' | 'applicant'>('inventor');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [foundUser, setFoundUser] = useState<PatentInventor | null>(null);
  const [calculatedIncentive, setCalculatedIncentive] = useState<number | null>(null);
  const [isLoadingDraft, setIsLoadingDraft] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  
  const form = useForm<PatentFormValues>({
    resolver: zodResolver(patentSchema),
    defaultValues: {
      patentLocale: 'National',
      patentInventors: [],
      patentCoApplicants: [],
    },
  });

  const { fields: inventorFields, append: appendInventor, remove: removeInventor } = useFieldArray({
    control: form.control,
    name: "patentInventors"
  });
  
  const { fields: applicantFields, append: appendApplicant, remove: removeApplicant } = useFieldArray({
    control: form.control,
    name: "patentCoApplicants"
  });

  const formValues = form.watch();

  const calculate = useCallback(async () => {
    const mapClaimStatus = (status?: PatentFormValues['currentStatus']): IncentiveClaim['currentStatus'] | undefined => {
      if (status === 'Published') return 'Published';
      if (status === 'Filed') return 'Under Examination';
      if (status === 'Granted') return 'Awarded';
      return undefined;
    };
    const mappedStatus = mapClaimStatus(formValues.currentStatus);
    const incentiveInput: Partial<IncentiveClaim> = {
      ...formValues,
      currentStatus: mappedStatus,
      filingDate: formValues.filingDate?.toISOString(),
      publicationDate: formValues.publicationDate?.toISOString(),
      grantDate: formValues.grantDate?.toISOString(),
    };
    const result = await calculatePatentIncentive(incentiveInput);
    if (result.success) {
        setCalculatedIncentive(result.amount ?? null);
    } else {
        console.error("Incentive calculation failed:", result.error);
        setCalculatedIncentive(null);
    }
  }, [formValues]);

  useEffect(() => {
    calculate();
  }, [calculate]);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser) as User;
      setUser(parsedUser);
      setBankDetailsMissing(!parsedUser.bankDetails);
      setOrcidOrMisIdMissing(!parsedUser.orcidId || !parsedUser.misId);
      
      const inventors = form.getValues('patentInventors');
      if (inventors.length === 0 && parsedUser.misId) {
        appendInventor({ name: parsedUser.name, misId: parsedUser.misId, uid: parsedUser.uid });
      }
    }
    const claimId = searchParams.get('claimId');
    if (!claimId) {
        setIsLoadingDraft(false);
    }
  }, [appendInventor, form, searchParams]);
  
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
                  const normalizeStatus = (status?: string): PatentFormValues['currentStatus'] | undefined => {
                    if (status === 'Awarded') return 'Granted';
                    if (status === 'Under Examination' || status === 'FER Responded' || status === 'Amended Examination') {
                      return 'Filed';
                    }
                    if (status === 'Filed' || status === 'Published' || status === 'Granted') return status;
                    return undefined;
                  };
                  form.reset({
                    ...(draftData as unknown as PatentFormValues),
                    filingDate: draftData.filingDate ? parseISO(draftData.filingDate) : undefined,
                    publicationDate: draftData.publicationDate ? parseISO(draftData.publicationDate) : undefined,
                    grantDate: draftData.grantDate ? parseISO(draftData.grantDate) : undefined,
                    currentStatus: normalizeStatus(draftData.currentStatus),
                    patentForm1: undefined,
                    patentApprovalProof: undefined,
                    patentGovtReceipt: undefined,
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

  const handleSearchUser = async () => {
    if (!searchTerm) return;
    setIsSearching(true);
    setFoundUser(null);
    try {
        const result = await findUserByMisId(searchTerm);
        if (result.success && result.users && result.users.length > 0) {
            const user = result.users[0];
            setFoundUser({ ...user });
        } else {
            toast({ variant: 'destructive', title: 'User Not Found', description: result.error });
        }
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Search Failed', description: error.message || 'An error occurred while searching.' });
    } finally {
        setIsSearching(false);
    }
  };

  const handleAddUser = () => {
    if (foundUser) {
        const list = searchType === 'inventor' ? inventorFields : applicantFields;
        const appendFn = searchType === 'inventor' ? appendInventor : appendApplicant;
        
        if (list.some(u => u.misId === foundUser.misId)) {
            toast({ variant: 'destructive', title: 'User Already Added', description: `This user is already in the ${searchType} list.` });
            return;
        }
        appendFn(foundUser);
        setFoundUser(null);
        setSearchTerm('');
    }
  };


  const currentStatus = form.watch('currentStatus');
  const patentLocale = form.watch('patentLocale');
  const isCollaboration = form.watch('isCollaboration');
  const isIprSdg = form.watch('isIprSdg');
  const isIprDisciplinary = form.watch('isIprDisciplinary');
  const patentFiledFromIprCell = form.watch('patentFiledFromIprCell');
  const patentFiledInPuName = form.watch('patentFiledInPuName');
  
  const handleProceedToReview = async () => {
    const isValid = await form.trigger();
    if (isValid) {
      setCurrentStep(2);
    } else {
        toast({
            variant: 'destructive',
            title: 'Validation Error',
            description: 'Please correct the errors before proceeding.',
        });
    }
  };

  async function handleSave(status: 'Draft' | 'Pending') {
    if (!user || !user.faculty) {
      toast({ variant: 'destructive', title: 'Error', description: 'User information not found. Please log in again.' });
      return;
    }
    if (status !== 'Draft' && (!user.bankDetails || !user.orcidId || !user.misId)) {
        toast({
            variant: 'destructive',
            title: 'Profile Incomplete',
            description: 'Please add your bank details, ORCID iD, and MIS ID in Settings before submitting a claim.',
        });
        return;
    }
    
    setIsSubmitting(true);
    try {
        const data = form.getValues();
        
        const uniquenessCheck = await checkPatentUniqueness(data.patentTitle, data.patentApplicationNumber, searchParams.get('claimId') || undefined);
        if (!uniquenessCheck.isUnique) {
            toast({ variant: 'destructive', title: 'Duplicate Entry', description: uniquenessCheck.message, duration: 8000 });
            setIsSubmitting(false);
            return;
        }
        
        const uploadFileHelper = async (file: File | undefined, folderName: string): Promise<string | undefined> => {
          if (!file || !user) return undefined;
          const path = `incentive-proofs/${user.uid}/${folderName}/${new Date().toISOString()}-${file.name}`;
          const result = await uploadFileToApi(file, { path });
          if (!result.success || !result.url) { throw new Error(result.error || `File upload failed for ${folderName}`); }
          return result.url;
        };

        const [patentForm1Url, patentApprovalProofUrl, patentGovtReceiptUrl] = await Promise.all([
            uploadFileHelper(data.patentForm1?.[0], 'patent-form1'),
            uploadFileHelper(data.patentApprovalProof?.[0], 'patent-approval'),
            uploadFileHelper(data.patentGovtReceipt?.[0], 'patent-govt-receipt'),
        ]);

        const { patentForm1, patentApprovalProof, patentGovtReceipt, currentStatus, ...restOfData } = data;
        const mapClaimStatus = (status?: PatentFormValues['currentStatus']): IncentiveClaim['currentStatus'] | undefined => {
          if (status === 'Published') return 'Published';
          if (status === 'Filed') return 'Under Examination';
          if (status === 'Granted') return 'Awarded';
          return undefined;
        };
        
        const claimData: Partial<IncentiveClaim> = {
            ...restOfData,
          currentStatus: mapClaimStatus(currentStatus),
          calculatedIncentive: calculatedIncentive ?? undefined,
            filingDate: data.filingDate?.toISOString(),
            publicationDate: data.publicationDate?.toISOString(),
            grantDate: data.grantDate?.toISOString(),
          misId: user.misId ?? undefined,
          orcidId: user.orcidId ?? undefined,
            claimType: 'Patents',
            benefitMode: 'incentives',
            uid: user.uid,
            userName: user.name,
            userEmail: user.email,
            faculty: user.faculty,
            status,
            submissionDate: new Date().toISOString(),
          bankDetails: user.bankDetails ?? undefined,
        };

        if (patentForm1Url) claimData.patentForm1Url = patentForm1Url;
        if (patentApprovalProofUrl) claimData.patentApprovalProofUrl = patentApprovalProofUrl;
        if (patentGovtReceiptUrl) claimData.patentGovtReceiptUrl = patentGovtReceiptUrl;
        
        const claimId = searchParams.get('claimId');
        const result = await submitIncentiveClaimViaApi(claimData as Omit<IncentiveClaim, 'id' | 'claimId'>, claimId || undefined);

        if (!result.success || !result.claimId) {
            throw new Error(result.error);
        }

        const newClaimId = claimId || result.claimId;

        if (status === 'Draft') {
          toast({ title: 'Draft Saved!', description: "You can continue editing from the 'Incentive Claim' page." });
          if(!searchParams.get('claimId')) {
            router.push(`/dashboard/incentive-claim/patent?claimId=${newClaimId}`);
          }
        } else {
          toast({ title: 'Success', description: 'Your incentive claim for patent has been submitted.' });
          router.push('/dashboard/incentive-claim');
        }

    } catch (error: any) {
        console.error('Error submitting claim: ', error);
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to submit claim. Please try again.' });
    } finally {
        setIsSubmitting(false);
    }
  }
  
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
    <Card>
      <Form {...form}>
        <form>
          <CardContent className="space-y-6 pt-6">
            {(bankDetailsMissing || orcidOrMisIdMissing) && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Profile Incomplete</AlertTitle>
                    <AlertDescription>
                        An ORCID iD, MIS ID, and bank details are mandatory for submitting incentive claims. Please add them to your profile.
                        <Button asChild variant="link" className="p-1 h-auto"><Link href="/dashboard/settings">Go to Settings</Link></Button>
                    </AlertDescription>
                </Alert>
            )}
            
            <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Important Notes on Patent Incentives</AlertTitle>
                <AlertDescription>
                    <ul className="list-disc list-inside space-y-1 mt-2 text-xs">
                        <li>No incentives shall be offered for the grant of Industrial Designs, Trademarks or Copyrights.</li>
                        <li>Financial and technical support shall be provided by the IPR Cell for the protection of any form of intellectual property by filing of applications subject to the condition that 'Parul University' is the sole/Joint applicant.</li>
                        <li>The above specified support shall be provided for filing applications within India only.</li>
                        <li>No reimbursement shall be given for the patent applications filed from outside agencies, without taking IPR Cell in confidence.</li>
                        <li>IPR arising out of the research work performed in PU or using PU facility, must be filed from RDC, PU, with PU name as an applicant. For filing IPR application outside RDC, PU, the applicant must take due permission from the University in case of some extraordinary situation. If due permission is not obtained, the university can take disciplinary action against the applicant(s) for non-compliance.</li>
                    </ul>
                </AlertDescription>
            </Alert>

            <div className="rounded-lg border p-4 space-y-4 animate-in fade-in-0">
                <h3 className="font-semibold text-sm -mb-2">IPR DETAILS</h3>
                <Separator />
                <FormField name="patentLocale" control={form.control} render={({ field }) => ( <FormItem><FormLabel>National / International</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="National">National</SelectItem><SelectItem value="International">International</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                {patentLocale === 'International' && <FormField name="patentCountry" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Country Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />}
                <FormField name="patentTitle" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Title of IPR</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="patentApplicationNumber" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Application Number of IPR</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="patentDomain" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Domain of IPR</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                
                <Separator />
                <h3 className="font-semibold text-sm">Inventors & Applicants</h3>
                
                 <div className="space-y-2 p-3 border rounded-md">
                    <FormLabel className="text-sm">Add Inventor / Co-Applicant</FormLabel>
                    <RadioGroup defaultValue="inventor" onValueChange={(v) => setSearchType(v as 'inventor' | 'applicant')} className="flex items-center space-x-4 mb-2">
                        <div className="flex items-center space-x-2"><RadioGroupItem value="inventor" id="r1" /><label htmlFor="r1">Inventor</label></div>
                        <div className="flex items-center space-x-2"><RadioGroupItem value="applicant" id="r2" /><label htmlFor="r2">Co-Applicant</label></div>
                    </RadioGroup>
                    <div className="flex items-center gap-2">
                        <Input placeholder={`Search by ${searchType}'s Name or MIS ID`} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        <Button type="button" onClick={handleSearchUser} disabled={isSearching}>{isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}</Button>
                    </div>
                    {foundUser && (
                        <div className="flex items-center justify-between p-2 border rounded-md mt-2">
                            <div><p className="text-sm">{foundUser.name} ({foundUser.misId})</p></div>
                            <Button type="button" size="sm" onClick={handleAddUser}>Add</Button>
                        </div>
                    )}
                </div>
                
                {inventorFields.length > 0 && (
                     <div className="space-y-2">
                        <FormLabel>Inventor(s)</FormLabel>
                        {inventorFields.map((field, index) => (
                            <div key={field.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                                <p className="text-sm">{field.name} ({field.misId})</p>
                                {index > 0 && <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeInventor(index)}><Trash2 className="h-4 w-4" /></Button>}
                            </div>
                        ))}
                     </div>
                )}

                {applicantFields.length > 0 && (
                     <div className="space-y-2">
                        <FormLabel>Co-Applicant(s)</FormLabel>
                        {applicantFields.map((field, index) => (
                            <div key={field.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                                <p className="text-sm">{field.name} ({field.misId})</p>
                                <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeApplicant(index)}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                        ))}
                     </div>
                )}
                
                <Separator />
                 <h3 className="font-semibold text-sm">Collaboration & Goals</h3>
                 
                 <FormField name="isCollaboration" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Is IPR filed with Collaboration of other Institute / University / Organization</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select..."/></SelectTrigger></FormControl><SelectContent><SelectItem value="Yes">Yes</SelectItem><SelectItem value="No">No</SelectItem><SelectItem value="NA">NA</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                 {isCollaboration === 'Yes' && <FormField name="collaborationDetails" control={form.control} render={({ field }) => ( <FormItem><FormLabel>If Yes, please provide details</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem> )} />}
                 
                 <FormField name="isIprSdg" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Is IPR related to Sustainable Development Goals?</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select..."/></SelectTrigger></FormControl><SelectContent><SelectItem value="Yes">Yes</SelectItem><SelectItem value="No">No</SelectItem><SelectItem value="NA">NA</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                 {isIprSdg === 'Yes' && <FormField control={form.control} name="sdgGoals" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Select Sustainable Development Goal(s)</FormLabel>
                      <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="w-full justify-between font-normal">
                              {(() => {
                                const selectedCount = field.value?.length ?? 0;
                                return selectedCount > 0 ? `${selectedCount} selected` : "Select relevant goals";
                              })()}
                              <ChevronDown className="h-4 w-4 opacity-50" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] max-h-60 overflow-y-auto">
                              <DropdownMenuLabel>Select all that apply</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {sdgGoalsList.map((goal) => (
                                <DropdownMenuCheckboxItem key={goal} checked={field.value?.includes(goal)} onCheckedChange={(checked) => { return checked ? field.onChange([...(field.value || []), goal]) : field.onChange(field.value?.filter((value) => value !== goal)); }} onSelect={(e) => e.preventDefault()}>{goal}</DropdownMenuCheckboxItem>
                              ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                       <FormMessage />
                    </FormItem>
                  )}/>}

                <FormField name="isIprDisciplinary" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Is IPR related to Interdisciplinary / Multidisciplinary / Transdisciplinary?</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select..."/></SelectTrigger></FormControl><SelectContent><SelectItem value="Yes">Yes</SelectItem><SelectItem value="No">No</SelectItem><SelectItem value="NA">NA</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                {isIprDisciplinary === 'Yes' && <FormField name="disciplinaryType" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Select Disciplinary Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl><SelectContent><SelectItem value="Interdisciplinary">Interdisciplinary</SelectItem><SelectItem value="Multidisciplinary">Multidisciplinary</SelectItem><SelectItem value="Transdisciplinary">Transdisciplinary</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />}
                
                <Separator />
                <h3 className="font-semibold text-sm">Filing Details & Status</h3>

                <FormField name="patentSpecificationType" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Specification Type</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-6"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Full" /></FormControl><FormLabel className="font-normal">Full</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Provisional" /></FormControl><FormLabel className="font-normal">Provisional</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )} />
                <FormField name="patentFiledInPuName" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Was the patent filed in the name of PU as an Applicant?</FormLabel><FormControl><RadioGroup onValueChange={(val) => field.onChange(val === 'true')} value={String(field.value)} className="flex items-center space-x-6"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="true" /></FormControl><FormLabel className="font-normal">Yes</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="false" /></FormControl><FormLabel className="font-normal">No</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )} />
                {patentFiledInPuName && <FormField name="isPuSoleApplicant" control={form.control} render={({ field }) => ( <FormItem><FormLabel>If Yes, was PU the Sole-Applicant?</FormLabel><FormControl><RadioGroup onValueChange={(val) => field.onChange(val === 'true')} value={String(field.value)} className="flex items-center space-x-6"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="true" /></FormControl><FormLabel className="font-normal">Yes</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="false" /></FormControl><FormLabel className="font-normal">No (Joint Applicant)</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )} />}
                <FormField name="patentFiledFromIprCell" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Was the patent filed from IPR Cell, PU?</FormLabel><FormControl><RadioGroup onValueChange={(val) => field.onChange(val === 'true')} value={String(field.value)} className="flex items-center space-x-6"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="true" /></FormControl><FormLabel className="font-normal">Yes</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="false" /></FormControl><FormLabel className="font-normal">No</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )} />
                {patentFiledFromIprCell === false && (
                    <FormField name="patentPermissionTaken" control={form.control} render={({ field }) => ( <FormItem><FormLabel>If No, was permission from PU taken?</FormLabel><FormControl><RadioGroup onValueChange={(val) => field.onChange(val === 'true')} value={String(field.value)} className="flex items-center space-x-6"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="true" /></FormControl><FormLabel className="font-normal">Yes</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="false" /></FormControl><FormLabel className="font-normal">No</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )} />
                )}

                <FormField name="currentStatus" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Current Status of Application</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select status"/></SelectTrigger></FormControl><SelectContent><SelectItem value="Filed">Filed</SelectItem><SelectItem value="Published">Published</SelectItem><SelectItem value="Granted">Granted</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField name="filingDate" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Date of Filing</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP") : (<span>Pick a date</span>)}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem> )} />
                  {(currentStatus === 'Published' || currentStatus === 'Granted') && <FormField name="publicationDate" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Date of Publication</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP") : (<span>Pick a date</span>)}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem> )} />}
                  {currentStatus === 'Granted' && <FormField name="grantDate" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Date of Grant</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP") : (<span>Pick a date</span>)}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem> )} />}
                </div>

                 {calculatedIncentive !== null && (
                    <div className="p-4 bg-secondary rounded-md">
                        <p className="text-sm font-medium">Tentative Eligible Incentive Amount: <span className="font-bold text-lg text-primary">₹{calculatedIncentive.toLocaleString('en-IN')}</span></p>
                        <p className="text-xs text-muted-foreground">This is your individual share based on the policy and number of inventors.</p>
                    </div>
                )}

                <FormField name="patentForm1" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Attach Proof (Form 1) (PDF)</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} accept="application/pdf" /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="patentApprovalProof" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Attach Proof of Approval (PDF)</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} accept="application/pdf" /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="patentGovtReceipt" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Attach Proof (Govt. Receipt) (PDF)</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} accept="application/pdf" /></FormControl><FormMessage /></FormItem> )} />
                <FormField control={form.control} name="patentSelfDeclaration" render={({ field }) => ( <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><div className="space-y-1 leading-none"><FormLabel>Self Declaration</FormLabel><FormMessage /><p className="text-xs text-muted-foreground">I hereby confirm that I have not applied/claimed for any incentive for the same application/publication earlier.</p></div></FormItem> )} />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleSave('Draft')}
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
  );
}
