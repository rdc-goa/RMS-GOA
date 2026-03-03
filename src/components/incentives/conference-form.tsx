'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
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
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/config';
import { collection, doc, getDoc, getDocs, query, where, orderBy } from 'firebase/firestore';
import type { User, IncentiveClaim } from '@/types';
import { uploadFileToApi } from '@/lib/upload-client';
import { Loader2, AlertCircle, Info, Edit } from 'lucide-react';
import { submitIncentiveClaimViaApi } from '@/lib/incentive-claim-client';
import { parseISO, addYears, format } from 'date-fns';
import { calculateConferenceIncentive } from '@/app/incentive-calculation';
import { WorkshopForm } from '@/components/incentives/workshop-form';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const workshopEventTypes = ['STTP', 'Workshop', 'Training Program', 'FDP', 'Other'];

const conferenceSchema = z
  .object({
    eventType: z.string({ required_error: 'Please select an event type.' }),
    conferencePaperTitle: z.string().min(5, 'Paper title is required.'),
    conferenceName: z.string().min(3, 'Conference name is required.'),
    conferenceMode: z.enum(['Online', 'Offline'], { required_error: 'Presentation mode is required.' }),
    onlinePresentationOrder: z.enum(['First', 'Second', 'Third', 'Additional']).optional(),
    conferenceType: z.enum(['International', 'National', 'Regional/State'], { required_error: 'Conference type is required.' }),
    conferenceVenue: z.enum(['India', 'Indian Subcontinent', 'South Korea, Japan, Australia and Middle East', 'Europe', 'African/South American/North American', 'Other'], { required_error: 'Conference venue is required.' }),
    presentationType: z.enum(['Oral', 'Poster', 'Other']).optional(),
    govtFundingRequestProof: z.any().optional().refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, 'File must be less than 10 MB.'),
    registrationFee: z.coerce.number().nonnegative('Fee cannot be negative.').optional(),
    travelFare: z.coerce.number().nonnegative('Fare cannot be negative.').optional(),
    wasPresentingAuthor: z.boolean().optional(),
    isPuNamePresent: z.boolean().optional(),
    abstractUpload: z
      .any()
      .refine((files) => files?.length > 0, 'An abstract is required.')
      .refine((files) => files?.[0]?.type === 'application/pdf', 'Abstract must be a PDF file.')
      .refine((files) => files?.[0]?.size <= MAX_FILE_SIZE, 'File must be less than 10 MB.'),
    organizerName: z.string().min(2, 'Organizer name is required.'),
    eventWebsite: z.string().url('Please enter a valid URL.').optional().or(z.literal('')),
    conferenceDate: z.string().min(1, 'Conference date is required.'),
    presentationDate: z.string().min(1, 'Presentation date is required.'),
    registrationFeeProof: z.any().optional().refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, 'File must be less than 10 MB.'),
    participationCertificate: z
      .any()
      .refine((files) => files?.length > 0, 'Participation certificate is required.')
      .refine((files) => files?.[0]?.type === 'application/pdf', 'File must be a PDF.')
      .refine((files) => files?.[0]?.size <= MAX_FILE_SIZE, 'File must be less than 10 MB.'),
    wonPrize: z.boolean().optional(),
    prizeDetails: z.string().optional(),
    prizeProof: z.any().optional().refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, 'File must be less than 10 MB.'),
    attendedOtherConference: z.boolean().optional(),
    travelPlaceVisited: z.string().optional(),
    travelMode: z.enum(['Bus', 'Train', 'Air', 'Other']).optional(),
    travelReceipts: z.any().optional().refine((files) => !files?.[0] || files?.[0]?.size <= MAX_FILE_SIZE, 'File must be less than 10 MB.'),
    conferenceSelfDeclaration: z.boolean().refine((val) => val === true, { message: 'You must agree to the self-declaration.' }),
    authorType: z.string().optional(),
    totalAuthors: z.string().optional(),
  })
  .refine(
    (data) => !(data.conferenceVenue && data.conferenceVenue !== 'India') || (!!data.govtFundingRequestProof && data.govtFundingRequestProof.length > 0),
    { message: 'Proof of government funding request is required for conferences outside India.', path: ['govtFundingRequestProof'] }
  )
  .refine(
    (data) => !(data.wonPrize) || (!!data.prizeDetails && data.prizeDetails.length > 2),
    { message: 'Prize details are required if you won a prize.', path: ['prizeDetails'] }
  )
  .refine(
    (data) => !(data.wonPrize) || (!!data.prizeProof && data.prizeProof.length > 0),
    { message: 'Proof of prize is required if you won a prize.', path: ['prizeProof'] }
  )
  .refine(
    (data) => data.conferenceMode === 'Online' || !!data.presentationType,
    { message: 'Presentation type is required for offline conferences.', path: ['presentationType'] }
  )
  .refine(
    (data) => !data.conferenceDate || !data.presentationDate || new Date(data.presentationDate) >= new Date(data.conferenceDate),
    { message: 'Presentation date must be on or after the conference start date.', path: ['presentationDate'] }
  );

