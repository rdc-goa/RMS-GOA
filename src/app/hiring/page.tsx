
'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/config';
import type { ProjectRecruitment } from '@/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Building, MapPin, Target, Wallet, Calendar, User, Briefcase, GraduationCap } from 'lucide-react';
import { format, isAfter } from 'date-fns';
import Link from 'next/link';
import { Logo } from '@/components/logo';

function JobCard({ job }: { job: ProjectRecruitment }) {
    const isDeadlinePassed = isAfter(new Date(), new Date(job.applicationDeadline));

    return (
        <Card>
            <CardHeader>
                <CardTitle>{job.positionTitle}</CardTitle>
                <CardDescription>For Project: {job.projectName}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary"><User className="mr-1 h-3 w-3" /> {job.positionType}</Badge>
                    <Badge variant="secondary"><Building className="mr-1 h-3 w-3" /> {job.postedByName}</Badge>
                    {job.salary && <Badge variant="secondary"><Wallet className="mr-1 h-3 w-3" /> {job.salary}</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{job.jobDescription}</p>
                <div>
                    <h4 className="font-semibold text-sm">Target Branches & Departments</h4>
                    <div className="flex flex-wrap gap-1 mt-1">
                        {[...(job.targetBranches || []), ...(job.targetDepartments || [])].map(t => <Badge key={t} variant="outline">{t}</Badge>)}
                    </div>
                </div>
            </CardContent>
            <CardFooter className="flex justify-between items-center">
                 <div className="text-sm text-muted-foreground">
                    <Calendar className="inline-block mr-1 h-4 w-4" />
                    Apply by: {format(new Date(job.applicationDeadline), 'PPP')}
                </div>
                <Button asChild disabled={isDeadlinePassed}>
                    <Link href={`/hiring/apply/${job.id}`}>
                        {isDeadlinePassed ? 'Application Closed' : 'Apply Now'}
                    </Link>
                </Button>
            </CardFooter>
        </Card>
    );
}

export default function HiringPage() {
    const [jobs, setJobs] = useState<ProjectRecruitment[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchJobs = async () => {
            try {
                const q = query(
                    collection(db, 'projectRecruitments'),
                    where('status', '==', 'Approved'),
                    orderBy('applicationDeadline', 'desc')
                );
                const querySnapshot = await getDocs(q);
                const jobList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProjectRecruitment));
                setJobs(jobList);
            } catch (error) {
                console.error("Error fetching job postings:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchJobs();
    }, []);

    return (
        <div className="flex flex-col min-h-screen bg-background dark:bg-transparent">
             <header className="container mx-auto px-4 lg:px-6 h-20 flex items-center justify-between sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b">
                <Logo />
                <nav>
                    <Link href="/">
                        <Button variant="ghost">Back to Home</Button>
                    </Link>
                </nav>
            </header>
            <main className="flex-1 py-12 md:py-16">
                <div className="container mx-auto px-4 md:px-6 max-w-4xl">
                    <div className="text-center mb-12">
                        <h1 className="text-4xl font-bold tracking-tight">Join a Research Project</h1>
                        <p className="mt-4 text-lg text-muted-foreground">
                            Explore opportunities to work on innovative research projects at Parul University Goa.
                        </p>
                    </div>

                    {loading ? (
                        <div className="flex justify-center items-center h-64">
                            <Loader2 className="h-12 w-12 animate-spin text-primary" />
                        </div>
                    ) : jobs.length > 0 ? (
                        <div className="space-y-6">
                            {jobs.map(job => <JobCard key={job.id} job={job} />)}
                        </div>
                    ) : (
                        <div className="text-center py-16 border-2 border-dashed rounded-lg">
                            <GraduationCap className="mx-auto h-12 w-12 text-muted-foreground" />
                            <h3 className="mt-4 text-lg font-semibold">No Openings Available</h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                                There are currently no open positions. Please check back later.
                            </p>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
