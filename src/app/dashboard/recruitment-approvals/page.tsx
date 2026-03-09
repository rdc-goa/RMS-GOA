
'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/page-header';
import type { User, ProjectRecruitment } from '@/types';
import { db } from '@/lib/config';
import { collection, query, where, getDocs, orderBy, doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Check, X, Eye } from 'lucide-react';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

function JobDetailsDialog({ job, isOpen, onOpenChange, poster }: { job: ProjectRecruitment | null; isOpen: boolean; onOpenChange: (open: boolean) => void; poster: User | null; }) {
    if (!job) return null;

    const posterProfileLink = poster?.misId ? (poster.campus === 'Goa' ? `/goa/${poster.misId}` : `/profile/${poster.misId}`) : null;

    const renderDetail = (label: string, value?: string | string[] | React.ReactNode) => {
        if (!value || (Array.isArray(value) && value.length === 0)) return null;
        let displayValue: React.ReactNode = value;
        if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
             displayValue = (
                <div className="flex flex-wrap gap-1">{value.map(v => <Badge key={v} variant="secondary">{v}</Badge>)}</div>
            );
        }

        return (
            <div className="grid grid-cols-3 gap-2 text-sm">
                <p className="font-semibold text-muted-foreground col-span-1">{label}</p>
                <div className="col-span-2">{displayValue}</div>
            </div>
        );
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{job.positionTitle}</DialogTitle>
                    <DialogDescription>Project: {job.projectName}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-4">
                    {renderDetail('Posted by', posterProfileLink ? (
                        <Link href={posterProfileLink} className="text-primary hover:underline" target="_blank">
                            {job.postedByName}
                        </Link>
                    ) : job.postedByName)}
                    {renderDetail('Position Type', job.positionType)}
                    {renderDetail('Application Deadline', format(new Date(job.applicationDeadline), 'PPP'))}
                    {renderDetail('Salary/Stipend', job.salary)}
                    <div className="space-y-1">
                        <p className="font-semibold text-muted-foreground text-sm">Job Description</p>
                        <p className="text-sm">{job.jobDescription}</p>
                    </div>
                    {renderDetail('Qualifications', <p className="text-sm whitespace-pre-wrap">{job.qualifications}</p>)}
                    {renderDetail('Responsibilities', <p className="text-sm whitespace-pre-wrap">{job.responsibilities}</p>)}
                    {renderDetail('Target Departments/Branches', job.targetDepartments)}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default function RecruitmentApprovalsPage() {
    const [user, setUser] = useState<User | null>(null);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [pendingPostings, setPendingPostings] = useState<ProjectRecruitment[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const [jobToView, setJobToView] = useState<ProjectRecruitment | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);

    const fetchAllData = useCallback(async () => {
        setLoading(true);
        try {
            const postingsQuery = query(
                collection(db, 'projectRecruitments'),
                where('status', '==', 'Pending Approval'),
                orderBy('createdAt', 'desc')
            );
            
            const usersQuery = query(collection(db, 'users'));
            
            const [postingsSnapshot, usersSnapshot] = await Promise.all([
                getDocs(postingsQuery),
                getDocs(usersQuery)
            ]);
            
            setPendingPostings(postingsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProjectRecruitment)));
            setAllUsers(usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User)));
        } catch (error) {
            console.error("Error fetching data:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch job postings for approval.' });
        } finally {
            setLoading(false);
        }
    }, [toast]);
    
    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
        fetchAllData();
    }, [fetchAllData]);

    const handleApproval = async (id: string, newStatus: 'Approved' | 'Rejected') => {
        try {
            const docRef = doc(db, 'projectRecruitments', id);
            await updateDoc(docRef, { status: newStatus, approvedAt: newStatus === 'Approved' ? new Date().toISOString() : null });
            toast({ title: `Posting ${newStatus}`, description: 'The job posting has been updated.' });
            fetchAllData(); // Refresh list
        } catch (error) {
            toast({ variant: 'destructive', title: 'Update Failed' });
        }
    };
    
    const handleViewDetails = (job: ProjectRecruitment) => {
        setJobToView(job);
        setIsDetailsOpen(true);
    };

    if (loading) {
        return <div className="container mx-auto py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    return (
        <div className="container mx-auto py-10">
            <PageHeader title="Recruitment Approvals" description="Review and approve new job postings for the public hiring page." />
            <div className="mt-8 space-y-4">
                {pendingPostings.length > 0 ? (
                    pendingPostings.map(job => {
                        const poster = allUsers.find(u => u.uid === job.postedByUid);
                        const posterProfileLink = poster?.misId ? (poster.campus === 'Goa' ? `/goa/${poster.misId}` : `/profile/${poster.misId}`) : null;
                        
                        return (
                            <Card key={job.id}>
                                <CardHeader>
                                    <div className="flex justify-between items-start gap-4">
                                        <div>
                                            <CardTitle>{job.positionTitle}</CardTitle>
                                            <CardDescription>
                                                For: {job.projectName} | Posted by: {posterProfileLink ? (
                                                    <Link href={posterProfileLink} className="text-primary hover:underline" target="_blank">
                                                        {job.postedByName}
                                                    </Link>
                                                ) : (
                                                    job.postedByName
                                                )}
                                            </CardDescription>
                                        </div>
                                        <div className="flex flex-shrink-0 gap-2">
                                            <Button variant="outline" size="sm" onClick={() => handleViewDetails(job)}><Eye className="mr-2 h-4 w-4"/>View Details</Button>
                                            <Button size="sm" onClick={() => handleApproval(job.id, 'Approved')}><Check className="mr-2 h-4 w-4"/>Approve</Button>
                                            <Button size="sm" variant="destructive" onClick={() => handleApproval(job.id, 'Rejected')}><X className="mr-2 h-4 w-4"/>Reject</Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-muted-foreground">{job.jobDescription}</p>
                                    <div className="text-xs text-muted-foreground mt-2">Deadline: {format(new Date(job.applicationDeadline), 'PPP')}</div>
                                </CardContent>
                            </Card>
                        )
                    })
                ) : (
                    <p className="text-muted-foreground text-center py-8">No job postings are currently pending approval.</p>
                )}
            </div>
            <JobDetailsDialog job={jobToView} isOpen={isDetailsOpen} onOpenChange={setIsDetailsOpen} poster={allUsers.find(u => u.uid === jobToView?.postedByUid) || null} />
        </div>
    );
}
