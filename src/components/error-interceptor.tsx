'use client';

import { useEffect } from 'react';
import { reportSystemError } from '@/lib/error-reporting';
import { User } from '@/types';

export function ErrorInterceptor() {
    useEffect(() => {
        // Only run on client
        if (typeof window === 'undefined') return;

        const originalConsoleError = console.error;
        let isInternalLogging = false;

        console.error = (...args: any[]) => {
            // Call original console.error
            originalConsoleError.apply(console, args);

            if (isInternalLogging) return;

            // Extract message
            const message = args.map(arg => {
                if (arg instanceof Error) return arg.message + (arg.stack ? '\n' + arg.stack : '');
                return String(arg);
            }).join(' ');

            const isIndexError = message.toLowerCase().includes("index") || 
                                message.includes("create_composite") || 
                                message.includes("https://console.firebase.google.com");

            const isChunkError = message.includes("ChunkLoadError") || 
                                 message.includes("Failed to load chunk");

            if (isChunkError) {
                // Deployment sync issue: browser is looking for old chunks that were replaced
                const lastReload = sessionStorage.getItem('chunk_error_reload');
                const now = Date.now();
                
                // Only reload if we haven't reloaded for this in the last 30 seconds
                if (!lastReload || (now - parseInt(lastReload)) > 30000) {
                    sessionStorage.setItem('chunk_error_reload', now.toString());
                    console.warn("ChunkLoadError detected. Re-syncing application...");
                    window.location.reload();
                    return;
                }
            }

            // Filter out noise to prevent helpdesk spam
            const isNoise = message.includes("Warning:") || 
                            message.includes("React DevTools") ||
                            message.includes("Extension context invalidated") ||
                            message.includes("ChunkLoadError") ||
                            message.includes("Failed to load resource: net::ERR_BLOCKED_BY_CLIENT");

            if (!isNoise) {
                isInternalLogging = true;
                let user: User | null = null;
                try {
                    const storedUser = localStorage.getItem('user');
                    if (storedUser) user = JSON.parse(storedUser);
                } catch (e) {}

                reportSystemError(message, user, "Automatic Console Interception")
                    .finally(() => {
                        isInternalLogging = false;
                    });
            }
        };

        // Also catch unhandled rejections
        const handleRejection = (event: PromiseRejectionEvent) => {
            const error = event.reason;
            const message = error?.message || String(error);
            
            const isChunkError = message.includes("ChunkLoadError") || 
                                 message.includes("Failed to load chunk");

            if (isChunkError) {
                const lastReload = sessionStorage.getItem('chunk_error_reload');
                const now = Date.now();
                if (!lastReload || (now - parseInt(lastReload)) > 30000) {
                    sessionStorage.setItem('chunk_error_reload', now.toString());
                    window.location.reload();
                    return;
                }
            }

            let user: User | null = null;
            try {
                const storedUser = localStorage.getItem('user');
                if (storedUser) user = JSON.parse(storedUser);
            } catch (e) {}
            
            reportSystemError(error, user, "Unhandled Promise Rejection");
        };

        window.addEventListener('unhandledrejection', handleRejection);

        return () => {
            console.error = originalConsoleError;
            window.removeEventListener('unhandledrejection', handleRejection);
        };
    }, []);

    return null;
}
