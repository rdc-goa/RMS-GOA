'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/config';
import { doc, getDoc } from 'firebase/firestore';
import type { User, IncentiveClaim } from '@/types';
import { uploadFileToApi } from '@/lib/upload-client';
import { Loader2, AlertCircle, X } from 'lucide-react';
import { submitIncentiveClaimViaApi } from '@/lib/incentive-claim-client';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const awardSchema = z.object({
  awardTitle: z.string().min(3, 'Award title is required.'),
  awardingBody: z.string().min(2, 'Awarding body is required.'),
  awardStature: z.enum(['National', 'International'], { required_error: 'Stature of awarding body is required.' }),
  awardBodyType: z.enum(['Government', 'NGO (Non-Governmental Organization)', 'Any Other'], { required_error: 'Type of awarding body is required.' }),
  awardLocale: z.string().min(2, 'Locale of the awarding body is required.'),
  membershipNumber: z.string().optional(),
  amountPaid: z.number().min(0, 'Amount paid must be 0 or greater.').optional(),
  paymentDate: z.string().optional(),
  awardDate: z.string({ required_error: 'Award date is required.' }).min(1, 'Award date is required.'),
  awardProof: z.array(z.string()).min(1, 'At least one proof document is required.').max(10, 'Maximum 10 files allowed.'),
  awardSelfDeclaration: z.boolean().refine((val) => val === true, {
    message: 'You must confirm the self-declaration.',
  }),
});

type AwardFormValues = z.infer<typeof awardSchema>;

