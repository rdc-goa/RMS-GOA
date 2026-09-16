// src/components/emr/reschedule-meeting-dialog.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { FundingCall, User, EmrInterest } from '@/types';
import { format, parseISO, startOfToday, isToday, parse, setHours, setMinutes } from 'date-fns';
import { cn } from '@/lib/utils';
import { Calendar, ChevronDown, Loader2, Info } from 'lucide-react';
import { rescheduleEmrApplicantWithDetails } from '@/app/emr-actions';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

interface RescheduleMeetingDialogProps {
    call: FundingCall;
    interest: EmrInterest;
    allUsers: User[];
    currentUser: User;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onActionComplete: () => void;
}

const scheduleSchema = z.object({
  date: z.date({ required_error: 'A meeting date is required.' }).min(startOfToday(), "Meeting date cannot be in the past."),
  time: z.string().min(1, "Time is required."),
  pptDeadline: z.date({ required_error: 'A presentation deadline is required.'}),
  evaluatorUids: z.array(z.string()).min(1, 'Please select at least one evaluator.'),
  mode: z.enum(['Offline', 'Online'], { required_error: 'Please select a meeting mode.' }),
  venue: z.string().optional(),
}).refine(data => {
    if (data.mode === 'Offline') {
        return data.venue && data.venue.length > 0;
    }
    if (data.mode === 'Online') {
        return data.venue && data.venue.startsWith('https://');
    }
    return true;
}, {
    message: 'A valid venue or meeting link is required for the selected mode.',
    path: ['venue'],
}).refine(data => {
    if (isToday(data.date)) {
        const now = new Date();
        const meetingTime = parse(data.time, 'HH:mm', data.date);
        return meetingTime > now;
    }
    return true;
}, {
    message: "Meeting time must be in the future for today's date.",
    path: ['time'],
}).refine(data => data.pptDeadline <= data.date, {
    message: 'PPT deadline must be on or before the meeting date.',
    path: ['pptDeadline'],
});

