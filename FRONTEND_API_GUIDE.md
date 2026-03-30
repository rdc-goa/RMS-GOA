# Frontend API Guide: PT Management, Member Attendance, Billing, and RBAC

This document provides comprehensive guidance for frontend developers and AI agents to implement features in the Research & Development Portal. It covers authentication, data structures, API endpoints, and module interactions.

---

## Table of Contents
1. [Authentication & Authorization](#authentication--authorization)
2. [User Data Structure](#user-data-structure)
3. [PT Management (Project Team Management)](#pt-management-project-team-management)
4. [Member Attendance](#member-attendance)
5. [Billing & Payment Management](#billing--payment-management)
6. [Role-Based Access Control (RBAC)](#role-based-access-control-rbac)
7. [Common Error Handling](#common-error-handling)
8. [Development Best Practices](#development-best-practices)

---

## Authentication & Authorization

### Session Management
The application uses Firebase Authentication with localStorage caching for performance.

#### User Data Storage
```typescript
// User data is stored in localStorage after login
const storedUser = localStorage.getItem('user');
const currentUser = storedUser ? JSON.parse(storedUser) : null;

// Always validate user exists before accessing protected resources
if (!currentUser) {
  redirect('/login');
}

// User data is kept in sync with Firebase Firestore
// Location: `users/{firebaseUid}` collection
```

#### Auth Flow
1. User logs in via Firebase Authentication
2. User profile is fetched from Firestore
3. User data is stored in localStorage
4. Dashboard layout loads user and populates sidebar based on `allowedModules`
5. On logout, all user data is cleared from localStorage and sessionStorage

#### Protected Pages
```typescript
// Check if user has access to a page
function isPageAccessible(user: User, moduleId: string): boolean {
  // Check condition attribute for unconditional access
  if (condition === true) return true;
  
  // Special handling for incentive-approvals
  if (moduleId === 'incentive-approvals') {
    return user.designation === 'Principal' || 
           user.allowedModules?.some(m => m.startsWith('incentive-approver-'));
  }
  
  // Standard module check
  return user.allowedModules?.includes(moduleId) || false;
}

// On every protected page, add this check:
useEffect(() => {
  const storedUser = localStorage.getItem('user');
  if (!storedUser) {
    redirect('/login');
  }
  const parsedUser = JSON.parse(storedUser) as User;
  
  // Page-specific access check
  if (!parsedUser.allowedModules?.includes('your-module-id')) {
    redirect('/dashboard');
  }
  setUser(parsedUser);
}, []);
```

---

## User Data Structure

### User Type
```typescript
interface User {
  uid: string                          // Firebase unique ID
  name: string                         // User's full name
  email: string                        // Official email address
  role: "admin" | "faculty" | "CRO" | "Super-admin" | "Evaluator" | "IQAC"
  designation?: "Principal" | "HOD" | "faculty" | string
  campus?: 'Goa'
  faculty?: string                     // Primary faculty affiliation
  institute?: string                   // Institute/College name
  department?: string                  // Department name
  misId?: string                       // University MIS ID
  phoneNumber?: string                 // Contact number
  
  // Public profile fields
  orcidId?: string
  scopusId?: string
  vidwanId?: string
  googleScholarId?: string
  profileComplete?: boolean
  photoURL?: string
  
  // System fields
  allowedModules?: string[]           // Dynamically assigned module access
  sidebarOrder?: string[]             // User's custom sidebar ordering
  hasCompletedTutorial?: boolean
  
  // Bank details (for payment processing)
  bankDetails?: UserBankDetails
  notificationSettings?: NotificationSettings
}

interface UserBankDetails {
  beneficiaryName: string
  accountNumber: string
  bankName: string
  branchName: string
  city: string
  ifscCode: string                     // Format: XXXX0XXXXXX
}
```

### Accessing User Data
```typescript
// Always parse and type-cast
const user = JSON.parse(localStorage.getItem('user') || '{}') as User;

// Check all required fields before using
if (!user.uid || !user.email) {
  // Redirect to login
}

// Get user's modules for feature visibility
const visibleModules = user.allowedModules || [];
const hasPaymentAccess = visibleModules.includes('billing');
```

---

## PT Management (Project Team Management)

### Overview
Project Team (PT) Management handles the creation and management of research project teams, including PIs, Co-PIs, and team members.

### Data Structures

#### CoPi Details
```typescript
interface CoPiDetails {
  uid?: string                         // Firebase UID if registered user
  name: string                         // Co-investigator's name
  email: string                        // Email address
  misId?: string                       // MIS ID for unregistered users
  cvUrl?: string                       // URL to uploaded CV in Firebase Storage
  cvFileName?: string                  // Original filename for display
}

interface Project {
  // ... other fields
  
  // Team information
  pi: string                           // Principal Investigator name
  pi_uid: string                       // PI's Firebase UID
  pi_email?: string
  pi_phoneNumber?: string
  piCvUrl?: string
  
  coPiDetails?: CoPiDetails[]          // Array of Co-investigators
  coPiUids?: string[]                  // Array of Co-investigator UIDs
  
  teamInfo: string                     // Description of team roles
  
  // ... other fields
}
```

### CRUD Operations

#### Creating a Project with Team
```typescript
// Frontend server action
export async function createProject(formData: ProjectFormData) {
  const projectData: Project = {
    title: formData.title,
    pi: formData.piName,
    pi_uid: currentUser.uid,
    pi_email: currentUser.email,
    
    // Add Co-PIs
    coPiDetails: formData.coPis.map(copi => ({
      name: copi.name,
      email: copi.email,
      misId: copi.misId,          // Optional: For unregistered users
      cvUrl: copi.cvUploadUrl,
      cvFileName: copi.cvFileName,
      uid: copi.uid                // If found in system
    })),
    coPiUids: formData.coPis
      .filter(c => c.uid)
      .map(c => c.uid),
    
    teamInfo: formData.teamDescription,
    
    // ... other fields
  };
  
  try {
    // Save to Firestore
    await adminDb.collection('projects').add(projectData);
  } catch (error) {
    console.error('Error creating project:', error);
    throw new Error('Failed to create project');
  }
}
```

#### Frontend: Adding Co-PIs
```typescript
// Component for adding Co-PIs
const [coPis, setCoPis] = useState<CoPiDetails[]>([]);

const handleAddCoPi = async (email: string) => {
  try {
    // Check if user exists in system
    const response = await fetch('/api/check-user-exists', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
    
    const { exists, user: foundUser } = await response.json();
    
    const newCoPi: CoPiDetails = {
      name: foundUser?.name || '',
      email: email,
      uid: foundUser?.uid,
      misId: foundUser?.misId
    };
    
    setCoPis([...coPis, newCoPi]);
  } catch (error) {
    console.error('Error adding co-pi:', error);
  }
};
```

#### Updating Team Members
```typescript
export async function updateProjectTeam(
  projectId: string,
  coPiDetails: CoPiDetails[]
) {
  const projectRef = adminDb.collection('projects').doc(projectId);
  
  await projectRef.update({
    coPiDetails,
    coPiUids: coPiDetails
      .filter(c => c.uid)
      .map(c => c.uid),
    coPiNames: coPiDetails.map(c => c.name),
    coPiEmails: coPiDetails.map(c => c.email),
    updatedAt: new Date().toISOString()
  });
}

return { success: true, message: 'Team updated successfully' };
```

#### Fetching Project Teams
```typescript
// Get all team members for a project
export async function getProjectTeam(projectId: string) {
  const projectRef = adminDb.collection('projects').doc(projectId);
  const projectSnap = await projectRef.get();
  
  if (!projectSnap.exists) {
    throw new Error('Project not found');
  }
  
  const project = projectSnap.data() as Project;
  
  return {
    pi: {
      name: project.pi,
      uid: project.pi_uid,
      email: project.pi_email
    },
    coPis: project.coPiDetails || [],
    teamInfo: project.teamInfo
  };
}
```

### Frontend Components

#### Team Input Component
```typescript
// Features to implement:
// 1. Search for existing users by email
// 2. Allow adding unregistered users with MIS ID
// 3. Upload CV for each team member
// 4. Display member list with edit/delete options
// 5. Auto-fetch user details if found in system

interface TeamMemberInputProps {
  onMembersChange: (members: CoPiDetails[]) => void;
  initialMembers?: CoPiDetails[];
  disabled?: boolean;
}

export function TeamMemberInput({ onMembersChange, initialMembers = [], disabled }: TeamMemberInputProps) {
  const [members, setMembers] = useState<CoPiDetails[]>(initialMembers);
  const [searchEmail, setSearchEmail] = useState('');
  
  // Implement search functionality
  // Implement CV upload to Firebase Storage
  // Implement member addition/removal
  
  return (
    // JSX for team member management
  );
}
```

---

## Member Attendance

### Overview
Attendance tracking for IMR (Intramural Research) and EMR (Extramural Research) evaluation meetings.

### Data Structures

#### Attendance Records
```typescript
interface MeetingDetails {
  date: string                         // yyyy-MM-dd format
  time?: string                        // HH:mm format
  venue: string                        // Meeting location
  assignedEvaluators?: string[]       // UIDs of assigned evaluators
  absentEvaluators?: string[]         // UIDs of absent evaluators
}

interface Project {
  // ... other fields
  meetingDetails?: MeetingDetails
  wasAbsent?: boolean                 // PI's absence status
  // ... other fields
}

interface EmrInterest {
  // ... other fields
  assignedEvaluators?: string[]
  evaluatedBy?: string[]
  wasAbsent?: boolean
  meetingSlot?: {
    date: string
    time: string
    pptDeadline: string              // ISO string
  }
  // ... other fields
}
```

### Marking Attendance

#### IMR Attendance
```typescript
export async function markImrAttendance(projectId: string, params: {
  absentPiUids: string[]
  absentEvaluatorUids: string[]
}): Promise<{ success: boolean; error?: string }> {
  try {
    const projectRef = adminDb.collection('projects').doc(projectId);
    const projectSnap = await projectRef.get();
    
    if (!projectSnap.exists) {
      return { success: false, error: 'Project not found' };
    }
    
    const project = projectSnap.data() as Project;
    
    // Update PI absence status
    const isPiAbsent = params.absentPiUids.includes(project.pi_uid);
    
    // Update evaluator absence
    const absentEvaluators = params.absentEvaluatorUids || [];
    
    await projectRef.update({
      wasAbsent: isPiAbsent,
      'meetingDetails.absentEvaluators': absentEvaluators,
      updatedAt: new Date().toISOString()
    });
    
    // Log the activity
    await logActivity('INFO', 'IMR meeting attendance marked', {
      projectId,
      absentPis: params.absentPiUids.length,
      absentEvaluators: absentEvaluators.length
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error marking IMR attendance:', error);
    return { success: false, error: 'Failed to update attendance' };
  }
}
```

#### EMR Attendance
```typescript
export async function markEmrAttendance(
  callId: string,
  absentApplicantIds: string[],
  absentEvaluatorUids: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get all interests for this call
    const interestsQuery = adminDb
      .collection('emrInterests')
      .where('callId', '==', callId);
    
    const interestsSnap = await interestsQuery.get();
    
    // Update each interest with absence info
    const batch = adminDb.batch();
    
    interestsSnap.forEach(doc => {
      const interest = doc.data() as EmrInterest;
      const isApplicantAbsent = absentApplicantIds.includes(interest.userId);
      
      batch.update(doc.ref, {
        wasAbsent: isApplicantAbsent,
        'meetingSlot.absentEvaluators': absentEvaluatorUids,
        updatedAt: new Date().toISOString()
      });
    });
    
    await batch.commit();
    
    // Log activity
    await logActivity('INFO', 'EMR meeting attendance marked', {
      callId,
      absentApplicants: absentApplicantIds.length,
      absentEvaluators: absentEvaluatorUids.length
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error marking EMR attendance:', error);
    return { success: false, error: 'Failed to update attendance' };
  }
}
```

### Frontend: Attendance Dialog

```typescript
interface AttendanceDialogProps {
  meetingDate: string
  participants: User[]
  evaluators: User[]
  onSubmit: (absentParticipants: string[], absentEvaluators: string[]) => void;
}

export function AttendanceDialog({
  meetingDate,
  participants,
  evaluators,
  onSubmit
}: AttendanceDialogProps) {
  const [absentParticipants, setAbsentParticipants] = useState<string[]>([]);
  const [absentEvaluators, setAbsentEvaluators] = useState<string[]>([]);
  
  // Features:
  // 1. Display participant and evaluator lists
  // 2. Allow marking individuals as absent with checkbox
  // 3. Show attendance count summary
  // 4. Require confirmation before submission
  // 5. Submit via server action
  
  const handleSubmit = () => {
    onSubmit(absentParticipants, absentEvaluators);
  };
  
  return (
    <Dialog>
      <DialogHeader>
        <DialogTitle>Mark Attendance - {meetingDate}</DialogTitle>
      </DialogHeader>
      
      {/* Participant list */}
      {/* Evaluator list */}
      {/* Submit button */}
    </Dialog>
  );
}
```

### Attendance Status Queries

```typescript
// Get attendance records for a project
export async function getProjectAttendance(projectId: string) {
  const projectRef = adminDb.collection('projects').doc(projectId);
  const projectSnap = await projectRef.get();
  
  const project = projectSnap.data() as Project;
  
  return {
    meeting: project.meetingDetails,
    piAbsent: project.wasAbsent,
    absentEvaluators: project.meetingDetails?.absentEvaluators || [],
    presentEvaluators: (project.meetingDetails?.assignedEvaluators || [])
      .filter(uid => !(project.meetingDetails?.absentEvaluators || []).includes(uid))
  };
}

// Get attendance for EMR call
export async function getEmrCallAttendance(callId: string) {
  const interestsQuery = adminDb
    .collection('emrInterests')
    .where('callId', '==', callId);
  
  const interestsSnap = await interestsQuery.get();
  
  const attendance = interestsSnap.docs.map(doc => {
    const interest = doc.data() as EmrInterest;
    return {
      interestId: interest.id,
      applicantName: interest.userName,
      absent: interest.wasAbsent || false,
      absentEvaluators: interest.meetingSlot?.absentEvaluators || []
    };
  });
  
  return attendance;
}
```

---

## Billing & Payment Management

### Overview
Billing module handles payment management, invoicing, and financial tracking for grants and incentive claims.

### Data Structures

#### Bank Details
```typescript
interface UserBankDetails {
  beneficiaryName: string              // Name on bank account
  accountNumber: string                // Account number (min 5 chars)
  bankName: string                     // Bank name dropdown
  branchName: string                   // Branch name
  city: string                         // City where branch is located
  ifscCode: string                     // IFSC code (format: XXXX0XXXXXX)
}

interface BankDetails {
  accountHolderName: string
  accountNumber: string
  bankName: string
  ifscCode: string
  branchName: string
  city: string
}
```

#### Transaction
```typescript
interface Transaction {
  id: string                           // Unique transaction ID
  phaseId: string                      // Link to grant phase
  dateOfTransaction: string            // ISO string
  amount: number
  vendorName: string
  isGstRegistered: boolean
  gstNumber?: string                   // If GST registered
  invoiceUrl?: string                  // Firebase Storage URL
  description: string
  isDraft?: boolean
}

interface GrantPhase {
  id: string
  name: string
  amount: number
  status: "Pending Disbursement" | "Disbursed" | "Utilization Submitted" | "Completed"
  disbursementDate?: string            // ISO string
  transactions?: Transaction[]
  utilizationSubmissionDate?: string   // ISO string
}

interface GrantDetails {
  totalAmount: number
  sanctionNumber?: string
  status: "Awarded" | "In Progress" | "Completed"
  bankDetails?: BankDetails
  phases: GrantPhase[]
}
```

#### Incentive Claim (Payment-related fields)
```typescript
interface IncentiveClaim {
  // ... other fields
  
  // Payment tracking
  status: "Draft" | "Pending" | "Accepted" | "Rejected" | 
          "Pending Principal Approval" | 
          "Pending Stage 2 Approval" | 
          "Pending Stage 3 Approval" | 
          "Pending Stage 4 Approval" | 
          "Pending Stage 5 Approval" | 
          "Submitted to Accounts" | "Payment Completed"
  
  bankDetails?: UserBankDetails
  finalApprovedAmount?: number
  calculatedIncentive?: number
  
  paymentSheetRef?: string             // Reference to payment sheet
  paymentSheetRemarks?: string
  
  // ... other fields
}
```

### Payment Flow

#### 1. User Submits Bank Details
```typescript
// User bank details are stored in User document
export async function updateUserBankDetails(
  userId: string,
  bankDetails: UserBankDetails
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate IFSC code format
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    if (!ifscRegex.test(bankDetails.ifscCode)) {
      return { success: false, error: 'Invalid IFSC code format' };
    }
    
    const userRef = adminDb.collection('users').doc(userId);
    
    await userRef.update({
      bankDetails: {
        beneficiaryName: bankDetails.beneficiaryName,
        accountNumber: bankDetails.accountNumber,
        bankName: bankDetails.bankName,
        branchName: bankDetails.branchName,
        city: bankDetails.city,
        ifscCode: bankDetails.ifscCode
      }
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error updating bank details:', error);
    return { success: false, error: 'Failed to update bank details' };
  }
}
```

#### 2. Project Grant Disbursement
```typescript
// Create grant phases for a sanctioned project
export async function createGrantPhases(
  projectId: string,
  phases: { name: string; amount: number }[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const projectRef = adminDb.collection('projects').doc(projectId);
    
    const totalAmount = phases.reduce((sum, p) => sum + p.amount, 0);
    
    const grantDetails: GrantDetails = {
      totalAmount,
      status: 'Awarded',
      phases: phases.map((phase, index) => ({
        id: `phase-${Date.now()}-${index}`,
        name: phase.name,
        amount: phase.amount,
        status: 'Pending Disbursement',
        transactions: [],
        disbursementDate: new Date().toISOString()
      }))
    };
    
    await projectRef.update({
      grant: grantDetails,
      status: 'Sanctioned'
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error creating grant phases:', error);
    return { success: false, error: 'Failed to create grant phases' };
  }
}
```

#### 3. Transaction Recording (Utilization)
```typescript
export async function addTransaction(
  projectId: string,
  phaseId: string,
  transaction: Omit<Transaction, 'id'>
): Promise<{ success: boolean; error?: string }> {
  try {
    const projectRef = adminDb.collection('projects').doc(projectId);
    const projectSnap = await projectRef.get();
    
    const project = projectSnap.data() as Project;
    const phase = project.grant?.phases?.find(p => p.id === phaseId);
    
    if (!phase) {
      return { success: false, error: 'Phase not found' };
    }
    
    // Check if transaction amount exceeds phase amount
    const usedAmount = (phase.transactions || [])
      .reduce((sum, t) => sum + t.amount, 0);
    
    if (usedAmount + transaction.amount > phase.amount) {
      return {
        success: false,
        error: `Transaction amount exceeds phase budget. Remaining: ${phase.amount - usedAmount}`
      };
    }
    
    // Create transaction with ID
    const newTransaction: Transaction = {
      id: `txn-${Date.now()}`,
      phaseId,
      dateOfTransaction: transaction.dateOfTransaction,
      amount: transaction.amount,
      vendorName: transaction.vendorName,
      isGstRegistered: transaction.isGstRegistered,
      gstNumber: transaction.gstNumber,
      invoiceUrl: transaction.invoiceUrl,
      description: transaction.description,
      isDraft: transaction.isDraft || false
    };
    
    // Update phase with transaction
    const updatedPhases = project.grant!.phases!.map(p => {
      if (p.id === phaseId) {
        return {
          ...p,
          transactions: [...(p.transactions || []), newTransaction]
        };
      }
      return p;
    });
    
    await projectRef.update({
      'grant.phases': updatedPhases
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error adding transaction:', error);
    return { success: false, error: 'Failed to add transaction' };
  }
}
```

#### 4. Invoice Upload
```typescript
// Handle invoice file upload to Firebase Storage
export async function uploadInvoice(
  projectId: string,
  transactionId: string,
  file: File
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const bucket = storage.bucket();
    const fileName = `invoices/${projectId}/${transactionId}-${file.name}`;
    
    const blob = bucket.file(fileName);
    
    await blob.save(Buffer.from(await file.arrayBuffer()), {
      metadata: {
        contentType: file.type
      }
    });
    
    // Get signed URL (valid for 365 days)
    const [url] = await blob.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 365 * 24 * 60 * 60 * 1000
    });
    
    return { success: true, url };
  } catch (error) {
    console.error('Error uploading invoice:', error);
    return { success: false, error: 'Failed to upload invoice' };
  }
}
```

### Frontend: Payment Components

#### Bank Details Form
```typescript
const bankSchema = z.object({
  beneficiaryName: z.string().min(2, 'Beneficiary name required'),
  accountNumber: z.string().min(5, 'Valid account number required'),
  bankName: z.string().min(1, 'Please select a bank'),
  branchName: z.string().min(2, 'Branch name required'),
  city: z.string().min(2, 'City required'),
  ifscCode: z.string()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code format')
});

export function BankDetailsForm() {
  // Implementation:
  // 1. Dropdown for bank selection
  // 2. IFSC code validation on blur
  // 3. Account number formatting (no validation, just storage)
  // 4. Save to user document
  // 5. Show success/error messages
  
  return (
    // Form JSX
  );
}
```

#### Transaction/Billing Management
```typescript
interface BillingPageProps {
  projectId: string;
}

export function BillingPage({ projectId }: BillingPageProps) {
  // Features:
  // 1. Display all grant phases
  // 2. Show phase-wise budget allocation
  // 3. Display transactions added per phase
  // 4. Calculate remaining budget per phase
  // 5. Add new transactions with invoice upload
  // 6. View transaction history
  // 7. Generate utilization reports
  
  return (
    // Grant phase cards
    // Transaction table
    // Add transaction form
  );
}
```

### Billing Queries

```typescript
// Get project billing summary
export async function getProjectBillingSummary(projectId: string) {
  const projectRef = adminDb.collection('projects').doc(projectId);
  const projectSnap = await projectRef.get();
  
  const project = projectSnap.data() as Project;
  const grant = project.grant;
  
  if (!grant) {
    return null;
  }
  
  return {
    totalGrantAmount: grant.totalAmount,
    status: grant.status,
    phases: grant.phases?.map(phase => ({
      id: phase.id,
      name: phase.name,
      allocatedAmount: phase.amount,
      status: phase.status,
      usedAmount: (phase.transactions || [])
        .filter(t => !t.isDraft)
        .reduce((sum, t) => sum + t.amount, 0),
      remainingAmount: phase.amount - 
        (phase.transactions || [])
          .filter(t => !t.isDraft)
          .reduce((sum, t) => sum + t.amount, 0),
      transactions: phase.transactions?.length || 0
    })) || []
  };
}

// Get all transactions for a phase
export async function getPhaseTransactions(projectId: string, phaseId: string) {
  const projectRef = adminDb.collection('projects').doc(projectId);
  const projectSnap = await projectRef.get();
  
  const project = projectSnap.data() as Project;
  const phase = project.grant?.phases?.find(p => p.id === phaseId);
  
  return phase?.transactions || [];
}
```

---

## Role-Based Access Control (RBAC)

### Overview
The RBAC system uses a combination of fixed roles and dynamically assigned module permissions to control feature access.

### Role Hierarchy

```
Super-admin (Full access to everything)
├── Admin (System administration, user management)
├── CRO (Faculty-level oversight, project management)
├── Faculty (Project submission, profile management)
├── Evaluator (Project evaluation)
├── Principal (Class-wise oversight + approval duties)
└── IQAC (Quality assurance)
```

### Module Permission System

#### Module IDs
```typescript
// Available module IDs for allowedModules array:
const AVAILABLE_MODULES = [
  'dashboard',
  'new-submission',
  'my-projects',
  'emr-calendar',
  'incentive-claim',
  'post-a-job',
  'recruitment-approvals',
  'arps-calculator',
  'incentive-approvals',                    // Special: Principals get automatic access
  'evaluator-dashboard',
  'my-evaluations',
  'emr-evaluations',
  'schedule-meeting',
  'pending-reviews',
  'completed-reviews',
  'all-projects',
  'emr-management',
  'analytics',
  'manage-users',
  'manage-incentive-claims',
  'bulk-upload',
  'bulk-upload-papers',
  'bulk-upload-emr',
  'bulk-upload-incentives',
  'module-management',
  'notifications',
  'settings',
  // Special modules for approvals
  'incentive-approver-2',                   // Stage 2 approver
  'incentive-approver-3',                   // Stage 3 approver
  'incentive-approver-4',                   // Stage 4 approver
  'incentive-approver-5'                    // Stage 5 approver
];
```

#### Default Modules by Role
```typescript
function getDefaultModulesForRole(role: User['role'], designation?: string): string[] {
  const baseModules = [
    'dashboard',
    'notifications',
    'settings'
  ];
  
  switch (role) {
    case 'faculty':
      return [
        ...baseModules,
        'new-submission',
        'my-projects',
        'emr-calendar',
        'incentive-claim',
        'arps-calculator'
      ];
      
    case 'admin':
      return [
        ...baseModules,
        'all-projects',
        'manage-users',
        'schedule-meeting',
        'manage-incentive-claims'
      ];
      
    case 'CRO':
      return [
        ...baseModules,
        'all-projects',
        'schedule-meeting',
        'manage-users',
        'analytics',
        'pending-reviews',
        'completed-reviews'
      ];
      
    case 'Super-admin':
      // Has access to all modules
      return Object.values(AVAILABLE_MODULES);
      
    case 'Evaluator':
      return [
        ...baseModules,
        'evaluator-dashboard',
        'pending-reviews'
      ];
      
    case 'IQAC':
      return [
        ...baseModules,
        'analytics',
        'manage-incentive-claims'
      ];
      
    default:
      return baseModules;
  }
}
```

### Assigning Module Permissions

#### Frontend: Module Management Page
```typescript
// Location: dashboard/module-management/page.tsx

interface ModuleManagementPageProps {
  searchUser: User;
}

export function ModuleManagementPage() {
  // Features:
  // 1. Super-admin only access check
  // 2. Search for users by name/email
  // 3. Display user's current modules
  // 4. Toggle module access with checkboxes
  // 5. Show special modules (incentive-approver-X)
  // 6. Save changes to Firestore
  // 7. Notify user of changes via email
  
  return (
    // User search input
    // Module checkbox list
    // Save button
  );
}
```

#### Backend: Module Permission Updates
```typescript
export async function updateUserModules(
  userId: string,
  moduleIds: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate all module IDs exist
    const invalidModules = moduleIds.filter(
      id => !AVAILABLE_MODULES.includes(id)
    );
    
    if (invalidModules.length > 0) {
      return {
        success: false,
        error: `Invalid modules: ${invalidModules.join(', ')}`
      };
    }
    
    const userRef = adminDb.collection('users').doc(userId);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
      return { success: false, error: 'User not found' };
    }
    
    const user = userSnap.data() as User;
    
    // Update modules
    await userRef.update({
      allowedModules: moduleIds
    });
    
    // Log the change
    await logActivity('INFO', 'User modules updated', {
      userId,
      userName: user.name,
      modules: moduleIds.join(', ')
    });
    
    // Send email notification
    await sendEmail({
      to: user.email,
      subject: 'Your Portal Access Has Been Updated',
      template: 'module-update',
      data: {
        userName: user.name,
        modules: moduleIds
      }
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error updating user modules:', error);
    return { success: false, error: 'Failed to update modules' };
  }
}
```

### Checking Permissions

#### Frontend Access Check
```typescript
// In any protected page
export function ProtectedPage() {
  const [user, setUser] = useState<User | null>(null);
  
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      redirect('/login');
    }
    
    const parsedUser = JSON.parse(storedUser) as User;
    
    // Check module access
    const requiredModule = 'manage-users';
    const hasAccess = parsedUser.allowedModules?.includes(requiredModule);
    
    if (!hasAccess && parsedUser.role !== 'Super-admin') {
      // Show access denied message
      redirect('/dashboard');
    }
    
    setUser(parsedUser);
  }, []);
  
  if (!user) {
    return <LoadingSpinner />;
  }
  
  return <PageContent />;
}
```

#### Component-Level Feature Flags
```typescript
interface FeatureVisibilityProps {
  user: User;
}

export function FeatureFlag(
  { requiredModules, requiredRoles, children }: 
  { requiredModules?: string[]; requiredRoles?: User['role'][]; children: React.ReactNode }
) {
  const user = JSON.parse(localStorage.getItem('user') || '{}') as User;
  
  const hasModuleAccess = !requiredModules || 
    requiredModules.some(m => user.allowedModules?.includes(m));
    
  const hasRoleAccess = !requiredRoles || 
    requiredRoles.includes(user.role);
  
  if (!hasModuleAccess || !hasRoleAccess) {
    return null;
  }
  
  return <>{children}</>;
}

// Usage:
<FeatureFlag requiredModules={['analytics']}>
  <AnalyticsButton />
</FeatureFlag>

<FeatureFlag requiredRoles={['Super-admin', 'admin']}>
  <AdminPanel />
</FeatureFlag>
```

### Special Access Cases

#### Principals' Incentive Approvals
```typescript
// Principals automatically get access to incentive-approvals
// even without the 'incentive-approvals' module

function hasApprovalAccess(user: User): boolean {
  const hasPrincipalStatus = user.designation === 'Principal';
  const hasApproverModule = user.allowedModules?.some(m => 
    m.startsWith('incentive-approver-')
  );
  
  return hasPrincipalStatus || !!hasApproverModule;
}

// Stage determination for approvers
function getApprovalStage(user: User): number | null {
  if (user.designation === 'Principal') {
    return 0; // Stage 1 (Principal is always Stage 1)
  }
  
  const approverModule = user.allowedModules?.find(
    m => m.startsWith('incentive-approver-')
  );
  
  if (!approverModule) return null;
  
  // Extract stage from module name: incent
ive-approver-2 -> 2 -> returns 1 (0-indexed)
  return parseInt(approverModule.split('-')[2]) - 1;
}
```

---

## Common Error Handling

### Frontend Error Handling Pattern
```typescript
export default function Page() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const handleAction = async () => {
    setError(null);
    setLoading(true);
    
    try {
      const result = await someServerAction();
      
      if (!result.success) {
        setError(result.error || 'An error occurred');
        return;
      }
      
      toast({ title: 'Success!' });
    } catch (error) {
      console.error('Error:', error);
      setError(error instanceof Error ? error.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <>
      {error && <ErrorAlert message={error} />}
      {/* Page content */}
    </>
  );
}
```

### Server Action Error Returns
```typescript
interface ActionResult<T = void> {
  success: boolean;
  error?: string;
  data?: T;
}

// All server actions should follow this pattern:
export async function myAction(params: any): Promise<ActionResult> {
  try {
    // Perform action
    return { success: true };
  } catch (error) {
    console.error('Error:', error);
    
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    
    return { success: false, error: 'An unexpected error occurred' };
  }
}
```

### Common Error Messages
```typescript
const ERROR_MESSAGES = {
  UNAUTHORIZED: 'You do not have permission to perform this action',
  NOT_FOUND: 'The requested resource was not found',
  INVALID_INPUT: 'Please check your input and try again',
  NETWORK_ERROR: 'Network error. Please check your connection',
  UPLOAD_FAILED: 'File upload failed. Please try again',
  FILE_TOO_LARGE: 'File is too large. Maximum allowed size is 10MB',
  INVALID_FILE_TYPE: 'Invalid file type. Please upload a valid file'
};
```

---

## Development Best Practices

### Component Organization
```
src/
├── app/
│   ├── dashboard/
│   │   ├── pt-management/
│   │   ├── attendance/
│   │   ├── billing/
│   │   └── module-management/
│   └── [actions.ts, server files]
├── components/
│   ├── common/
│   ├── pt-management/
│   ├── attendance/
│   ├── billing/
│   └── rbac/
└── types/
    └── index.ts
```

### Type Safety
```typescript
// Always use types from src/types/index.ts
import type { User, Project, Transaction } from '@/types';

// Avoid 'any' type
❌ const user: any = data;
✅ const user: User = data;

// Type server action parameters
export async function myAction(
  projectId: string,
  data: { name: string; amount: number }
): Promise<ActionResult>
```

### Firebase Best Practices
```typescript
// Use batch writes for multiple updates
const batch = adminDb.batch();

updates.forEach(update => {
  const docRef = adminDb.collection(update.collection).doc(update.id);
  batch.update(docRef, update.data);
});

await batch.commit();

// Always validate Firestore responses
const docSnap = await adminDb.collection('users').doc(userId).get();

if (!docSnap.exists) {
  throw new Error(`User ${userId} not found`);
}

const user = docSnap.data() as User;
```

### Logging
```typescript
// Use logActivity for important operations
import { logActivity } from '@/app/actions';

await logActivity('INFO', 'User created new project', {
  userId: currentUser.uid,
  projectTitle: project.title,
  timestamp: new Date().toISOString()
});

// For errors
await logActivity('ERROR', 'Payment processing failed', {
  projectId,
  error: error.message
});
```

### Testing Checklist
- [ ] User authentication works
- [ ] Module permissions are correctly enforced
- [ ] All CRUD operations succeed and fail gracefully
- [ ] File uploads work and store URLs correctly
- [ ] Firebase queries use proper indices
- [ ] Error messages are user-friendly
- [ ] All redirects work on access denial
- [ ] Timestamps are in ISO format
- [ ] Batch operations don't exceed limits
- [ ] Email notifications send on important events

---

## API Endpoint Reference

### User Management
- `POST /api/check-user-exists` - Verify if user exists by email
- `GET /api/get-staff-name` - Get staff/user details by MIS ID
- `POST /dashboard/manage-users` - Update user roles/modules (admin only)

### File Operations
- `POST /api/upload` - Upload files to Firebase Storage
- `GET /api/get-research-papers` - Fetch research papers

### Project Operations
- Project CRUD via server actions in `src/app/actions.ts`
- EMR operations via `src/app/emr-actions.ts`

### System Operations
- `POST /api/cron/*` - Background tasks
- `POST /dashboard/settings` - Update system settings (Super-admin only)

---

## Contact & Support

For questions or issues, refer to:
- Backend source code: `src/app/*-actions.ts`
- Type definitions: `src/types/index.ts`
- UI Components: `src/components/`
- Firebase documentation: https://firebase.google.com/docs

Last Updated: March 2026
