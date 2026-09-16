
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
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function MyEvaluationsPage() {
  const [evaluatedProjects, setEvaluatedProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
     const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
         if (!parsedUser.allowedModules?.includes('my-evaluations')) {
            toast({
            title: 'Access Denied',
            description: "You don't have permission to view this page.",
            variant: 'destructive',
            });
            router.replace('/dashboard');
            return;
        }
        setUser(parsedUser);
      } else {
          router.replace('/login');
      }
  }, [router, toast]);

  useEffect(() => {
    if (!user) return;
    
    async function getProjects() {
      setLoading(true);
      try {
        const projectsCol = collection(db, 'projects');
        const q = query(
          projectsCol,
          where('evaluatedBy', 'array-contains', user?.uid || ""),
          orderBy('submissionDate', 'desc')
        );
        const projectSnapshot = await getDocs(q);
        const projectList = projectSnapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id,
        } as Project));
        
        setEvaluatedProjects(projectList);

      } catch (error: any) {
        console.error("Error fetching evaluated projects: ", error);
        toast({
            variant: 'destructive',
            title: 'Error Fetching Projects',
            description: 'Could not fetch your evaluation history. Please try again.',
        });
      } finally {
        setLoading(false);
      }
    }
    getProjects();
  }, [user, toast]);

  const filteredProjects = useMemo(() => {
    if (!searchTerm) return evaluatedProjects;
    return evaluatedProjects.filter(p => 
      p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.pi.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [evaluatedProjects, searchTerm]);
  
  if (!user) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin"/></div>
  }


  return (
    <div className="container mx-auto py-10">
      <PageHeader title="My Evaluation History" description="A record of all projects you have evaluated." showBackButton={false} />
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
        ) : filteredProjects.length > 0 ? (
          <ProjectList projects={filteredProjects} currentUser={user} />
        ) : (
           <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              You have not evaluated any projects yet.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