export function RescheduleMeetingDialog({ call, interest, allUsers, currentUser, isOpen, onOpenChange, onActionComplete }: RescheduleMeetingDialogProps) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const targetUser = allUsers.find(u => u.uid === interest.userId);
    const hasGoaCampusPi = targetUser?.campus === 'Goa';

    const scheduleForm = useForm<z.infer<typeof scheduleSchema>>({
        resolver: zodResolver(scheduleSchema),
        defaultValues: {
            venue: interest.meetingSlot?.date ? (call.meetingDetails?.venue || 'RDC Committee Room, PIMSR') : 'RDC Committee Room, PIMSR',
            evaluatorUids: interest.assignedEvaluators || call.meetingDetails?.assignedEvaluators || [],
            date: interest.meetingSlot?.date ? parseISO(interest.meetingSlot.date) : (call.meetingDetails?.date ? parseISO(call.meetingDetails.date) : undefined),
            time: interest.meetingSlot?.time || call.meetingDetails?.time || '',
            pptDeadline: interest.meetingSlot?.pptDeadline ? parseISO(interest.meetingSlot.pptDeadline) : (call.meetingDetails?.pptDeadline ? parseISO(call.meetingDetails.pptDeadline) : undefined),
            mode: 'Offline',
        },
    });

    const meetingMode = scheduleForm.watch('mode');

    useEffect(() => {
        if (hasGoaCampusPi) {
            scheduleForm.setValue('mode', 'Online');
        }
    }, [hasGoaCampusPi, scheduleForm]);
    
    useEffect(() => {
        if (meetingMode === 'Online') {
            const currentVenue = scheduleForm.getValues('venue');
            if (!currentVenue?.startsWith('https://')) {
                scheduleForm.setValue('venue', '');
            }
        } else {
            scheduleForm.setValue('venue', 'RDC Committee Room, PIMSR');
        }
    }, [meetingMode, scheduleForm]);

    useEffect(() => {
        if (isOpen) {
            scheduleForm.reset({
                venue: interest.meetingSlot?.date ? (call.meetingDetails?.venue || 'RDC Committee Room, PIMSR') : 'RDC Committee Room, PIMSR',
                evaluatorUids: interest.assignedEvaluators || call.meetingDetails?.assignedEvaluators || [],
                date: interest.meetingSlot?.date ? parseISO(interest.meetingSlot.date) : (call.meetingDetails?.date ? parseISO(call.meetingDetails.date) : undefined),
                time: interest.meetingSlot?.time || call.meetingDetails?.time || '',
                pptDeadline: interest.meetingSlot?.pptDeadline ? parseISO(interest.meetingSlot.pptDeadline) : (call.meetingDetails?.pptDeadline ? parseISO(call.meetingDetails.pptDeadline) : undefined),
                mode: hasGoaCampusPi ? 'Online' : 'Offline',
            });
        }
    }, [interest, call, isOpen, scheduleForm, hasGoaCampusPi]);

    const handleScheduleSubmit = async (scheduleValues: z.infer<typeof scheduleSchema>) => {
        setIsSubmitting(true);
        try {
            const meetingDetails = {
                date: format(scheduleValues.date, 'yyyy-MM-dd'),
                time: scheduleValues.time,
                venue: scheduleValues.venue || '',
                pptDeadline: scheduleValues.pptDeadline.toISOString(),
                evaluatorUids: scheduleValues.evaluatorUids,
                mode: scheduleValues.mode,
            };
            const result = await rescheduleEmrApplicantWithDetails(interest.id, meetingDetails);

            if (result.success) {
                toast({ title: 'Success', description: 'Meeting rescheduled successfully.' });
                onActionComplete();
                onOpenChange(false);
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error });
            }
        } catch (error) {
            console.error('Error rescheduling meeting:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not reschedule meeting.' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const availableEvaluators = allUsers.filter(u => {
        const isAdminRole = ['Super-admin', 'admin', 'CRO'].includes(u.role);
        const isNotAnApplicant = interest.userId !== u.uid;
        
        if (currentUser?.designation === 'Head of Goa Campus') {
            return isAdminRole && isNotAnApplicant && u.campus === 'Goa';
        }
        
        return isAdminRole && isNotAnApplicant;
    });

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Reschedule Meeting for: {interest.userName}</DialogTitle>
                    <DialogDescription>Set the new meeting details for the applicant.</DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Form {...scheduleForm}>
                        <form id="reschedule-form" onSubmit={scheduleForm.handleSubmit(handleScheduleSubmit)} className="space-y-4">
                             <FormField name="date" control={scheduleForm.control} render={({ field }) => ( 
                                <FormItem className="flex flex-col">
                                    <FormLabel>Meeting Date</FormLabel>
                                    <Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal w-full", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP") : (<span>Pick a date</span>)}<Calendar className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><CalendarPicker captionLayout="dropdown-buttons" fromYear={new Date().getFullYear()} toYear={new Date().getFullYear() + 5} mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date < startOfToday()} initialFocus /></PopoverContent></Popover>
                                    <FormMessage />
                                </FormItem> 
                             )} />
                             <FormField name="time" control={scheduleForm.control} render={({ field }) => ( <FormItem><FormLabel>Meeting Time</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem> )} />
                             
                             <FormField name="mode" control={scheduleForm.control} render={({ field }) => (
                                <FormItem className="space-y-3">
                                    <FormLabel>Meeting Mode</FormLabel>
                                    {hasGoaCampusPi && (
                                        <Alert variant="default" className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700">
                                            <Info className="h-4 w-4 text-blue-600" />
                                            <AlertTitle>Online Mode Enforced</AlertTitle>
                                            <AlertDescription className="text-blue-700 dark:text-blue-300">
                                                An online meeting is required as this applicant is from the Goa campus.
                                            </AlertDescription>
                                        </Alert>
                                    )}
                                    <FormControl>
                                        <RadioGroup onValueChange={field.onChange} value={field.value} className="flex space-x-4">
                                            <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="Offline" disabled={hasGoaCampusPi} /></FormControl><FormLabel className="font-normal">Offline</FormLabel></FormItem>
                                            <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="Online" /></FormControl><FormLabel className="font-normal">Online</FormLabel></FormItem>
                                        </RadioGroup>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            
                             <FormField name="venue" control={scheduleForm.control} render={({ field }) => ( 
                                <FormItem>
                                    <FormLabel>{meetingMode === 'Online' ? 'Meeting Link' : 'Venue'}</FormLabel>
                                    <FormControl>
                                        <Input {...field} placeholder={meetingMode === 'Online' ? 'https://meet.google.com/...' : 'Enter physical venue'}/>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem> 
                              )} />

                             <FormField name="pptDeadline" control={scheduleForm.control} render={({ field }) => ( 
                                <FormItem className="flex flex-col">
                                    <FormLabel>Presentation Upload Deadline</FormLabel>
                                    <Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal w-full", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPp") : (<span>Pick date and time</span>)}<Calendar className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><CalendarPicker captionLayout="dropdown-buttons" fromYear={new Date().getFullYear()} toYear={new Date().getFullYear() + 5} mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date < startOfToday()} initialFocus /><div className="p-2 border-t"><Input type="time" onChange={e => {const time = e.target.value; field.onChange((currentDate: any) => setHours(setMinutes(currentDate || new Date(), parseInt(time.split(':')[1])), parseInt(time.split(':')[0])))}}/></div></PopoverContent></Popover>
                                    <FormMessage />
                                </FormItem> 
                             )} />
                             <FormField
                                control={scheduleForm.control}
                                name="evaluatorUids"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                    <FormLabel>Assign Evaluators</FormLabel>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                        <Button variant="outline" className="w-full justify-between">
                                            {field.value?.length > 0 ? `${field.value.length} selected` : "Select evaluators"}
                                            <ChevronDown className="h-4 w-4 opacity-50" />
                                        </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="w-[--radix-popover-trigger-width]">
                                        <DropdownMenuLabel>Available Staff</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        {availableEvaluators.map((evaluator) => (
                                            <DropdownMenuCheckboxItem
                                                key={evaluator.uid}
                                                checked={field.value?.includes(evaluator.uid)}
                                                onCheckedChange={(checked) => {
                                                    return checked
                                                    ? field.onChange([...(field.value || []), evaluator.uid])
                                                    : field.onChange(field.value?.filter((id) => id !== evaluator.uid));
                                                }}
                                            >
                                            {evaluator.name}
                                            </DropdownMenuCheckboxItem>
                                        ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    <FormMessage />
                                    </FormItem>
                                )}
                             />
                        </form>
                    </Form>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button type="submit" form="reschedule-form" disabled={isSubmitting}>
                      {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Rescheduling...</> : 'Reschedule'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
