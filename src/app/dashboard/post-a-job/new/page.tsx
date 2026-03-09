
'use client';

import { PageHeader } from '@/components/page-header';
import { RecruitmentForm } from '@/components/recruitment/recruitment-form';

export default function NewRecruitmentPage() {
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
