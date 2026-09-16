'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { GanttChartSquare, Microscope, Users, FileText, Loader2, ChevronDown, Upload, X, Download, ClipboardCheck, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { User, CoPiDetails, SpecialCfp, CfpSubmission } from '@/types';
import { getDefaultModulesForRole } from '@/lib/modules';
import { Checkbox } from '@/components/ui/checkbox';
import { isCfpDeadlinePast } from '@/lib/utils';
import { db } from '@/lib/config';
import { doc, getDoc, collection } from 'firebase/firestore';
import { saveCfpSubmission } from '@/app/actions';
import { uploadFileToApi, uploadPublicCfpFile } from '@/lib/upload-client';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from '@/components/ui/separator';
import { format, parseISO } from 'date-fns';

const steps = [
  { id: 1, title: 'Investigator & Project', icon: Microscope },
  { id: 2, title: 'Team Details', icon: Users },
  { id: 3, title: 'Proposal Files', icon: FileText },
  { id: 4, title: 'Timeline & Outlay', icon: GanttChartSquare },
];

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
];

export default function CfpApplyPage() {
  const params = useParams();
  const cfpId = params.id as string;
  const searchParams = useSearchParams();
  const draftId = searchParams.get('draftId');

  const [cfp, setCfp] = useState<SpecialCfp | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();
  const router = useRouter();

  const [draftData, setDraftData] = useState<CfpSubmission | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);

  // Co-PI details and CV lists
  const [coPiList, setCoPiList] = useState<CoPiDetails[]>([]);
  const [piCvFile, setPiCvFile] = useState<File | null>(null);
  const [coPiCvFiles, setCoPiCvFiles] = useState<{ [email: string]: File }>({});

  // Manual Co-PI input fields
  const [coPiName, setCoPiName] = useState('');
  const [coPiEmail, setCoPiEmail] = useState('');
  const [coPiOrg, setCoPiOrg] = useState('');

  // Single Page Mode Check
  const isSinglePageMode = cfpId === 'pu-sustainability-grand-challenge-2026';
  const isDeadlinePassed = useMemo(() => {
    if (draftData?.allowEditAfterDeadline) return false;
    return isCfpDeadlinePast(cfp?.applyDeadline, cfp?.status);
  }, [cfp, draftData]);
  const totalSteps = isSinglePageMode ? 2 : 4;
  const stepsToShow = isSinglePageMode
    ? [
      { id: 1, title: 'Fill Application', icon: Microscope },
      { id: 2, title: 'Review & Submit', icon: ClipboardCheck },
    ]
    : steps;

  useEffect(() => {
    const fetchCfp = async () => {
      try {
        const docRef = doc(db, 'specialCfps', cfpId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setCfp({ id: docSnap.id, ...docSnap.data() } as SpecialCfp);
        } else {
          toast({ variant: 'destructive', title: 'Error', description: 'Call announcement not found.' });
        }
      } catch (error) {
        console.error("Error fetching CFP details:", error);
      }
    };
    if (cfpId) fetchCfp();
  }, [cfpId, toast]);

  const formSchema = useMemo(() => z.object({
    // Step 1: PI & Project Info
    piName: z.string().min(3, 'Name is required.'),
    piEmail: z.string().email('Invalid email.'),
    piPhone: z.string().min(10, 'Valid phone number is required.'),
    piOrganization: z.string().min(3, 'Organization is required.'),
    piFaculty: z.string().optional(),
    piDepartment: z.string().optional(),

    title: z.string().min(5, 'Title must be at least 5 characters.'),
    abstract: z.string().min(20, 'Abstract must be at least 20 characters.'),
    projectType: z.string().min(1, 'Category is required.'),
    sdgGoals: z.array(z.string()).min(1, 'Please select at least one SDG goal.'),

    // Step 2
    studentInfo: z.string().optional(),

    // Step 3
    proposalUpload: z.any().refine((files) => {
      if (draftId) return true;
      return files && files.length > 0;
    }, 'Project proposal is required.'),
    ethicsUpload: z.any().optional(),

    // Step 4
    expectedOutcomes: z.string().min(10, 'Expected outcomes are required.'),
    guidelinesAgreement: z.boolean().refine(val => val === true, {
      message: "You must agree to the guidelines to submit.",
    }),
  }), [draftId]);

  type FormData = z.infer<typeof formSchema>;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      piName: '',
      piEmail: '',
      piPhone: '',
      piOrganization: '',
      piFaculty: '',
      piDepartment: '',
      title: '',
      abstract: '',
      projectType: '',
      studentInfo: '',
      expectedOutcomes: '',
      guidelinesAgreement: false,
      sdgGoals: [],
    },
  });

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsed = JSON.parse(storedUser) as User;
      const allowedModules = parsed.allowedModules || getDefaultModulesForRole(parsed.role, parsed.designation);
      if (!allowedModules.includes('call-for-proposals')) {
        toast({
          title: 'Access Denied',
          description: "You don't have permission to view this page.",
          variant: 'destructive',
        });
        router.replace('/dashboard');
        return;
      }
      setCurrentUser(parsed);
      // Prefill fields
      form.setValue('piName', parsed.name);
      form.setValue('piEmail', parsed.email);
      form.setValue('piPhone', parsed.phoneNumber || '');
      form.setValue('piOrganization', parsed.campus ? 'Parul University Goa' : '');
      form.setValue('piFaculty', parsed.faculty || '');
      form.setValue('piDepartment', parsed.department || '');
    } else {
      router.replace('/login');
    }
  }, [cfpId, form, router, toast]);

  useEffect(() => {
    if (!draftId) return;
    const fetchDraft = async () => {
      setLoadingDraft(true);
      try {
        const docRef = doc(db, 'cfpSubmissions', draftId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = { id: docSnap.id, ...docSnap.data() } as CfpSubmission;
          setDraftData(data);
          
          form.reset({
            piName: data.piName || '',
            piEmail: data.piEmail || '',
            piPhone: data.piPhone || '',
            piOrganization: data.piOrganization || '',
            piFaculty: data.piFaculty || '',
            piDepartment: data.piDepartment || '',
            title: data.title || '',
            abstract: data.abstract || '',
            projectType: data.projectType || '',
            studentInfo: data.studentInfo || '',
            expectedOutcomes: data.expectedOutcomes || '',
            guidelinesAgreement: data.guidelinesAgreement || false,
            sdgGoals: data.sdgGoals || [],
          });

          if (data.coPiDetails) {
            setCoPiList(data.coPiDetails);
          }
        } else {
          toast({ variant: 'destructive', title: 'Error', description: 'Draft submission not found.' });
        }
      } catch (err) {
        console.error("Error fetching draft:", err);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to load draft details.' });
      } finally {
        setLoadingDraft(false);
      }
    };
    fetchDraft();
  }, [draftId, form, toast]);

  const handleNext = async () => {
    const fieldsToValidate = isSinglePageMode
      ? {
        1: ['piName', 'piEmail', 'piPhone', 'piOrganization', 'title', 'abstract', 'projectType', 'sdgGoals', 'proposalUpload', 'expectedOutcomes'],
        2: ['guidelinesAgreement'],
      }[currentStep] as (keyof FormData)[]
      : {
        1: ['piName', 'piEmail', 'piPhone', 'piOrganization', 'title', 'abstract', 'projectType', 'sdgGoals'],
        2: [],
        3: ['proposalUpload'],
        4: ['expectedOutcomes', 'guidelinesAgreement'],
      }[currentStep] as (keyof FormData)[];

    if (currentStep === 1) {
      if (!piCvFile && !draftData?.piCvUrl) {
        toast({
          variant: 'destructive',
          title: 'CV Required',
          description: 'Please upload your CV as the Principal Investigator.'
        });
        return;
      }
    }

    if ((!isSinglePageMode && currentStep === 2) || (isSinglePageMode && currentStep === 1)) {
      const missingCvs = coPiList.filter(coPi => !coPi.cvUrl && !coPiCvFiles[coPi.email]);
      if (missingCvs.length > 0) {
        toast({
          variant: 'destructive',
          title: 'CV Required',
          description: `Please upload CV for Co-PIs: ${missingCvs.map(c => c.name).join(', ')}`
        });
        return;
      }
    }

    const isValid = await form.trigger(fieldsToValidate);
    if (isValid) {
      if (currentStep < totalSteps) {
        setCurrentStep(currentStep + 1);
      }
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleAddCoPi = () => {
    if (coPiList.length >= 3) {
      toast({
        variant: 'destructive',
        title: 'Limit Reached',
        description: 'You can add a maximum of 3 Co-PIs.'
      });
      return;
    }

    if (!coPiName || !coPiEmail || !coPiOrg) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please fill all Co-PI fields.' });
      return;
    }

    if (coPiList.some(c => c.email === coPiEmail)) {
      toast({ variant: 'destructive', title: 'Duplicate Co-PI', description: 'Co-PI already added.' });
      return;
    }

    const newCoPi: CoPiDetails = {
      name: coPiName,
      email: coPiEmail,
      organization: coPiOrg,
      isExternal: coPiOrg.toLowerCase() !== 'parul university' && coPiOrg.toLowerCase() !== 'parul university goa',
    };

    setCoPiList([...coPiList, newCoPi]);
    setCoPiName('');
    setCoPiEmail('');
    setCoPiOrg('');
  };

  const handleRemoveCoPi = (email: string) => {
    setCoPiList(coPiList.filter(c => c.email !== email));
    const newCvs = { ...coPiCvFiles };
    delete newCvs[email];
    setCoPiCvFiles(newCvs);
  };

  const handleCvUpload = (file: File | null, email?: string) => {
    if (!file) {
      if (email) {
        const newCvs = { ...coPiCvFiles };
        delete newCvs[email];
        setCoPiCvFiles(newCvs);
      } else {
        setPiCvFile(null);
      }
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File Too Large', description: 'CV file must be under 5MB.' });
      return;
    }

    if (email) {
      setCoPiCvFiles(prev => ({ ...prev, [email]: file }));
    } else {
      setPiCvFile(file);
    }
  };

  const handleSaveSubmission = async (status: 'Draft' | 'Submitted') => {
    if (coPiList.length > 3) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'You can submit a maximum of 3 Co-PIs.'
      });
      return;
    }

    setIsSaving(true);
    setProgress(5);

    try {
      let submissionId = draftId || doc(collection(db, 'cfpSubmissions')).id;

      const uploadFile = async (file: File): Promise<string> => {
        const result = await uploadPublicCfpFile(file, cfpId);
        if (result.success && result.url) return result.url;
        throw new Error(result.error || `Failed to upload ${file.name}`);
      };

      // PI CV
      let piCvUrl = draftData?.piCvUrl || '';
      let piCvFileName = draftData?.piCvFileName || '';
      if (piCvFile) {
        piCvUrl = await uploadFile(piCvFile);
        piCvFileName = piCvFile.name;
        setProgress(20);
      }

      // Co-PI CVs
      const updatedCoPiList = [...coPiList];
      let uploadProgress = 25;
      for (let i = 0; i < updatedCoPiList.length; i++) {
        const coPi = updatedCoPiList[i];
        const cvFile = coPiCvFiles[coPi.email];
        if (cvFile) {
          const cvUrl = await uploadFile(cvFile);
          updatedCoPiList[i] = {
            ...coPi,
            cvUrl,
            cvFileName: cvFile.name
          };
          uploadProgress += 15;
          setProgress(uploadProgress);
        }
      }

      const data = form.getValues();

      // Project Proposal
      let proposalUrl = draftData?.proposalUrl || '';
      let proposalUrls: string[] = draftData?.proposalUrls || [];
      let proposalFileNames: string[] = draftData?.proposalFileNames || [];
      if (data.proposalUpload && data.proposalUpload.length > 0) {
        proposalUrls = [];
        proposalFileNames = [];
        const totalFiles = data.proposalUpload.length;
        let progressStart = 50;
        let progressStep = 30 / totalFiles;
        for (let i = 0; i < totalFiles; i++) {
          const file = data.proposalUpload[i];
          const url = await uploadFile(file);
          if (i === 0) {
            proposalUrl = url;
          }
          proposalUrls.push(url);
          proposalFileNames.push(file.name);
          setProgress(progressStart + (i + 1) * progressStep);
        }
      }

      // Ethics Upload
      let ethicsUrl = draftData?.ethicsUrl || '';
      if (data.ethicsUpload?.[0]) {
        ethicsUrl = await uploadFile(data.ethicsUpload[0]);
        setProgress(90);
      }

      const submissionData: Omit<CfpSubmission, 'id'> = {
        cfpId: cfpId,
        cfpTitle: cfp?.title || 'Special CFP Call',
        piName: data.piName,
        piEmail: data.piEmail,
        piPhone: data.piPhone,
        piOrganization: data.piOrganization,
        piFaculty: data.piFaculty,
        piDepartment: data.piDepartment,
        piCvUrl,
        piCvFileName,
        title: data.title,
        abstract: data.abstract,
        projectType: data.projectType,
        sdgGoals: data.sdgGoals,
        coPiDetails: updatedCoPiList,
        studentInfo: data.studentInfo,
        proposalUrl,
        proposalUrls,
        proposalFileNames,
        ethicsUrl,
        expectedOutcomes: data.expectedOutcomes,
        guidelinesAgreement: data.guidelinesAgreement,
        status: status,
        submissionDate: new Date().toISOString(),
        pi_uid: currentUser?.uid || undefined,
        allowEditAfterDeadline: draftData?.allowEditAfterDeadline || undefined
      };

      const result = await saveCfpSubmission(submissionId, submissionData);
      if (result.success) {
        setProgress(100);
        toast({ title: status === 'Draft' ? 'Draft Saved!' : 'Proposal Submitted Successfully!' });
        router.push(currentUser ? '/dashboard/call-for-proposals' : '/');
      } else {
        throw new Error(result.error);
      }

    } catch (error: any) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Submission Failed', description: error.message });
    } finally {
      setIsSaving(false);
      setProgress(0);
    }
  };

  const onFinalSubmit = () => handleSaveSubmission('Submitted');

  if (loadingDraft) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="mt-2 text-xs font-semibold text-slate-500">Loading draft details...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-10 max-w-4xl pt-10">
      <Card className="border-slate-200 dark:border-white/5 bg-white dark:bg-slate-950/45 backdrop-blur-xl shadow-md dark:shadow-2xl rounded-3xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.01] to-transparent pointer-events-none" />
        <CardHeader className="border-b border-slate-100 dark:border-slate-900 pb-6">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] bg-primary/10 border border-primary/20 text-primary font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                {cfp?.department || 'Special Call'}
              </span>
              <CardTitle className="text-xl font-bold text-slate-900 dark:text-white mt-3">{cfp?.title}</CardTitle>
              <CardDescription className="text-slate-600 dark:text-slate-400 text-xs mt-1">
                Announced by Parul University Goa. Open to Parul University Goa faculty and external candidates.
              </CardDescription>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Step {currentStep} of {totalSteps}</p>
              <Progress value={(currentStep / totalSteps) * 100} className="w-24 mt-1 bg-slate-100 dark:bg-slate-900" />
            </div>
          </div>
        </CardHeader>

        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(onFinalSubmit)}>
            <CardContent className="p-8 space-y-6">

              {isDeadlinePassed && (
                <div className="p-5 rounded-2xl border border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-3 shadow-sm">
                  <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="font-bold text-sm text-destructive">Applications Closed</h4>
                    <p className="text-xs leading-relaxed text-destructive/90">
                      The application deadline for this Call for Proposals ({cfp?.applyDeadline ? format(parseISO(cfp.applyDeadline), 'dd MMM yyyy') : 'Past'}) has passed. New application submissions are closed and no longer accepted.
                    </p>
                  </div>
                </div>
              )}

              {/* Standard Step 1 or Single Page Mode Step 1 (Displays all fields in scrolled format) */}
              {currentStep === 1 && (
                <div className="space-y-6 animate-in fade-in-0">

                  {/* Call Overview & Guidelines PDF Card */}
                  <div className="border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-900/30 rounded-3xl p-6 space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
                      <div>
                        <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Call Overview</h4>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1 leading-relaxed">{cfp?.title}</h3>
                      </div>
                      {cfp?.applyDeadline && (
                        <span className="inline-flex items-center rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-[9px] font-bold text-primary uppercase tracking-wider shrink-0 self-start">
                          Deadline: {format(parseISO(cfp.applyDeadline), 'dd MMM yyyy')}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {cfp?.description}
                    </p>

                    {cfp?.files && cfp.files.length > 0 && (
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-900 space-y-2">
                        <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Call Documents</p>
                        <div className="flex flex-wrap gap-2">
                          {cfp.files.map((file, idx) => (
                            <Button key={idx} asChild variant="outline" size="sm" className="bg-white dark:bg-slate-950 border-slate-200 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-slate-900/80 text-slate-900 dark:text-white font-bold h-9 gap-1.5">
                              <a href={file.url} target="_blank" rel="noopener noreferrer">
                                <Download className="h-4 w-4 text-primary" />
                                {file.name}
                              </a>
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* investigator details */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider border-b border-slate-100 dark:border-slate-900 pb-2 pt-2">Investigator Details</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField name="piName" control={form.control} render={({ field }) => (
                        <FormItem><FormLabel>Investigator Name <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white" /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField name="piEmail" control={form.control} render={({ field }) => (
                        <FormItem><FormLabel>Email Address <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white" /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField name="piPhone" control={form.control} render={({ field }) => (
                        <FormItem><FormLabel>Phone Number <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white" /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField name="piOrganization" control={form.control} render={({ field }) => (
                        <FormItem><FormLabel>University / Organization <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} placeholder="e.g. Parul University, IIT, etc." className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white" /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>

                    {form.watch('piOrganization')?.toLowerCase().includes('parul') && (
                      <div className="grid grid-cols-2 gap-4">
                        <FormField name="piFaculty" control={form.control} render={({ field }) => (
                          <FormItem><FormLabel>Faculty</FormLabel><FormControl><Input {...field} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white" /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField name="piDepartment" control={form.control} render={({ field }) => (
                          <FormItem><FormLabel>Department</FormLabel><FormControl><Input {...field} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white" /></FormControl><FormMessage /></FormItem>
                        )} />
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">Principal Investigator's CV (PDF/Word, Max 5MB) <span className="text-destructive">*</span></label>
                      <Input type="file" accept=".pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => handleCvUpload(e.target.files?.[0] || null)} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white" />
                      {piCvFile ? (
                        <p className="text-xs text-primary font-semibold">Selected CV: {piCvFile.name}</p>
                      ) : draftData?.piCvUrl ? (
                        <p className="text-xs text-emerald-500 font-semibold flex items-center gap-1">
                          <FileText className="h-3 w-3 animate-pulse" /> Existing CV: <a href={draftData.piCvUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-emerald-450">View Uploaded CV</a> (Leave empty to keep existing)
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {/* project details */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider border-b border-slate-100 dark:border-slate-900 pb-2 pt-4">Project Details</h3>
                    <FormField name="title" control={form.control} render={({ field }) => (
                      <FormItem><FormLabel>Project Title <span className="text-destructive">*</span></FormLabel><FormControl><Input {...field} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white" /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField name="abstract" control={form.control} render={({ field }) => (
                      <FormItem><FormLabel>Abstract <span className="text-destructive">*</span></FormLabel><FormControl><Textarea rows={4} {...field} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white" /></FormControl><FormMessage /></FormItem>
                    )} />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField name="projectType" control={form.control} render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category <span className="text-destructive">*</span></FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white">
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-white dark:bg-slate-950 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white">
                              <SelectItem value="Unidisciplinary">Unidisciplinary</SelectItem>
                              <SelectItem value="Multi-Disciplinary">Multi-Disciplinary</SelectItem>
                              <SelectItem value="Inter-Disciplinary">Inter-Disciplinary</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />

                      <FormField
                        control={form.control}
                        name="sdgGoals"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>UN Sustainable Development Goals (SDGs) <span className="text-destructive">*</span></FormLabel>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="w-full justify-between bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white font-normal hover:bg-slate-100 dark:hover:bg-slate-900/80">
                                  {(field.value?.length || 0) > 0 ? `${field.value?.length} selected` : "Select goals"}
                                  <ChevronDown className="h-4 w-4 opacity-50" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] max-h-60 overflow-y-auto bg-white dark:bg-slate-950 text-slate-900 dark:text-white border-slate-200 dark:border-white/5">
                                <DropdownMenuLabel>Select all that apply</DropdownMenuLabel>
                                <DropdownMenuSeparator className="bg-slate-100 dark:bg-slate-900" />
                                {sdgGoalsList.map((goal) => (
                                  <DropdownMenuCheckboxItem
                                    key={goal}
                                    checked={field.value?.includes(goal) || false}
                                    onCheckedChange={(checked) => {
                                      return checked
                                        ? field.onChange([...(field.value || []), goal])
                                        : field.onChange((field.value || []).filter((value: string) => value !== goal));
                                    }}
                                    onSelect={(e) => e.preventDefault()}
                                    className="hover:bg-slate-50 dark:hover:bg-slate-900"
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
                    </div>
                  </div>

                  {/* If in Single Page Mode, include Co-PI, Files and Outcomes on step 1 */}
                  {isSinglePageMode && (
                    <>
                      <div className="space-y-6">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider border-b border-slate-100 dark:border-slate-900 pb-2 pt-4">Co-Investigators</h3>
                        <div className="grid grid-cols-3 gap-2">
                          <Input placeholder="Co-PI Name" value={coPiName} onChange={(e) => setCoPiName(e.target.value)} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white text-xs" />
                          <Input placeholder="Co-PI Email" value={coPiEmail} onChange={(e) => setCoPiEmail(e.target.value)} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white text-xs" />
                          <div className="flex gap-2">
                            <Input placeholder="University / Institute" value={coPiOrg} onChange={(e) => setCoPiOrg(e.target.value)} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white text-xs flex-1" />
                            <Button type="button" onClick={handleAddCoPi} className="bg-primary hover:bg-primary/95 text-xs h-9 px-3">Add</Button>
                          </div>
                        </div>

                        <div className="space-y-4 pt-2">
                          {coPiList.map(coPi => (
                            <div key={coPi.email} className="p-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-white/5 rounded-2xl space-y-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-bold text-slate-900 dark:text-white">{coPi.name}</p>
                                  <p className="text-xs text-slate-600 dark:text-slate-400">{coPi.email} | {coPi.organization}</p>
                                </div>
                                <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveCoPi(coPi.email)} className="h-7 text-destructive hover:bg-destructive/10">
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                              <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">CV Upload (PDF/Word, max 5MB) <span className="text-destructive">*</span></label>
                                <Input type="file" accept=".pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => handleCvUpload(e.target.files?.[0] || null, coPi.email)} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white text-xs h-8" />
                                {coPiCvFiles[coPi.email] && <p className="text-xs text-primary">Selected CV: {coPiCvFiles[coPi.email].name}</p>}
                              </div>
                            </div>
                          ))}
                        </div>

                        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider border-b border-slate-100 dark:border-slate-900 pb-2 pt-4">Student Members</h3>
                        <FormField name="studentInfo" control={form.control} render={({ field }) => (
                          <FormItem><FormControl><Textarea {...field} placeholder="List student names and roles (if any)..." className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white" /></FormControl><FormMessage /></FormItem>
                        )} />
                      </div>

                      <div className="space-y-6">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider border-b border-slate-100 dark:border-slate-900 pb-2 pt-4">Proposal Documents</h3>
                            <FormField
                              name="proposalUpload"
                              control={form.control}
                              render={({ field: { value, onChange, ...fieldProps } }) => (
                                <FormItem>
                                  <FormLabel>Project Proposal Documents (PDF/Word) <span className="text-destructive">*</span></FormLabel>
                                  <FormControl>
                                    <Input {...fieldProps} type="file" multiple accept=".pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => onChange(e.target.files)} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white" />
                                  </FormControl>
                                  <FormDescription className="text-slate-600 dark:text-slate-400 text-xs">Upload one or more comprehensive documents in PDF/Word under 5 MB each.</FormDescription>
                                  {form.watch('proposalUpload') && Array.from(form.watch('proposalUpload') as any).length > 0 ? (
                                    <div className="mt-2 space-y-1">
                                      <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Selected Files:</p>
                                      {Array.from(form.watch('proposalUpload') as any).map((file: any, idx: number) => (
                                        <div key={idx} className="flex items-center gap-1.5 text-xs text-emerald-500 dark:text-emerald-400">
                                          <FileText className="h-3 w-3 shrink-0" />
                                          <span className="truncate">{file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : draftData?.proposalUrls && draftData.proposalUrls.length > 0 ? (
                                    <div className="mt-2 space-y-1">
                                      <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Existing Proposal Documents:</p>
                                      {draftData.proposalUrls.map((url, idx) => (
                                        <div key={idx} className="flex items-center gap-1.5 text-xs text-emerald-500 dark:text-emerald-400">
                                          <FileText className="h-3 w-3 shrink-0" />
                                          <a href={url} target="_blank" rel="noopener noreferrer" className="underline hover:text-emerald-405 truncate">
                                            {draftData.proposalFileNames?.[idx] || `Proposal Document ${idx + 1}`}
                                          </a>
                                        </div>
                                      ))}
                                      <p className="text-[9px] text-slate-400 italic mt-1">(Uploading new files will replace all existing proposal documents)</p>
                                    </div>
                                  ) : null}
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                        <FormField
                          name="ethicsUpload"
                          control={form.control}
                          render={({ field: { value, onChange, ...fieldProps } }) => (
                            <FormItem>
                              <FormLabel>Ethics Approval Certificate (PDF/Word, if applicable)</FormLabel>
                              <FormControl>
                                <Input {...fieldProps} type="file" accept=".pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => onChange(e.target.files)} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white" />
                              </FormControl>
                              <FormDescription className="text-slate-600 dark:text-slate-400 text-xs">PDF/Word under 5 MB.</FormDescription>
                              {form.watch('ethicsUpload')?.[0] ? (
                                <p className="text-xs text-primary font-semibold mt-1">Selected Ethics Certificate: {form.watch('ethicsUpload')[0].name}</p>
                              ) : draftData?.ethicsUrl ? (
                                <p className="text-xs text-emerald-500 font-semibold flex items-center gap-1 mt-1">
                                  <FileText className="h-3 w-3" /> Existing Ethics Cert: <a href={draftData.ethicsUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-emerald-450">View Certificate</a> (Leave empty to keep existing)
                                </p>
                              ) : null}
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="space-y-6">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider border-b border-slate-100 dark:border-slate-900 pb-2 pt-4">Expected Outcomes</h3>
                        <FormField name="expectedOutcomes" control={form.control} render={({ field }) => (
                          <FormItem><FormLabel>Describe Expected Outcomes & Impact <span className="text-destructive">*</span></FormLabel><FormControl><Textarea rows={5} {...field} placeholder="Budget requirement, publication targets, and expected socio-economic impacts..." className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white" /></FormControl><FormMessage /></FormItem>
                        )} />
                      </div>
                    </>
                  )}

                </div>
              )}

              {/* Standard Step 2: Team Details */}
              {currentStep === 2 && !isSinglePageMode && (
                <div className="space-y-6 animate-in fade-in-0">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider border-b border-slate-900 pb-2">Co-Investigators</h3>
                  <div className="grid grid-cols-3 gap-2">
                    <Input placeholder="Co-PI Name" value={coPiName} onChange={(e) => setCoPiName(e.target.value)} className="bg-slate-900 border-white/5 text-white text-xs" />
                    <Input placeholder="Co-PI Email" value={coPiEmail} onChange={(e) => setCoPiEmail(e.target.value)} className="bg-slate-900 border-white/5 text-white text-xs" />
                    <div className="flex gap-2">
                      <Input placeholder="University / Institute" value={coPiOrg} onChange={(e) => setCoPiOrg(e.target.value)} className="bg-slate-900 border-white/5 text-white text-xs flex-1" />
                      <Button type="button" onClick={handleAddCoPi} className="bg-primary hover:bg-primary/95 text-xs h-9 px-3">Add</Button>
                    </div>
                  </div>

                  <div className="space-y-4 pt-2">
                    {coPiList.map(coPi => (
                      <div key={coPi.email} className="p-4 bg-slate-900/40 border border-white/5 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-bold text-white">{coPi.name}</p>
                            <p className="text-xs text-slate-400">{coPi.email} | {coPi.organization}</p>
                          </div>
                          <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveCoPi(coPi.email)} className="h-7 text-destructive hover:bg-destructive/10">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-slate-300">CV Upload (PDF/Word, max 5MB) <span className="text-destructive">*</span></label>
                          <Input type="file" accept=".pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => handleCvUpload(e.target.files?.[0] || null, coPi.email)} className="bg-slate-900 border-white/5 text-white text-xs h-8" />
                          {coPiCvFiles[coPi.email] && <p className="text-xs text-primary">Selected CV: {coPiCvFiles[coPi.email].name}</p>}
                        </div>
                      </div>
                    ))}
                  </div>

                  <h3 className="text-sm font-bold text-white uppercase tracking-wider border-b border-slate-900 pb-2 pt-4">Student Members</h3>
                  <FormField name="studentInfo" control={form.control} render={({ field }) => (
                    <FormItem><FormControl><Textarea {...field} placeholder="List student names and roles (if any)..." className="bg-slate-900 border-white/5 text-white" /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
              )}

               {/* Standard Step 3: Proposal Documents */}
              {currentStep === 3 && !isSinglePageMode && (
                <div className="space-y-6 animate-in fade-in-0">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider border-b border-slate-100 dark:border-slate-900 pb-2">Proposal Documents</h3>
                  <FormField
                    name="proposalUpload"
                    control={form.control}
                    render={({ field: { value, onChange, ...fieldProps } }) => (
                      <FormItem>
                        <FormLabel>Project Proposal Documents (PDF/Word) <span className="text-destructive">*</span></FormLabel>
                        <FormControl>
                          <Input {...fieldProps} type="file" multiple accept=".pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => onChange(e.target.files)} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white" />
                        </FormControl>
                        <FormDescription className="text-slate-600 dark:text-slate-400 text-xs">Upload one or more comprehensive documents in PDF/Word under 5 MB each.</FormDescription>
                        {form.watch('proposalUpload') && Array.from(form.watch('proposalUpload') as any).length > 0 ? (
                          <div className="mt-2 space-y-1">
                            <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Selected Files:</p>
                            {Array.from(form.watch('proposalUpload') as any).map((file: any, idx: number) => (
                              <div key={idx} className="flex items-center gap-1.5 text-xs text-emerald-500 dark:text-emerald-400">
                                <FileText className="h-3 w-3 shrink-0" />
                                <span className="truncate">{file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)</span>
                              </div>
                            ))}
                          </div>
                        ) : draftData?.proposalUrls && draftData.proposalUrls.length > 0 ? (
                          <div className="mt-2 space-y-1">
                            <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Existing Proposal Documents:</p>
                            {draftData.proposalUrls.map((url, idx) => (
                              <div key={idx} className="flex items-center gap-1.5 text-xs text-emerald-500 dark:text-emerald-400">
                                <FileText className="h-3 w-3 shrink-0" />
                                <a href={url} target="_blank" rel="noopener noreferrer" className="underline hover:text-emerald-405 truncate">
                                  {draftData.proposalFileNames?.[idx] || `Proposal Document ${idx + 1}`}
                                </a>
                              </div>
                            ))}
                            <p className="text-[9px] text-slate-400 italic mt-1">(Uploading new files will replace all existing proposal documents)</p>
                          </div>
                        ) : null}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    name="ethicsUpload"
                    control={form.control}
                    render={({ field: { value, onChange, ...fieldProps } }) => (
                      <FormItem>
                        <FormLabel>Ethics Approval Certificate (PDF/Word, if applicable)</FormLabel>
                        <FormControl>
                          <Input {...fieldProps} type="file" accept=".pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => onChange(e.target.files)} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white" />
                        </FormControl>
                        <FormDescription className="text-slate-600 dark:text-slate-400 text-xs">PDF/Word under 5 MB.</FormDescription>
                        {form.watch('ethicsUpload')?.[0] ? (
                          <p className="text-xs text-primary font-semibold mt-1">Selected Ethics Certificate: {form.watch('ethicsUpload')[0].name}</p>
                        ) : draftData?.ethicsUrl ? (
                          <p className="text-xs text-emerald-500 font-semibold flex items-center gap-1 mt-1">
                            <FileText className="h-3 w-3" /> Existing Ethics Cert: <a href={draftData.ethicsUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-emerald-450">View Certificate</a> (Leave empty to keep existing)
                          </p>
                        ) : null}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* Standard Step 4: Expected Outcomes & Declaration */}
              {currentStep === 4 && !isSinglePageMode && (
                <div className="space-y-6 animate-in fade-in-0">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider border-b border-slate-100 dark:border-slate-900 pb-2">Expected Outcomes & Outlay</h3>
                  <FormField name="expectedOutcomes" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel>Describe Expected Outcomes & Impact <span className="text-destructive">*</span></FormLabel><FormControl><Textarea rows={5} {...field} placeholder="Budget requirement, publication targets, and expected socio-economic impacts..." className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white" /></FormControl><FormMessage /></FormItem>
                  )} />

                  <FormField
                    control={form.control}
                    name="guidelinesAgreement"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-2xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-900/30 p-5">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-slate-900 dark:text-white font-bold">Guidelines Declaration</FormLabel>
                          <FormMessage />
                          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                            I declare that I have gone through all terms and conditions of the special Call For Proposals, and all information provided here is authentic and correct.
                          </p>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* Single Page Mode Step 2: Structured Review & Submit Screen */}
              {currentStep === 2 && isSinglePageMode && (
                <div className="space-y-6 animate-in fade-in-0">
                  <div className="border border-primary/20 bg-primary/5 rounded-2xl p-4 flex items-center gap-3">
                    <ClipboardCheck className="h-5 w-5 text-primary animate-pulse" />
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Review Your Application</h4>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400">Please audit your proposal details below before submitting them to the panel.</p>
                    </div>
                  </div>

                  <div className="grid gap-6 bg-slate-50 dark:bg-slate-900/20 border border-slate-200 dark:border-white/5 rounded-3xl p-6">
                    {/* investigator details */}
                    <div>
                      <h4 className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Principal Investigator Info</h4>
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div><span className="text-slate-500 dark:text-slate-400">Name:</span> <p className="text-slate-900 dark:text-white font-semibold">{form.getValues('piName')}</p></div>
                        <div><span className="text-slate-500 dark:text-slate-400">Email:</span> <p className="text-slate-900 dark:text-white font-semibold">{form.getValues('piEmail')}</p></div>
                        <div><span className="text-slate-500 dark:text-slate-400">Phone:</span> <p className="text-slate-900 dark:text-white font-semibold">{form.getValues('piPhone')}</p></div>
                        <div><span className="text-slate-500 dark:text-slate-400">Organization:</span> <p className="text-slate-900 dark:text-white font-semibold">{form.getValues('piOrganization')}</p></div>
                        {form.getValues('piFaculty') && <div><span className="text-slate-500 dark:text-slate-400">Faculty:</span> <p className="text-slate-900 dark:text-white font-semibold">{form.getValues('piFaculty')}</p></div>}
                        {form.getValues('piDepartment') && <div><span className="text-slate-500 dark:text-slate-400">Department:</span> <p className="text-slate-900 dark:text-white font-semibold">{form.getValues('piDepartment')}</p></div>}
                        {piCvFile && <div><span className="text-slate-500 dark:text-slate-400">Uploaded CV:</span> <p className="text-emerald-600 dark:text-emerald-400 font-semibold">{piCvFile.name}</p></div>}
                      </div>
                    </div>

                    <Separator className="bg-slate-100 dark:bg-slate-900" />

                    {/* project details */}
                    <div>
                      <h4 className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Project Core Specs</h4>
                      <div className="space-y-3 text-xs">
                        <div><span className="text-slate-500 dark:text-slate-400">Title:</span> <p className="text-slate-900 dark:text-white font-bold text-sm leading-relaxed">{form.getValues('title')}</p></div>
                        <div><span className="text-slate-500 dark:text-slate-400">Category:</span> <p className="text-slate-900 dark:text-white font-semibold">{form.getValues('projectType')}</p></div>
                        {form.getValues('sdgGoals')?.length ? (
                          <div>
                            <span className="text-slate-500 dark:text-slate-400">Target SDGs:</span>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {form.getValues('sdgGoals')?.map(goal => (
                                <span key={goal} className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/5 text-[10px] text-slate-700 dark:text-slate-300 font-medium">{goal}</span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        <div><span className="text-slate-500 dark:text-slate-400">Abstract Summary:</span> <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap mt-1 bg-slate-100/50 dark:bg-slate-950/40 p-3 border border-slate-200 dark:border-white/5 rounded-xl">{form.getValues('abstract')}</p></div>
                      </div>
                    </div>

                    <Separator className="bg-slate-100 dark:bg-slate-900" />

                    {/* Team info */}
                    <div>
                      <h4 className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Research Partners & Students</h4>
                      <div className="space-y-3 text-xs">
                        {coPiList.length > 0 ? (
                          <div>
                            <span className="text-slate-500 dark:text-slate-400">Co-Investigators ({coPiList.length}):</span>
                            <div className="grid gap-2 mt-1.5">
                              {coPiList.map(co => (
                                <div key={co.email} className="p-2.5 bg-slate-100/50 dark:bg-slate-950/40 border border-slate-200 dark:border-white/5 rounded-xl flex items-center justify-between">
                                  <div>
                                    <p className="font-semibold text-slate-900 dark:text-white">{co.name}</p>
                                    <p className="text-[10px] text-slate-600 dark:text-slate-400">{co.email} | {co.organization}</p>
                                  </div>
                                  {coPiCvFiles[co.email] && <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-semibold">CV Attached</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-slate-500 font-semibold italic">No Co-Investigators assigned.</p>
                        )}
                        {form.getValues('studentInfo') && (
                          <div><span className="text-slate-500 dark:text-slate-400">Student Members:</span> <p className="text-slate-700 dark:text-white mt-1 bg-slate-100/50 dark:bg-slate-950/40 p-3 border border-slate-200 dark:border-white/5 rounded-xl leading-relaxed whitespace-pre-wrap">{form.getValues('studentInfo')}</p></div>
                        )}
                      </div>
                    </div>

                    <Separator className="bg-slate-100 dark:bg-slate-900" />

                    {/* Documents */}
                    <div>
                      <h4 className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Project Documents</h4>
                      <div className="space-y-2 text-xs">
                        {form.getValues('proposalUpload') && Array.from(form.getValues('proposalUpload') as any).length > 0 ? (
                          Array.from(form.getValues('proposalUpload') as any).map((file: any, index: number) => (
                            <div key={index} className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                              <FileText className="h-4 w-4 text-primary" />
                              <span>Proposal Document {index + 1}: <strong className="text-slate-900 dark:text-white">{file.name}</strong></span>
                            </div>
                          ))
                        ) : null}
                        {form.getValues('ethicsUpload')?.[0] ? (
                          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                            <FileText className="h-4 w-4 text-primary" />
                            <span>Ethics Clearance: <strong className="text-slate-900 dark:text-white">{form.getValues('ethicsUpload')[0].name}</strong></span>
                          </div>
                        ) : (
                          <p className="text-slate-500 italic text-[11px]">No ethics clearance certificate uploaded.</p>
                        )}
                      </div>
                    </div>

                    <Separator className="bg-slate-100 dark:bg-slate-900" />

                    {/* outcomes */}
                    <div>
                      <h4 className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Expected Outcomes & Outlay</h4>
                      <div className="text-xs">
                        <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap bg-slate-100/50 dark:bg-slate-950/40 p-3 border border-slate-200 dark:border-white/5 rounded-xl">{form.getValues('expectedOutcomes')}</p>
                      </div>
                    </div>
                  </div>

                  {/* Declaration Checklist */}
                  <FormField
                    control={form.control}
                    name="guidelinesAgreement"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-2xl border border-primary/20 bg-slate-50 dark:bg-slate-950/30 p-5 mt-4">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-slate-900 dark:text-white font-bold cursor-pointer">Guidelines Declaration</FormLabel>
                          <FormMessage />
                          <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                            I declare that I have gone through all terms and conditions of the Sustainability Special Call For Proposals, and all information provided here is authentic and correct. I am ready to submit.
                          </p>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              )}

            </CardContent>

            <CardFooter className="flex-col items-stretch gap-4 border-t border-slate-100 dark:border-slate-900 p-8">
              {isSaving && (
                <div className="w-full flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                  <Progress value={progress} className="w-full bg-slate-100 dark:bg-slate-900" />
                  <span className="font-bold">{`${Math.round(progress)}%`}</span>
                </div>
              )}

              <div className="flex justify-between">
                <Button type="button" variant="outline" onClick={handlePrevious} disabled={currentStep === 1 || isSaving || isDeadlinePassed} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-900 dark:text-white">
                  Previous
                </Button>
                <div className="flex items-center gap-2">
                  {currentUser && !isDeadlinePassed && (
                    <Button type="button" variant="ghost" onClick={() => handleSaveSubmission('Draft')} disabled={isSaving} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
                      Save as Draft
                    </Button>
                  )}
                  {isDeadlinePassed ? (
                    <Button type="button" disabled className="bg-slate-400 dark:bg-slate-800 text-white font-bold cursor-not-allowed">
                      Applications Closed
                    </Button>
                  ) : (
                    <>
                      {currentStep < totalSteps && (
                        <Button type="button" onClick={handleNext} disabled={isSaving} className="bg-primary hover:bg-primary/95 text-white font-bold">
                          {isSinglePageMode ? 'Review Application' : 'Next'}
                        </Button>
                      )}
                      {currentStep === totalSteps && (
                        <Button type="submit" disabled={isSaving || !form.watch('guidelinesAgreement')} className="bg-primary hover:bg-primary/95 text-white font-bold">
                          {isSaving ? 'Submitting...' : 'Submit Proposal'}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </CardFooter>
          </form>
        </FormProvider>
      </Card>
    </div>
  );
}
