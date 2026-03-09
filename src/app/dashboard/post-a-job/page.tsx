
'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, Users } from 'lucide-react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/config';
import type { ProjectRecruitment, User } from '@/types';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';

export default function PostAJobPage() {
    const [user, setUser] = useState<User | null>(null);
    const [postings, setPostings] = useState<ProjectRecruitment[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            const parsedUser = JSON.parse(storedUser);
            setUser(parsedUser);
        } else {
            router.push('/login');
        }
    }, [router]);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }
        
        const fetchPostings = async () => {
            setLoading(true);
            try {
                let q;
                const postingsCollection = collection(db, 'projectRecruitments');
                const isAdmin = user.role === 'admin' || user.role === 'Super-admin';

                if (isAdmin) {
                    q = query(postingsCollection, orderBy('createdAt', 'desc'));
                } else {
                    q = query(
                        postingsCollection,
                        where('postedByUid', '==', user.uid),
                        orderBy('createdAt', 'desc')
                    );
                }
                const querySnapshot = await getDocs(q);
                setPostings(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProjectRecruitment)));
            } catch (error) {
                console.error("Error fetching job postings:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchPostings();
    }, [user]);

    const getStatusVariant = (status: ProjectRecruitment['status']) => {
        switch (status) {
            case 'Approved': return 'default';
            case 'Pending Approval': return 'secondary';
            case 'Rejected': return 'destructive';
            case 'Closed': return 'outline';
            default: return 'secondary';
        }
    };

    return (
        <div className="container mx-auto py-10">
            <PageHeader title="Post a Job Opening" description="Create and manage job postings for your research projects.">
                <Button asChild>
                    <Link href="/dashboard/post-a-job/new">
                        <Plus className="mr-2 h-4 w-4" /> Create New Posting
                    </Link>
                </Button>
            </PageHeader>
            <div className="mt-8">
                <Card>
                    <CardHeader>
                        <CardTitle>My Job Postings</CardTitle>
                        <CardDescription>A history of all the job openings you have created.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="space-y-4">
                                <Skeleton className="h-24 w-full" />
                                <Skeleton className="h-24 w-full" />
                            </div>
                        ) : postings.length > 0 ? (
                            <div className="space-y-4">
                                {postings.map(job => (
                                    <div key={job.id} className="border p-4 rounded-lg flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                                        <div className="flex-1">
                                            <p className="font-semibold">{job.positionTitle}</p>
                                            <p className="text-sm text-muted-foreground">For: {job.projectName}</p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                Created: {format(new Date(job.createdAt), 'PPP')} | Deadline: {format(new Date(job.applicationDeadline), 'PPP')}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 self-start sm:self-center">
                                            <Badge variant={getStatusVariant(job.status)}>{job.status}</Badge>
                                            <Button asChild variant="outline" size="sm">
                                                <Link href={`/dashboard/recruitment/${job.id}`}>
                                                    <Users className="mr-2 h-4 w-4" /> View Applicants
                                                </Link>
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-10 text-muted-foreground">
                                You have not created any job postings yet.
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
