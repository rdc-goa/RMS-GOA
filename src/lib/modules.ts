

import type { User } from "@/types"

export const ALL_MODULES = [
  { id: "dashboard", label: "Dashboard" },
  { id: "new-submission", label: "New Submission" },
  { id: "my-projects", label: "My Projects" },
  { id: "emr-calendar", label: "EMR Calendar" },
  { id: "incentive-claim", label: "Incentive Claims" },
  { id: "arps-calculator", label: "ARPS Calculator" },
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
  { id: 'post-a-job', label: 'Post a Job' },
  { id: 'recruitment-approvals', label: 'Recruitment Approvals' },
]

const coreModules = ["dashboard", "notifications", "settings", "emr-calendar", "incentive-claim"]
const facultyCoreModules = ["new-submissiogin", "my-projects"]
const hierarchyCoreModules = ["analytics"]

const facultyDefaults = [...coreModules, ...facultyCoreModules]
const croDefaults = [...coreModules, ...facultyCoreModules, "all-projects", "analytics"]
const iqacDefaults = [...coreModules, "all-projects", "analytics"]
const adminDefaults = [...croDefaults, "schedule-meeting", "pending-reviews", "completed-reviews", "emr-management", "manage-incentive-claims"]
const superAdminDefaults = [...adminDefaults, "module-management", "arps-calculator"]

// Default modules for special designations who are otherwise 'faculty' role
const principalDefaults = [...coreModules, ...hierarchyCoreModules, "all-projects"]
const hodDefaults = [...coreModules, ...hierarchyCoreModules, "all-projects"]
const goaHeadDefaults = [...coreModules, ...hierarchyCoreModules, "all-projects"] // Read-only access

export function getDefaultModulesForRole(role: User["role"], designation?: User["designation"]): string[] {
  if (designation === "Head of Goa Campus") {
    return goaHeadDefaults
  }
  
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
