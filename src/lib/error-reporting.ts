import { User } from "@/types";

/**
 * Reports a system error to the RDC helpdesk.
 * Specifically targets Firebase index building/missing errors as requested.
 */
export const reportSystemError = async (error: any, user: User | null, action?: string) => {
    const errorMessage = error?.message || String(error);
    
    // Always log to console for debugging
    console.error("System Error caught:", errorMessage);

    const isOfflineError = (msg: string): boolean => {
        if (!msg) return false;
        const lower = msg.toLowerCase();
        return (
            lower.includes("failed to get document because the client is offline") ||
            lower.includes("could not reach cloud firestore backend") ||
            lower.includes("client is offline") ||
            lower.includes("code=unavailable") ||
            (lower.includes("offline") && (lower.includes("firestore") || lower.includes("firebase")))
        );
    };

    if (isOfflineError(errorMessage)) {
        console.log("Offline error detected. Skipping helpdesk reporting.");
        return;
    }

    if (errorMessage.includes("input-otp could not insert CSS rule") || errorMessage.includes("[data-input-otp]:autofill")) {
        console.log("Benign input-otp CSS insertion error ignored.");
        return;
    }

    try {
        // Deduplication logic using sessionStorage
        const errorKey = `reported_error_${errorMessage.substring(0, 50)}_${window.location.pathname}`;
        const alreadyReported = sessionStorage.getItem(errorKey);
        
        if (alreadyReported) {
            console.log("System Error already reported to helpdesk in this session, skipping email.");
            return;
        }

        sessionStorage.setItem(errorKey, new Date().toISOString());
        
        await fetch('/api/report-error', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                error: {
                    message: errorMessage,
                    stack: error?.stack
                },
                pageUrl: window.location.href,
                user,
                userAction: action
            })
        });
        
        console.log("[RDC GOA] CRITICAL: Error details sent to helpdesk.rdc@paruluniversity.ac.in");
    } catch (reportingError) {
        console.error("Failed to report error to helpdesk:", reportingError);
    }
}
