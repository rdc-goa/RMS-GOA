
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { getDefaultModulesForRole } from '@/lib/modules';
import type { User } from '@/types';
import { PageHeader } from '@/components/page-header';
import { RecruitmentForm } from '@/components/recruitment/recruitment-form';

export default function NewRecruitmentPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser) as User;
      const allowedModules = parsedUser.allowedModules || getDefaultModulesForRole(parsedUser.role, parsedUser.designation);
      if (!allowedModules.includes('post-a-job')) {
        toast({
          title: 'Access Denied',
          description: "You don't have permission to view this page.",
          variant: 'destructive',
        });
        router.replace('/dashboard');
        return;
      }
      setLoading(false);
    } else {
      router.replace('/login');
    }
  }, [router, toast]);

  if (loading) {
    return (
      <div className="container mx-auto py-10 flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl py-10">
      <PageHeader
        title="Create New Job Posting"
        description="Fill out the details below to create a new job opening for your project."
        backButtonHref="/dashboard/post-a-job"
        backButtonText="Back to Postings"
      />
      <div className="mt-8">
        <RecruitmentForm />
      </div>
    </div>
  );
}
