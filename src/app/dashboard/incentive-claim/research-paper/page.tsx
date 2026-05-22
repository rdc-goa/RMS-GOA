

'use client';

import { PageHeader } from '@/components/page-header';
import { ResearchPaperForm } from '@/components/incentives/research-paper-form';

export default function ResearchPaperClaimPage() {
  return (
    <div className="container mx-auto max-w-5xl py-10">
      <PageHeader

        backButtonHref="/dashboard/incentive-claim"
        backButtonText="Back to Claim Types"
      />
      <div className="mt-8">
        <ResearchPaperForm />
      </div>
    </div>
  );
}
