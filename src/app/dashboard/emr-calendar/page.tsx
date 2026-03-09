
'use client';

import { useState, useEffect, useCallback, createRef } from 'react';
import * as z from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { db } from '@/lib/config';
import { collection, query, orderBy, onSnapshot, doc, deleteDoc, updateDoc, where, getDocs } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Calendar as CalendarIcon, Edit, Plus, Users, ChevronLeft, ChevronRight, Link as LinkIcon, Loader2, Upload, NotebookText, Send, Trash2, Download } from 'lucide-react';
import type { FundingCall, User, EmrInterest, EmrEvaluation } from '@/types';
import { format, differenceInDays, differenceInHours, differenceInMinutes, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isAfter, setHours, setMinutes, setSeconds, isBefore } from 'date-fns';
import { uploadFileToServer } from '@/app/actions';
import { createFundingCall, announceEmrCall } from '@/app/emr-actions';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { EmrActions } from '@/components/emr/emr-actions';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useIsMobile } from '@/hooks/use-mobile';


interface EmrCalendarProps {
  user: User;
}

type CalendarEvent = {
  type: 'deadline' | 'meeting' | 'agencyDeadline';
  call: FundingCall;
};

const callSchema = z.object({
  title: z.string().min(5, 'Call title is required.'),
  agency: z.string().min(2, 'Funding agency is required.'),
  description: z.string().optional(),
  callType: z.enum(['Fellowship', 'Grant', 'Collaboration', 'Other']),
  applyDeadline: z.date({ required_error: 'Application deadline is required.'}),
  interestDeadline: z.date({ required_error: 'Interest registration deadline is required.'}),
  detailsUrl: z.string().url('Please enter a valid URL.').optional().or(z.literal('')),
  attachments: z.any().optional(),
  notifyAllStaff: z.boolean().default(false).optional(),
}).refine(data => data.interestDeadline <= data.applyDeadline, {
  message: 'Interest deadline must be on or before the agency application deadline.',
  path: ['interestDeadline'],
});

const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
};

