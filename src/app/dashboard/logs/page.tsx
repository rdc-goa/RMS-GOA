
import { Suspense } from "react";
import { LogViewer } from "@/components/logs/log-viewer";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "System Logs | RDC Admin",
  description: "Monitor application, security, and workflow logs.",
};

export default function LogsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">System Logs</h1>
        <p className="text-muted-foreground">
          Observability layer for application, security, and workflow events.
        </p>
      </div>
      
      <Suspense fallback={<LogSkeleton />}>
        <LogViewer />
      </Suspense>
    </div>
  );
}

function LogSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-[200px]" />
        <Skeleton className="h-10 w-[150px]" />
        <Skeleton className="h-10 flex-1" />
      </div>
      <div className="rounded-md border">
        <div className="h-[400px] w-full flex flex-col gap-2 p-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
