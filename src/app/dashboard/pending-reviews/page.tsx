
'use client';

import { useState, useEffect, useMemo } from 'react';
import { PageHeader } from '@/components/page-header';
import { ProjectList } from '@/components/projects/project-list';
import { db } from '@/lib/config';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import type { Project, User } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

export default function PendingReviewsPage() {
  const [pendingProjects, setPendingProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
       if (!parsedUser.allowedModules?.includes('pending-reviews')) {
        toast({
          title: 'Access Denied',
          description: "You don't have permission to view this page.",
          variant: 'destructive',
        });
        router.replace('/dashboard');
        return;
      }
      setCurrentUser(parsedUser);
    } else {
        router.replace('/login');
    }
  }, [router, toast]);

  useEffect(() => {
    if (!currentUser) return;

    async function getPendingProjects() {
      try {
        const projectsCol = collection(db, 'projects');
        const q = query(
          projectsCol, 
          where('status', 'in', ['Under Review', 'Revision Submitted', 'Pending Completion Approval']),
          orderBy('submissionDate', 'desc')
        );
        const projectSnapshot = await getDocs(q);
        const projectList = projectSnapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id,
        } as Project));
        setPendingProjects(projectList);
      } catch (error) {
        console.error("Error fetching pending projects: ", error);
      } finally {
        setLoading(false);
      }
    }
    getPendingProjects();
  }, [currentUser]);

  const filteredProjects = useMemo(() => {
    if (!searchTerm) return pendingProjects;
    return pendingProjects.filter(p => 
      p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.pi.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [pendingProjects, searchTerm]);
  
  if (!currentUser) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin"/></div>
  }

  return (
    <div className="container mx-auto py-10">
      <PageHeader title="Pending Reviews" description="Projects awaiting initial review or completion approval." />
      <div className="flex items-center py-4">
        <Input
            placeholder="Filter by title or PI..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="max-w-sm"
        />
      </div>
      <div className="mt-4">
         {loading ? (
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </CardContent>
          </Card>
        ) : (
          <ProjectList projects={filteredProjects} currentUser={currentUser} />
        )}
      </div>
    </div>
  );
}
