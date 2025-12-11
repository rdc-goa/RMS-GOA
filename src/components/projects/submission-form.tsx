
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
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
import { GanttChartSquare, Microscope, Users, FileText, Loader2, AlertCircle, ChevronDown, Upload, X, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { User, Project, CoPiDetails } from '@/types';
import { Checkbox } from '@/components/ui/checkbox';
import { db } from '@/lib/config';
import { collection, doc, setDoc, getDocs, query, where } from 'firebase/firestore';
import { uploadFileToServer } from '@/app/server-actions';
import { saveProjectSubmission } from '@/app/project-actions';
import { findUserByMisId } from '@/app/userfinding';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from '../ui/separator';

interface SubmissionFormProps {
  project?: Project;
}

const steps = [
  { id: 1, title: 'Project Details', icon: Microscope },
  { id: 2, title: 'Team Info', icon: Users },
  { id: 3, title: 'File Uploads', icon: FileText },
  { id: 4, title: 'Timeline & Outcomes', icon: GanttChartSquare },
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

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
};

export function SubmissionForm({ project }: SubmissionFormProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [user, setUser] = useState<User | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [bankDetailsMissing, setBankDetailsMissing] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const [coPiSearchTerm, setCoPiSearchTerm] = useState('');
  const [foundCoPi, setFoundCoPi] = useState<{ uid?: string | null; name: string; email: string; misId: string; campus: string; } | null>(null);
  const [coPiList, setCoPiList] = useState<CoPiDetails[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [coPiCvFiles, setCoPiCvFiles] = useState<{ [email: string]: File }>({});
  const [piCvFile, setPiCvFile] = useState<File | null>(null);

  const formSchema = useMemo(() => z.object({
    // Step 1
    title: z.string().min(5, 'Title must be at least 5 characters.'),
    abstract: z.string().min(20, 'Abstract must be at least 20 characters.'),
    projectType: z.string().min(1, 'Please select a category.'),
    sdgGoals: z.array(z.string()).optional(),
    // Step 2
    studentInfo: z.string().optional(),
    // Step 3
    proposalUpload: z.any().refine((files) => {
        return !!project?.proposalUrl || (files && files.length > 0);
    }, 'Project proposal is required.'),
    ethicsUpload: z.any().optional(),
    // Step 4
    expectedOutcomes: z.string().min(10, 'Please describe the expected outcomes.'),
    guidelinesAgreement: z.boolean().refine(val => val === true, {
      message: "You must agree to the guidelines to submit.",
    }),
  }), [project]);

  type FormData = z.infer<typeof formSchema>;
  
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
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
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        if (!parsedUser.bankDetails) {
            setBankDetailsMissing(true);
        }
    }
  }, []);

  useEffect(() => {
    if (project) {
        const teamInfo = project.teamInfo || '';
        const studentRegex = /Students: (.*)/;
        const studentMatch = teamInfo.match(studentRegex);

        form.reset({
            title: project.title,
            abstract: project.abstract,
            projectType: project.type,
            studentInfo: studentMatch ? studentMatch[1].trim() : '',
            expectedOutcomes: project.timelineAndOutcomes,
            guidelinesAgreement: project.status !== 'Draft',
            sdgGoals: project.sdgGoals || [],
        });
        
        if (project.coPiDetails) {
            setCoPiList(project.coPiDetails);
        }
    }
  }, [project, form, toast]);

  const handleNext = async () => {
    const fieldsToValidate = {
      1: ['title', 'abstract', 'projectType'],
      2: [],
      3: ['proposalUpload'],
      4: ['expectedOutcomes', 'guidelinesAgreement'],
    }[currentStep] as (keyof FormData)[];

    // Additional validation for CVs in step 2
    if (currentStep === 2) {
      if (!project?.piCvUrl && !piCvFile) {
        toast({
          variant: 'destructive',
          title: 'CV Required',
          description: 'Please upload your CV as the Principal Investigator.'
        });
        return;
      }
      const missingCvs = coPiList.filter(coPi => !coPi.cvUrl && !coPiCvFiles[coPi.email]);
      if (missingCvs.length > 0) {
        toast({
          variant: 'destructive',
          title: 'CV Required',
          description: `Please upload CV for: ${missingCvs.map(c => c.name).join(', ')}`
        });
        return;
      }
    }

    const isValid = await form.trigger(fieldsToValidate);
    if (isValid) {
      if (currentStep < 4) {
        setCurrentStep(currentStep + 1);
      }
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };
  
  const handleSearchCoPi = async () => {
    if (!coPiSearchTerm) return;
    setIsSearching(true);
    setFoundCoPi(null);
    try {
        const result = await findUserByMisId(coPiSearchTerm);
        if (result.success && result.users && result.users.length > 0) {
            const user = result.users[0];
            setFoundCoPi({ ...user });
        } else {
            toast({ variant: 'destructive', title: 'User Not Found', description: result.error });
        }
    } catch (error) {
        toast({ variant: 'destructive', title: 'Search Failed', description: 'An error occurred while searching.' });
    } finally {
        setIsSearching(false);
    }
  };

  const handleAddCoPi = () => {
    if (foundCoPi && !coPiList.some(coPi => coPi.email === foundCoPi.email)) {
        if (user && foundCoPi.email === user.email) {
            toast({ variant: 'destructive', title: 'Cannot Add Self', description: 'You cannot add yourself as a Co-PI.' });
            return;
        }
        setCoPiList([...coPiList, foundCoPi]);
    }
    setFoundCoPi(null);
    setCoPiSearchTerm('');
  };

  const handleRemoveCoPi = (emailToRemove: string) => {
    setCoPiList(coPiList.filter(coPi => coPi.email !== emailToRemove));
    // Remove the CV file from state as well
    const newCvFiles = { ...coPiCvFiles };
    delete newCvFiles[emailToRemove];
    setCoPiCvFiles(newCvFiles);
  };

  const handleCvUpload = (file: File | null, email?: string) => {
    if (!file) {
      if (email) {
        const newCvFiles = { ...coPiCvFiles };
        delete newCvFiles[email];
        setCoPiCvFiles(newCvFiles);
      } else {
        setPiCvFile(null);
      }
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File Too Large', description: 'CV file must be under 5MB.' });
      return;
    }
    if (file.type !== 'application/pdf') {
      toast({ variant: 'destructive', title: 'Invalid File Type', description: 'CV must be a PDF file.' });
      return;
    }

    if (email) {
      setCoPiCvFiles(prev => ({ ...prev, [email]: file }));
    } else {
      setPiCvFile(file);
    }
  };


  const handleSave = async (status: 'Draft' | 'Submitted') => {
    if (!user || !user.faculty || !user.institute || !user.department) {
      toast({
        variant: 'destructive',
        title: 'Profile Incomplete',
        description: 'Please complete your profile in Settings before submitting.',
      });
      return;
    }
    if (status === 'Submitted' && !user.bankDetails) {
        toast({
            variant: 'destructive',
            title: 'Bank Details Missing',
            description: 'You must add your bank details in Settings to submit a project.',
        });
        return;
    }

    // Validate CVs for submission
    if (status === 'Submitted') {
      if (!project?.piCvUrl && !piCvFile) {
        toast({ variant: 'destructive', title: 'CV Required', description: 'Please upload your CV as the Principal Investigator.' });
        return;
      }
      const missingCvs = coPiList.filter(coPi => !coPi.cvUrl && !coPiCvFiles[coPi.email]);
      if (missingCvs.length > 0) {
        toast({
          variant: 'destructive',
          title: 'CV Required',
          description: `Please upload CV for all Co-PIs: ${missingCvs.map(c => c.name).join(', ')}`
        });
        return;
      }
    }
    
    const data = form.getValues();
    if (status === 'Draft' && (!data.title || data.title.trim() === '')) {
        toast({
            variant: 'destructive',
            title: 'Title Required',
            description: 'Please enter a project title before saving a draft.',
        });
        return;
    }

    setIsSaving(true);
    setProgress(5);

    try {
      let projectId = project?.id || doc(collection(db, 'projects')).id;

      const uploadFile = async (file: File, folder: string): Promise<string> => {
        const dataUrl = await fileToDataUrl(file);
        const path = `projects/${projectId}/${folder}/${file.name}`;
        const result = await uploadFileToServer(dataUrl, path);
        if (result.success && result.url) return result.url;
        throw new Error(result.error || `Failed to upload ${file.name}`);
      };

      // Upload PI CV
      let piCvUrl = project?.piCvUrl;
      if (piCvFile) {
        piCvUrl = await uploadFile(piCvFile, `pi-cv`);
        setProgress(15);
      }

      // Upload Co-PI CVs
      const updatedCoPiList = [...coPiList];
      let uploadProgress = 20;
      
      for (let i = 0; i < updatedCoPiList.length; i++) {
        const coPi = updatedCoPiList[i];
        const cvFile = coPiCvFiles[coPi.email];
        
        if (cvFile) {
          try {
            const cvUrl = await uploadFile(cvFile, `copi-cvs/${coPi.email.replace('@', '_at_')}`);
            updatedCoPiList[i] = {
              ...coPi,
              cvUrl,
              cvFileName: cvFile.name
            };
            uploadProgress += 15;
            setProgress(uploadProgress);
          } catch (error) {
            console.error(`Failed to upload CV for ${coPi.name}:`, error);
            toast({
              variant: 'destructive',
              title: 'CV Upload Failed',
              description: `Failed to upload CV for ${coPi.name}. Please try again.`
            });
            setIsSaving(false);
            return;
          }
        }
      }

      let proposalUrl = project?.proposalUrl;
      if (data.proposalUpload?.[0]) {
        proposalUrl = await uploadFile(data.proposalUpload[0], 'proposal');
        setProgress(70);
      }

      let ethicsUrl = project?.ethicsUrl;
      if (data.ethicsUpload?.[0]) {
        ethicsUrl = await uploadFile(data.ethicsUpload[0], 'ethics');
        setProgress(90);
      }
      
      const teamInfoParts = [];
      if (data.studentInfo && data.studentInfo.trim() !== '') teamInfoParts.push(`Students: ${data.studentInfo}`);
      const teamInfo = teamInfoParts.join('; ');
      
      const coPiUids = updatedCoPiList.filter(coPi => coPi.uid).map(coPi => coPi.uid!);

      const projectData: Omit<Project, 'id'> = {
        title: data.title, abstract: data.abstract, type: data.projectType,
        faculty: user.faculty, institute: user.institute, departmentName: user.department,
        pi: user.name, pi_uid: user.uid, pi_email: user.email, pi_phoneNumber: user.phoneNumber, piCvUrl,
        coPiDetails: updatedCoPiList, // Store details with CV URLs
        coPiUids: coPiUids, // Store UIDs for registered users
        teamInfo, timelineAndOutcomes: data.expectedOutcomes, status: status,
        submissionDate: project?.submissionDate || new Date().toISOString(), proposalUrl, ethicsUrl,
        sdgGoals: data.sdgGoals,
      };

      const result = await saveProjectSubmission(projectId, projectData);
      
      if (!result.success) {
          throw new Error(result.error);
      }

      setProgress(100);
      
      if (status === 'Draft') {
        toast({ title: 'Draft Saved!', description: "You can continue editing from 'My Projects'." });
        if (!project?.id) router.push(`/dashboard/edit-submission/${projectId}`);
      } else {
        toast({ title: 'Project Submitted!', description: 'Your project is now under review.' });
        router.push('/dashboard/my-projects');
      }
    } catch (error: any) {
      console.error('Error saving project: ', error);
      toast({ variant: 'destructive', title: 'Save Failed', description: error.message || 'An error occurred.' });
    } finally {
      setIsSaving(false);
      setProgress(0);
    }
  };

  const onFinalSubmit = () => handleSave('Submitted');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{project ? 'Edit Submission' : 'New Submission'} - Step {currentStep}: {steps[currentStep - 1].title}</CardTitle>
            <CardDescription>Follow the steps to complete your submission.</CardDescription>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-muted-foreground">Progress</p>
            <Progress value={(currentStep / 4) * 100} className="w-32 mt-1" />
          </div>
        </div>
      </CardHeader>
      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(onFinalSubmit)}>
          <CardContent className="space-y-8">
            {bankDetailsMissing && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Bank Details Required</AlertTitle>
                    <AlertDescription>
                        You must add your salary bank account details in your profile before you can submit a project.
                        <Button asChild variant="link" className="p-1 h-auto"><Link href="/dashboard/settings">Go to Settings</Link></Button>
                    </AlertDescription>
                </Alert>
            )}
            {currentStep === 1 && (
              <div className="space-y-4 animate-in fade-in-0">
                <FormField name="title" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Project Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="abstract" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Abstract</FormLabel><FormControl><Textarea rows={5} {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="projectType" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel>Category</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Unidisciplinary">Unidisciplinary</SelectItem><SelectItem value="Multi-Disciplinary">Multi-Disciplinary</SelectItem><SelectItem value="Inter-Disciplinary">Inter-Disciplinary</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                )} />
                <Separator />
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
                                      : field.onChange(field.value?.filter((value) => value !== goal));
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
                 <div className="p-4 border rounded-lg bg-muted/50 text-sm text-muted-foreground">
                    <p><span className="font-semibold text-foreground">Faculty:</span> {user?.faculty || 'Not set'}</p>
                    <p><span className="font-semibold text-foreground">Institute:</span> {user?.institute || 'Not set'}</p>
                    <p><span className="font-semibold text-foreground">Department:</span> {user?.department || 'Not set'}</p>
                    <p className="mt-2 text-xs">This information is from your profile. You can change it in <a href="/dashboard/settings" className="underline">Settings</a>.</p>
                </div>
              </div>
            )}
            {currentStep === 2 && (
              <div className="space-y-6 animate-in fade-in-0">
                <div className="p-4 bg-secondary rounded-md space-y-3">
                    <FormLabel>Principal Investigator (PI)</FormLabel>
                    <Input disabled value={user?.name || 'Loading...'} />
                     <div className="space-y-2">
                         <div className="flex items-center justify-between">
                           <label className="text-sm font-medium">Your CV (PDF, max 5MB) <span className="text-destructive">*</span></label>
                           {project?.piCvUrl && (
                             <Button asChild variant="link" size="sm" className="p-0 h-auto">
                               <a href={project.piCvUrl} target="_blank" rel="noopener noreferrer">
                                 View Current CV
                               </a>
                             </Button>
                           )}
                         </div>
                         <Input
                           type="file"
                           accept=".pdf"
                           onChange={(e) => handleCvUpload(e.target.files?.[0] || null)}
                           className="text-sm"
                         />
                         {piCvFile && (
                           <p className="text-xs text-muted-foreground">
                             Selected: {piCvFile.name}
                           </p>
                         )}
                         {!project?.piCvUrl && !piCvFile && (
                           <p className="text-xs text-destructive">CV upload required</p>
                         )}
                    </div>
                </div>

                 <div className="space-y-2">
                    <FormLabel>Co-PIs</FormLabel>
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Search by Co-PI's MIS ID"
                        value={coPiSearchTerm}
                        onChange={(e) => setCoPiSearchTerm(e.target.value)}
                      />
                      <Button type="button" onClick={handleSearchCoPi} disabled={isSearching}>
                        {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
                      </Button>
                    </div>
                    {foundCoPi && (
                      <div className="flex items-center justify-between p-2 border rounded-md">
                        <p>{foundCoPi.name}</p>
                        <Button type="button" size="sm" onClick={handleAddCoPi}>Add</Button>
                      </div>
                    )}
                    <div className="space-y-4 pt-2">
                      {coPiList.map(coPi => (
                        <div key={coPi.email} className="p-4 bg-secondary/50 rounded-md space-y-3">
                           <div className="flex items-center justify-between">
                             <p className="text-sm font-medium">{coPi.name} {!coPi.uid && <span className="text-xs text-muted-foreground">(Not Registered)</span>}</p>
                             <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveCoPi(coPi.email)}>
                               <X className="h-4 w-4" />
                             </Button>
                           </div>
                           <div className="space-y-2">
                             <div className="flex items-center justify-between">
                               <label className="text-sm font-medium">CV (PDF, max 5MB) <span className="text-destructive">*</span></label>
                               {coPi.cvUrl && (
                                 <Button asChild variant="link" size="sm" className="p-0 h-auto">
                                   <a href={coPi.cvUrl} target="_blank" rel="noopener noreferrer">
                                     View Current CV
                                   </a>
                                 </Button>
                               )}
                             </div>
                             <Input
                               type="file"
                               accept=".pdf"
                               onChange={(e) => handleCvUpload(e.target.files?.[0] || null, coPi.email)}
                               className="text-sm"
                             />
                             {coPiCvFiles[coPi.email] && (
                               <p className="text-xs text-muted-foreground">
                                 Selected: {coPiCvFiles[coPi.email].name}
                               </p>
                             )}
                             {!coPi.cvUrl && !coPiCvFiles[coPi.email] && (
                               <p className="text-xs text-destructive">CV upload required</p>
                             )}
                           </div>
                        </div>
                      ))}
                    </div>
                </div>
                <FormField name="studentInfo" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Student Members</FormLabel><FormControl><Textarea {...field} placeholder="List student names and roles..." /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
            )}
            {currentStep === 3 && (
              <div className="space-y-6 animate-in fade-in-0">
                <FormField
                  name="proposalUpload"
                  control={form.control}
                  render={({ field: { value, onChange, ...fieldProps } }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Project Proposal (PDF)<span className="text-destructive"> *</span></FormLabel>
                        <Button asChild variant="outline" size="sm">
                          <a href="https://atkqjlzikx23ms5d.public.blob.vercel-storage.com/Sample%20Template%20IMR%20PPT.pptx" download>
                              <Download className="mr-2 h-4 w-4" />
                              Download Template
                          </a>
                        </Button>
                      </div>
                       {project?.proposalUrl && <p className="text-xs text-muted-foreground">Existing file: <a href={project.proposalUrl} target="_blank" className="underline" rel="noreferrer">View Uploaded Proposal</a>. Uploading a new file will replace it.</p>}
                      <FormControl>
                        <Input {...fieldProps} type="file" accept=".pdf" onChange={(e) => onChange(e.target.files)} />
                      </FormControl>
                       <FormDescription>Below 5 MB</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="ethicsUpload"
                  control={form.control}
                  render={({ field: { value, onChange, ...fieldProps } }) => (
                    <FormItem>
                      <FormLabel>Ethics Approval (PDF, if applicable)</FormLabel>
                       {project?.ethicsUrl && <p className="text-xs text-muted-foreground">Existing file: <a href={project.ethicsUrl} target="_blank" className="underline" rel="noreferrer">View Uploaded Ethics Approval</a>. Uploading a new file will replace it.</p>}
                      <FormControl>
                        <Input {...fieldProps} type="file" accept=".pdf" onChange={(e) => onChange(e.target.files)} />
                      </FormControl>
                      <FormDescription>Below 5 MB</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
            {currentStep === 4 && (
              <div className="space-y-6 animate-in fade-in-0">
                <FormField name="expectedOutcomes" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel>Expected Outcomes & Impact</FormLabel><FormControl><Textarea rows={5} {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField
                  control={form.control}
                  name="guidelinesAgreement"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Declaration</FormLabel>
                        <FormMessage />
                          <p className="text-sm text-muted-foreground">
                          I declare that I have gone through all the guidelines of the{" "}
                          <a
                            href="https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/Notification%201446_Revision%20in%20the%20Research%20%26%20Development%20Policy%20of%20the%20University%20%281%29.pdf"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-primary underline-offset-4 hover:underline"
                          >
                            Research Policy of Parul University
                          </a>
                          .
                        </p>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
            )}
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-4 border-t pt-6">
            {isSaving && (
              <div className="w-full flex items-center gap-4 text-sm text-muted-foreground">
                <Progress value={progress} className="w-full" />
                <span>{`${Math.round(progress)}%`}</span>
              </div>
            )}
            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={handlePrevious} disabled={currentStep === 1 || isSaving}>Previous</Button>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" onClick={() => handleSave('Draft')} disabled={isSaving}>
                  {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Saving...</> : 'Save as Draft'}
                </Button>
                {currentStep < 4 && <Button type="button" onClick={handleNext} disabled={isSaving}>Next</Button>}
                {currentStep === 4 && <Button type="submit" disabled={isSaving || !form.watch('guidelinesAgreement') || bankDetailsMissing}>{isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Submitting...</> : "Submit Project"}</Button>}
              </div>
            </div>
          </CardFooter>
        </form>
      </FormProvider>
    </Card>
  );
}
