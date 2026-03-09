
import { PageHeader } from '@/components/page-header';
import { SubmissionForm } from '@/components/projects/submission-form';
import { Guidelines } from '@/components/projects/guidelines';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import Link from 'next/link';

export default function NewSubmissionPage() {
  return (
    <div className="container mx-auto max-w-4xl py-10">
       <PageHeader
        title="New Project Submission"
        description="Please fill out the form below to submit your research project. You can save your progress as a draft at any time."
      >
        <Button asChild variant="outline">
            <a href="https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/Sample%20Template%20IMR%20PPT.pptx" download>
                <Download className="mr-2 h-4 w-4" />
                Download Template
            </a>
        </Button>
      </PageHeader>
      <div className="mt-8 space-y-8">
        <Guidelines />
        <SubmissionForm />
      </div>
    </div>
  );
}
