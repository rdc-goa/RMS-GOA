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
import { Textarea } from '@/components/ui/textarea';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/config';
import { doc, getDoc } from 'firebase/firestore';
import type { User, IncentiveClaim } from '@/types';
import { uploadFileToApi } from '@/lib/upload-client';
import { Loader2, AlertCircle } from 'lucide-react';
import { submitIncentiveClaimViaApi } from '@/lib/incentive-claim-client';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const workshopEventTypes = ['STTP', 'Workshop', 'Training Program', 'FDP', 'Other'];

const allEventTypes = [
  'Conference',
  'Seminar',
  'Symposium',
  'Invited Talk/Guest Speaker',
  ...workshopEventTypes,
];

const workshopSchema = z
  .object({
    eventType: z.string({ required_error: 'Please select an event type.' }),
    workshopName: z.string().min(3, 'Workshop/FDP name is required.'),
    attendanceMode: z.enum(['Online', 'Offline'], { required_error: 'Attendance mode is required.' }),
    organizerName: z.string().min(2, 'Organizer name is required.'),
    eventTypeLevel: z.enum(['International', 'National', 'Regional/State', 'Other'], { required_error: 'Event level is required.' }),
    registrationFee: z.coerce.number().nonnegative('Fee cannot be negative.').optional(),
    registrationFeeProof: z.any().optional().refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, 'File must be less than 10 MB.'),
    workshopCertificate: z
      .any()
      .refine((files) => files?.length > 0, 'Participation certificate is required.')
      .refine((files) => files?.[0]?.type === 'application/pdf', 'File must be a PDF.')
      .refine((files) => files?.[0]?.size <= MAX_FILE_SIZE, 'File must be less than 10 MB.'),
    travelPlaceVisited: z.string().optional(),
    travelMode: z.enum(['Bus', 'Train', 'Air', 'Other']).optional(),
    travelDetails: z.string().optional(),
    travelFare: z.coerce.number().nonnegative('Fare cannot be negative.').optional(),
    travelReceipts: z.any().optional().refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, 'File must be less than 10 MB.'),
    workshopSelfDeclaration: z.boolean().refine((val) => val === true, { message: 'You must agree to the self-declaration.' }),
  })
  .refine((data) => data.attendanceMode === 'Online' || (!!data.travelPlaceVisited && data.travelPlaceVisited.length > 1), {
    message: 'Place visited is required for offline attendance.',
    path: ['travelPlaceVisited'],
  })
  .refine((data) => data.attendanceMode === 'Online' || !!data.travelMode, {
    message: 'Travel mode is required for offline attendance.',
    path: ['travelMode'],
  });

type WorkshopFormValues = z.infer<typeof workshopSchema>;

const eventLevelOptions = ['International', 'National', 'Regional/State', 'Other'];

type WorkshopFormProps = {
  initialEventType?: string | null;
  onEventTypeChange?: (eventType: string | null) => void;
};

