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
      const errorMessage = errorData.error || errorData.message || `Request failed with status ${response.status}`;
      return { success: false, error: errorMessage };
    }

    const result = await response.json();
    return {
      success: result.success ?? true,
      claimId: result.claimId,
      error: result.error,
    };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to submit claim" };
  }
}
