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
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/config';
import type { User, IncentiveClaim, PatentInventor } from '@/types';
import { checkPatentUniqueness, getIncentiveClaimByIdAction } from '@/app/actions';
import { uploadFileToApi } from '@/lib/upload-client';
import { Loader2, AlertCircle, Info, Plus, Trash2, Search, Calendar as CalendarIcon, ChevronDown, Edit, Users, UserPlus, FileText, CheckCircle2 } from 'lucide-react';
import { submitIncentiveClaimViaApi } from '@/lib/incentive-claim-client';
import { AuthorSearch } from './author-search';
import { Badge } from '@/components/ui/badge';
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
    patentLocale: z.enum(['National', 'International'], { required_error: "Please specify whether your patent is 'National' or 'International'." }),
    patentCountry: z.string().optional(),
    patentTitle: z.string().min(3, "Please enter the complete, official title of your patent (at least 3 characters long)."),
    patentApplicationNumber: z.string().min(3, "Please enter the official registration/application number issued by the patent office."),
    patentDomain: z.string().min(3, "Please specify the technical field or domain of your patent (e.g., 'Biotechnology', 'Mechanical Engineering')."),
    patentInventors: z.array(z.object({ 
      name: z.string(), 
      email: z.string().optional().nullable(),
      misId: z.string().optional().nullable(), 
      uid: z.string().optional().nullable(),
      isExternal: z.boolean().optional(),
      organization: z.string().optional(),
    })).min(1, "Please list at least one inventor involved in this patent application."),
    patentCoApplicants: z.array(z.object({ 
      name: z.string(), 
      email: z.string().optional().nullable(),
      misId: z.string().optional().nullable(), 
      uid: z.string().optional().nullable(),
      isExternal: z.boolean().optional(),
      organization: z.string().optional(),
    })).optional(),
    isCollaboration: z.enum(['Yes', 'No', 'NA'], { required_error: "Please specify whether this patent was filed in collaboration with another institution." }),
    collaborationDetails: z.string().optional(),
    isIprSdg: z.enum(['Yes', 'No', 'NA'], { required_error: "Please specify whether your patent contributes to any Sustainable Development Goals (SDGs)." }),
    sdgGoals: z.array(z.string()).optional(),
    isIprDisciplinary: z.enum(['Yes', 'No', 'NA'], { required_error: "Please specify whether this IPR has inter/multi/trans-disciplinary aspects." }),
    disciplinaryType: z.enum(['Interdisciplinary', 'Multidisciplinary', 'Transdisciplinary']).optional(),
    filingDate: z.date({ required_error: "Please select the official date on which your patent application was filed." }),
    publicationDate: z.date().optional(),
    grantDate: z.date().optional(),
    currentStatus: z.enum(['Filed', 'Published', 'Granted'], { required_error: "Please select the current status of your patent ('Filed', 'Published', or 'Granted')." }),
    patentForm1: z
      .any()
      .refine((files) => files?.length > 0, "Please upload proof of status to verify the filing.")
      .refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, "The uploaded proof of status file exceeds the 10 MB limit."),
    patentFiledFromIprCell: z.boolean({ required_error: "Please confirm whether this patent was filed through the university's official IPR Cell." }),
    patentRoutedViaSsip: z.boolean({ required_error: "Please specify whether the application was routed via SSIP." }),
    patentPermissionTaken: z.boolean().optional(),
    patentApprovalProof: z
      .any()
      .optional()
      .refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, "The uploaded approval proof file exceeds the 10 MB limit."),
    patentGovtReceipt: z
      .any()
      .refine((files) => files?.length > 0, "Please upload the official government payment receipt to verify filing completion.")
      .refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, "The uploaded government receipt file exceeds the 10 MB limit."),
    patentSelfDeclaration: z.boolean().refine(val => val === true, { message: "You must check the self-declaration box to acknowledge that the details are authentic and no other claim has been made." }),
    patentFiledInPuName: z.boolean({ required_error: "Please specify if this patent is officially filed under Parul University's name." }),
    isPuSoleApplicant: z.boolean().optional(),
    patentSpecificationType: z.enum(['Full', 'Provisional'], { required_error: "Please select whether your patent specification is 'Full' or 'Provisional'." }),
    patentTotalStudents: z.coerce.number().nonnegative("The count of university students involved cannot be a negative value.").optional(),
    patentStudentNames: z.string().optional(),
  })
  .refine(data => !(data.patentLocale === 'International') || (!!data.patentCountry && data.patentCountry.length > 0), { message: "Please select or type the country where your international patent was filed.", path: ['patentCountry'] })
  .refine(data => !(data.isCollaboration === 'Yes') || (!!data.collaborationDetails && data.collaborationDetails.length > 0), { message: "You indicated a collaborative filing. Please provide details of the collaborating partners or institutions.", path: ['collaborationDetails'] })
  .refine(data => !(data.isIprSdg === 'Yes') || (!!data.sdgGoals && data.sdgGoals.length > 0), { message: "You indicated SDG relevance. Please select at least one applicable SDG goal from the list.", path: ['sdgGoals'] })
  .refine(data => !(data.isIprDisciplinary === 'Yes') || !!data.disciplinaryType, { message: "Please select whether your patent is Interdisciplinary, Multidisciplinary, or Transdisciplinary.", path: ['disciplinaryType'] })
  .refine(data => {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (data.filingDate > today) return false;
      if (data.publicationDate && data.publicationDate > today) return false;
      if (data.grantDate && data.grantDate > today) return false;
      return true;
  }, { message: "The filing or publication dates cannot be in the future. Please select a valid past or present date.", path: ["filingDate"] })
  .refine(data => !(data.currentStatus === 'Published' || data.currentStatus === 'Granted') || !!data.publicationDate, { message: "A publication date is required for patents that are already published or granted.", path: ['publicationDate'] });

  type PatentFormValues = z.infer<typeof patentSchema>;

  function ReviewDetails({ data, onEdit }: { data: PatentFormValues; onEdit: () => void }) {
    const renderDetail = (label: string, value?: string | number | boolean | string[] | PatentInventor[]) => {
      if (!value && value !== 0 && value !== false) return null;
        
      let displayValue: React.ReactNode = String(value);
      if (typeof value === 'boolean') {
        displayValue = (
          <Badge variant={value ? "default" : "secondary"} className="rounded-md">
            {value ? 'Yes' : 'No'}
          </Badge>
        );
      }
      if (Array.isArray(value)) {
        if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null && 'name' in value[0]) {
          displayValue = (
            <div className="border rounded-xl overflow-hidden shadow-sm mt-1">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="font-bold">Name</TableHead>
                    <TableHead className="font-bold">MIS ID/Org</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                {(value as PatentInventor[]).map((p, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-muted-foreground">{p.misId || p.organization || (p.isExternal ? 'External' : 'Internal')}</TableCell>
                  </TableRow>
                ))}
                </TableBody>
              </Table>
            </div>
          );
        } else {
          displayValue = (
            <div className="flex flex-wrap gap-1 mt-1">
              {(value as string[]).map((v, i) => (
                <Badge key={i} variant="outline" className="bg-primary/5 text-primary border-primary/20">{v}</Badge>
              ))}
            </div>
          );
        }
      }

      return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 py-3 border-b border-muted last:border-0 items-start">
          <dt className="font-bold text-muted-foreground text-sm uppercase tracking-wider">{label}</dt>
          <dd className="col-span-2 text-base font-medium">{displayValue}</dd>
        </div>
      );
    };
    
    const form1File = data.patentForm1?.[0] as File | undefined;
    const approvalProofFile = data.patentApprovalProof?.[0] as File | undefined;
    const govtReceiptFile = data.patentGovtReceipt?.[0] as File | undefined;

    return (
      <Card className="max-w-4xl mx-auto shadow-xl border-t-4 border-t-primary overflow-hidden transition-all duration-300">
        <CardHeader className="bg-muted/30 pb-6">
          <div className="flex justify-between items-center">
            <div className="space-y-1">
              <CardTitle className="text-2xl flex items-center gap-2 font-bold tracking-tight">
                <CheckCircle2 className="h-7 w-7 text-primary" /> Review Your Application
              </CardTitle>
              <CardDescription className="text-base text-muted-foreground font-medium">Please verify all patent details before final submission.</CardDescription>
            </div>
            <Button variant="outline" onClick={onEdit} className="rounded-xl border-primary/30 text-primary hover:bg-primary/5 font-bold px-6">
              <Edit className="h-4 w-4 mr-2" /> Modify Form
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-8 space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
            {/* Column 1: Core Identity */}
            <div className="space-y-8">
              <div>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Patent Identity</p>
                <p className="text-lg font-bold text-foreground leading-tight mb-2">{data.patentTitle}</p>
                <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="font-bold">{data.patentLocale}</Badge>
                    {data.patentCountry && <Badge variant="outline" className="font-bold">{data.patentCountry}</Badge>}
                    <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-bold">{data.patentDomain}</Badge>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Application Identifier</p>
                <p className="text-sm font-mono font-bold bg-muted/30 px-2 py-1 rounded-md inline-block">{data.patentApplicationNumber}</p>
              </div>

               <div>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Status & Timeline</p>
                <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10 space-y-3">
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-medium text-muted-foreground">Current Status:</span>
                        <Badge className="font-black bg-primary text-[10px]">{data.currentStatus}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-medium text-muted-foreground">Filing Date:</span>
                        <span className="text-xs font-bold">{data.filingDate ? format(data.filingDate, 'PPP') : 'N/A'}</span>
                    </div>
                    {data.publicationDate && (
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-medium text-muted-foreground">Publication Date:</span>
                            <span className="text-xs font-bold">{format(data.publicationDate, 'PPP')}</span>
                        </div>
                    )}
                    {data.grantDate && (
                        <div className="flex justify-between items-center text-green-700">
                            <span className="text-xs font-medium">Grant Date:</span>
                            <span className="text-xs font-black">{format(data.grantDate, 'PPP')}</span>
                        </div>
                    )}
                </div>
              </div>
            </div>

            {/* Column 2: Authors & Compliance */}
            <div className="space-y-8">
               <div>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Inventors & Applicants</p>
                <div className="space-y-2">
                    {data.patentInventors.map((inv, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs font-bold p-2 bg-muted/20 rounded-lg">
                            <div className="h-1.5 w-1.5 rounded-full bg-primary/40"></div>
                            {inv.name} <span className="text-[9px] text-muted-foreground font-black uppercase">({inv.misId || 'Internal'})</span>
                        </div>
                    ))}
                </div>
              </div>

              {data.patentTotalStudents !== undefined && data.patentTotalStudents > 0 && (
                <div>
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Student Members (PU)</p>
                  <div className="bg-muted/20 p-3 rounded-xl border space-y-1">
                    <p className="text-xs font-bold text-foreground">Total PU Students: {data.patentTotalStudents}</p>
                    {data.patentStudentNames && (
                      <p className="text-xs text-muted-foreground">Names: {data.patentStudentNames}</p>
                    )}
                  </div>
                </div>
              )}

              {data.sdgGoals && data.sdgGoals.length > 0 && (
                <div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">SDG Impact</p>
                    <div className="flex flex-wrap gap-1">
                        {data.sdgGoals.map((g, i) => <Badge key={i} variant="secondary" className="text-[9px] font-bold h-5">{g}</Badge>)}
                    </div>
                </div>
              )}

              <div>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Compliance & Verification</p>
                <div className="grid grid-cols-1 gap-2">
                    <div className="flex items-center justify-between p-2 bg-muted/10 rounded-xl border border-dashed">
                        <span className="text-[10px] font-medium text-muted-foreground">Routed via SSIP:</span>
                        <Badge variant="outline" className="text-[9px] font-black text-primary">{data.patentRoutedViaSsip ? 'YES' : 'NO'}</Badge>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-muted/10 rounded-xl border border-dashed">
                        <span className="text-[10px] font-medium text-muted-foreground">Proof of Status:</span>
                        <Badge variant="outline" className="text-[9px] font-black text-primary"><FileText className="h-3 w-3 mr-1" /> ATTACHED</Badge>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-muted/10 rounded-xl border border-dashed">
                        <span className="text-[10px] font-medium text-muted-foreground">Govt. Receipt:</span>
                        <Badge variant="outline" className="text-[9px] font-black text-primary"><FileText className="h-3 w-3 mr-1" /> ATTACHED</Badge>
                    </div>
                </div>
              </div>
            </div>
          </div>
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
  const [calculatedIncentive, setCalculatedIncentive] = useState<number | null>(null);
  const [isLoadingDraft, setIsLoadingDraft] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [addType, setAddType] = useState<'inventor' | 'applicant'>('inventor');
  const [showLogic, setShowLogic] = useState(false);
  const [rejectionComments, setRejectionComments] = useState<string | null>(null);

  const getPatentLogicBreakdown = (data: Partial<PatentFormValues>) => {
    const steps: {label: string, value: string}[] = [];
    const status = data.currentStatus || 'Filed';
    let baseAmount = 0;
    if (status === 'Published') baseAmount = 3000;
    else if (status === 'Granted') baseAmount = 18000;
    
    steps.push({ label: '1. Patent Lifecycle Stage', value: `${status} (₹${baseAmount.toLocaleString('en-IN')} Base)` });
    
    if (data.patentRoutedViaSsip) {
      steps.push({ label: '2. SSIP Routing', value: 'Routed via SSIP (Flat ₹3,000, 80% factor bypassed)' });
      const inventorCount = Math.max(1, data.patentInventors?.length || 1);
      steps.push({ label: '3. Total Inventors Split', value: `÷ ${inventorCount} Inventor(s)` });
      const finalAmount = Math.round(3000 / inventorCount);
      steps.push({ label: '4. Estimated Individual Share', value: `₹${finalAmount.toLocaleString('en-IN')}` });
      return steps;
    }

    if (baseAmount === 0 || !data.patentFiledInPuName) {
         steps.push({ label: '2. PU Applicancy Check', value: 'Not Eligible (0%)' });
         steps.push({ label: '3. Final Estimation', value: '₹0' });
         return steps;
    }

    let puShareMultiplier = 1;
    let labelText = 'Sole Applicant (100% Share)';
    if (!data.isPuSoleApplicant) {
        puShareMultiplier = 0.8;
        labelText = 'Joint Applicant (80% Share)';
    }

    steps.push({ label: '2. PU Affiliation Share', value: labelText });
    
    const pooledAmount = baseAmount * puShareMultiplier;
    const inventorCount = Math.max(1, data.patentInventors?.length || 1);
    
    steps.push({ label: '3. Total Inventors Split', value: `÷ ${inventorCount} Inventor(s)` });

    const finalAmount = Math.round(pooledAmount / inventorCount);
    steps.push({ label: '4. Estimated Individual Share', value: `₹${finalAmount.toLocaleString('en-IN')}` });

    return steps;
  };
   
  const form = useForm<PatentFormValues>({
    resolver: zodResolver(patentSchema),
    defaultValues: {
      patentLocale: 'National',
      patentCountry: '',
      patentTitle: '',
      patentApplicationNumber: '',
      patentDomain: '',
      collaborationDetails: '',
      patentInventors: [],
      patentCoApplicants: [],
      isCollaboration: undefined,
      isIprSdg: undefined,
      sdgGoals: [],
      isIprDisciplinary: undefined,
      disciplinaryType: undefined,
      filingDate: undefined,
      publicationDate: undefined,
      grantDate: undefined,
      currentStatus: undefined,
      patentFiledFromIprCell: undefined,
      patentRoutedViaSsip: undefined,
      patentPermissionTaken: undefined,
      patentSelfDeclaration: false,
      patentFiledInPuName: undefined,
      isPuSoleApplicant: undefined,
      patentSpecificationType: undefined,
      patentTotalStudents: 0,
      patentStudentNames: '',
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

  const clearLocalBackup = useCallback(() => {
    if (user) {
      localStorage.removeItem(`local_draft_patent_form_${user.uid}`);
    }
  }, [user]);

  // Auto-save form values to localStorage
  useEffect(() => {
    if (!user || isLoadingDraft) return;
    const key = `local_draft_patent_form_${user.uid}`;
    
    const valuesToSave = {
      ...formValues,
      filingDate: formValues.filingDate ? (formValues.filingDate instanceof Date ? formValues.filingDate.toISOString() : formValues.filingDate) : undefined,
      publicationDate: formValues.publicationDate ? (formValues.publicationDate instanceof Date ? formValues.publicationDate.toISOString() : formValues.publicationDate) : undefined,
      grantDate: formValues.grantDate ? (formValues.grantDate instanceof Date ? formValues.grantDate.toISOString() : formValues.grantDate) : undefined,
      patentForm1: undefined,
      patentApprovalProof: undefined,
      patentGovtReceipt: undefined,
    };
    
    localStorage.setItem(key, JSON.stringify(valuesToSave));
  }, [formValues, user, isLoadingDraft]);

  // Prompt to restore local backup on load
  useEffect(() => {
    if (!user || isLoadingDraft) return;
    const key = `local_draft_patent_form_${user.uid}`;
    const backupStr = localStorage.getItem(key);
    if (backupStr) {
      try {
        const backup = JSON.parse(backupStr);
        if (backup.patentTitle && backup.patentTitle.length > 3 && backup.patentTitle !== form.getValues('patentTitle')) {
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
                  const restored = {
                    ...backup,
                    filingDate: backup.filingDate ? new Date(backup.filingDate) : undefined,
                    publicationDate: backup.publicationDate ? new Date(backup.publicationDate) : undefined,
                    grantDate: backup.grantDate ? new Date(backup.grantDate) : undefined,
                  };
                  form.reset(restored);
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
    const mapClaimStatus = (status?: PatentFormValues['currentStatus']): IncentiveClaim['currentStatus'] | undefined => {
      if (status === 'Published') return 'Published';
      if (status === 'Filed') return 'Under Examination';
      if (status === 'Granted') return 'Awarded';
      return undefined;
    };
    const mappedStatus = mapClaimStatus(formValues.currentStatus);
    const incentiveInput: any = {
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
                const result = await getIncentiveClaimByIdAction(claimId);
                if (result.success && result.data) {
                  const draftData = result.data as any;
                  const normalizeStatus = (status?: string): PatentFormValues['currentStatus'] | undefined => {
                    if (status === 'Awarded') return 'Granted';
                    if (status === 'Under Examination' || status === 'FER Responded' || status === 'Amended Examination') {
                      return 'Filed';
                    }
                    if (status === 'Filed' || status === 'Published' || status === 'Granted') return status;
                    return undefined;
                  };
                  form.reset({
                    ...draftData,
                    patentCountry: draftData.patentCountry || '',
                    patentTitle: draftData.patentTitle || '',
                    patentApplicationNumber: draftData.patentApplicationNumber || '',
                    patentDomain: draftData.patentDomain || '',
                    collaborationDetails: draftData.collaborationDetails || '',
                    patentTotalStudents: draftData.patentTotalStudents || 0,
                    patentStudentNames: draftData.patentStudentNames || '',
                    filingDate: draftData.filingDate ? parseISO(draftData.filingDate) : undefined,
                    publicationDate: draftData.publicationDate ? parseISO(draftData.publicationDate) : undefined,
                    grantDate: draftData.grantDate ? parseISO(draftData.grantDate) : undefined,
                    currentStatus: normalizeStatus(draftData.currentStatus),
                    patentForm1: undefined,
                    patentApprovalProof: undefined,
                    patentGovtReceipt: undefined,
                  });
                  // Check if there are rejection comments in approvals
                  const lastApproval = draftData.approvals?.filter((a: any) => a != null).reverse().find((a: any) => a.status === 'Not Approved');
                  if (lastApproval?.comments) {
                    setRejectionComments(lastApproval.comments);
                  }
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
      console.error("FORM VALIDATION ERRORS:", JSON.stringify(form.formState.errors, null, 2))
      const errorKeys = Object.keys(form.formState.errors);
      
      const getReadableFieldName = (key: string) => {
        const mapping: Record<string, string> = {
          patentLocale: "National/International Locale",
          patentCountry: "Country",
          patentTitle: "Title of IPR",
          patentApplicationNumber: "Application Number",
          patentDomain: "Domain of IPR",
          isCollaboration: "Is Collaboration",
          collaborationDetails: "Collaboration Details",
          isIprSdg: "Sustainable Development Goals (SDG)",
          sdgGoals: "SDG Goals Selection",
          isIprDisciplinary: "Disciplinary Type status",
          disciplinaryType: "Disciplinary Type",
          filingDate: "Filing Date",
          publicationDate: "Publication Date",
          grantDate: "Grant Date",
          currentStatus: "Current Status",
          patentForm1: "Proof of Status File",
          patentFiledFromIprCell: "Filed from Ipr Cell Check",
          patentRoutedViaSsip: "Routed via SSIP Check",
          patentPermissionTaken: "Permission Taken Check",
          patentApprovalProof: "Approval Proof File",
          patentGovtReceipt: "Govt. Receipt File",
          patentSelfDeclaration: "Self Declaration Check",
          patentFiledInPuName: "Filed in PU Name Check",
          isPuSoleApplicant: "PU Sole Applicant Check",
          patentSpecificationType: "Specification Type",
          patentInventors: "Inventors List",
          patentCoApplicants: "Co-Applicants List"
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
        variant: 'destructive',
        title: 'Validation Error',
        description: toastDescription,
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
        
        const claimData: any = {
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
          clearLocalBackup();
          if(!searchParams.get('claimId')) {
            router.push(`/dashboard/incentive-claim/patent?claimId=${newClaimId}`);
          }
        } else {
          toast({ title: 'Success', description: 'Your incentive claim for patent has been submitted.' });
          clearLocalBackup();
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
      <div className="space-y-6">
        <ReviewDetails data={form.getValues()} onEdit={() => setCurrentStep(1)} />
        <Card className="max-w-4xl mx-auto bg-muted/20 border-t">
          <CardFooter className="flex justify-between p-6">
            <Button variant="ghost" onClick={() => setCurrentStep(1)} disabled={isSubmitting} className="rounded-xl px-8">
              Back to Edit
            </Button>
            <Button onClick={form.handleSubmit(onFinalSubmit)} disabled={isSubmitting || bankDetailsMissing || orcidOrMisIdMissing} className="rounded-xl px-10 h-12 font-bold shadow-lg shadow-primary/25">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting Claim...
                </>
              ) : 'Confirm & Submit Patent Claim'}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <Card className="max-w-4xl mx-auto shadow-2xl border-t-4 border-t-primary overflow-hidden">
      <CardHeader className="bg-primary/5 pb-8">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-3xl font-bold tracking-tight text-primary">Patent Incentive Claim</CardTitle>
            <CardDescription className="text-base text-muted-foreground">Submit your application for intellectual property rights incentives.</CardDescription>
          </div>
          <div className="bg-primary/10 p-3 rounded-2xl">
            <FileText className="h-10 w-10 text-primary" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-8 bg-card">
        <Form {...form}>
          <form className="space-y-8">
            {(bankDetailsMissing || orcidOrMisIdMissing) && (
                <Alert variant="destructive" className="rounded-2xl border-2">
                    <AlertCircle className="h-5 w-5" />
                    <AlertTitle className="font-bold">Profile Incomplete</AlertTitle>
                    <AlertDescription>
                        An ORCID iD, MIS ID, and bank details are mandatory for submitting incentive claims. Please add them to your profile.
                        <Button asChild variant="link" className="p-0 h-auto text-destructive-foreground font-bold underline ml-2"><Link href="/dashboard/settings">Go to Settings</Link></Button>
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
            
            <Alert className="bg-primary/5 border-primary/20 py-4 rounded-2xl ring-1 ring-primary/5">
                <Info className="h-5 w-5 text-primary" />
                <AlertTitle className="text-primary font-bold">Important Notes on Patent Incentives</AlertTitle>
                <AlertDescription>
                    <ul className="list-disc list-inside space-y-1 mt-2 text-xs text-muted-foreground/80 font-medium">
                        <li>No incentives offered for Industrial Designs, Trademarks or Copyrights.</li>
                        <li>Support provided by IPR Cell if 'Parul University' is the sole/Joint applicant.</li>
                        <li>Support limited to Indian applications unless prior permission obtained.</li>
                        <li>IPR arising from PU research must be filed through RDC, PU.</li>
                    </ul>
                </AlertDescription>
            </Alert>

            <div className="space-y-8">
                <section className="space-y-6">
                    <div className="flex items-center gap-2 text-primary font-bold text-lg mb-4">
                        <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                        IPR Details
                    </div>
                   
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField name="patentLocale" control={form.control} render={({ field }) => ( 
                            <FormItem>
                                <FormLabel className="text-base font-semibold">National / International <span className="text-destructive font-black">*</span></FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                        <SelectTrigger className="h-12 shadow-sm focus-visible:ring-primary"><SelectValue/></SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="National">National</SelectItem>
                                        <SelectItem value="International">International</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem> 
                        )} />
                        {patentLocale === 'International' && (
                            <FormField name="patentCountry" control={form.control} render={({ field }) => ( 
                                <FormItem>
                                    <FormLabel className="text-base font-semibold">Country Name <span className="text-destructive font-black">*</span></FormLabel>
                                    <FormControl><Input {...field} value={field.value ?? ""} className="h-12 shadow-sm" /></FormControl>
                                    <FormMessage />
                                </FormItem> 
                            )} />
                        )}
                    </div>

                    <FormField name="patentTitle" control={form.control} render={({ field }) => ( 
                        <FormItem>
                            <FormLabel className="text-base font-semibold">Title of IPR <span className="text-destructive font-black">*</span></FormLabel>
                            <FormControl><Textarea {...field} value={field.value ?? ""} className="min-h-[100px] text-lg shadow-sm focus-visible:ring-primary" placeholder="Enter full title of the patent/IPR" /></FormControl>
                            <FormMessage />
                        </FormItem> 
                    )} />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField name="patentApplicationNumber" control={form.control} render={({ field }) => ( 
                            <FormItem>
                                <FormLabel className="text-base font-semibold">Application Number <span className="text-destructive font-black">*</span></FormLabel>
                                <FormControl><Input {...field} value={field.value ?? ""} className="h-12 shadow-sm font-mono" placeholder="e.g. 2023110XXXXX" /></FormControl>
                                <FormMessage />
                            </FormItem> 
                        )} />
                        <FormField name="patentDomain" control={form.control} render={({ field }) => ( 
                            <FormItem>
                                <FormLabel className="text-base font-semibold">Domain of IPR <span className="text-destructive font-black">*</span></FormLabel>
                                <FormControl><Input {...field} value={field.value ?? ""} className="h-12 shadow-sm" placeholder="e.g. Mechanical, Biotech, CSE" /></FormControl>
                                <FormMessage />
                            </FormItem> 
                        )} />
                    </div>
                </section>
                
                <Separator className="my-8" />

                <section className="space-y-6">
                    <div className="flex items-center gap-2 text-primary font-bold text-lg mb-4">
                        <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                        Team & Inventors
                    </div>
                    
                    <div className="bg-muted/20 p-6 rounded-2xl border border-dashed border-primary/30 space-y-6">
                        <div className="space-y-3">
                            <Label className="text-base font-bold text-primary flex items-center gap-2">
                                <Search className="h-4 w-4" /> Member Lookup Type
                            </Label>
                            <RadioGroup 
                                defaultValue="inventor" 
                                onValueChange={(val) => setAddType(val as 'inventor' | 'applicant')}
                                className="flex gap-4"
                            >
                                <Label 
                                    htmlFor="add-inventor" 
                                    className="flex items-center space-x-2 bg-background px-4 py-3 rounded-xl border cursor-pointer hover:bg-muted/50 transition-colors [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
                                >
                                    <RadioGroupItem value="inventor" id="add-inventor" />
                                    <span className="font-semibold cursor-pointer">Internal Inventor</span>
                                </Label>
                                <Label 
                                    htmlFor="add-applicant" 
                                    className="flex items-center space-x-2 bg-background px-4 py-3 rounded-xl border cursor-pointer hover:bg-muted/50 transition-colors [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
                                >
                                    <RadioGroupItem value="applicant" id="add-applicant" />
                                    <span className="font-semibold cursor-pointer">Co-Applicant</span>
                                </Label>
                            </RadioGroup>
                        </div>
                        
                        <AuthorSearch 
                            authors={addType === 'inventor' ? inventorFields : applicantFields}
                            onAdd={(u) => addType === 'inventor' ? appendInventor(u) : appendApplicant(u)}
                            type={addType}
                            title={`Add Internal ${addType === 'inventor' ? 'Inventor' : 'Co-Applicant'}`}
                            currentUserEmail={user?.email}
                        />

                        {(inventorFields.length > 0 || applicantFields.length > 0) && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                                {inventorFields.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-xs font-black uppercase text-muted-foreground px-1 tracking-widest">Added Inventors</p>
                                        {inventorFields.map((field, index) => (
                                            <div key={field.id} className="flex items-center justify-between bg-background p-3 rounded-xl border shadow-sm animate-in slide-in-from-left-2 transition-all group">
                                                <div className="flex items-center gap-3">
                                                    <div className="bg-primary/10 p-2 rounded-lg text-primary text-xs font-bold">{index + 1}</div>
                                                    <div>
                                                        <p className="font-bold text-sm">{field.name}</p>
                                                        <p className="text-[10px] text-muted-foreground uppercase">
                                                            {field.misId || (field.isExternal ? (field.organization || 'External') : 'Internal')}
                                                        </p>
                                                    </div>
                                                </div>
                                                {index > 0 && (
                                                    <Button type="button" variant="ghost" size="sm" className="h-8 w-8 text-destructive p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeInventor(index)}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {applicantFields.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-xs font-black uppercase text-muted-foreground px-1 tracking-widest">Co-Applicants</p>
                                        {applicantFields.map((field, index) => (
                                            <div key={field.id} className="flex items-center justify-between bg-background p-3 rounded-xl border shadow-sm animate-in slide-in-from-left-2 transition-all group">
                                                <div className="flex items-center gap-3">
                                                    <div className="bg-secondary/20 p-2 rounded-lg text-secondary-foreground text-xs font-bold">{index + 1}</div>
                                                    <div>
                                                        <p className="font-bold text-sm">{field.name}</p>
                                                        <p className="text-[10px] text-muted-foreground uppercase">
                                                            {field.misId || field.organization || (field.isExternal ? 'External' : 'Internal')}
                                                        </p>
                                                    </div>
                                                </div>
                                                <Button type="button" variant="ghost" size="sm" className="h-8 w-8 text-destructive p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeApplicant(index)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </section>
                
                <Separator className="my-8" />

                <section className="space-y-6">
                    <div className="flex items-center gap-2 text-primary font-bold text-lg mb-4">
                        <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                        Student Details
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                            control={form.control}
                            name="patentTotalStudents"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-base font-semibold">No. of Student Members (PU)</FormLabel>
                                    <FormControl>
                                        <Input type="number" {...field} min="0" className="h-12 shadow-sm rounded-xl" />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="patentStudentNames"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-base font-semibold">Name of Student Members from PU</FormLabel>
                                    <FormControl>
                                        <Textarea placeholder="Enter name of student members, separated by comma..." {...field} value={field.value ?? ""} className="min-h-[48px] shadow-sm rounded-xl" />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </section>

                <Separator className="my-8" />

                <section className="space-y-6">
                    <div className="flex items-center gap-2 text-primary font-bold text-lg mb-4">
                        <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                        Collaboration & SDGs
                    </div>
                 
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <FormField name="isCollaboration" control={form.control} render={({ field }) => ( 
                            <FormItem>
                                <FormLabel className="text-base font-semibold">Is this a Collaboration? <span className="text-destructive font-black">*</span></FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl><SelectTrigger className="h-12 shadow-sm"><SelectValue placeholder="Select..."/></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="Yes">Yes (Joint filing)</SelectItem>
                                        <SelectItem value="No">No (Independent)</SelectItem>
                                        <SelectItem value="NA">Not Applicable</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem> 
                        )} />
                        {isCollaboration === 'Yes' && (
                            <FormField name="collaborationDetails" control={form.control} render={({ field }) => ( 
                                <FormItem>
                                    <FormLabel className="text-base font-semibold text-primary/80">Collaboration Details <span className="text-destructive font-black">*</span></FormLabel>
                                    <FormControl><Textarea {...field} value={field.value ?? ""} className="h-12 min-h-[48px] shadow-sm" placeholder="List partnering institutes/orgs" /></FormControl>
                                    <FormMessage />
                                </FormItem> 
                            )} />
                        )}
                    </div>
                 
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <FormField name="isIprSdg" control={form.control} render={({ field }) => ( 
                            <FormItem>
                                <FormLabel className="text-base font-semibold">Related to Sustainable Development Goals? <span className="text-destructive font-black">*</span></FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl><SelectTrigger className="h-12 shadow-sm"><SelectValue placeholder="Select..."/></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="Yes">Yes</SelectItem>
                                        <SelectItem value="No">No</SelectItem>
                                        <SelectItem value="NA">NA</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem> 
                        )} />
                        {isIprSdg === 'Yes' && (
                            <FormField control={form.control} name="sdgGoals" render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-base font-semibold text-primary/80">Select SDG Goal(s) <span className="text-destructive font-black">*</span></FormLabel>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="outline" className="w-full justify-between h-12 font-medium shadow-sm border-primary/20 bg-primary/5">
                                            {(() => {
                                                const selectedCount = field.value?.length ?? 0;
                                                return selectedCount > 0 ? `${selectedCount} Goal(s) Selected` : "Click to select goals";
                                            })()}
                                            <ChevronDown className="h-4 w-4 opacity-50" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] max-h-80 overflow-y-auto rounded-xl">
                                            <DropdownMenuLabel className="font-black text-xs uppercase tracking-widest text-muted-foreground p-3">Sustainable Development Goals</DropdownMenuLabel>
                                            <DropdownMenuSeparator />
                                            {sdgGoalsList.map((goal) => (
                                                <DropdownMenuCheckboxItem key={goal} checked={field.value?.includes(goal)} onCheckedChange={(checked) => { return checked ? field.onChange([...(field.value || []), goal]) : field.onChange(field.value?.filter((value) => value !== goal)); }} onSelect={(e) => e.preventDefault()} className="py-2.5">{goal}</DropdownMenuCheckboxItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <FormField name="isIprDisciplinary" control={form.control} render={({ field }) => ( 
                            <FormItem>
                                <FormLabel className="text-base font-semibold">Disciplinary Category <span className="text-destructive font-black">*</span></FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl><SelectTrigger className="h-12 shadow-sm"><SelectValue placeholder="Select..."/></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="Yes">Yes (Multi/Inter/Trans)</SelectItem>
                                        <SelectItem value="No">No (Single Subject)</SelectItem>
                                        <SelectItem value="NA">NA</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem> 
                        )} />
                        {isIprDisciplinary === 'Yes' && (
                            <FormField name="disciplinaryType" control={form.control} render={({ field }) => ( 
                                <FormItem>
                                    <FormLabel className="text-base font-semibold text-primary/80">Select Type <span className="text-destructive font-black">*</span></FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl><SelectTrigger className="h-12 shadow-sm"><SelectValue/></SelectTrigger></FormControl>
                                        <SelectContent>
                                            <SelectItem value="Interdisciplinary">Interdisciplinary</SelectItem>
                                            <SelectItem value="Multidisciplinary">Multidisciplinary</SelectItem>
                                            <SelectItem value="Transdisciplinary">Transdisciplinary</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem> 
                            )} />
                        )}
                    </div>
                </section>
                
                <Separator className="my-8" />

                <section className="space-y-8">
                    <div className="flex items-center gap-2 text-primary font-bold text-lg mb-4">
                        <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                        Filing Specifics & Status
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                        <FormField name="patentSpecificationType" control={form.control} render={({ field }) => ( 
                            <FormItem className="space-y-3 p-4 bg-muted/30 rounded-2xl border">
                                <FormLabel className="text-base font-bold">Specification Type <span className="text-destructive font-black">*</span></FormLabel>
                                <FormControl>
                                    <RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-4">
                                        <Label 
                                            htmlFor="spec-full" 
                                            className="flex items-center space-x-3 bg-background px-4 py-2 rounded-xl border hover:bg-muted transition-colors cursor-pointer flex-1 [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
                                        >
                                            <RadioGroupItem value="Full" id="spec-full" />
                                            <span className="font-semibold cursor-pointer flex-1">Full</span>
                                        </Label>
                                        <Label 
                                            htmlFor="spec-prov" 
                                            className="flex items-center space-x-3 bg-background px-4 py-2 rounded-xl border hover:bg-muted transition-colors cursor-pointer flex-1 [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
                                        >
                                            <RadioGroupItem value="Provisional" id="spec-prov" />
                                            <span className="font-semibold cursor-pointer flex-1">Provisional</span>
                                        </Label>
                                    </RadioGroup>
                                </FormControl>
                                <FormMessage />
                            </FormItem> 
                        )} />

                        <FormField name="patentFiledInPuName" control={form.control} render={({ field }) => ( 
                            <FormItem className="space-y-3 p-4 bg-muted/30 rounded-2xl border">
                                <FormLabel className="text-base font-bold">Filed in PU Name? <span className="text-destructive font-black">*</span></FormLabel>
                                <FormControl>
                                    <RadioGroup onValueChange={(val) => field.onChange(val === 'true')} value={String(field.value)} className="flex gap-4">
                                        <Label 
                                            htmlFor="filed-pu-yes" 
                                            className="flex items-center space-x-3 bg-background px-4 py-2 rounded-xl border hover:bg-muted transition-colors cursor-pointer flex-1 [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
                                        >
                                            <RadioGroupItem value="true" id="filed-pu-yes" />
                                            <span className="font-semibold cursor-pointer flex-1">Yes</span>
                                        </Label>
                                        <Label 
                                            htmlFor="filed-pu-no" 
                                            className="flex items-center space-x-3 bg-background px-4 py-2 rounded-xl border hover:bg-muted transition-colors cursor-pointer flex-1 [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
                                        >
                                            <RadioGroupItem value="false" id="filed-pu-no" />
                                            <span className="font-semibold cursor-pointer flex-1">No</span>
                                        </Label>
                                    </RadioGroup>
                                </FormControl>
                                <FormMessage />
                            </FormItem> 
                        )} />

                        {patentFiledInPuName && (
                            <FormField name="isPuSoleApplicant" control={form.control} render={({ field }) => ( 
                                <FormItem className="space-y-3 p-4 bg-primary/5 rounded-2xl border border-primary/20 md:col-span-1">
                                    <FormLabel className="text-base font-bold text-primary">Is PU Sole Applicant?</FormLabel>
                                    <FormControl>
                                        <RadioGroup onValueChange={(val) => field.onChange(val === 'true')} value={String(field.value)} className="flex gap-4">
                                            <Label 
                                                htmlFor="sole-yes" 
                                                className="flex items-center space-x-3 bg-background px-4 py-2 rounded-xl border hover:bg-muted transition-colors cursor-pointer flex-1 [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
                                            >
                                                <RadioGroupItem value="true" id="sole-yes" />
                                                <span className="font-semibold cursor-pointer flex-1">Yes</span>
                                            </Label>
                                            <Label 
                                                htmlFor="sole-no" 
                                                className="flex items-center space-x-3 bg-background px-4 py-2 rounded-xl border hover:bg-muted transition-colors cursor-pointer flex-1 [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
                                            >
                                                <RadioGroupItem value="false" id="sole-no" />
                                                <span className="font-semibold cursor-pointer flex-1">Joint</span>
                                            </Label>
                                        </RadioGroup>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem> 
                            )} />
                        )}

                        <FormField name="patentFiledFromIprCell" control={form.control} render={({ field }) => ( 
                            <FormItem className="space-y-3 p-4 bg-muted/30 rounded-2xl border">
                                <FormLabel className="text-base font-bold">Filed via PU IPR Cell? <span className="text-destructive font-black">*</span></FormLabel>
                                <FormControl>
                                    <RadioGroup onValueChange={(val) => field.onChange(val === 'true')} value={field.value !== undefined ? String(field.value) : ''} className="flex gap-4">
                                        <Label 
                                            htmlFor="ipr-cell-yes" 
                                            className="flex items-center space-x-3 bg-background px-4 py-2 rounded-xl border hover:bg-muted transition-colors cursor-pointer flex-1 [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                                            <RadioGroupItem value="true" id="ipr-cell-yes" />
                                            <span className="font-semibold cursor-pointer flex-1">Yes</span>
                                        </Label>
                                        <Label 
                                            htmlFor="ipr-cell-no" 
                                            className="flex items-center space-x-3 bg-background px-4 py-2 rounded-xl border hover:bg-muted transition-colors cursor-pointer flex-1 [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                                            <RadioGroupItem value="false" id="ipr-cell-no" />
                                            <span className="font-semibold cursor-pointer flex-1">No</span>
                                        </Label>
                                    </RadioGroup>
                                </FormControl>
                                <FormMessage />
                            </FormItem> 
                        )} />

                        <FormField name="patentRoutedViaSsip" control={form.control} render={({ field }) => ( 
                            <FormItem className="space-y-3 p-4 bg-muted/30 rounded-2xl border">
                                <FormLabel className="text-base font-bold">Is the application routed via SSIP? <span className="text-destructive font-black">*</span></FormLabel>
                                <FormControl>
                                    <RadioGroup onValueChange={(val) => field.onChange(val === 'true')} value={field.value !== undefined ? String(field.value) : ''} className="flex gap-4">
                                        <Label 
                                            htmlFor="ssip-yes" 
                                            className="flex items-center space-x-3 bg-background px-4 py-2 rounded-xl border hover:bg-muted transition-colors cursor-pointer flex-1 [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                                            <RadioGroupItem value="true" id="ssip-yes" />
                                            <span className="font-semibold cursor-pointer flex-1">Yes</span>
                                        </Label>
                                        <Label 
                                            htmlFor="ssip-no" 
                                            className="flex items-center space-x-3 bg-background px-4 py-2 rounded-xl border hover:bg-muted transition-colors cursor-pointer flex-1 [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                                            <RadioGroupItem value="false" id="ssip-no" />
                                            <span className="font-semibold cursor-pointer flex-1">No</span>
                                        </Label>
                                    </RadioGroup>
                                </FormControl>
                                <FormMessage />
                            </FormItem> 
                        )} />

                        {patentFiledFromIprCell === false && (
                            <FormField name="patentPermissionTaken" control={form.control} render={({ field }) => ( 
                                <FormItem className="space-y-3 p-4 bg-orange-50 rounded-2xl border border-orange-200">
                                    <FormLabel className="text-base font-bold text-orange-700">Permission Taken?</FormLabel>
                                    <FormControl>
                                        <RadioGroup onValueChange={(val) => field.onChange(val === 'true')} value={String(field.value)} className="flex gap-4">
                                            <Label 
                                                htmlFor="perm-yes" 
                                                className="flex items-center space-x-3 bg-background px-4 py-2 rounded-xl border hover:bg-muted transition-colors cursor-pointer flex-1 [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
                                            >
                                                <RadioGroupItem value="true" id="perm-yes" />
                                                <span className="font-semibold cursor-pointer flex-1">Yes</span>
                                            </Label>
                                            <Label 
                                                htmlFor="perm-no" 
                                                className="flex items-center space-x-3 bg-background px-4 py-2 rounded-xl border hover:bg-muted transition-colors cursor-pointer flex-1 [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
                                            >
                                                <RadioGroupItem value="false" id="perm-no" />
                                                <span className="font-semibold cursor-pointer flex-1">No</span>
                                            </Label>
                                        </RadioGroup>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem> 
                            )} />
                        )}
                    </div>

                    <div className="bg-primary/5 p-6 rounded-2xl border border-primary/20 space-y-6">
                        <FormField name="currentStatus" control={form.control} render={({ field }) => ( 
                            <FormItem>
                                <FormLabel className="text-base font-bold text-primary">Current Lifecycle Status <span className="text-destructive font-black">*</span></FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl><SelectTrigger className="h-12 shadow-sm font-bold bg-background"><SelectValue placeholder="Select status"/></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="Filed">Filed (Form 1 submitted)</SelectItem>
                                        <SelectItem value="Published">Published (Official Journal)</SelectItem>
                                        <SelectItem value="Granted">Granted (Patent Certificate awarded)</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem> 
                        )} />
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField name="filingDate" control={form.control} render={({ field }) => ( 
                                <FormItem className="flex flex-col">
                                    <FormLabel className="text-sm font-semibold mb-2">Date of Filing <span className="text-destructive font-black">*</span></FormLabel>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <FormControl>
                                                <Button variant={"outline"} className={cn("h-12 pl-3 text-left font-normal bg-background shadow-sm", !field.value && "text-muted-foreground")}>
                                                    {field.value ? format(field.value, "PPP") : (<span>Pick a date</span>)}
                                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                </Button>
                                            </FormControl>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0 rounded-xl" align="start">
                                            <Calendar 
                                                mode="single" 
                                                selected={field.value} 
                                                onSelect={field.onChange} 
                                                disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                                                initialFocus 
                                            />
                                        </PopoverContent>
                                    </Popover>
                                    <FormMessage />
                                </FormItem> 
                            )} />
                            {(currentStatus === 'Published' || currentStatus === 'Granted') && (
                                <FormField name="publicationDate" control={form.control} render={({ field }) => ( 
                                    <FormItem className="flex flex-col">
                                        <FormLabel className="text-sm font-semibold mb-2">Date of Publication <span className="text-destructive font-black">*</span></FormLabel>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <FormControl>
                                                    <Button variant={"outline"} className={cn("h-12 pl-3 text-left font-normal bg-background shadow-sm", !field.value && "text-muted-foreground")}>
                                                        {field.value ? format(field.value, "PPP") : (<span>Pick a date</span>)}
                                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                    </Button>
                                                </FormControl>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0 rounded-xl" align="start">
                                                <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                                            </PopoverContent>
                                        </Popover>
                                        <FormMessage />
                                    </FormItem> 
                                )} />
                            )}
                            {currentStatus === 'Granted' && (
                                <FormField name="grantDate" control={form.control} render={({ field }) => ( 
                                    <FormItem className="flex flex-col">
                                        <FormLabel className="text-sm font-semibold mb-2 text-green-700 font-bold">Date of Grant <span className="text-destructive font-black">*</span></FormLabel>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <FormControl>
                                                    <Button variant={"outline"} className={cn("h-12 pl-3 text-left font-normal bg-background border-green-200 shadow-sm", !field.value && "text-muted-foreground")}>
                                                        {field.value ? format(field.value, "PPP") : (<span>Pick a date</span>)}
                                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                    </Button>
                                                </FormControl>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0 rounded-xl" align="start">
                                                <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                                            </PopoverContent>
                                        </Popover>
                                        <FormMessage />
                                    </FormItem> 
                                )} />
                            )}
                        </div>
                    </div>
                </section>

                 <section className="space-y-6">
                    <div className="flex items-center gap-2 text-primary font-bold text-lg mb-4">
                        <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                        Documentation
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField name="patentForm1" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( 
                            <FormItem>
                                <FormLabel className="font-semibold text-xs uppercase tracking-widest text-muted-foreground flex flex-wrap items-center justify-between gap-2">
                                    <span>Upload Proof of Status (PDF/Image) <span className="text-destructive font-black">*</span></span>
                                    <a 
                                        href="https://iprsearch.ipindia.gov.in/PublicSearch/PublicationSearch/ApplicationStatus" 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="text-[10px] text-primary lowercase tracking-normal font-bold underline normal-case flex items-center gap-1"
                                    >
                                        Verify Application Status
                                    </a>
                                </FormLabel>
                                <FormControl>
                                    <Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} accept="application/pdf,image/png,image/jpeg,image/jpg" className="h-12 border-dashed bg-muted/10" />
                                </FormControl>
                                <FormMessage />
                            </FormItem> 
                        )} />
                        <FormField name="patentGovtReceipt" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel className="font-semibold text-xs uppercase tracking-widest text-muted-foreground">Attach Proof (Govt. Receipt) (PDF) <span className="text-destructive font-black">*</span></FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} accept="application/pdf" className="h-12 border-dashed bg-muted/10"/></FormControl><FormMessage /></FormItem> )} />
                    </div>
                    {patentFiledFromIprCell === false && (
                        <FormField name="patentApprovalProof" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel className="font-semibold text-xs uppercase tracking-widest text-muted-foreground">Attach Proof of Approval (PDF) <span className="text-destructive font-black">*</span></FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} accept="application/pdf" className="h-12 border-dashed bg-muted/10"/></FormControl><FormMessage /></FormItem> )} />
                    )}

                    <FormField control={form.control} name="patentSelfDeclaration" render={({ field }) => ( 
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-2xl border-2 border-primary/20 p-6 bg-primary/5 shadow-sm">
                            <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} className="h-6 w-6 rounded-md" /></FormControl>
                            <div className="space-y-1">
                                <FormLabel className="font-bold text-primary">Self Declaration Acknowledgement <span className="text-destructive font-black">*</span></FormLabel>
                                <p className="text-sm text-primary/80 font-medium">I hereby confirm that I have not applied/claimed for any incentive for the same IP application earlier and all details are accurate.</p>
                                <FormMessage />
                            </div>
                        </FormItem> 
                    )} />
                </section>

                {calculatedIncentive !== null && (
                    <Alert className="mt-8 bg-primary/5 border-primary/20 py-6 rounded-3xl transition-all animate-in zoom-in-95 border-l-4 border-l-primary shadow-sm hover:shadow-md mb-8">
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
                                {getPatentLogicBreakdown(form.getValues()).map((step, idx) => (
                                <div key={idx} className="flex justify-between items-center py-1 border-b last:border-0 border-muted">
                                    <span className="text-muted-foreground">{step.label}</span>
                                    <span className={idx === (getPatentLogicBreakdown(form.getValues()).length - 1) ? "font-bold text-green-600" : "font-semibold"}>{step.value}</span>
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
            </div>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex justify-between p-8 bg-muted/20 border-t items-center">
        <Button
            type="button"
            variant="ghost"
            onClick={() => handleSave('Draft')}
            disabled={isSubmitting}
            className="rounded-xl px-6 h-12 font-semibold hover:bg-background/80"
        >
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save as Draft
        </Button>
        
        <div className="flex gap-4">
            <Button variant="ghost" size="lg" onClick={() => router.back()} className="rounded-xl px-8 h-12 font-semibold">Cancel</Button>
            <Button size="lg" onClick={handleProceedToReview} disabled={isSubmitting || bankDetailsMissing || orcidOrMisIdMissing} className="rounded-xl px-10 h-12 font-bold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all">
                Review Application
            </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

