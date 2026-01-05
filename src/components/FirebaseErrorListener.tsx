
'use client';

import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { useToast } from '@/hooks/use-toast';
import type { User } from '@/types';
import { sendErrorEmail } from '@/app/server-actions'; // We will create this

export function FirebaseErrorListener() {
  const { toast } = useToast();

  useEffect(() => {
    const handlePermissionError = (error: any) => {
      // In development, we still want the detailed overlay for debugging.
      if (process.env.NODE_ENV === 'development') {
        throw error;
      } 
      // In production, show a user-friendly message and report the error.
      else {
        console.error("Firestore Permission Error:", error.message, error.context);

        toast({
          variant: 'destructive',
          title: 'An Error Occurred',
          description: "We're sorry, but an unexpected error occurred. Please try again or contact the helpdesk at helpdesk.rdc@paruluniversity.ac.in for assistance.",
          duration: 10000,
        });

        // Get user details from localStorage to send in the report
        const storedUser = localStorage.getItem('user');
        let user: User | null = null;
        if (storedUser) {
          try {
            user = JSON.parse(storedUser);
          } catch (e) {
            console.error("Could not parse user from localStorage for error report.");
          }
        }
        
        // Asynchronously send the error report email without blocking the UI
        sendErrorEmail({
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack,
            },
            context: error.context,
            user: user ? {
                name: user.name,
                email: user.email,
                phoneNumber: user.phoneNumber || 'Not provided',
            } : null,
        });
      }
    };

    errorEmitter.on('permission-error', handlePermissionError);

    // No cleanup function is returned, so the listener persists for the app's lifetime.
  }, [toast]);

  // This component does not render anything to the DOM.
  return null;
}
