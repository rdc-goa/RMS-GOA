
import type { User } from "@/types"

export const ALL_MODULES = [
  { id: "dashboard", label: "Dashboard" },
  { id: "ai-chat", label: "AI Chat Agent" },
  { id: "new-submission", label: "New Submission" },
  { id: "my-projects", label: "My Projects" },
  { id: "emr-calendar", label: "EMR Calendar" },
  { id: "incentive-claim", label: "Incentive Claims" },
  { id: "incentive-approvals", label: "Incentive Approvals" },
  { id: "evaluator-dashboard", label: "Evaluation Queue" },
  { id: "my-evaluations", label: "My IMR Evaluations" },
  { id: "emr-evaluations", label: "EMR Evaluations" },
  { id: "schedule-meeting", label: "Schedule Meeting" },
  { id: "pending-reviews", label: "Pending Reviews" },
  { id: "completed-reviews", label: "Completed Reviews" },
  { id: "all-projects", label: "All Projects" },
  { id: "emr-management", label: "EMR Management" },
  { id: "analytics", label: "Analytics" },
  { id: "manage-users", label: "Manage Users" },
  { id: "manage-incentive-claims", label: "Manage Incentive Claims" },
  { id: "bulk-upload", label: "Bulk Upload Projects" },
  { id: "bulk-upload-papers", label: "Bulk Upload Papers" },
  { id: "bulk-upload-emr", label: "Bulk Upload EMR Projects" },
  { id: "bulk-upload-incentives", label: "Bulk Upload Incentives" },
  { id: "module-management", label: "Module Management" },
  { id: "notifications", label: "Notifications" },
  { id: "settings", label: "Settings" },
]

const coreModules = ["dashboard", "notifications", "settings", "emr-calendar"]
const facultyCoreModules = ["new-submission", "my-projects"]
const hierarchyCoreModules = ["analytics"]

const facultyDefaults = [...coreModules, ...facultyCoreModules, "incentive-claim"]
const croDefaults = [...coreModules, ...facultyCoreModules, "all-projects", "analytics", "incentive-claim"]
const iqacDefaults = [...coreModules, "all-projects", "analytics"]
const adminDefaults = [...croDefaults, "schedule-meeting", "pending-reviews", "completed-reviews", "emr-management", "manage-incentive-claims"]
const superAdminDefaults = [...adminDefaults, "module-management"]

// Default modules for special designations who are otherwise 'faculty' role
const principalDefaults = [...coreModules, ...hierarchyCoreModules, "all-projects"]
const hodDefaults = [...coreModules, ...hierarchyCoreModules, "all-projects"]

export function getDefaultModulesForRole(role: User["role"], designation?: User["designation"]): string[] {
  
  if (role === "faculty") {
    if (designation === "Principal") {
      return principalDefaults
    }
    if (designation === "HOD") {
      return hodDefaults
    }
    return facultyDefaults
  }

  if (role === "Evaluator") {
    return [...coreModules, "evaluator-dashboard", "my-evaluations", "emr-evaluations"]
  }
  
  if (role === 'IQAC') {
      return iqacDefaults;
  }

  switch (role) {
    case "CRO":
      return croDefaults
    case "admin":
      return [...adminDefaults, "emr-evaluations"]
    case "Super-admin":
      return [...superAdminDefaults, "emr-evaluations"]
    default:
      return coreModules
  }
}