export function AddEditCallDialog({
  isOpen,
  onOpenChange,
  existingCall,
  user,
  onActionComplete,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  existingCall?: FundingCall | null;
  user: User;
  onActionComplete: () => void;
}) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const isMobile = useIsMobile();

  const form = useForm<z.infer<typeof callSchema>>({
    resolver: zodResolver(callSchema),
  });

  useEffect(() => {
    if (existingCall) {
      form.reset({
        ...existingCall,
        interestDeadline: parseISO(existingCall.interestDeadline),
        applyDeadline: parseISO(existingCall.applyDeadline),
        notifyAllStaff: existingCall.isAnnounced,
      });
    } else {
      form.reset({
        title: '',
        agency: '',
        description: '',
        callType: 'Grant',
        detailsUrl: '',
        interestDeadline: setMinutes(setHours(new Date(), 17), 0),
        applyDeadline: undefined,
        attachments: undefined,
        notifyAllStaff: true,
      });
    }
  }, [existingCall, form]);

  const handleSaveCall = async (values: z.infer<typeof callSchema>) => {
    setIsSubmitting(true);
    try {
        const callDataForServer: any = { ...values };

        if (values.attachments && values.attachments.length > 0) {
            const attachmentDataUrls = await Promise.all(
                Array.from(values.attachments as FileList).map(async (file: File) => ({
                    name: file.name,
                    dataUrl: await fileToDataUrl(file),
                }))
            );
            callDataForServer.attachments = attachmentDataUrls;
        }

        if (existingCall) {
            // Update logic
            const callRef = doc(db, 'fundingCalls', existingCall.id);
            await updateDoc(callRef, {
                ...callDataForServer,
                interestDeadline: values.interestDeadline.toISOString(),
                applyDeadline: values.applyDeadline.toISOString(),
            });
            toast({ title: 'Success', description: 'Funding call has been updated.' });
        } else {
            // Create logic
            const result = await createFundingCall(callDataForServer);
            if (!result.success) {
                throw new Error(result.error);
            }
            toast({ title: 'Success', description: 'Funding call has been added.' });
        }
        onActionComplete();
        onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving funding call:', error);
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Could not save funding call.' });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleDeleteCall = async () => {
    if (!existingCall) return;
    try {
        await deleteDoc(doc(db, 'fundingCalls', existingCall.id));
        toast({ title: 'Success', description: 'Funding call deleted.' });
        onActionComplete();
        onOpenChange(false);
    } catch (error) {
        console.error('Error deleting funding call:', error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not delete funding call.' });
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{existingCall ? 'Edit' : 'Add New'} Funding Call</DialogTitle>
          <DialogDescription>
            {existingCall ? 'Update the details for this EMR opportunity.' : 'Enter the details for the new EMR opportunity.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form id="add-edit-call-form" onSubmit={form.handleSubmit(handleSaveCall)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
             <FormField name="title" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Call Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
             <FormField name="agency" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Funding Agency</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
             <FormField name="description" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Description</FormLabel><FormControl><RichTextEditor {...field} /></FormControl><FormMessage /></FormItem> )} />
             <FormField name="callType" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Call Type</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a type" /></SelectTrigger></FormControl><SelectContent><SelectItem value="Fellowship">Fellowship</SelectItem><SelectItem value="Grant">Grant</SelectItem><SelectItem value="Collaboration">Collaboration</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <FormField name="interestDeadline" control={form.control} render={({ field }) => ( 
                <FormItem className="flex flex-col">
                  <FormLabel>Interest Registration Deadline</FormLabel>
                  {isMobile ? (
                    <Input type="datetime-local" value={field.value ? format(field.value, "yyyy-MM-dd'T'HH:mm") : ''} onChange={(e) => field.onChange(e.target.value ? parseISO(e.target.value) : undefined)} />
                  ) : (
                    <Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? (format(field.value, "PPP HH:mm")) : (<span>Pick a date</span>)}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar captionLayout="dropdown-buttons" fromYear={2015} toYear={new Date().getFullYear() + 5} mode="single" selected={field.value} onSelect={field.onChange} initialFocus /><div className="p-2 border-t"><Input type="time" value={field.value ? format(field.value, 'HH:mm') : ''} onChange={e => {const time = e.target.value; const [hours, minutes] = time.split(':').map(Number); field.onChange(setHours(setMinutes(field.value || new Date(), minutes), hours))}}/></div></PopoverContent></Popover>
                  )}
                  <FormMessage />
                </FormItem> 
              )} />
               <FormField name="applyDeadline" control={form.control} render={({ field }) => ( 
                <FormItem className="flex flex-col">
                  <FormLabel>Agency Application Deadline</FormLabel>
                   {isMobile ? (
                    <Input type="date" value={field.value ? format(field.value, 'yyyy-MM-dd') : ''} onChange={(e) => field.onChange(e.target.value ? parseISO(e.target.value) : undefined)} />
                  ) : (
                    <Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? (format(field.value, "PPP")) : (<span>Pick a date</span>)}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar captionLayout="dropdown-buttons" fromYear={2015} toYear={new Date().getFullYear() + 5} mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover>
                  )}
                  <FormMessage />
                </FormItem> 
              )} />
            </div>
             <FormField name="detailsUrl" control={form.control} render={({ field }) => ( <FormItem><FormLabel>URL for Full Details</FormLabel><FormControl><Input type="url" {...field} /></FormControl><FormMessage /></FormItem> )} />
             <FormField name="attachments" control={form.control} render={({ field: { onChange, value, ...rest }}) => ( <FormItem><FormLabel>Attachments (Optional)</FormLabel><FormControl><Input type="file" multiple onChange={(e) => onChange(e.target.files)} {...rest} /></FormControl><FormMessage /></FormItem> )} />
              {!existingCall && (
                 <FormField
                  control={form.control}
                  name="notifyAllStaff"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                      <div className="space-y-0.5">
                        <FormLabel>Notify All Staff</FormLabel>
                        <FormDescription>
                          Send an email announcement about this new call to all staff members.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}
          </form>
        </Form>
        <DialogFooter className="justify-between">
          <div>
            {existingCall && (
                <Button variant="destructive" onClick={() => setIsDeleteDialogOpen(true)}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
            )}
          </div>
          <div className="flex gap-2">
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button type="submit" form="add-edit-call-form" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save Call'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
       <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>This will permanently delete the funding call. This action cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteCall} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </Dialog>
  );
}