type ConferenceFormValues = z.infer<typeof conferenceSchema>;

const eventTypes = [
  'Conference',
  'Seminar',
  'Symposium',
  'Invited Talk/Guest Speaker',
  ...workshopEventTypes,
];

const conferenceVenueOptions = {
  International: ['India', 'Indian Subcontinent', 'South Korea, Japan, Australia and Middle East', 'Europe', 'African/South American/North American', 'Other'],
  National: ['India'],
  'Regional/State': ['India'],
};

const authorCountOptions = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10+'];
const authorTypeOptions = ['First Author', 'Corresponding Author', 'Co-Author'];

function ReviewDetails({ data, onEdit }: { data: ConferenceFormValues; onEdit: () => void }) {
  const renderDetail = (label: string, value?: string | number | boolean) => {
    if (!value && value !== 0 && value !== false) return null;
    return (
      <div className="grid grid-cols-3 gap-2 py-1.5 items-start">
        <dt className="font-semibold text-muted-foreground col-span-1">{label}</dt>
        <dd className="col-span-2">{String(value)}</dd>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Review Your Application</CardTitle>
            <CardDescription>Please review the details below before final submission.</CardDescription>
          </div>
          <Button variant="outline" onClick={onEdit}>
            <Edit className="h-4 w-4 mr-2" /> Edit
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {renderDetail('Event Type', data.eventType)}
        {renderDetail('Paper Title', data.conferencePaperTitle)}
        {renderDetail('Conference Name', data.conferenceName)}
        {renderDetail('Organizer', data.organizerName)}
        {renderDetail('Event Website', data.eventWebsite)}
        {renderDetail('Conference Date', data.conferenceDate)}
        {renderDetail('Presentation Date', data.presentationDate)}
        {renderDetail('Conference Type', data.conferenceType)}
        {renderDetail('Presentation Type', data.presentationType)}
        {renderDetail('Presentation Mode', data.conferenceMode)}
        {renderDetail('Online Presentation Order', data.onlinePresentationOrder)}
        {renderDetail('Registration Fee', data.registrationFee ? `₹${data.registrationFee.toLocaleString('en-IN')}` : undefined)}
        {renderDetail('Venue/Location', data.conferenceVenue)}
        {renderDetail('Place Visited', data.travelPlaceVisited)}
        {renderDetail('Travel Mode', data.travelMode)}
        {renderDetail('Travel Fare', data.travelFare ? `₹${data.travelFare.toLocaleString('en-IN')}` : undefined)}
        {renderDetail('Presenting Author?', data.wasPresentingAuthor ? 'Yes' : 'No')}
        {renderDetail('PU Name in Paper?', data.isPuNamePresent ? 'Yes' : 'No')}
        {renderDetail('Won a Prize?', data.wonPrize ? 'Yes' : 'No')}
        {renderDetail('Prize Details', data.prizeDetails)}
      </CardContent>
    </Card>
  );
}

export function ConferenceForm() {
  const searchParams = useSearchParams();
  const [draftEventType, setDraftEventType] = useState<string | null>(null);
  const [selectedEventType, setSelectedEventType] = useState<string | null>(null);
  const [isLoadingDraft, setIsLoadingDraft] = useState(true);

  useEffect(() => {
    const claimId = searchParams.get('claimId');
    if (claimId) {
      const fetchDraft = async () => {
        try {
          const claimRef = doc(db, 'incentiveClaims', claimId);
          const claimSnap = await getDoc(claimRef);
          if (claimSnap.exists()) {
            const draftData = claimSnap.data() as IncentiveClaim;
            const eventType = draftData.eventType || null;
            setDraftEventType(eventType);
            setSelectedEventType(eventType);
          }
        } catch (error) {
          console.error('Error fetching draft:', error);
        } finally {
          setIsLoadingDraft(false);
        }
      };
      fetchDraft();
    } else {
      setIsLoadingDraft(false);
    }
  }, [searchParams]);

  if (isLoadingDraft) {
    return (
      <Card className="p-8 flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </Card>
    );
  }

  if (selectedEventType && workshopEventTypes.includes(selectedEventType)) {
    return <WorkshopForm initialEventType={selectedEventType} onEventTypeChange={setSelectedEventType} />;
  }

  return <ConferenceFormContent onEventTypeChange={setSelectedEventType} />;
}

interface ConferenceFormContentProps {
  onEventTypeChange?: (eventType: string | null) => void;
}

function ConferenceFormContent({ onEventTypeChange }: ConferenceFormContentProps) {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bankDetailsMissing, setBankDetailsMissing] = useState(false);
  const [orcidOrMisIdMissing, setOrcidOrMisIdMissing] = useState(false);
  const [eligibility, setEligibility] = useState<{ eligible: boolean; nextAvailableDate?: string }>({ eligible: true });
  const [isLoadingDraft, setIsLoadingDraft] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [calculatedIncentive, setCalculatedIncentive] = useState<number | null>(null);
  const [calculationBreakdown, setCalculationBreakdown] = useState<{ eligibleExpenses?: number; maxReimbursement?: number } | null>(null);

  const form = useForm<ConferenceFormValues>({
    resolver: zodResolver(conferenceSchema),
    defaultValues: {
      eventType: '',
      conferenceName: '',
      conferencePaperTitle: '',
      conferenceType: undefined,
      conferenceVenue: undefined,
      presentationType: undefined,
      govtFundingRequestProof: undefined,
      registrationFee: 0,
      travelFare: 0,
      conferenceMode: undefined,
      onlinePresentationOrder: undefined,
      wasPresentingAuthor: false,
      isPuNamePresent: false,
      abstractUpload: undefined,
      organizerName: '',
      eventWebsite: '',
      conferenceDate: '',
      presentationDate: '',
      registrationFeeProof: undefined,
      participationCertificate: undefined,
      wonPrize: false,
      prizeDetails: '',
      prizeProof: undefined,
      attendedOtherConference: false,
      travelPlaceVisited: '',
      travelMode: undefined,
      travelReceipts: undefined,
      conferenceSelfDeclaration: false,
    },
  });

  const selectedEventType = form.watch('eventType');

  // Notify parent component when workshop event type is selected
  useEffect(() => {
    if (selectedEventType && workshopEventTypes.includes(selectedEventType)) {
      onEventTypeChange?.(selectedEventType);
    }
  }, [selectedEventType, onEventTypeChange]);

  const calculate = useCallback(async () => {
    const dataForCalc = form.getValues();
    if (dataForCalc.conferenceMode) {
      const result = await calculateConferenceIncentive(dataForCalc);
      if (result.success) {
        setCalculatedIncentive(result.amount ?? null);
        setCalculationBreakdown({
          eligibleExpenses: result.eligibleExpenses,
          maxReimbursement: result.maxReimbursement,
        });
      } else {
        setCalculatedIncentive(null);
        setCalculationBreakdown(null);
      }
    } else {
      setCalculatedIncentive(null);
      setCalculationBreakdown(null);
    }
  }, [form]);

  useEffect(() => {
    const subscription = form.watch((value, { name, type }) => {
      const fieldsForRecalculation = [
        'registrationFee',
        'travelFare',
        'conferenceMode',
        'onlinePresentationOrder',
        'conferenceType',
        'presentationType',
        'conferenceVenue',
        'organizerName',
        'conferenceName',
      ];
      if (type === 'change' && fieldsForRecalculation.includes(name as string)) {
        calculate();
      }
    });
    return () => subscription.unsubscribe();
  }, [form, calculate]);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      setBankDetailsMissing(!parsedUser.bankDetails);
      setOrcidOrMisIdMissing(!parsedUser.orcidId || !parsedUser.misId);

      const checkEligibility = async () => {
        const claimsRef = collection(db, 'incentiveClaims');
        const q = query(
          claimsRef,
          where('uid', '==', parsedUser.uid),
          where('claimType', '==', 'Conference Presentations'),
          where('status', 'in', ['Accepted', 'Submitted to Accounts', 'Payment Completed']),
          orderBy('submissionDate', 'desc')
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const lastPuConferenceClaim = snapshot.docs
            .map((docItem) => docItem.data() as IncentiveClaim)
            .find(
              (claim) =>
                claim.organizerName?.toLowerCase().includes('parul university') ||
                claim.conferenceName?.toLowerCase().includes('picet')
            );

          if (lastPuConferenceClaim) {
            const lastClaimDate = parseISO(lastPuConferenceClaim.submissionDate);
            const oneYearAgo = addYears(new Date(), -1);

            if (lastClaimDate > oneYearAgo) {
              const nextDate = addYears(lastClaimDate, 1);
              setEligibility({
                eligible: false,
                nextAvailableDate: format(nextDate, 'PPP'),
              });
            }
          }
        }
      };
      checkEligibility();
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
              govtFundingRequestProof: undefined,
              abstractUpload: undefined,
              registrationFeeProof: undefined,
              participationCertificate: undefined,
              prizeProof: undefined,
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

      const {
        govtFundingRequestProof,
        abstractUpload,
        registrationFeeProof,
        participationCertificate,
        prizeProof,
        travelReceipts,
        ...restOfData
      } = data;

      const [
        govtFundingRequestProofUrl,
        abstractUrl,
        registrationFeeProofUrl,
        participationCertificateUrl,
        prizeProofUrl,
        travelReceiptsUrl,
      ] = await Promise.all([
        uploadFileHelper(govtFundingRequestProof?.[0], 'conference-funding-proof'),
        uploadFileHelper(abstractUpload?.[0], 'conference-abstract'),
        uploadFileHelper(registrationFeeProof?.[0], 'conference-reg-proof'),
        uploadFileHelper(participationCertificate?.[0], 'conference-cert'),
        uploadFileHelper(prizeProof?.[0], 'conference-prize-proof'),
        uploadFileHelper(travelReceipts?.[0], 'conference-travel-receipts'),
      ]);

      const claimData = {
        ...restOfData,
        govtFundingRequestProofUrl: govtFundingRequestProofUrl ?? undefined,
        abstractUrl: abstractUrl ?? undefined,
        registrationFeeProofUrl: registrationFeeProofUrl ?? undefined,
        participationCertificateUrl: participationCertificateUrl ?? undefined,
        prizeProofUrl: prizeProofUrl ?? undefined,
        travelReceiptsUrl: travelReceiptsUrl ?? undefined,
        calculatedIncentive: calculatedIncentive ?? undefined,
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
        authorType: data.authorType,
        totalAuthors: data.totalAuthors,
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

  const onFinalSubmit = () => handleSave('Pending');

  const { conferenceMode, conferenceType, wonPrize, organizerName, conferenceName, conferenceVenue } = form.watch();
  const isPuConference = organizerName?.toLowerCase().includes('parul university') || conferenceName?.toLowerCase().includes('picet');
  const isFormDisabled = (!eligibility.eligible && isPuConference) || isSubmitting;

  if (isLoadingDraft) {
    return (
      <Card className="p-8 flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </Card>
    );
  }

  if (currentStep === 2) {
    return (
      <Card>
        <form onSubmit={form.handleSubmit(onFinalSubmit)}>
          <CardContent className="pt-6">
            <ReviewDetails data={form.getValues()} onEdit={() => setCurrentStep(1)} />
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isFormDisabled || bankDetailsMissing || orcidOrMisIdMissing}>
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
                  <Button asChild variant="link" className="p-1 h-auto">
                    <Link href="/dashboard/settings">Go to Settings</Link>
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {!eligibility.eligible && isPuConference && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Not Eligible for PU Conference Reimbursement</AlertTitle>
                <AlertDescription>
                  As per policy, a faculty member is eligible for PU conference assistance ONCE per year. You will be eligible to apply again on{' '}
                  <strong>{eligibility.nextAvailableDate}</strong>.
                </AlertDescription>
              </Alert>
            )}

            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Conference Reimbursement Policy</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside space-y-1 mt-2 text-xs">
                  <li>For conferences organized by Parul University, 75% of the registration fee is reimbursed. This can be claimed once a year.</li>
                  <li>Only the presenting author is entitled for reimbursement for other conferences.</li>
                  <li>For <strong>offline conferences outside India</strong>, proof of application for government travel grants is mandatory.</li>
                  <li>A faculty member is eligible for assistance for <strong>offline</strong> conferences ONCE in TWO years. There is no limit for online presentations.</li>
                  <li>Airfare for International travel and II-AC train fare (or actual, whichever is lesser) for travel within India shall be reimbursed within policy limits.</li>
                  <li>Please refer to the full SOP for detailed limits and conditions.</li>
                </ul>
              </AlertDescription>
            </Alert>

            <div className="rounded-lg border p-4 space-y-6 animate-in fade-in-0">
              <div>
                <h3 className="font-semibold text-sm -mb-2">EVENT &amp; PRESENTATION DETAILS</h3>
                <Separator className="mt-4" />
                <div className="space-y-4 mt-4">
                  <FormField
                    name="eventType"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type of Event</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={isFormDisabled}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select event type..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {eventTypes.map((type) => (
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
                    name="conferenceMode"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Presentation Mode</FormLabel>
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
                                <RadioGroupItem value="Offline" disabled={isFormDisabled} />
                              </FormControl>
                              <FormLabel className="font-normal">Offline</FormLabel>
                            </FormItem>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {conferenceMode === 'Online' && (
                    <FormField
                      name="onlinePresentationOrder"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Online Presentation Order</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value} disabled={isFormDisabled}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select order" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="First">First</SelectItem>
                              <SelectItem value="Second">Second</SelectItem>
                              <SelectItem value="Third">Third</SelectItem>
                              <SelectItem value="Additional">Additional</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <FormField
                    name="conferencePaperTitle"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Paper Title</FormLabel>
                        <FormControl>
                          <Input placeholder="Title of the paper presented" {...field} disabled={isFormDisabled} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="conferenceName"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Conference/Event Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Full name of the conference" {...field} disabled={isFormDisabled} />
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
                          <Input placeholder="Name of Institution/Organisation" {...field} disabled={isFormDisabled} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="eventWebsite"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Event Website</FormLabel>
                        <FormControl>
                          <Input type="url" placeholder="https://example.com" {...field} disabled={isFormDisabled} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      name="conferenceDate"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Conference Start Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} disabled={isFormDisabled} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      name="presentationDate"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Your Presentation Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} disabled={isFormDisabled} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      name="conferenceType"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Conference Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value} disabled={isFormDisabled}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="International">International</SelectItem>
                              <SelectItem value="National">National</SelectItem>
                              <SelectItem value="Regional/State">Regional/State</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {conferenceMode === 'Offline' && (
                      <FormField
                        name="presentationType"
                        control={form.control}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Presentation Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={isFormDisabled}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Oral">Oral</SelectItem>
                                <SelectItem value="Poster">Poster</SelectItem>
                                <SelectItem value="Other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                  <FormField
                    control={form.control}
                    name="conferenceVenue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Conference Venue/Location</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={!conferenceType || isFormDisabled}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select venue" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(conferenceVenueOptions[conferenceType as keyof typeof conferenceVenueOptions] || []).map((venue) => (
                              <SelectItem key={venue} value={venue}>
                                {venue}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="abstractUpload"
                    control={form.control}
                    render={({ field: { value, onChange, ...fieldProps } }) => (
                      <FormItem>
                        <FormLabel>Attach Full Abstract (PDF, Below 10MB)</FormLabel>
                        <FormControl>
                          <Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} disabled={isFormDisabled} accept="application/pdf" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="participationCertificate"
                    control={form.control}
                    render={({ field: { value, onChange, ...fieldProps } }) => (
                      <FormItem>
                        <FormLabel>Attach Participation/Presentation Certificate (PDF, Below 10MB)</FormLabel>
                        <FormControl>
                          <Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} disabled={isFormDisabled} accept="application/pdf" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="totalAuthors"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Total No. of Authors</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="-- Please Select --" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {authorCountOptions.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
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
                      name="authorType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Author Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="-- Please Select --" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {authorTypeOptions.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-sm -mb-2">EXPENSE &amp; TRAVEL DETAILS</h3>
                <Separator className="mt-4" />
                <div className="space-y-4 mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      name="registrationFee"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Registration Fee (INR)</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="e.g., 5000" {...field} min="0" disabled={isFormDisabled} />
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
                          <FormLabel>Proof of Registration Fee Payment (PDF, Below 10MB)</FormLabel>
                          <FormControl>
                            <Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} disabled={isFormDisabled} accept="application/pdf" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  {conferenceMode === 'Offline' && (
                    <div className="space-y-4">
                      <FormField
                        name="travelPlaceVisited"
                        control={form.control}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Place Visited</FormLabel>
                            <FormControl>
                              <Input {...field} disabled={isFormDisabled} />
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
                            <Select onValueChange={field.onChange} value={field.value} disabled={isFormDisabled}>
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
                        name="travelFare"
                        control={form.control}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Travel Fare Incurred (INR)</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} min="0" disabled={isFormDisabled} />
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
                            <FormLabel>Attach All Tickets/Travel Receipts</FormLabel>
                            <FormControl>
                              <Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} disabled={isFormDisabled} accept="application/pdf" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                  {conferenceVenue && conferenceVenue !== 'India' && (
                    <FormField
                      name="govtFundingRequestProof"
                      control={form.control}
                      render={({ field: { value, onChange, ...fieldProps } }) => (
                        <FormItem>
                          <FormLabel>Proof of Govt. Funding Request (PDF, Below 10MB)</FormLabel>
                          <FormControl>
                            <Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} disabled={isFormDisabled} accept="application/pdf" />
                          </FormControl>
                          <FormDescription>Required for conferences outside India.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-sm -mb-2">DECLARATIONS</h3>
                <Separator className="mt-4" />
                <div className="space-y-4 mt-4">
                  <FormField
                    name="wasPresentingAuthor"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>Were you the presenting author?</FormLabel>
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isFormDisabled} />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="isPuNamePresent"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>Is "Parul University" name present in the paper?</FormLabel>
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isFormDisabled} />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="wonPrize"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>Did your paper win a prize?</FormLabel>
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isFormDisabled} />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {wonPrize && (
                    <div className="space-y-4 pl-4 border-l-2">
                      <FormField
                        name="prizeDetails"
                        control={form.control}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Prize Details</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., Best Paper Award" {...field} disabled={isFormDisabled} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        name="prizeProof"
                        control={form.control}
                        render={({ field: { value, onChange, ...fieldProps } }) => (
                          <FormItem>
                            <FormLabel>Attach Prize Certificate (PDF)</FormLabel>
                            <FormControl>
                              <Input {...fieldProps} type="file" onChange={(e) => onChange(e.target.files)} disabled={isFormDisabled} accept="application/pdf" />
                            </FormControl>
                            <FormDescription>Below 10 MB</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                  <FormField
                    name="attendedOtherConference"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>Have you attended any other conference this year?</FormLabel>
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isFormDisabled} />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="conferenceSelfDeclaration"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isFormDisabled} />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Self Declaration</FormLabel>
                          <FormMessage />
                          <p className="text-xs text-muted-foreground">
                            I hereby confirm that I have not applied/claimed for any incentive for the same application/publication earlier &amp; certified that I have availed only this conference in the calendar year.
                          </p>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-secondary rounded-md space-y-2 mt-6">
              <p className="text-sm font-medium">Tentative Eligible Reimbursement Amount:</p>
              {calculatedIncentive !== null ? (
                <>
                  <p className="font-bold text-2xl text-primary">₹{calculatedIncentive.toLocaleString('en-IN')}</p>
                  {calculationBreakdown && (
                    <div className="text-xs text-muted-foreground">
                      <div>Eligible expenses: ₹{(calculationBreakdown.eligibleExpenses ?? 0).toLocaleString('en-IN')}</div>
                      <div>Policy cap: ₹{(calculationBreakdown.maxReimbursement ?? 0).toLocaleString('en-IN')}</div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">Fill out the form to see an estimate.</p>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => handleSave('Draft')} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save as Draft
            </Button>
            <Button type="button" onClick={handleProceedToReview} disabled={isFormDisabled || bankDetailsMissing || orcidOrMisIdMissing}>
              Proceed to Review
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
