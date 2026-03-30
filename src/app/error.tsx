
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import type { User } from '@/types';
import { sendErrorEmail } from '@/app/actions';

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

    // Send email report
    sendErrorEmail(
      { message: error.message, digest: error.digest },
      parsedUser
    ).catch(e => console.error("Failed to send error report email:", e));

  }, [error]);

  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center p-4">
      <Card className="w-full max-w-lg text-center shadow-lg">
        <CardHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle className="mt-4 text-2xl">An Unexpected Error Occurred</CardTitle>
          <CardDescription>We apologize for the inconvenience. Our technical team has been automatically notified of this issue.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Please try again. If the problem persists, please contact our support team for assistance.
          </p>
          <p className="mt-4 font-semibold">
            <a href="mailto:rdc@goa.paruluniversity.ac.in" className="text-primary hover:underline">
              rdc@goa.paruluniversity.ac.in
            </a>
          </p>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button onClick={() => reset()}>
            Try Again
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