function ViewDescriptionDialog({ call }: { call: FundingCall }) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-auto py-1 px-2 text-xs">
                    <NotebookText className="mr-2 h-3 w-3" /> View Description
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{call.title}</DialogTitle>
                    <DialogDescription>Full description for the funding call from {call.agency}.</DialogDescription>
                </DialogHeader>
                <div className="max-h-[60vh] overflow-y-auto pr-4">
                    <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: call.description || 'No description provided.' }} />
                </div>
            </DialogContent>
        </Dialog>
    );
}

function EmrCalendar({ user }: EmrCalendarProps) {
    const { toast } = useToast();
    const [calls, setCalls] = useState<FundingCall[]>([]);
    const [userInterests, setUserInterests] = useState<EmrInterest[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddEditDialogOpen, setIsAddEditDialogOpen] = useState(false);
    const [selectedCall, setSelectedCall] = useState<FundingCall | null>(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [isAnnounceDialogOpen, setIsAnnounceDialogOpen] = useState(false);
    const [isAnnouncing, setIsAnnouncing] = useState(false);

    const isAdmin = user.role === 'Super-admin' || user.role === 'admin';
    const isSuperAdmin = user.role === 'Super-admin';

    const firstDay = startOfMonth(currentMonth);
    const lastDay = endOfMonth(currentMonth);
    const daysInMonth = eachDayOfInterval({ start: firstDay, end: lastDay });
    const startingDayIndex = getDay(firstDay);

    const eventRefs = new Map<string, React.RefObject<HTMLDivElement>>();
    calls.forEach(call => {
        eventRefs.set(`deadline-${call.id}`, createRef());
        if (call.meetingDetails?.date) {
            eventRefs.set(`meeting-${call.id}`, createRef());
        }
    });

    const handleDateClick = (dateStr: string) => {
        const firstEventForDate = eventsByDate[dateStr]?.[0];
        if (firstEventForDate) {
            const eventId = firstEventForDate.type === 'meeting' ? `meeting-${firstEventForDate.call.id}` : `deadline-${firstEventForDate.call.id}`;
            const ref = eventRefs.get(eventId);
            ref?.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };


    const eventsByDate = calls.reduce((acc, call) => {
        const deadlineDate = format(parseISO(call.interestDeadline), 'yyyy-MM-dd');
        if (!acc[deadlineDate]) acc[deadlineDate] = [];
        acc[deadlineDate].push({ type: 'deadline', call });
        
        const agencyDeadlineDate = format(parseISO(call.applyDeadline), 'yyyy-MM-dd');
        if (!acc[agencyDeadlineDate]) acc[agencyDeadlineDate] = [];
        acc[agencyDeadlineDate].push({ type: 'agencyDeadline', call });

        if (call.meetingDetails?.date) {
            const meetingDate = format(parseISO(call.meetingDetails.date), 'yyyy-MM-dd');
            if (!acc[meetingDate]) acc[meetingDate] = [];
            acc[meetingDate].push({ type: 'meeting', call });
        }
        return acc;
    }, {} as Record<string, CalendarEvent[]>);


    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const callsQuery = query(collection(db, 'fundingCalls'), orderBy('interestDeadline', 'desc'));
            const unsubscribeCalls = onSnapshot(callsQuery, (snapshot) => {
                setCalls(snapshot.docs.map(callDoc => ({ id: callDoc.id, ...callDoc.data() } as FundingCall)));
            });

            const userInterestsQuery = query(collection(db, 'emrInterests'), where('userId', '==', user.uid));
            const unsubscribeUserInterests = onSnapshot(userInterestsQuery, (snapshot) => {
                setUserInterests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as EmrInterest})));
            });
            
            setLoading(false);

            return () => {
                unsubscribeCalls();
                unsubscribeUserInterests();
            }

        } catch (error) {
            console.error("Error fetching data:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch EMR data.' });
            setLoading(false);
        }
    }, [toast, user.uid]);

    useEffect(() => {
        const unsubscribePromise = fetchData();
        return () => {
             unsubscribePromise.then(fn => fn && fn());
        }
    }, [fetchData]);
    
    
    const getStatusBadge = (call: FundingCall) => {
        const now = new Date();
        if (call.status === 'Meeting Scheduled') {
            return <Badge variant="default">Meeting Scheduled</Badge>;
        }
        if (isAfter(now, parseISO(call.interestDeadline))) {
            return <Badge variant="secondary">Closed</Badge>;
        }
        return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/50 dark:text-green-200 dark:border-green-700">Open</Badge>;
    }

    const handleAnnounceCall = async () => {
      if (!selectedCall) return;
      setIsAnnouncing(true);
      try {
        const result = await announceEmrCall(selectedCall.id);
        if (result.success) {
          toast({ title: "Success", description: "Announcement email has been sent to all staff." });
        } else {
          toast({ variant: "destructive", title: "Failed to Announce", description: result.error });
        }
      } catch (error: any) {
        toast({ variant: "destructive", title: "Error", description: error.message || "An unexpected error occurred." });
      } finally {
        setIsAnnouncing(false);
        setIsAnnounceDialogOpen(false);
      }
    };


    if (loading) {
        return <Skeleton className="h-96 w-full" />;
    }

    const upcomingCalls = calls.filter(c => !isAfter(new Date(), parseISO(c.interestDeadline)));

    return (
        <div className="space-y-8">
             {userInterests.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>My EMR Applications</CardTitle>
                        <CardDescription>A summary of your registered interests in external funding calls.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {userInterests.map(interest => {
                                const call = calls.find(c => c.id === interest.callId);
                                if (!call) return null;
                                return (
                                    <div key={interest.id} className="p-3 border rounded-lg bg-background">
                                        <p className="font-semibold">{interest.callTitle || call.title}</p>
                                        <p className="text-sm text-muted-foreground">Registered on: {new Date(interest.registeredAt).toLocaleDateString()}</p>
                                        <div className="mt-2">
                                           <EmrActions user={user} call={call} interestDetails={interest} onActionComplete={fetchData} isDashboardView={true} />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft className="h-4 w-4" /></Button>
                        <h3 className="text-xl font-semibold text-center w-48">{format(currentMonth, 'MMMM yyyy')}</h3>
                        <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                    {isSuperAdmin && (
                        <div className="flex items-center gap-2">
                             <Button onClick={() => { setSelectedCall(null); setIsAddEditDialogOpen(true); }}><Plus className="mr-2 h-4 w-4" /> Add New Call</Button>
                        </div>
                    )}
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div>
                            <div className="grid grid-cols-7 border-t border-l">
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                                    <div key={day} className="text-center font-semibold p-2 border-b border-r text-sm text-muted-foreground">{day}</div>
                                ))}
                                {Array.from({ length: startingDayIndex }).map((_, i) => (
                                    <div key={`empty-${i}`} className="border-b border-r min-h-[5rem] sm:min-h-[6rem]"></div>
                                ))}
                                {daysInMonth.map(day => {
                                    const dateStr = format(day, 'yyyy-MM-dd');
                                    const eventsOnDay = eventsByDate[dateStr] || [];
                                    const hasDeadline = eventsOnDay.some(e => e.type === 'deadline');
                                    const hasMeeting = eventsOnDay.some(e => e.type === 'meeting');
                                    const hasAgencyDeadline = eventsOnDay.some(e => e.type === 'agencyDeadline');
                                    return (
                                        <div 
                                            key={dateStr} 
                                            className={cn("min-h-[5rem] sm:min-h-[6rem] border-b border-r p-1 sm:p-2 flex flex-col hover:bg-muted/50 transition-colors", eventsOnDay.length > 0 ? "cursor-pointer" : "cursor-default")}
                                            onClick={() => eventsOnDay.length > 0 && handleDateClick(dateStr)}
                                        >
                                            <span className="font-semibold">{format(day, 'd')}</span>
                                            <div className="flex-grow flex items-end justify-start gap-1 mt-1">
                                                {hasDeadline && <div className="h-2 w-2 rounded-full bg-green-500" title="Interest Registration Deadline"></div>}
                                                {hasMeeting && <div className="h-2 w-2 rounded-full bg-blue-500" title="Meeting Scheduled"></div>}
                                                {hasAgencyDeadline && <div className="h-2 w-2 rounded-full bg-red-500" title="Agency Application Deadline"></div>}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                        
                        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                            <h4 className="font-semibold">All Upcoming Deadlines</h4>
                            {upcomingCalls.length > 0 ? upcomingCalls.map(call => {
                                const interestDetails = userInterests.find(i => i.callId === call.id);
                                const callRef = eventRefs.get(`deadline-${call.id}`);
                                const isCallClosed = isAfter(new Date(), parseISO(call.interestDeadline));

                                return (
                                    <div key={call.id} ref={callRef} className="border p-4 rounded-lg space-y-3">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1">
                                                <h4 className="font-semibold text-base">{call.title}</h4>
                                                <p className="text-sm text-muted-foreground">Agency: {call.agency}</p>
                                                <div className="flex items-center gap-2 mt-2">
                                                    <Badge variant="secondary">{call.callType}</Badge>
                                                    {getStatusBadge(call)}
                                                </div>
                                            </div>
                                             <EmrActions user={user} call={call} interestDetails={interestDetails} onActionComplete={fetchData} />
                                        </div>
                                        
                                        <div className="flex items-center justify-between pt-3 border-t">
                                            <div className="text-xs text-muted-foreground space-y-1">
                                                <p>Interest Deadline: <span className="font-medium text-foreground">{format(parseISO(call.interestDeadline), 'PPp')}</span></p>
                                                <p>Application Deadline: <span className="font-medium text-foreground">{format(parseISO(call.applyDeadline), 'PP')}</span></p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {isAdmin && (
                                                    <Button asChild variant="ghost" size="sm">
                                                        <Link href={`/dashboard/emr-management/${call.id}`}>
                                                            <Users className="h-4 w-4 mr-1"/> View Registrations
                                                        </Link>
                                                    </Button>
                                                )}
                                            </div>
                                         </div>

                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 text-xs">
                                                <ViewDescriptionDialog call={call} />
                                                {call.detailsUrl && <Button variant="link" asChild className="p-0 h-auto text-xs"><a href={call.detailsUrl} target="_blank" rel="noopener noreferrer"><LinkIcon className="h-3 w-3 mr-1"/> View Full Details</a></Button>}
                                                {call.attachments && call.attachments.map((att, i) => (
                                                    <Button key={i} variant="link" asChild className="p-0 h-auto text-xs"><a href={att.url} target="_blank" rel="noopener noreferrer"><Download className="h-3 w-3 mr-1"/>Download</a></Button>
                                                ))}
                                            </div>
                                            {isSuperAdmin && !call.isAnnounced && !isCallClosed && (
                                                <Button size="sm" variant="outline" onClick={() => { setSelectedCall(call); setIsAnnounceDialogOpen(true); }}>
                                                    <Send className="mr-2 h-4 w-4" /> Announce
                                                </Button>
                                            )}
                                        </div>

                                    </div>
                                )
                            }) : (
                                 <div className="text-center py-10 text-muted-foreground">
                                    No upcoming deadlines.
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
                {isSuperAdmin && user && (
                    <>
                        <AddEditCallDialog
                            isOpen={isAddEditDialogOpen}
                            onOpenChange={setIsAddEditDialogOpen}
                            existingCall={selectedCall}
                            user={user}
                            onActionComplete={fetchData}
                        />
                         {selectedCall && (
                             <AlertDialog open={isAnnounceDialogOpen} onOpenChange={setIsAnnounceDialogOpen}>
                               <AlertDialogContent>
                                 <AlertDialogHeader>
                                   <AlertDialogTitle>Announce Funding Call?</AlertDialogTitle>
                                   <AlertDialogDescription>
                                     This will send an email notification to all staff members about the call for "{selectedCall.title}". This action cannot be undone. Are you sure?
                                   </AlertDialogDescription>
                                 </AlertDialogHeader>
                                 <AlertDialogFooter>
                                   <AlertDialogCancel>Cancel</AlertDialogCancel>
                                   <AlertDialogAction onClick={handleAnnounceCall} disabled={isAnnouncing}>
                                     {isAnnouncing && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                     Confirm & Announce
                                   </AlertDialogAction>
                                 </AlertDialogFooter>
                               </AlertDialogContent>
                             </AlertDialog>
                         )}
                    </>
                )}
            </Card>
        </div>
    );
}

export default function EmrCalendarPage() {
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
    }, []);

    if (!user) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }
    
    return <EmrCalendar user={user} />;
}

    