export function WorkshopForm({ initialEventType, onEventTypeChange }: WorkshopFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bankDetailsMissing, setBankDetailsMissing] = useState(false);
  const [orcidOrMisIdMissing, setOrcidOrMisIdMissing] = useState(false);
  const [isLoadingDraft, setIsLoadingDraft] = useState(true);

  const form = useForm<WorkshopFormValues>({
    resolver: zodResolver(workshopSchema),
    defaultValues: {
      eventType: initialEventType || '',
      workshopName: '',
      attendanceMode: undefined,
      organizerName: '',
      eventTypeLevel: undefined,
      registrationFee: 0,
      registrationFeeProof: undefined,
      workshopCertificate: undefined,
      travelPlaceVisited: '',
      travelMode: undefined,
      travelDetails: '',
      travelFare: 0,
      travelReceipts: undefined,
      workshopSelfDeclaration: false,
    },
  });

  const selectedEventType = form.watch('eventType');

  useEffect(() => {
    if (initialEventType) {
      form.setValue('eventType', initialEventType);
    }
  }, [initialEventType, form]);

  // Notify parent when event type changes to a non-workshop type
  useEffect(() => {
    if (selectedEventType && !workshopEventTypes.includes(selectedEventType)) {
      onEventTypeChange?.(selectedEventType);
    }
  }, [selectedEventType, onEventTypeChange]);

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
              registrationFeeProof: undefined,
              workshopCertificate: undefined,
              travelReceipts: undefined,
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

  async function handleSave(status: 'Draft' | 'Pending') {
    if (!user || !user.faculty) {
      toast({ variant: 'destructive', title: 'Error', description: 'User information not found. Please log in again.' });
      return;
    }
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

      const { registrationFeeProof, workshopCertificate, travelReceipts, ...restOfData } = data;

      const [registrationFeeProofUrl, workshopCertificateUrl, travelReceiptsUrl] = await Promise.all([
        uploadFileHelper(registrationFeeProof?.[0], 'workshop-registration-proof'),
        uploadFileHelper(workshopCertificate?.[0], 'workshop-certificate'),
        uploadFileHelper(travelReceipts?.[0], 'workshop-travel-receipts'),
      ]);

      const claimData = {
        ...restOfData,
        registrationFeeProofUrl: registrationFeeProofUrl ?? undefined,
        workshopCertificateUrl: workshopCertificateUrl ?? undefined,
        travelReceiptsUrl: travelReceiptsUrl ?? undefined,
        misId: user.misId ?? undefined,
        orcidId: user.orcidId ?? undefined,
        bankDetails: user.bankDetails ?? undefined,
        claimType: 'Conference Presentations',
        benefitMode: 'reimbursement',
        uid: user.uid,
        userName: user.name,
        userEmail: user.email,
        faculty: user.faculty,
        status,
        submissionDate: new Date().toISOString(),
      } satisfies Omit<IncentiveClaim, 'id' | 'claimId'>;

      const result = await submitIncentiveClaimViaApi(claimData);

      if (!result.success) {
        throw new Error(result.error);
      }

      const claimId = searchParams.get('claimId') || result.claimId;

      if (status === 'Draft') {
        toast({ title: 'Draft Saved!', description: "You can continue editing from the 'Incentive Claim' page." });
        if (!searchParams.get('claimId')) {
          router.push(`/dashboard/incentive-claim/conference?claimId=${claimId}`);
        }
      } else {
        toast({ title: 'Success', description: 'Your incentive claim has been submitted.' });
        router.push('/dashboard/incentive-claim');
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to submit claim. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  }

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
        <form>
          <CardContent className="space-y-6 pt-6">
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

            <div className="rounded-lg border p-4 space-y-6">
              <div>
                <h3 className="font-semibold text-sm -mb-2">DETAILS OF WORKSHOP/FDP/TRAINING</h3>
                <Separator className="mt-4" />
                <div className="space-y-4 mt-4">
                  <FormField
                    name="eventType"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type of Event</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select event type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {allEventTypes.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="workshopName"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Workshop/FDP Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Name of the program" {...field} disabled={isSubmitting} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="attendanceMode"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Attendance Mode</FormLabel>
                        <FormControl>
                          <RadioGroup onValueChange={field.onChange} value={field.value} className="flex items-center space-x-6">
                            <FormItem className="flex items-center space-x-2 space-y-0">
                              <FormControl>
                                <RadioGroupItem value="Online" disabled={isSubmitting} />
                              </FormControl>
                              <FormLabel className="font-normal">Online</FormLabel>
                            </FormItem>
                            <FormItem className="flex items-center space-x-2 space-y-0">
                              <FormControl>
                                <RadioGroupItem value="Offline" disabled={isSubmitting} />
                              </FormControl>
                              <FormLabel className="font-normal">Offline</FormLabel>
                            </FormItem>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="organizerName"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Organizer Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Name of institution/organisation" {...field} disabled={isSubmitting} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="eventTypeLevel"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Event Level</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select event level" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {eventLevelOptions.map((level) => (
                              <SelectItem key={level} value={level}>
                                {level}
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
                      name="registrationFee"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Registration Fee (INR)</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" {...field} disabled={isSubmitting} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      name="registrationFeeProof"
                      control={form.control}
                      render={({ field: { value, onChange, ...fieldProps } }) => (
                        <FormItem>
                          <FormLabel>Registration Fee Proof (PDF, Below 10MB)</FormLabel>
                          <FormControl>
                            <Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} disabled={isSubmitting} accept="application/pdf" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    name="workshopCertificate"
                    control={form.control}
                    render={({ field: { value, onChange, ...fieldProps } }) => (
                      <FormItem>
                        <FormLabel>Participation/Completion Certificate (PDF, Below 10MB)</FormLabel>
                        <FormControl>
                          <Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} disabled={isSubmitting} accept="application/pdf" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-sm -mb-2">TRAVEL DETAILS</h3>
                <Separator className="mt-4" />
                <div className="space-y-4 mt-4">
                  <FormField
                    name="travelPlaceVisited"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Place Visited</FormLabel>
                        <FormControl>
                          <Input placeholder="City/Location" {...field} disabled={isSubmitting} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="travelMode"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Travel Mode</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select travel mode" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Bus">Bus</SelectItem>
                            <SelectItem value="Train">Train</SelectItem>
                            <SelectItem value="Air">Air</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="travelDetails"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Travel Details</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Ticket/route/class details" {...field} disabled={isSubmitting} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="travelFare"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Travel Fare Incurred (INR)</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" {...field} disabled={isSubmitting} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="travelReceipts"
                    control={form.control}
                    render={({ field: { value, onChange, ...fieldProps } }) => (
                      <FormItem>
                        <FormLabel>Attach Tickets/Receipts (PDF, Below 10MB)</FormLabel>
                        <FormControl>
                          <Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} disabled={isSubmitting} accept="application/pdf" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-sm -mb-2">DECLARATION</h3>
                <Separator className="mt-4" />
                <div className="space-y-4 mt-4">
                  <FormField
                    name="workshopSelfDeclaration"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isSubmitting} />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Self Declaration</FormLabel>
                          <FormMessage />
                          <p className="text-xs text-muted-foreground">
                            I hereby confirm that I have not applied/claimed for any incentive for the same event earlier.
                          </p>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => handleSave('Draft')} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save as Draft
            </Button>
            <Button type="button" onClick={() => handleSave('Pending')} disabled={isSubmitting || bankDetailsMissing || orcidOrMisIdMissing}>
              Submit Claim
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
