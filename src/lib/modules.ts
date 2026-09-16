import type { User } from "@/types"

export const ALL_MODULES = [
  { id: "dashboard", label: "Dashboard" },
  { id: "new-submission", label: "New Submission" },
  { id: "my-projects", label: "My Projects" },
  { id: "call-for-proposals", label: "Call For Proposals" },
  { id: "manage-cfp-submissions", label: "Manage CFP Submissions" },
  { id: "cfp-evaluations", label: "CFP Evaluations Queue" },
  { id: "emr-calendar", label: "EMR Calendar" },
  { id: "incentive-claim", label: "Incentive Claims" },
  { id: "conference-participation", label: "Conference Participation" },
  { id: "manage-conference-participation", label: "Manage Conference Participation" },
  { id: "equipment-booking", label: "Equipment Booking" },
  { id: "my-equipment-bookings", label: "My Equipment Bookings" },
  { id: "manage-equipment-bookings", label: "Manage Equipment Bookings" },
  { id: "arps-calculator", label: "ARPS Calculator" },
  { id: "arps-submission", label: "ARPS Submissions" },
  { id: "arps-approvals", label: "ARPS Approvals" },
  { id: "manage-arps-submissions", label: "Manage ARPS" },
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
  { id: "module-management", label: "Module Management" },
  { id: "notifications", label: "Notifications" },
  { id: "settings", label: "Settings" },
  { id: "system-analytics", label: "System Analytics" },
  { id: "logs", label: "System Logs" },
  { id: 'post-a-job', label: 'Post a Job' },
  { id: 'recruitment-approvals', label: 'Recruitment Approvals' },
  { id: 'lab-consumables', label: 'Lab Consumables' },
  { id: 'manage-lab-consumables', label: 'Manage Lab Consumables' },
]

const coreModules = ["dashboard", "notifications", "settings", "emr-calendar", "incentive-claim", "call-for-proposals"]
const facultyCoreModules = ["new-submission", "my-projects"]
const hierarchyCoreModules = ["analytics"]

const facultyDefaults = [...coreModules, ...facultyCoreModules, "arps-submission", "arps-calculator"]
const croDefaults = [...coreModules, ...facultyCoreModules, "all-projects", "analytics", "arps-submission", "arps-approvals", "arps-calculator"]
const iqacDefaults = [...coreModules, "all-projects", "analytics"]
const adminDefaults = [
  ...croDefaults,
  "schedule-meeting",
  "pending-reviews",
  "completed-reviews",
  "emr-management",
  "manage-incentive-claims",
  "manage-lab-consumables",
  "manage-equipment-bookings",
  "manage-cfp-submissions",
  "cfp-evaluations",
  "manage-conference-participation"
]
const superAdminDefaults = [...adminDefaults, "module-management", "manage-arps-submissions", "system-analytics", "logs"]

// Default modules for special designations who are otherwise 'faculty' role
const principalDefaults = [...coreModules, ...hierarchyCoreModules, "all-projects", "manage-conference-participation"]
const hodDefaults = [...coreModules, ...hierarchyCoreModules, "all-projects", "manage-conference-participation"]
const goaHeadDefaults = [...coreModules, ...hierarchyCoreModules, "all-projects"] // Read-only access

export function getDefaultModulesForRole(role: User["role"], designation?: User["designation"]): string[] {
  if (designation === "CRO Evaluator" || designation === "Guest Faculty" || designation === "Guest Evaluator") {
    return ["dashboard", "notifications", "settings", "evaluator-dashboard", "cfp-evaluations"]
  }

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
    return [...coreModules, "evaluator-dashboard", "my-evaluations", "emr-evaluations", "cfp-evaluations"]
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
