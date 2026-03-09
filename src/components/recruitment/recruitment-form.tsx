
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/config';
import { collection, addDoc } from 'firebase/firestore';
import type { User } from '@/types';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon, Loader2, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, startOfToday } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Badge } from '../ui/badge';
import { notifyForRecruitmentApproval } from '@/app/actions';

const recruitmentSchema = z.object({
  projectName: z.string().min(5, 'Project name is required.'),
  positionTitle: z.string().min(3, 'Position title is required.'),
  positionType: z.enum(['Intern', 'Project Associate', 'JRF', 'SRF', 'Other'], { required_error: 'Please select a position type.' }),
  jobDescription: z.string().min(20, 'A brief job description is required.'),
  responsibilities: z.string().optional().default(''),
  qualifications: z.string().min(10, 'Please list required qualifications.'),
  targetDepartments: z.array(z.string()).optional().default([]),
  salary: z.string().optional().default(''),
  applicationDeadline: z.date({ required_error: 'An application deadline is required.' }).min(startOfToday(), 'Application deadline must be in the future.'),
});

type RecruitmentFormValues = z.infer<typeof recruitmentSchema>;

export function RecruitmentForm() {
    const { toast } = useToast();
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [allDepartments, setAllDepartments] = useState<string[]>([]);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        } else {
            router.push('/login');
        }

        async function fetchDepartments() {
            try {
                const res = await fetch('/api/get-departments');
                const result = await res.json();
                if (result.success) {
                    setAllDepartments(result.data);
                }
            } catch (error) {
                console.error("Failed to fetch departments", error);
            }
        }
        fetchDepartments();
    }, [router]);

    const form = useForm<RecruitmentFormValues>({
        resolver: zodResolver(recruitmentSchema),
        defaultValues: {
            projectName: '',
            positionTitle: '',
            positionType: undefined,
            jobDescription: '',
            responsibilities: '',
            qualifications: '',
            targetDepartments: [],
            salary: '',
            applicationDeadline: undefined,
        },
    });

    const onSubmit = async (data: RecruitmentFormValues) => {
        if (!user) return;
        setIsSubmitting(true);
        try {
            await addDoc(collection(db, 'projectRecruitments'), {
                ...data,
                applicationDeadline: data.applicationDeadline.toISOString(),
                postedByUid: user.uid,
                postedByName: user.name,
                status: 'Pending Approval',
                createdAt: new Date().toISOString(),
            });
            
            // Notify admins after successful submission
            await notifyForRecruitmentApproval(data.positionTitle, user.name);

            toast({ title: 'Submitted for Approval', description: 'Your job posting has been sent to an administrator for review.' });
            router.push('/dashboard/post-a-job');
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Submission Failed', description: error.message || 'An unknown error occurred.' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const selectedDepartments = form.watch('targetDepartments') || [];

    return (
        <Card>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <CardContent className="space-y-6 pt-6">
                        <FormField name="projectName" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Project Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField name="positionTitle" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Position Title</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                            <FormField name="positionType" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Position Type</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger></FormControl><SelectContent><SelectItem value="Intern">Intern</SelectItem><SelectItem value="Project Associate">Project Associate</SelectItem><SelectItem value="JRF">JRF</SelectItem><SelectItem value="SRF">SRF</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select><FormMessage /></FormItem> )} />
                        </div>
                        <FormField name="jobDescription" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Job Description</FormLabel><FormControl><Textarea rows={4} {...field} /></FormControl><FormMessage /></FormItem> )} />
                        <FormField name="qualifications" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Qualifications</FormLabel><FormControl><Textarea placeholder="List required skills, degrees, or experience..." {...field} /></FormControl><FormMessage /></FormItem> )} />
                        
                        <FormField
                            name="targetDepartments"
                            control={form.control}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Target Departments/Branches</FormLabel>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="outline" className="w-full justify-start font-normal">
                                                {selectedDepartments.length > 0 ? `${selectedDepartments.length} selected` : "Select departments..."}
                                                <ChevronDown className="h-4 w-4 opacity-50 ml-auto" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] max-h-60 overflow-y-auto">
                                            <DropdownMenuLabel>Available Departments</DropdownMenuLabel>
                                            <DropdownMenuSeparator />
                                            {allDepartments.map(dept => (
                                                <DropdownMenuCheckboxItem
                                                    key={dept}
                                                    checked={field.value?.includes(dept)}
                                                    onCheckedChange={(checked) => {
                                                        const newValue = checked
                                                            ? [...(field.value || []), dept]
                                                            : (field.value || []).filter(d => d !== dept);
                                                        field.onChange(newValue);
                                                    }}
                                                >
                                                    {dept}
                                                </DropdownMenuCheckboxItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {selectedDepartments.map(dept => (
                                            <Badge key={dept} variant="secondary">
                                                {dept}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-4 w-4 ml-1"
                                                    onClick={() => field.onChange(selectedDepartments.filter(d => d !== dept))}
                                                >
                                                    <X className="h-3 w-3" />
                                                </Button>
                                            </Badge>
                                        ))}
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField name="salary" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Salary / Stipend (Optional)</FormLabel><FormControl><Input placeholder="e.g., As per university norms" {...field} /></FormControl><FormMessage /></FormItem> )} />
                            <FormField name="applicationDeadline" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Application Deadline</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP") : (<span>Pick a date</span>)}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date < startOfToday()} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem> )} />
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Submitting for Approval...</> : 'Submit for Approval'}
                        </Button>
                    </CardFooter>
                </form>
            </Form>
        </Card>
    );
}
