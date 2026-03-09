'use client';

import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';

// This is a client-side component that listens for Firestore permission errors
// and throws them as uncaught exceptions. Next.js development overlay will then
// catch and display these errors beautifully, providing rich debugging context.
export function FirebaseErrorListener() {
  useEffect(() => {
    const handlePermissionError = (error: Error) => {
      // Throwing the error here makes it visible in the Next.js dev overlay
      // ONLY IN DEV MODE. In production, this will not be thrown.
      if (process.env.NODE_ENV === 'development') {
        throw error;
      } else {
        // In production, you might want to log this to a service like Sentry or Google Cloud Logging.
        console.error("Firestore Permission Error:", error.message);
      }
    };

    errorEmitter.on('permission-error', handlePermissionError);

    // No cleanup function is returned, so the listener persists for the app's lifetime.
  }, []);

  // This component does not render anything to the DOM.
  return null;
}