export function AwardForm() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bankDetailsMissing, setBankDetailsMissing] = useState(false);
  const [orcidOrMisIdMissing, setOrcidOrMisIdMissing] = useState(false);
  const [isLoadingDraft, setIsLoadingDraft] = useState(true);
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});

  const form = useForm<AwardFormValues>({
    resolver: zodResolver(awardSchema),
    defaultValues: {
      awardTitle: '',
      awardingBody: '',
      awardStature: undefined,
      awardBodyType: undefined,
      awardLocale: '',
      membershipNumber: '',
      amountPaid: 0,
      paymentDate: '',
      awardDate: '',
      awardProof: [],
      awardSelfDeclaration: false,
    },
  });

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      setBankDetailsMissing(!parsedUser?.bankDetails);
      setOrcidOrMisIdMissing(!parsedUser?.orcidId && !parsedUser?.misId);
    }
    setIsLoadingDraft(false);
  }, []);

  useEffect(() => {
    const claimId = searchParams.get('claimId');
    if (claimId && user) {
      const fetchDraft = async () => {
        try {
          const claimRef = doc(db, 'incentiveClaims', claimId);
          const claimSnap = await getDoc(claimRef);
          if (claimSnap.exists()) {
            const draftData = claimSnap.data() as IncentiveClaim;
            form.reset({
              awardTitle: draftData.awardTitle || '',
              awardingBody: draftData.awardingBody || '',
              awardStature: draftData.awardStature as 'National' | 'International' | undefined,
              awardBodyType: draftData.awardBodyType as 'Government' | 'NGO (Non-Governmental Organization)' | 'Any Other' | undefined,
              awardLocale: draftData.awardLocale || '',
              membershipNumber: draftData.membershipNumber || '',
              amountPaid: draftData.amountPaid || 0,
              paymentDate: draftData.paymentDate || '',
              awardDate: draftData.awardDate || '',
              awardProof: draftData.awardProofUrls || [],
              awardSelfDeclaration: draftData.awardSelfDeclaration || false,
            });
          }
        } catch (error) {
          console.error('Error fetching draft:', error);
          toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Failed to load draft.',
          });
        }
      };
      fetchDraft();
    }
  }, [searchParams, user, form, toast]);

  const handleFileUpload = async (files: FileList | null, fieldName: 'awardProof') => {
    if (!files || files.length === 0) return;

    const currentFiles = form.getValues(fieldName) || [];
    if (currentFiles.length + files.length > 10) {
      toast({
        variant: 'destructive',
        title: 'Too many files',
        description: 'Maximum 10 files allowed.',
      });
      return;
    }

    setUploadingFiles((prev) => new Set(prev).add(fieldName));

    try {
      const uploadedUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileKey = `${fieldName}-${file.name}-${Date.now()}-${i}`;
        
        if (file.size > MAX_FILE_SIZE) {
          toast({
            variant: 'destructive',
            title: 'File too large',
            description: `${file.name} exceeds 10 MB limit.`,
          });
          continue;
        }

        if (file.type !== 'application/pdf') {
          toast({
            variant: 'destructive',
            title: 'Invalid file type',
            description: `${file.name} is not a PDF file.`,
          });
          continue;
        }

        // Set initial progress
        setUploadProgress((prev) => ({ ...prev, [fileKey]: 0 }));

        try {
          const result = await uploadFileToApi(file);
          if (result.success && result.url) {
            uploadedUrls.push(result.url);
            setUploadProgress((prev) => ({ ...prev, [fileKey]: 100 }));
          } else {
            toast({
              variant: 'destructive',
              title: 'Upload failed',
              description: `Failed to upload ${file.name}`,
            });
          }
        } catch (error) {
          console.error(`Error uploading ${file.name}:`, error);
          toast({
            variant: 'destructive',
            title: 'Upload failed',
            description: `Failed to upload ${file.name}`,
          });
        } finally {
          // Remove progress after a short delay
          setTimeout(() => {
            setUploadProgress((prev) => {
              const newProgress = { ...prev };
              delete newProgress[fileKey];
              return newProgress;
            });
          }, 1000);
        }
      }

      if (uploadedUrls.length > 0) {
        form.setValue(fieldName, [...currentFiles, ...uploadedUrls]);
        toast({
          title: 'Success',
          description: `${uploadedUrls.length} file(s) uploaded successfully.`,
        });
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: 'Failed to upload files. Please try again.',
      });
    } finally {
      setUploadingFiles((prev) => {
        const newSet = new Set(prev);
        newSet.delete(fieldName);
        return newSet;
      });
    }
  };

  const removeFile = (fieldName: 'awardProof', index: number) => {
    const currentFiles = form.getValues(fieldName) || [];
    const newFiles = currentFiles.filter((_, i) => i !== index);
    form.setValue(fieldName, newFiles);
  };

  const saveDraft = async () => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'User not found. Please log in again.',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = form.getValues();
      const claimId = searchParams.get('claimId');

      const draftClaim: Partial<IncentiveClaim> = {
        uid: user.uid,
        userName: user.name || '',
        userEmail: user.email || '',
        faculty: user.faculty || '',
        claimType: 'Award',
        benefitMode: 'Incentive',
        status: 'Draft',
        submissionDate: new Date().toISOString(),
        awardTitle: formData.awardTitle,
        awardingBody: formData.awardingBody,
        awardStature: formData.awardStature,
        awardBodyType: formData.awardBodyType,
        awardLocale: formData.awardLocale,
        membershipNumber: formData.membershipNumber,
        amountPaid: formData.amountPaid,
        paymentDate: formData.paymentDate,
        awardDate: formData.awardDate,
        awardProofUrls: formData.awardProof,
        awardSelfDeclaration: formData.awardSelfDeclaration,
      };

      const result = await submitIncentiveClaimViaApi(draftClaim as Omit<IncentiveClaim, 'id' | 'claimId'>, claimId || undefined);

      if (result.success) {
        toast({
          title: 'Draft saved',
          description: 'Your draft has been saved successfully.',
        });
        router.push('/dashboard/incentive-claim');
      } else {
        throw new Error(result.error || 'Failed to save draft');
      }
    } catch (error) {
      console.error('Error saving draft:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to save draft. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = async (data: AwardFormValues) => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'User not found. Please log in again.',
      });
      return;
    }

    if (bankDetailsMissing || orcidOrMisIdMissing) {
      toast({
        variant: 'destructive',
        title: 'Profile Incomplete',
        description: 'Please complete your profile before submitting.',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const claimId = searchParams.get('claimId');

      const claim: Partial<IncentiveClaim> = {
        uid: user.uid,
        userName: user.name || '',
        userEmail: user.email || '',
        faculty: user.faculty || '',
        claimType: 'Award',
        benefitMode: 'Incentive',
        status: 'Pending',
        submissionDate: new Date().toISOString(),
        awardTitle: data.awardTitle,
        awardingBody: data.awardingBody,
        awardStature: data.awardStature,
        awardBodyType: data.awardBodyType,
        awardLocale: data.awardLocale,
        membershipNumber: data.membershipNumber,
        amountPaid: data.amountPaid,
        paymentDate: data.paymentDate,
        awardDate: data.awardDate,
        awardProofUrls: data.awardProof,
        awardSelfDeclaration: data.awardSelfDeclaration,
      };

      const result = await submitIncentiveClaimViaApi(claim as Omit<IncentiveClaim, 'id' | 'claimId'>, claimId || undefined);

      if (result.success) {
        toast({
          title: 'Success',
          description: 'Your award claim has been submitted successfully.',
        });
        router.push('/dashboard/incentive-claim');
      } else {
        throw new Error(result.error || 'Failed to submit claim');
      }
    } catch (error) {
      console.error('Error submitting claim:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to submit claim. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingDraft) {
    return (
      <Card className="p-8 flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </Card>
    );
  }

  return (
    <Card>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardHeader>
            
            <CardDescription>Submit details of your award for incentive claim</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {(bankDetailsMissing || orcidOrMisIdMissing) && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Profile Incomplete</AlertTitle>
                <AlertDescription>
                  An ORCID iD, MIS ID, and bank details are mandatory for submitting incentive claims. Please add them to your profile.
                  <Button asChild variant="link" className="p-1 h-auto">
                    <Link href="/dashboard/settings">Go to Settings</Link>
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
              <FormField
                name="awardTitle"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title of the Award *</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter award title" {...field} disabled={isSubmitting} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="awardingBody"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Awarding Body *</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter awarding body name" {...field} disabled={isSubmitting} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="awardStature"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stature of the Awarding Body *</FormLabel>
                    <FormControl>
                      <RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-6">
                        <FormItem className="flex items-center space-x-2 space-y-0">
                          <FormControl>
                            <RadioGroupItem value="National" disabled={isSubmitting} />
                          </FormControl>
                          <FormLabel className="font-normal">National</FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-2 space-y-0">
                          <FormControl>
                            <RadioGroupItem value="International" disabled={isSubmitting} />
                          </FormControl>
                          <FormLabel className="font-normal">International</FormLabel>
                        </FormItem>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="awardBodyType"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type of Awarding Body *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Government">Government</SelectItem>
                        <SelectItem value="NGO (Non-Governmental Organization)">NGO (Non-Governmental Organization)</SelectItem>
                        <SelectItem value="Any Other">Any Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="awardLocale"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Locale of the Awarding Body *</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter location/locale" {...field} disabled={isSubmitting} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="membershipNumber"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Membership Number (if any)</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter membership number" {...field} disabled={isSubmitting} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="amountPaid"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount Paid (if any)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="0"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="paymentDate"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Date (if applicable)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} disabled={isSubmitting} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="awardDate"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} disabled={isSubmitting} />
                    </FormControl>
                    <FormDescription>Date when the award was received</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="awardProof"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Attach Proof *</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <Input
                          type="file"
                          accept="application/pdf"
                          multiple
                          onChange={(e) => handleFileUpload(e.target.files, 'awardProof')}
                          disabled={isSubmitting || uploadingFiles.has('awardProof')}
                        />
                        <FormDescription>
                          Upload up to 10 supported files: PDF. Max 10 MB per file.
                        </FormDescription>
                        {Object.keys(uploadProgress).length > 0 && (
                          <div className="space-y-2">
                            {Object.entries(uploadProgress).map(([key, progress]) => {
                              const fileName = key.split('-').slice(1, -2).join('-');
                              return (
                                <div key={key} className="space-y-1">
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground truncate flex-1">{fileName}</span>
                                    <span className="text-muted-foreground ml-2">{progress}%</span>
                                  </div>
                                  <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                                    <div
                                      className="bg-primary h-full transition-all duration-300"
                                      style={{ width: `${progress}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {uploadingFiles.has('awardProof') && Object.keys(uploadProgress).length === 0 && (
                          <div className="flex items-center text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Preparing upload...
                          </div>
                        )}
                        {field.value && field.value.length > 0 && (
                          <div className="space-y-2">
                            {field.value.map((url, index) => (
                              <div key={index} className="flex items-center justify-between p-2 border rounded">
                                <span className="text-sm truncate flex-1">File {index + 1}</span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeFile('awardProof', index)}
                                  disabled={isSubmitting}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="font-semibold text-sm">D. Self Declaration</h3>
              <FormField
                name="awardSelfDeclaration"
                control={form.control}
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        I hereby confirm that I have not applied/claimed for any incentive for the same application/publication earlier. *
                      </FormLabel>
                      <FormMessage />
                    </div>
                  </FormItem>
                )}
              />
            </div>
          </CardContent>

          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={saveDraft} disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Draft'}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" asChild>
                <Link href="/dashboard/incentive-claim">Cancel</Link>
              </Button>
              <Button type="submit" disabled={isSubmitting || bankDetailsMissing || orcidOrMisIdMissing}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Claim'
                )}
              </Button>
            </div>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
