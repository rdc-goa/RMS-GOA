

'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import type { User, IncentiveClaim, Author } from '@/types';
import { uploadFileToApi } from '@/lib/upload-client';
import { Loader2, AlertCircle, Info, Edit, Trash2, CheckCircle2, FileText, X, Globe, Plus, Calendar as CalendarIcon, Link as LinkIcon, BadgeCheck, ShieldCheck, ChevronDown } from 'lucide-react';
import { parseISO, addYears, format } from 'date-fns';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { submitIncentiveClaimViaApi } from '@/lib/incentive-claim-client';
import { getIncentiveClaimByIdAction } from '@/app/actions';
import { cn } from "@/lib/utils";
import { Badge } from '@/components/ui/badge';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const membershipSchema = z.object({
    professionalBodyName: z.string().min(3, 'Name of the professional body is required.'),
    membershipType: z.enum(['Lifetime', 'Yearly', 'Other'], { required_error: 'Please select a membership type.'}),
    membershipLocale: z.enum(['National', 'International'], { required_error: 'Please select the locale.'}),
    membershipNumber: z.string().min(1, 'Membership number is required.'),
    membershipAmountPaid: z.coerce.number().positive('A valid positive amount is required.'),
    membershipPaymentDate: z.string().min(1, 'Payment date is required.'),
    membershipProof: z.any().refine((files) => files?.length > 0, 'Proof of membership/payment is required.').refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, 'File must be less than 10 MB.'),
    membershipSelfDeclaration: z.boolean().refine(val => val === true, { message: 'You must agree to the self-declaration.' }),
}).refine(data => {
    const paymentDate = new Date(data.membershipPaymentDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return paymentDate <= today;
}, {
    message: "Payment date cannot be in the future.",
    path: ["membershipPaymentDate"]
});

type MembershipFormValues = z.infer<typeof membershipSchema>;

function ReviewDetails({ 
    data, 
    onEdit,
    showLogic,
    setShowLogic,
    getMembershipLogicBreakdown 
}: { 
    data: MembershipFormValues; 
    onEdit: () => void;
    showLogic: boolean;
    setShowLogic: (s: boolean) => void;
    getMembershipLogicBreakdown: (data: Partial<MembershipFormValues>) => {label: string, value: string}[]
}) {
    const renderDetail = (label: string, value?: string | number | boolean) => {
        if (!value && value !== 0 && value !== false) return null;
        
        let displayValue: React.ReactNode = String(value);
        if (typeof value === 'boolean') {
            displayValue = (
                <Badge variant={value ? "default" : "secondary"}>
                    {value ? 'Yes' : 'No'}
                </Badge>
            );
        }

        return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 py-3 border-b border-muted last:border-0 items-start">
                <dt className="font-bold text-muted-foreground text-sm uppercase tracking-wider">{label}</dt>
                <dd className="col-span-2 text-base font-medium">{displayValue}</dd>
            </div>
        );
    };

    const proofFile = data.membershipProof?.[0] as File | undefined;

    return (
        <Card className="max-w-4xl mx-auto shadow-xl border-t-4 border-t-primary overflow-hidden">
            <CardHeader className="bg-muted/30 pb-6">
                <div className="flex justify-between items-center">
                    <div className="space-y-1">
                        <CardTitle className="text-2xl flex items-center gap-2 font-bold tracking-tight">
                            <CheckCircle2 className="h-7 w-7 text-primary" /> Review Your Application
                        </CardTitle>
                        <CardDescription className="text-base text-muted-foreground font-medium">Please verify your membership details before final submission.</CardDescription>
                    </div>
                    <Button variant="outline" onClick={onEdit} className="rounded-xl border-primary/30 text-primary hover:bg-primary/5 font-bold px-6">
                        <Edit className="h-4 w-4 mr-2" /> Modify Form
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="pt-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                    <div className="space-y-6">
                        <div>
                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Professional Body</p>
                            <p className="text-base font-bold text-foreground leading-tight">{data.professionalBodyName}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Type</p>
                                <Badge variant="secondary" className="font-bold">{data.membershipType}</Badge>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Locale</p>
                                <Badge variant="outline" className="font-bold border-primary/20 text-primary bg-primary/5">{data.membershipLocale}</Badge>
                            </div>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Membership ID</p>
                            <p className="text-sm font-mono font-bold bg-muted/30 px-2 py-1 rounded-md inline-block">{data.membershipNumber}</p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Financials</p>
                            <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10 mb-4">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs font-medium text-muted-foreground">Amount Paid:</span>
                                    <span className="text-lg font-black text-primary">₹{data.membershipAmountPaid.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-medium text-muted-foreground">Payment Date:</span>
                                    <span className="text-xs font-bold">{data.membershipPaymentDate}</span>
                                </div>
                            </div>
                            
                            <div className="bg-primary p-6 rounded-[2rem] text-primary-foreground shadow-xl shadow-primary/20 relative overflow-hidden group">
                                <div className="absolute -right-4 -top-4 bg-white/10 w-24 h-24 rounded-full blur-3xl group-hover:bg-white/20 transition-all duration-500"></div>
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-2">Estimated Incentive</p>
                                <p className="text-[11px] opacity-70 mb-4 leading-tight font-medium">Based on the provided details, your tentative incentive claim will be:</p>
                                <div className="flex items-baseline gap-2">
                                  <span className="text-4xl font-black tracking-tighter">₹{Math.min(data.membershipAmountPaid * 0.5, 10000).toLocaleString('en-IN')}</span>
                                  <span className="text-xs font-medium opacity-60">INR*</span>
                                </div>
                                <p className="text-[10px] mt-4 font-medium opacity-70 italic">*Subject to final verification by the technical committee.</p>
                                
                                <div className="mt-4 border-t border-primary/10 pt-4">
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-xs font-bold w-full flex justify-between items-center text-primary-foreground hover:bg-primary-foreground/10"
                                    onClick={() => setShowLogic(!showLogic)}
                                    type="button"
                                  >
                                    View Calculation Logic
                                    <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showLogic ? 'rotate-180' : ''}`} />
                                  </Button>
                                  
                                  {showLogic && (
                                    <div className="mt-3 p-4 bg-background/10 rounded-xl border border-primary-foreground/10 space-y-2 text-xs font-medium animate-in slide-in-from-top-2 flex flex-col gap-1 text-primary-foreground">
                                        {getMembershipLogicBreakdown(data).map((step, idx) => (
                                          <div key={idx} className="flex justify-between items-start py-1 border-b last:border-0 border-primary-foreground/10">
                                            <span className="opacity-80 pr-2">{step.label}</span>
                                            <span className={idx === (getMembershipLogicBreakdown(data).length - 1) ? "font-bold text-green-200 shrink-0" : "font-semibold shrink-0"}>{step.value}</span>
                                          </div>
                                        ))}
                                      
                                      <div className="text-[9px] italic mt-2 !pt-2 text-center border-t border-primary-foreground/10 opacity-70">
                                        *50% of the membership fee up to a max cap of ₹10,000 matches logic on approver's side.
                                      </div>
                                    </div>
                                  )}
                                </div>
                            </div>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Verification Proof</p>
                            <div className="flex items-center gap-3 bg-muted/20 p-3 rounded-xl border border-dashed hover:bg-muted/30 transition-colors cursor-default">
                                <div className="bg-primary/10 p-2 rounded-lg">
                                    <FileText className="h-4 w-4 text-primary" />
                                </div>
                                <div className="overflow-hidden">
                                    <p className="text-xs font-bold truncate">{proofFile?.name || "verified_membership_proof.pdf"}</p>
                                    <p className="text-[9px] text-muted-foreground uppercase font-black tracking-tighter">Document Attached</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export function MembershipForm() {
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
  const [showLogic, setShowLogic] = useState(false);

  const getMembershipLogicBreakdown = (data: Partial<MembershipFormValues>) => {
      const steps: {label: string, value: string}[] = [];
      const amtPaid = data.membershipAmountPaid || 0;
      
      steps.push({ label: '1. Membership Fee Paid', value: `₹${amtPaid.toLocaleString('en-IN')}` });
      
      if (amtPaid === 0) {
           steps.push({ label: '2. Final Estimation', value: '₹0' });
           return steps;
      }

      steps.push({ label: '2. University Support Rate', value: '50% Match' });
      
      const matchedAmount = amtPaid * 0.5;
      steps.push({ label: '3. Provisional Match', value: `₹${matchedAmount.toLocaleString('en-IN')}` });

      const finalAmount = Math.min(matchedAmount, 10000);
      if (matchedAmount > 10000) {
           steps.push({ label: '4. Policy Cap Applied', value: 'Capped at ₹10,000 max' });
      }
      
      steps.push({ label: '5. Estimated Final Reimbursement', value: `₹${finalAmount.toLocaleString('en-IN')}` });

      return steps;
  };
  
  const form = useForm<MembershipFormValues>({
    resolver: zodResolver(membershipSchema),
    defaultValues: {
      professionalBodyName: '',
      membershipType: undefined,
      membershipLocale: 'International',
      membershipNumber: '',
      membershipAmountPaid: 0,
      membershipPaymentDate: '',
      membershipProof: undefined,
      membershipSelfDeclaration: false,
    },
  });

  const amountPaid = form.watch('membershipAmountPaid');

  useEffect(() => {
    if (amountPaid && amountPaid > 0) {
        const incentive = Math.min(amountPaid * 0.5, 10000);
        setCalculatedIncentive(incentive);
    } else {
        setCalculatedIncentive(null);
    }
  }, [amountPaid]);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      setBankDetailsMissing(!parsedUser.bankDetails);
      setOrcidOrMisIdMissing(!parsedUser.orcidId || !parsedUser.misId);
    }
     const claimId = searchParams.get('claimId');
    if (!claimId) {
        setIsLoadingDraft(false);
    }
  }, [searchParams]);

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
                        membershipProof: undefined,
                    });
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
    // Re-check profile completeness on submission
    if (status === 'Pending' && (!user.bankDetails || !user.orcidId || !user.misId)) {
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
        
        const uploadFileHelper = async (file: File | undefined, folderName: string): Promise<string | undefined> => {
          if (!file || !user) return undefined;
          const path = `incentive-proofs/${user.uid}/${folderName}/${new Date().toISOString()}-${file.name}`;
          const result = await uploadFileToApi(file, { path });
          if (!result.success || !result.url) {
            throw new Error(result.error || `File upload failed for ${folderName}`);
          }
          return result.url;
        };

        const membershipProofUrl = await uploadFileHelper(data.membershipProof?.[0], 'membership-proof');
        
        // This is the fix: create a new object without the FileList
        const { membershipProof, ...restOfData } = data;

        const claimData: Omit<IncentiveClaim, 'id' | 'claimId'> = {
            ...restOfData,
            calculatedIncentive: calculatedIncentive || undefined,
            misId: user.misId || undefined,
            orcidId: user.orcidId || undefined,
            claimType: 'Membership of Professional Bodies',
            benefitMode: 'reimbursement',
            uid: user.uid,
            userName: user.name,
            userEmail: user.email,
            faculty: user.faculty,
            status,
            submissionDate: new Date().toISOString(),
            bankDetails: user.bankDetails || undefined,
        };

        if (membershipProofUrl) claimData.membershipProofUrl = membershipProofUrl;

        const claimId = searchParams.get('claimId');
        const result = await submitIncentiveClaimViaApi(claimData, claimId || undefined);
        if (!result.success || !result.claimId) {
            throw new Error(result.error);
        }

        const newClaimId = claimId || result.claimId;

        if (status === 'Draft') {
          toast({ title: 'Draft Saved!', description: "You can continue editing from the 'Incentive Claim' page." });
          if (!searchParams.get('claimId')) {
            router.push(`/dashboard/incentive-claim/membership?claimId=${newClaimId}`);
          }
        } else {
          toast({ title: 'Success', description: 'Your incentive claim for membership has been submitted.' });
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
            <ReviewDetails 
              data={form.getValues()} 
              onEdit={() => setCurrentStep(1)} 
              showLogic={showLogic}
              setShowLogic={setShowLogic}
              getMembershipLogicBreakdown={getMembershipLogicBreakdown}
            />
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
                        ) : 'Confirm & Submit Membership Claim'}
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
            <CardTitle className="text-3xl font-bold tracking-tight text-primary">Membership Incentive Claim</CardTitle>
            <CardDescription className="text-base text-muted-foreground">Submit for reimbursement of professional body membership fees.</CardDescription>
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

            <div className="space-y-8">
                <section className="space-y-6">
                    <div className="flex items-center gap-2 text-primary font-bold text-lg mb-4">
                        <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                        Membership Details
                    </div>

                    <FormField name="professionalBodyName" control={form.control} render={({ field }) => ( 
                        <FormItem>
                            <FormLabel className="text-base font-semibold">Name of Professional Body</FormLabel>
                            <FormControl>
                                <Input placeholder="e.g., Institute of Electrical and Electronics Engineers" {...field} className="h-12 shadow-sm text-lg focus-visible:ring-primary" />
                            </FormControl>
                            <FormMessage />
                        </FormItem> 
                    )} />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <FormField control={form.control} name="membershipType" render={({ field }) => ( 
                            <FormItem className="space-y-3">
                                <FormLabel className="text-base font-semibold">Type of Membership</FormLabel>
                                <FormControl>
                                    <RadioGroup onValueChange={field.onChange} value={field.value} className="flex flex-wrap gap-4">
                                        <Label 
                                            htmlFor="mem-lifetime" 
                                            className="flex items-center space-x-3 bg-muted/50 px-4 py-2 rounded-xl border hover:bg-muted transition-colors cursor-pointer min-w-[120px] [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
                                        >
                                            <RadioGroupItem value="Lifetime" id="mem-lifetime" />
                                            <span className="font-medium cursor-pointer flex-1">Lifetime</span>
                                        </Label>
                                        <Label 
                                            htmlFor="mem-yearly" 
                                            className="flex items-center space-x-3 bg-muted/50 px-4 py-2 rounded-xl border hover:bg-muted transition-colors cursor-pointer min-w-[120px] [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
                                        >
                                            <RadioGroupItem value="Yearly" id="mem-yearly" />
                                            <span className="font-medium cursor-pointer flex-1">Yearly</span>
                                        </Label>
                                        <Label 
                                            htmlFor="mem-other" 
                                            className="flex items-center space-x-3 bg-muted/50 px-4 py-2 rounded-xl border hover:bg-muted transition-colors cursor-pointer min-w-[120px] [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
                                        >
                                            <RadioGroupItem value="Other" id="mem-other" />
                                            <span className="font-medium cursor-pointer flex-1">Other</span>
                                        </Label>
                                    </RadioGroup>
                                </FormControl>
                                <FormMessage />
                            </FormItem> 
                        )} />

                        <FormField control={form.control} name="membershipLocale" render={({ field }) => ( 
                            <FormItem className="space-y-3">
                                <FormLabel className="text-base font-semibold">Locale</FormLabel>
                                <FormControl>
                                    <RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-4">
                                        <Label 
                                            htmlFor="loc-nat" 
                                            className="flex items-center space-x-3 bg-muted/50 px-4 py-2 rounded-xl border hover:bg-muted transition-colors cursor-pointer min-w-[120px] [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
                                        >
                                            <RadioGroupItem value="National" id="loc-nat" />
                                            <span className="font-medium cursor-pointer flex-1">National</span>
                                        </Label>
                                        <Label 
                                            htmlFor="loc-int" 
                                            className="flex items-center space-x-3 bg-muted/50 px-4 py-2 rounded-xl border hover:bg-muted transition-colors cursor-pointer min-w-[120px] [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
                                        >
                                            <RadioGroupItem value="International" id="loc-int" />
                                            <span className="font-medium cursor-pointer flex-1">International</span>
                                        </Label>
                                    </RadioGroup>
                                </FormControl>
                                <FormMessage />
                            </FormItem> 
                        )} />
                    </div>

                    <FormField name="membershipNumber" control={form.control} render={({ field }) => ( 
                        <FormItem>
                            <FormLabel className="text-base font-semibold">Membership Number</FormLabel>
                            <FormControl><Input {...field} className="h-12 shadow-sm font-mono" placeholder="Enter membership ID/Number" /></FormControl>
                            <FormMessage />
                        </FormItem> 
                    )} />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <FormField name="membershipAmountPaid" control={form.control} render={({ field }) => ( 
                            <FormItem>
                                <FormLabel className="text-base font-semibold">Amount Paid (INR)</FormLabel>
                                <FormControl>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">₹</span>
                                        <Input type="number" placeholder="e.g., 10000" {...field} min="0" className="h-12 pl-8 text-lg font-mono shadow-sm" />
                                    </div>
                                </FormControl>
                                <FormMessage />
                            </FormItem> 
                        )} />
                        <FormField name="membershipPaymentDate" control={form.control} render={({ field }) => ( 
                            <FormItem>
                                <FormLabel className="text-base font-semibold">Payment Date</FormLabel>
                                <FormControl><Input type="date" {...field} max={new Date().toISOString().split("T")[0]} className="h-12 shadow-sm" /></FormControl>
                                <FormMessage />
                            </FormItem> 
                        )} />
                    </div>
                </section>

                <Separator className="my-8" />

                <section className="space-y-6">
                    <div className="flex items-center gap-2 text-primary font-bold text-lg mb-4">
                        <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                        Documentation
                    </div>
                    
                    <FormField name="membershipProof" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( 
                        <FormItem>
                            <FormLabel className="text-base font-semibold">Proof of Membership & Payment (PDF)</FormLabel>
                            <FormControl>
                                <Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} accept="application/pdf" className="h-12 border-dashed border-2 cursor-pointer hover:bg-muted/30 transition-colors file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" />
                            </FormControl>
                            <FormDescription>Attach Membership Certificate and Payment Receipt.</FormDescription>
                            <FormMessage />
                        </FormItem> 
                    )} />

                    <FormField control={form.control} name="membershipSelfDeclaration" render={({ field }) => ( 
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-2xl border-2 border-primary/20 p-6 bg-primary/5 shadow-sm">
                            <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} className="h-6 w-6 rounded-md" /></FormControl>
                            <div className="space-y-1">
                                <FormLabel className="font-bold text-primary">Self Declaration Acknowledgement</FormLabel>
                                <p className="text-sm text-primary/80 font-medium">I hereby confirm that I have not applied/claimed for any reimbursement for this membership earlier.</p>
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
                            <div className="mt-3 p-4 bg-background rounded-xl border shadow-inner space-y-2 text-xs font-medium animate-in slide-in-from-top-2 flex flex-col gap-1">
                                {getMembershipLogicBreakdown(form.getValues()).map((step, idx) => (
                                  <div key={idx} className="flex justify-between items-start py-1 border-b last:border-0 border-muted">
                                    <span className="text-muted-foreground pr-2">{step.label}</span>
                                    <span className={idx === (getMembershipLogicBreakdown(form.getValues()).length - 1) ? "font-bold text-green-600 shrink-0" : "font-semibold shrink-0"}>{step.value}</span>
                                  </div>
                                ))}
                              
                              <div className="text-[9px] text-muted-foreground italic mt-2 !pt-2 text-center border-t border-muted opacity-70">
                                *50% of the membership fee up to a max cap of ₹10,000 matches logic on approver's side.
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
