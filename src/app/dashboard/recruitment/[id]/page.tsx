
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { db } from '@/lib/config';
import { doc, getDoc, collection, getDocs, orderBy, query } from 'firebase/firestore';
import type { ProjectRecruitment, RecruitmentApplication, User } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

export default function ViewApplicationsPage() {
    const params = useParams();
    const router = useRouter();
    const recruitmentId = params.id as string;
    const { toast } = useToast();

    const [job, setJob] = useState<ProjectRecruitment | null>(null);
    const [applications, setApplications] = useState<RecruitmentApplication[]>([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        } else {
            router.push('/login');
        }
    }, [router]);

    useEffect(() => {
        if (!recruitmentId || !user) return;

        const fetchData = async () => {
            setLoading(true);
            try {
                const jobDocRef = doc(db, 'projectRecruitments', recruitmentId);
                const jobDocSnap = await getDoc(jobDocRef);

                if (!jobDocSnap.exists()) {
                    toast({ variant: 'destructive', title: 'Not Found', description: 'This job posting does not exist.' });
                    router.push('/dashboard/post-a-job');
                    return;
                }
                const jobData = { id: jobDocSnap.id, ...jobDocSnap.data() } as ProjectRecruitment;

                const isOwner = user.uid === jobData.postedByUid;
                const isAdmin = user.role === 'Super-admin' || user.role === 'admin';

                if (!isOwner && !isAdmin) {
                    toast({ variant: 'destructive', title: 'Access Denied', description: "You don't have permission to view these applications." });
                    router.push('/dashboard');
                    return;
                }
                
                setJob(jobData);

                const appsQuery = query(collection(db, 'projectRecruitments', recruitmentId, 'applications'), orderBy('appliedAt', 'desc'));
                const appsSnapshot = await getDocs(appsQuery);
                setApplications(appsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RecruitmentApplication)));

            } catch (error) {
                console.error("Error fetching applications:", error);
                toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch applications.' });
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [recruitmentId, user, router, toast]);

    const handleExport = () => {
        if (!applications.length) return;
        const dataToExport = applications.map(app => ({
            'Applicant Name': app.applicantName,
            'Email': app.applicantEmail,
            'Phone': app.applicantPhone,
            'Enrollment No.': app.applicantMisId || 'N/A',
            'Institute': app.institute || 'N/A',
            'Department': app.department || 'N/A',
            'Applied At': format(new Date(app.appliedAt), 'PPP p'),
            'CV Link': app.cvUrl,
            'Cover Letter Link': app.coverLetterUrl || 'N/A',
        }));
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Applications");
        XLSX.writeFile(workbook, `applications_${job?.positionTitle.replace(/\s/g, '_')}.xlsx`);
    };
    
    if (loading) {
      return (
        <div className="container mx-auto py-10">
          <PageHeader title="Loading Applications..." description="Please wait..." />
          <Skeleton className="h-64 w-full mt-8" />
        </div>
      );
    }
    
    if (!job) return null;

    return (
        <div className="container mx-auto py-10">
            <PageHeader title={`Applicants for ${job.positionTitle}`} description={`Project: ${job.projectName}`} backButtonHref="/dashboard/post-a-job" backButtonText="Back to My Postings">
                 <Button onClick={handleExport} disabled={applications.length === 0}>
                    <Download className="mr-2 h-4 w-4" /> Export as XLSX
                </Button>
            </PageHeader>
            <div className="mt-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Total Applications: {applications.length}</CardTitle>
                        <CardDescription>A list of all candidates who have applied for this position.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {applications.length > 0 ? (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Name</TableHead>
                                            <TableHead>Contact</TableHead>
                                            <TableHead>Academics</TableHead>
                                            <TableHead>Applied On</TableHead>
                                            <TableHead>Documents</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {applications.map(app => (
                                            <TableRow key={app.id}>
                                                <TableCell>
                                                    <div className="font-medium">{app.applicantName}</div>
                                                    {app.applicantMisId && <div className="text-sm text-muted-foreground">{app.applicantMisId}</div>}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-sm">{app.applicantEmail}</div>
                                                    <div className="text-sm text-muted-foreground">{app.applicantPhone}</div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-sm">{app.institute || 'N/A'}</div>
                                                    <div className="text-sm text-muted-foreground">{app.department || 'N/A'}</div>
                                                </TableCell>
                                                <TableCell>
                                                    {format(new Date(app.appliedAt), 'PPP')}
                                                </TableCell>
                                                <TableCell className="space-x-2">
                                                    <Button asChild variant="link" className="p-0 h-auto">
                                                        <a href={app.cvUrl} target="_blank" rel="noopener noreferrer">View CV</a>
                                                    </Button>
                                                    {app.coverLetterUrl && (
                                                        <Button asChild variant="link" className="p-0 h-auto">
                                                            <a href={app.coverLetterUrl} target="_blank" rel="noopener noreferrer">Cover Letter</a>
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        ) : (
                            <div className="text-center py-12 text-muted-foreground">
                                No applications have been received for this posting yet.
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
