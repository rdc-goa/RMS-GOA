'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function AnnounceSpecialCfpRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/manage-cfp-submissions');
  }, [router]);

  return (
    <div className="flex flex-col justify-center items-center py-20 min-h-[60vh]">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <span className="ml-4 text-muted-foreground mt-4 font-semibold">
        Redirecting you to the unified Manage CFPs console...
      </span>
    </div>
  );
}
