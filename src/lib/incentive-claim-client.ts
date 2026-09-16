import { auth } from "@/lib/config";
import type { IncentiveClaim } from "@/types";

export async function submitIncentiveClaimViaApi(
  claimData: Omit<IncentiveClaim, "id" | "claimId">,
  claimIdToUpdate?: string
): Promise<{ success: boolean; error?: string; claimId?: string }> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: "User not authenticated" };
    }

    const token = await user.getIdToken();
    
    const payload = { claimData, claimIdToUpdate };
    const jsonString = JSON.stringify(payload);
    
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    };

    // Always send data - no compression complexity
    const response = await fetch("/api/incentive-claims", {
      method: "POST",
      headers,
      body: jsonString,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      let errorMessage = errorData.error || errorData.message || `Request failed with status ${response.status}`;
      if (errorMessage.toLowerCase().includes("invalid or expired token") || errorMessage.toLowerCase().includes("expired token")) {
        errorMessage = "Invalid or expired token. Please log out of the portal and login again.";
      }
      return { success: false, error: errorMessage };
    }

    const result = await response.json();
    if (result.error && (result.error.toLowerCase().includes("invalid or expired token") || result.error.toLowerCase().includes("expired token"))) {
      result.error = "Invalid or expired token. Please log out of the portal and login again.";
    }
    return {
      success: result.success ?? true,
      claimId: result.claimId,
      error: result.error,
    };
  } catch (error: any) {
    let errorMessage = error?.message || "Failed to submit claim";
    if (errorMessage.toLowerCase().includes("invalid or expired token") || errorMessage.toLowerCase().includes("expired token")) {
      errorMessage = "Invalid or expired token. Please log out of the portal and login again.";
    }
    return { success: false, error: errorMessage };
  }
}
