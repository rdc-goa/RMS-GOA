import { reportErrorToHelpdesk } from "@/app/actions";
import { User } from "@/types";

/**
 * Reports a system error to the RDC helpdesk.
 * Specifically targets Firebase index building/missing errors as requested.
 */
export const reportSystemError = async (error: any, user: User | null) => {
    const errorMessage = error?.message || String(error);

    // Always log to console for debugging
    console.error("System Error caught:", errorMessage);

    // If it's a Firebase index error or explicitly requested systematic error
    const isIndexError = errorMessage.toLowerCase().includes("index") || errorMessage.includes("create_composite");
    const isFirebaseError = errorMessage.toLowerCase().includes("firebaseerror");

    if (isIndexError || isFirebaseError) {
        try {
            await reportErrorToHelpdesk(
                {
                    message: errorMessage,
                    stack: error?.stack
                },
                window.location.href,
                user
            );
            console.log("CRITICAL: Error details sent to helpdesk.rdc@paruluniversity.ac.in");
        } catch (reportingError) {
            console.error("Failed to report error to helpdesk:", reportingError);
        }
    }
}
