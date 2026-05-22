'use client';

import { useForm, useFieldArray } from 'react-hook-form';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/config';
import type { User, IncentiveClaim, Author } from '@/types';
import { uploadFileToApi } from '@/lib/upload-client';
import { Loader2, AlertCircle, Trash2, Plus, Calendar as CalendarIcon, Bot, CheckCircle2, FileText, X, Globe } from 'lucide-react';
import { submitIncentiveClaimViaApi } from '@/lib/incentive-claim-client';
import { getIncentiveClaimByIdAction } from '@/app/actions';
import { AuthorSearch } from './author-search';

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
    workshopStartDate: z.string().min(1, 'Start date is required.'),
    workshopEndDate: z.string().min(1, 'End date is required.'),
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
    authors: z
      .array(
        z
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
          })
      )
      .min(1, 'At least one author is required.')
      .refine(data => {
        const firstAuthors = data.filter(author => author.role === 'First Author' || author.role === 'First & Corresponding Author');
        return firstAuthors.length <= 1;
      }, { message: 'Only one author can be designated as the First Author.', path: ['authors'] }),
  })
  .refine((data) => data.attendanceMode === 'Online' || (!!data.travelPlaceVisited && data.travelPlaceVisited.length > 1), {
    message: 'Place visited is required for offline attendance.',
    path: ['travelPlaceVisited'],
  })
  .refine((data) => data.attendanceMode === 'Online' || !!data.travelMode, {
    message: 'Travel mode is required for offline attendance.',
    path: ['travelMode'],
  })
  .refine((data) => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return new Date(data.workshopStartDate) <= today;
  }, {
    message: "Start date cannot be in the future.",
    path: ["workshopStartDate"],
  })
  .refine((data) => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return new Date(data.workshopEndDate) <= today;
  }, {
    message: "End date cannot be in the future.",
    path: ["workshopEndDate"],
  })
  .refine((data) => {
    return new Date(data.workshopEndDate) >= new Date(data.workshopStartDate);
  }, {
    message: "End date must be on or after the start date.",
    path: ["workshopEndDate"],
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
      workshopStartDate: '',
      workshopEndDate: '',
      authors: [],
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

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "authors",
  });

  const coAuthorRoles: Author['role'][] = ['First Author', 'Corresponding Author', 'Co-Author', 'Presenting Author', 'First & Presenting Author'];

  const selectedEventType = form.watch('eventType');
  const attendanceMode = form.watch('attendanceMode');

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

      const isUserAlreadyAdded = form.getValues('authors').some(field => field.email.toLowerCase() === parsedUser.email.toLowerCase());
      if (!isUserAlreadyAdded) {
        append({
          name: parsedUser.name,
          email: parsedUser.email,
          uid: parsedUser.uid,
          role: "First Author",
          isExternal: false,
          status: 'approved'
        })
      }
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
              authors: draftData.authors || [],
              registrationFeeProof: undefined,
              workshopCertificate: undefined,
              travelReceipts: undefined,
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

      const claimData: Omit<IncentiveClaim, 'id' | 'claimId'> = {
        ...restOfData,
        workshopStartDate: data.workshopStartDate,
        workshopEndDate: data.workshopEndDate,
        registrationFeeProofUrl: registrationFeeProofUrl ?? undefined,
        workshopCertificateUrl: workshopCertificateUrl ?? undefined,
        travelReceiptsUrl: travelReceiptsUrl ?? undefined,
        calculatedIncentive: undefined,
        misId: user.misId ?? undefined,
        orcidId: user.orcidId ?? undefined,
        bankDetails: user.bankDetails ?? undefined,
        claimType: 'Workshop/FDP/Training',
        benefitMode: 'reimbursement',
        uid: user.uid,
        userName: user.name,
        userEmail: user.email,
        faculty: user.faculty,
        status,
        submissionDate: new Date().toISOString(),
      };

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

  const firstAuthorExists = fields.some(author => author.role === 'First Author' || author.role === 'First & Corresponding Author');

  const getAvailableRoles = (currentAuthor?: Author) => {
    const isCurrentAuthorFirst = currentAuthor && (currentAuthor.role === 'First Author' || currentAuthor.role === 'First & Corresponding Author');
    if (firstAuthorExists && !isCurrentAuthorFirst) {
      return coAuthorRoles.filter(role => role !== 'First Author' && role !== 'First & Corresponding Author');
    }
    return coAuthorRoles;
  };

  const removeAuthor = (index: number) => {
    const authorToRemove = fields[index];
    if (authorToRemove.email.toLowerCase() === user?.email.toLowerCase()) {
      toast({ variant: 'destructive', title: 'Action not allowed', description: 'You cannot remove yourself as the primary author.' });
      return;
    }
    remove(index);
  };

  const updateAuthorRole = (index: number, role: Author['role']) => {
    const currentAuthors = form.getValues('authors');
    const author = currentAuthors[index];
    const isTryingToBeFirst = role === 'First Author' || role === 'First & Corresponding Author';
    const isAnotherFirst = currentAuthors.some((a, i) => i !== index && (a.role === 'First Author' || a.role === 'First & Corresponding Author'));

    if (isTryingToBeFirst && isAnotherFirst) {
      toast({ title: 'Conflict', description: 'Another author is already the First Author.', variant: 'destructive' });
      return;
    }

    update(index, { ...author, role });
  };

  if (isLoadingDraft) {
    return (
      <Card className="p-8 flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </Card>
    );
  }

  return (
    <Card className="max-w-4xl mx-auto shadow-2xl border-t-4 border-t-primary overflow-hidden">
      <CardHeader className="bg-primary/5 pb-8">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-3xl font-bold tracking-tight text-primary uppercase">Workshop / FDP / Training</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">Complete all required fields to submit your claim.</CardDescription>
          </div>
          <div className="bg-primary/10 p-3 rounded-2xl shadow-inner">
            <CalendarIcon className="h-10 w-10 text-primary" />
          </div>
        </div>
      </CardHeader>

      <Form {...form}>
        <form>
          <CardContent className="pt-8 bg-card space-y-10">
            {(bankDetailsMissing || orcidOrMisIdMissing) && (
              <Alert variant="destructive" className="rounded-2xl border-2">
                <AlertCircle className="h-5 w-5" />
                <AlertTitle className="font-bold">Profile Update Required</AlertTitle>
                <AlertDescription className="flex items-center justify-between">
                  <span>Your Profile details (Bank, ORCID, MIS) must be complete to apply.</span>
                  <Button asChild variant="link" className="text-destructive font-black underline p-0 h-auto">
                    <Link href="/dashboard/settings">Settings</Link>
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Event Details Section */}
            <section className="space-y-6">
              <div className="flex items-center gap-2 text-primary font-bold text-lg mb-4">
                <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                Event Specification
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <FormField name="eventType" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">Event Classification</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
                      <FormControl><SelectTrigger className="h-12 shadow-sm"><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                      <SelectContent>{allEventTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField name="attendanceMode" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">Attendance Mode</FormLabel>
                    <FormControl>
                      <RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-6 pt-2">
                        <label htmlFor="mode-on-w" className="flex items-center space-x-3 bg-muted/40 px-5 py-2.5 rounded-xl border border-muted-foreground/10 hover:bg-muted transition-all cursor-pointer [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                          <RadioGroupItem value="Online" id="mode-on-w" disabled={isSubmitting} />
                          <span className="font-bold text-sm">Online</span>
                        </label>
                        <label htmlFor="mode-off-w" className="flex items-center space-x-3 bg-muted/40 px-5 py-2.5 rounded-xl border border-muted-foreground/10 hover:bg-muted transition-all cursor-pointer [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                          <RadioGroupItem value="Offline" id="mode-off-w" disabled={isSubmitting} />
                          <span className="font-bold text-sm">Offline</span>
                        </label>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField name="workshopName" control={form.control} render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-semibold">Workshop / FDP / Training Name</FormLabel>
                  <FormControl><Input placeholder="Full name of the program" {...field} disabled={isSubmitting} className="h-12 text-lg shadow-sm" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <FormField name="organizerName" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel className="text-base font-semibold">Organizing Body</FormLabel><FormControl><Input placeholder="e.g. Parul Institute of Engineering..." {...field} disabled={isSubmitting} className="h-12 shadow-sm" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="eventTypeLevel" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">Event Level</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
                      <FormControl><SelectTrigger className="h-12 shadow-sm"><SelectValue placeholder="Select scope" /></SelectTrigger></FormControl>
                      <SelectContent>{eventLevelOptions.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Hidden authors field */}
              <FormField name="authors" control={form.control} render={() => (<div className="hidden"><FormMessage /></div>)} />
            </section>

            <Separator className="my-10" />

            {/* Venue & Timeline */}
            <section className="space-y-6">
              <div className="flex items-center gap-2 text-primary font-bold text-lg mb-4">
                <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                Venue &amp; Timeline
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <FormField name="workshopStartDate" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel className="text-base font-semibold flex items-center gap-2"><CalendarIcon className="h-4 w-4" /> Start Date</FormLabel><FormControl><Input type="date" {...field} max={new Date().toISOString().split("T")[0]} disabled={isSubmitting} className="h-12 shadow-sm cursor-pointer" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField name="workshopEndDate" control={form.control} render={({ field }) => (
                  <FormItem><FormLabel className="text-base font-semibold flex items-center gap-2"><CalendarIcon className="h-4 w-4" /> End Date</FormLabel><FormControl><Input type="date" {...field} min={form.watch('workshopStartDate') || undefined} max={new Date().toISOString().split("T")[0]} disabled={isSubmitting} className="h-12 shadow-sm cursor-pointer" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                <FormField name="workshopCertificate" control={form.control} render={({ field: { value, onChange, ...rest } }) => (
                  <FormItem className="space-y-3"><FormLabel className="font-bold flex items-center gap-2 underline decoration-primary decoration-2"><FileText className="h-4 w-4" /> Participation Certificate</FormLabel><FormControl><Input type="file" accept="application/pdf" className="h-12 border-dashed border-2 bg-muted/20" onChange={e => onChange(e.target.files)} disabled={isSubmitting} {...rest} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
            </section>

            <Separator className="my-10" />

            {/* Financial Section */}
            <section className="space-y-8">
              <div className="flex items-center gap-2 text-primary font-bold text-lg mb-4">
                <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                Financial Data &amp; Claims
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <FormField name="registrationFee" control={form.control} render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">Registration Fee (INR)</FormLabel>
                    <FormControl><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">₹</span><Input type="number" {...field} min="0" disabled={isSubmitting} className="h-12 pl-8 text-lg font-black shadow-sm" /></div></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField name="registrationFeeProof" control={form.control} render={({ field: { value, onChange, ...rest } }) => (
                  <FormItem className="pt-2">
                    <FormLabel className="font-bold flex items-center gap-2 text-xs"><FileText className="h-3 w-3" /> Proof of Payment</FormLabel>
                    <FormControl><Input type="file" accept="application/pdf" className="h-9 text-xs" onChange={e => onChange(e.target.files)} disabled={isSubmitting} {...rest} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {attendanceMode === 'Offline' && (
                <div className="p-6 bg-muted/40 rounded-3xl space-y-6 border border-muted-foreground/10 animate-in slide-in-from-left-2">
                  <p className="text-xs font-black uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                    Travel Logistics
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <FormField name="travelPlaceVisited" control={form.control} render={({ field }) => (
                      <FormItem><FormLabel className="text-xs font-bold uppercase tracking-tight">Destination</FormLabel><FormControl><Input placeholder="City, Country" {...field} disabled={isSubmitting} className="h-10 bg-background" /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField name="travelMode" control={form.control} render={({ field }) => (
                      <FormItem><FormLabel className="text-xs font-bold uppercase tracking-tight">Transport Mode</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}><FormControl><SelectTrigger className="h-10 bg-background"><SelectValue placeholder="Select" /></SelectTrigger></FormControl><SelectContent>{["Bus", "Train", "Air", "Other"].map(mode => <SelectItem key={mode} value={mode}>{mode}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <FormField name="travelFare" control={form.control} render={({ field }) => (
                      <FormItem><FormLabel className="text-xs font-bold uppercase tracking-tight">Fare Incurred (INR)</FormLabel><FormControl><Input type="number" {...field} disabled={isSubmitting} className="h-10 bg-background" /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField name="travelReceipts" control={form.control} render={({ field: { value, onChange, ...rest } }) => (
                      <FormItem><FormLabel className="text-xs font-bold uppercase tracking-tight">Tickets / Receipts</FormLabel><FormControl><Input type="file" accept="application/pdf" onChange={e => onChange(e.target.files)} disabled={isSubmitting} className="h-10 bg-background" {...rest} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <FormField name="travelDetails" control={form.control} render={({ field }) => (
                    <FormItem><FormLabel className="text-xs font-bold uppercase tracking-tight">Travel Details</FormLabel><FormControl><Textarea placeholder="Ticket/route/class details" {...field} disabled={isSubmitting} className="bg-background" /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
              )}
            </section>

            <Separator className="my-10" />

            {/* Declaration */}
            <FormField control={form.control} name="workshopSelfDeclaration" render={({ field }) => (
              <FormItem className="flex flex-row items-center space-x-4 space-y-0 bg-primary/5 p-8 rounded-[2rem] border border-primary/20 shadow-sm ring-1 ring-inset ring-primary/5">
                <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isSubmitting} className="h-6 w-6 rounded-lg" /></FormControl>
                <div className="space-y-2 leading-none">
                  <FormLabel className="text-base font-black tracking-tight">Final Declaration of Integrity</FormLabel>
                  <FormMessage />
                  <p className="text-xs text-muted-foreground italic leading-relaxed">
                    I hereby confirm that I have not applied/claimed for any incentive for the same event earlier.
                  </p>
                </div>
              </FormItem>
            )} />
          </CardContent>

          <CardFooter className="flex justify-between p-8 bg-muted/20 border-t border-muted/30 gap-4">
            <Button type="button" variant="ghost" size="lg" onClick={() => handleSave('Draft')} disabled={isSubmitting} className="rounded-2xl px-8 h-12 font-bold hover:bg-primary/5 text-primary">
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save as Draft
            </Button>
            <Button type="button" size="lg" onClick={onFinalSubmit} disabled={isSubmitting || bankDetailsMissing || orcidOrMisIdMissing} className="rounded-2xl px-12 h-12 font-black shadow-xl shadow-primary/30 hover:shadow-primary/50 transition-all hover:scale-[1.02]">
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Submit Claim
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
