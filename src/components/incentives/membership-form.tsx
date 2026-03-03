

'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/config';
import { collection, doc, setDoc, getDoc } from 'firebase/firestore';
import type { User, IncentiveClaim } from '@/types';
import { uploadFileToApi } from '@/lib/upload-client';
import { Loader2, AlertCircle, Edit } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { submitIncentiveClaimViaApi } from '@/lib/incentive-claim-client';

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
});

type MembershipFormValues = z.infer<typeof membershipSchema>;

function ReviewDetails({ data, onEdit }: { data: MembershipFormValues; onEdit: () => void }) {
    const renderDetail = (label: string, value?: string | number | boolean) => {
        if (!value && value !== 0 && value !== false) return null;
        return (
            <div className="grid grid-cols-3 gap-2 py-1.5 items-start">
                <dt className="font-semibold text-muted-foreground col-span-1">{label}</dt>
                <dd className="col-span-2">{String(value)}</dd>
            </div>
        );
    };

    const proofFile = data.membershipProof?.[0] as File | undefined;

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
                {renderDetail("Professional Body Name", data.professionalBodyName)}
                {renderDetail("Membership Type", data.membershipType)}
                {renderDetail("Locale", data.membershipLocale)}
                {renderDetail("Membership Number", data.membershipNumber)}
                {renderDetail("Amount Paid (INR)", `₹${data.membershipAmountPaid.toLocaleString('en-IN')}`)}
                {renderDetail("Payment Date", data.membershipPaymentDate)}
                {renderDetail("Proof Document", proofFile?.name)}
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
                const claimRef = doc(db, 'incentiveClaims', claimId);
                const claimSnap = await getDoc(claimRef);
                if (claimSnap.exists()) {
                    const draftData = claimSnap.data() as IncentiveClaim;
                    form.reset({
                        ...draftData,
                        membershipProof: undefined, // Files can't be pre-filled
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
            calculatedIncentive,
            misId: user.misId || null,
            orcidId: user.orcidId || null,
            claimType: 'Membership of Professional Bodies',
            benefitMode: 'reimbursement',
            uid: user.uid,
            userName: user.name,
            userEmail: user.email,
            faculty: user.faculty,
            status,
            submissionDate: new Date().toISOString(),
            bankDetails: user.bankDetails || null,
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
            <div className="rounded-lg border p-4 space-y-4 animate-in fade-in-0">
                <h3 className="font-semibold text-sm -mb-2">MEMBERSHIP DETAILS</h3>
                <Separator />
                <FormField name="professionalBodyName" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Name of Professional Body</FormLabel><FormControl><Input placeholder="e.g., Institute of Electrical and Electronics Engineers" {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField control={form.control} name="membershipType" render={({ field }) => ( <FormItem><FormLabel>Type of Membership</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-6"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Lifetime" /></FormControl><FormLabel className="font-normal">Lifetime</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Yearly" /></FormControl><FormLabel className="font-normal">Yearly</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="Other" /></FormControl><FormLabel className="font-normal">Other</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )} />
                <FormField control={form.control} name="membershipLocale" render={({ field }) => ( <FormItem><FormLabel>Locale of Professional Body</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-6"><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="National" /></FormControl><FormLabel className="font-normal">National</FormLabel></FormItem><FormItem className="flex items-center space-x-2 space-y-0"><FormControl><RadioGroupItem value="International" /></FormControl><FormLabel className="font-normal">International</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )} />
                <FormField name="membershipNumber" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Membership Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField name="membershipAmountPaid" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Amount Paid (INR)</FormLabel><FormControl><Input type="number" placeholder="e.g., 10000" {...field} min="0" /></FormControl><FormMessage /></FormItem> )} />
                    <FormField name="membershipPaymentDate" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Payment Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem> )} />
                </div>
                {calculatedIncentive !== null && (
                    <div className="p-4 bg-secondary rounded-md">
                        <p className="text-sm font-medium">Tentative Eligible Incentive Amount: <span className="font-bold text-lg text-primary">₹{calculatedIncentive.toLocaleString('en-IN')}</span></p>
                        <p className="text-xs text-muted-foreground">50% of the membership fee, capped at ₹10,000.</p>
                    </div>
                )}
                <FormField name="membershipProof" control={form.control} render={({ field: { value, onChange, ...fieldProps } }) => ( <FormItem><FormLabel>Attach Proof (Membership Certificate, Invoice/Receipt and Payment Proof)</FormLabel><FormControl><Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} accept="application/pdf" /></FormControl><FormMessage /></FormItem> )} />
                <FormField control={form.control} name="membershipSelfDeclaration" render={({ field }) => ( <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4"><FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl><div className="space-y-1 leading-none"><FormLabel>Self Declaration</FormLabel><FormMessage /><p className="text-xs text-muted-foreground">I hereby confirm that I have not applied/claimed for any incentive for the same application/publication earlier.</p></div></FormItem> )} />
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
