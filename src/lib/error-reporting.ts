import { reportErrorToHelpdesk } from "@/app/actions";
import { User } from "@/types";

/**
 * Reports a system error to the RDC helpdesk.
 * Specifically targets Firebase index building/missing errors as requested.
 */
export const reportSystemError = async (error: any, user: User | null, action?: string) => {
    const errorMessage = error?.message || String(error);
    
    // Always log to console for debugging
    console.error("System Error caught:", errorMessage);

    try {
        // Deduplication logic using sessionStorage
        const errorKey = `reported_error_${errorMessage.substring(0, 50)}_${window.location.pathname}`;
        const alreadyReported = sessionStorage.getItem(errorKey);
        
        if (alreadyReported) {
            console.log("System Error already reported to helpdesk in this session, skipping email.");
            return;
        }

        sessionStorage.setItem(errorKey, new Date().toISOString());
        
        await reportErrorToHelpdesk(
            { 
                message: errorMessage, 
                stack: error?.stack 
            },
            window.location.href,
            user,
            action
        );
        
        console.log("[RDC GOA] CRITICAL: Error details sent to helpdesk.rdc@paruluniversity.ac.in");
    } catch (reportingError) {
        console.error("Failed to report error to helpdesk:", reportingError);
    }
}
