
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import type { User } from '@/types';
import { sendErrorEmail, logFrontendAction } from '@/app/actions';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Log the error to the console for developers
    console.error(error);

    // Get user details from local storage
    const storedUser = localStorage.getItem('user');
    const parsedUser = storedUser ? JSON.parse(storedUser) : null;
    setUser(parsedUser);
    
    // Send email report with deduplication
    const errorKey = `reported_ui_error_${error.message.substring(0, 50)}_${window.location.pathname}`;
    const alreadyReported = sessionStorage.getItem(errorKey);

    if (!alreadyReported) {
      sendErrorEmail(
        { message: error.message, digest: error.digest },
        parsedUser,
        window.location.href
      ).then(() => {
        sessionStorage.setItem(errorKey, new Date().toISOString());
      }).catch(e => console.error("Failed to send error report email:", e));
    } else {
      console.log("UI Error already reported in this session, skipping email.");
    }

    // Log to observability system
    logFrontendAction('FRONTEND', 'Unhandled UI Exception', {
      metadata: { errorMessage: error.message, digest: error.digest, stack: error.stack },
      user: parsedUser,
      status: 'error'
    }).catch(e => console.error("Failed to log frontend error:", e));

  }, [error]);

  const isChunkError = error.message.toLowerCase().includes('chunk') || error.message.toLowerCase().includes('dynamically imported module');

  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center p-4">
        <Card className="w-full max-w-lg text-center shadow-lg border-2 border-destructive/20 ring-1 ring-destructive/10">
            <CardHeader>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 animate-pulse">
                    <AlertTriangle className="h-8 w-8 text-destructive" />
                </div>
                <CardTitle className="mt-4 text-2xl font-bold tracking-tight">
                    {isChunkError ? 'Application Update Detected' : 'An Unexpected Error Occurred'}
                </CardTitle>
                <CardDescription className="text-base">
                    {isChunkError 
                        ? 'We have recently updated the portal. Please refresh your browser to load the latest version.'
                        : 'We apologize for the inconvenience. Our technical team has been automatically notified and is looking into it.'
                    }
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="bg-muted/50 p-3 rounded-lg text-left">
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">Error Trace ID</p>
                  <p className="text-xs font-mono break-all">{error.digest || 'N/A'}</p>
                  <p className="text-xs font-mono mt-2 text-destructive/80 bg-destructive/5 p-2 rounded border border-destructive/10">{error.message}</p>
                </div>
                
                <p className="text-sm text-muted-foreground">
                    If refreshing doesn't help, please contact our support team.
                </p>
                <p className="font-semibold">
                    <a href="mailto:helpdesk.rdc@paruluniversity.ac.in" className="text-primary hover:underline">
                        helpdesk.rdc@paruluniversity.ac.in
                    </a>
                </p>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
                <Button 
                  onClick={() => isChunkError ? window.location.reload() : reset()} 
                  className="w-full h-11 text-base font-bold shadow-lg shadow-primary/20"
                >
                    {isChunkError ? 'Refresh Now' : 'Try Again'}
                </Button>
                {isChunkError && (
                  <p className="text-[10px] text-muted-foreground italic">
                    Tip: If the error persists, try clearing your browser cache.
                  </p>
                )}
            </CardFooter>
        </Card>
    </div>
  );
}
