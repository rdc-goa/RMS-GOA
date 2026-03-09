
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, Briefcase, Building, Wallet, Calendar } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, isAfter } from 'date-fns';
import { uploadFileToServer } from '@/app/actions';
import { type ProjectRecruitment } from '@/types';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '@/lib/config';

const applicationSchema = z.object({
  applicantName: z.string().min(2, 'Your name is required.'),
  applicantEmail: z.string().email('Please enter a valid email address.'),
  applicantPhone: z.string().min(10, 'Please enter a valid 10-digit phone number.').max(10, 'Please enter a valid 10-digit phone number.'),
  applicantMisId: z.string().optional(),
  department: z.string().optional(),
  institute: z.string().optional(),
  cv: z.any().refine(files => files?.length === 1, 'CV is required.').refine(files => files?.[0]?.size <= 5 * 1024 * 1024, `Max file size is 5MB.`),
  coverLetter: z.any().optional(),
});

type ApplicationFormValues = z.infer<typeof applicationSchema>;

const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
};

export function ApplyForm({ job }: { job: ProjectRecruitment }) {
    const router = useRouter();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const form = useForm<ApplicationFormValues>({
        resolver: zodResolver(applicationSchema),
        defaultValues: {
            applicantName: '',
            applicantEmail: '',
            applicantPhone: '',
            applicantMisId: '',
            department: '',
            institute: '',
            coverLetter: undefined,
        },
    });
    
    const isDeadlinePassed = isAfter(new Date(), new Date(job.applicationDeadline));

    const onSubmit = async (data: ApplicationFormValues) => {
        setIsSubmitting(true);
        try {
            const cvFile = data.cv[0];
            const cvDataUrl = await fileToDataUrl(cvFile);
            
            const cvUploadResult = await uploadFileToServer(cvDataUrl, `recruitment-cvs/${job.id}/${cvFile.name}`);

            if (!cvUploadResult.success || !cvUploadResult.url) {
                throw new Error(cvUploadResult.error || 'Failed to upload CV.');
            }
            
            let coverLetterUrl: string | undefined;
            const coverLetterFile = data.coverLetter?.[0];
            if (coverLetterFile) {
                const coverLetterDataUrl = await fileToDataUrl(coverLetterFile);
                const coverLetterUploadResult = await uploadFileToServer(coverLetterDataUrl, `recruitment-cover-letters/${job.id}/${coverLetterFile.name}`);
                if (!coverLetterUploadResult.success || !coverLetterUploadResult.url) {
                    throw new Error(coverLetterUploadResult.error || 'Failed to upload Cover Letter.');
                }
                coverLetterUrl = coverLetterUploadResult.url;
            }

            await addDoc(collection(db, 'projectRecruitments', job.id, 'applications'), {
                recruitmentId: job.id,
                applicantName: data.applicantName,
                applicantEmail: data.applicantEmail,
                applicantPhone: data.applicantPhone,
                applicantMisId: data.applicantMisId,
                department: data.department,
                institute: data.institute,
                cvUrl: cvUploadResult.url,
                coverLetterUrl: coverLetterUrl,
                appliedAt: new Date().toISOString(),
            });

            toast({ title: 'Application Submitted!', description: 'Your application has been received. You will be contacted if shortlisted.' });
            router.push('/hiring');
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Submission Failed', description: error.message || 'An unknown error occurred.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-2xl">Apply for {job.positionTitle}</CardTitle>
                <CardDescription>Project: {job.projectName}</CardDescription>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground pt-2">
                    <span className="flex items-center"><Briefcase className="mr-1.5 h-4 w-4"/> {job.positionType}</span>
                    <span className="flex items-center"><Building className="mr-1.5 h-4 w-4"/> {job.postedByName}</span>
                    {job.salary && <span className="flex items-center"><Wallet className="mr-1.5 h-4 w-4"/> {job.salary}</span>}
                    <span className="flex items-center"><Calendar className="mr-1.5 h-4 w-4"/> Apply by {format(new Date(job.applicationDeadline), 'PPP')}</span>
                </div>
            </CardHeader>
            <CardContent>
                 {isDeadlinePassed ? (
                    <div className="text-center py-8 text-red-500 font-semibold">
                        The application deadline for this position has passed.
                    </div>
                ) : (
                    <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField name="applicantName" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                            <FormField name="applicantMisId" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Enrollment Number (if applicable)</FormLabel><FormControl><Input placeholder="230502...." {...field} /></FormControl><FormMessage /></FormItem> )} />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField name="applicantEmail" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Email Address</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem> )} />
                            <FormField name="applicantPhone" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input type="tel" {...field} /></FormControl><FormMessage /></FormItem> )} />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField name="institute" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Institute</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                            <FormField name="department" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Department</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                        </div>
                        <FormField
                            name="cv"
                            control={form.control}
                            render={({ field: { onChange, ...rest }}) => (
                                <FormItem>
                                    <FormLabel>Upload CV (PDF, max 5MB)</FormLabel>
                                    <FormControl>
                                        <Input type="file" accept=".pdf" onChange={(e) => onChange(e.target.files)} {...rest} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            name="coverLetter"
                            control={form.control}
                            render={({ field: { onChange, ...rest } }) => (
                                <FormItem>
                                    <FormLabel>Cover Letter (Optional, PDF, max 5MB)</FormLabel>
                                    <FormControl>
                                        <Input type="file" accept=".pdf" onChange={(e) => onChange(e.target.files)} {...rest} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        
                        <Button type="submit" className="w-full" disabled={isSubmitting}>
                            {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Submitting...</> : 'Submit Application'}
                        </Button>
                    </form>
                    </Form>
                )}
            </CardContent>
        </Card>
    );
}

