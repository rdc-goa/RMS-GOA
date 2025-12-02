
export type CoPiDetails = {
  uid?: string | null // Will exist for registered users
  name: string
  email: string
  misId?: string; // Stored when adding an unregistered user by MIS ID
  cvUrl?: string // URL to the uploaded CV
  cvFileName?: string // Original filename for display
}

export type UserBankDetails = {
  bankName: string
  accountNumber: string
  beneficiaryName: string
  city: string
  branchName: string
  ifscCode: string
}

export type NotificationSettings = {
  [key: string]: {
    inApp: boolean;
    email: boolean;
  }
}

export type User = {
  uid: string
  name: string
  email: string
  role: "admin" | "faculty" | "CRO" | "Super-admin" | "Evaluator" | "IQAC"
  designation?: "Principal" | "HOD" | "Super-admin" | "faculty" | string
  campus?: 'Goa';
  faculties?: string[] // A user can be associated with multiple faculties, especially CROs
  faculty?: string // Primary faculty
  institute?: string
  department?: string | null
  misId?: string
  orcidId?: string
  scopusId?: string
  vidwanId?: string
  googleScholarId?: string
  phoneNumber?: string
  profileComplete?: boolean
  photoURL?: string
  allowedModules?: string[]
  bankDetails?: UserBankDetails
  hasCompletedTutorial?: boolean
  sidebarOrder?: string[]
  researchDomain?: string
  notificationSettings?: NotificationSettings;
}

export type Author = {
  uid?: string | null // Present for internal authors who are registered on the portal
  email: string
  name: string
  role: "First Author" | "Corresponding Author" | "Co-Author" | "First & Corresponding Author" | "Presenting Author" | "First & Presenting Author";
  isExternal: boolean
  status: 'approved' | 'pending' | 'Applied';
}

export type ResearchPaper = {
  id: string
  title: string
  url: string
  mainAuthorUid: string
  authors: Author[]
  coAuthorRequests?: Author[];
  authorUids: string[] // For efficient querying by UID
  authorEmails: string[] // For efficient querying by email before sign-up
  domain?: string
  journalName?: string
  journalWebsite?: string
  qRating?: string
  impactFactor?: number
  createdAt: string // ISO String
  updatedAt: string // ISO String
}

export type BankDetails = {
  accountHolderName: string
  accountNumber: string
  bankName: string
  ifscCode: string
  branchName: string
  city: string
}

export type Transaction = {
  id: string // Can be a timestamp + random string
  phaseId: string // Link transaction to a phase
  dateOfTransaction: string // ISO String
  amount: number
  vendorName: string
  isGstRegistered: boolean
  gstNumber?: string
  invoiceUrl?: string // URL to the uploaded invoice in Firebase Storage
  description: string
}

export type GrantPhase = {
  id: string // Can be a timestamp + random string
  name: string
  amount: number
  installmentRefNumber?: string;
  status: "Pending Disbursement" | "Disbursed" | "Utilization Submitted" | "Completed"
  disbursementDate?: string
  transactions?: Transaction[]
  utilizationSubmissionDate?: string
}

export type GrantDetails = {
  totalAmount: number
  sanctionNumber?: string
  status: "Awarded" | "In Progress" | "Completed"
  bankDetails?: BankDetails
  phases: GrantPhase[]
}

export type Evaluation = {
  evaluatorUid: string
  evaluatorName: string
  evaluationDate: string // ISO String
  recommendation: "Recommended" | "Not Recommended" | "Revision Is Needed"
  comments: string
}

export type Project = {
  id: string
  projectId?: string // Standardized, sequential ID like RDC/IMR/APPL/0001
  title: string
  abstract: string
  type: string
  faculty: string
  institute: string
  departmentName: string
  pi: string
  pi_uid: string
  pi_email?: string
  pi_phoneNumber?: string
  piCvUrl?: string; // URL for PI's CV
  coPiDetails?: CoPiDetails[]
  coPiUids?: string[]
  status:
    | "Draft"
    | "Submitted"
    | "Under Review"
    | "Revision Needed"
    | "Sanctioned"
    | "Not Recommended"
    | "In Progress"
    | "Completed"
    | "Pending Completion Approval"
  teamInfo: string
  timelineAndOutcomes: string
  submissionDate: string // Should be ISO string
  proposalUrl?: string
  ethicsUrl?: string
  grant?: GrantDetails
  completionReportUrl?: string
  utilizationCertificateUrl?: string
  completionSubmissionDate?: string // ISO String
  evaluatedBy?: string[]
  hasHadMidTermReview?: boolean; // New flag for mid-term review tracking
  meetingDetails?: {
    date: string
    time: string
    venue: string
    assignedEvaluators?: string[]
    absentEvaluators?: string[];
  }
  wasAbsent?: boolean;
  revisedProposalUrl?: string
  revisionSubmissionDate?: string
  revisionComments?: string
  rejectionComments?: string;
  isBulkUploaded?: boolean
  projectStartDate?: string
  projectEndDate?: string
  projectDuration?: string
  phases?: { name: string; amount: number }[]
  sdgGoals?: string[]
  campus?: string
}

export type Notification = {
  id: string
  uid: string // The user this notification is for
  projectId?: string // The ID of the project, or a profile link
  title: string
  createdAt: string // ISO String
  isRead: boolean
  type?: 'coAuthorRequest' | 'default';
  paperId?: string;
  requester?: Author;
}

export type ApprovalStage = {
  approverUid: string;
  approverName: string;
  status: 'Approved' | 'Rejected';
  timestamp: string; // ISO string
  comments: string;
  approvedAmount: number;
  stage: number; // 1, 2, 3 or 4
  verifiedFields?: { [key: string]: boolean };
  suggestions?: { [key: string]: string };
};

export type PatentInventor = {
    name: string;
    misId: string;
    uid?: string | null;
}

export type IncentiveClaim = {
  id: string
  uid: string
  userName: string
  userEmail: string
  claimId?: string; // Standardized, sequential ID like RDC/IC/PAPER/0001
  status: "Pending" | "Accepted" | "Rejected" | "Draft" | "Pending Stage 1 Approval" | "Pending Stage 2 Approval" | "Pending Stage 3 Approval" | "Pending Stage 4 Approval" | "Submitted to Accounts" | "Payment Completed";
  submissionDate: string // ISO String
  faculty: string
  bankDetails?: UserBankDetails
  originalClaimId?: string // Link to the primary author's claim
  misId?: string
  orcidId?: string
  calculatedIncentive?: number
  finalApprovedAmount?: number;
  approvals?: ApprovalStage[];
  autoFetchedFields?: (keyof IncentiveClaim)[];
  paperId?: string; // Link to the entry in the 'papers' collection
  paymentSheetRef?: string;
  paymentSheetRemarks?: string;

  // Main selector
  claimType: string

  // Common fields
  benefitMode: string
  sdgGoals?: string[];
  authors?: Author[];
  authorUids?: string[];

  // Research Paper Fields
  publicationType?: string;
  indexType?: "wos" | "scopus" | "both" | "sci";
  doi?: string;
  scopusLink?: string;
  wosLink?: string;
  journalClassification?: "Q1" | "Q2" | "Q3" | "Q4" | "Nature/Science/Lancet" | "Top 1% Journals";
  wosType?: "SCIE" | "SSCI" | "A&HCI";
  journalName?: string;
  journalWebsite?: string;
  paperTitle?: string;
  relevantLink?: string;
  authorPosition?: '1st' | '2nd' | '3rd' | '4th' | '5th' | '6th';
  locale?: 'National' | 'International';
  printIssn?: string;
  electronicIssn?: string;
  publicationMonth?: string;
  publicationYear?: string;
  publicationProofUrls?: string[];
  isPuNameInPublication?: boolean;
  wasApcPaidByUniversity?: boolean;
  totalCorrespondingAuthors?: number;
  totalPuStudentAuthors?: number;
  puStudentNames?: string;
  authorType?: string;


  // Patent Fields
  patentTitle?: string
  patentStatus?: "Filed" | "Published" | "Granted"
  patentApplicantType?: "Sole" | "Joint"
  patentSpecificationType?: "Full" | "Provisional"
  patentApplicationNumber?: string
  patentTotalStudents?: number
  patentStudentNames?: string
  patentFiledInPuName?: boolean
  isPuSoleApplicant?: boolean;
  patentFiledFromIprCell?: boolean
  patentPermissionTaken?: boolean
  patentApprovalProofUrl?: string
  patentForm1Url?: string
  patentGovtReceiptUrl?: string
  patentSelfDeclaration?: boolean
  patentLocale?: 'National' | 'International';
  patentCountry?: string;
  patentCoApplicants?: PatentInventor[];
  patentInventors?: PatentInventor[];
  patentDomain?: string;
  isCollaboration?: 'Yes' | 'No' | 'NA';
  collaborationDetails?: string;
  isIprSdg?: 'Yes' | 'No' | 'NA';
  isIprDisciplinary?: 'Yes' | 'No' | 'NA';
  disciplinaryType?: 'Interdisciplinary' | 'Multidisciplinary' | 'Transdisciplinary';
  filingDate?: string; // ISO
  publicationDate?: string; // ISO
  grantDate?: string; // ISO
  currentStatus?: 'Awarded' | 'Published' | 'Under Examination' | 'FER Responded' | 'Amended Examination';


  // Conference Fields
  eventType?: string;
  conferenceName?: string
  conferencePaperTitle?: string
  conferenceType?: "International" | "National" | "Regional/State"
  conferenceVenue?:
    | "India"
    | "Indian Subcontinent"
    | "South Korea, Japan, Australia and Middle East"
    | "Europe"
    | "African/South American/North American"
    | 'Other'
  presentationType?: "Oral" | "Poster" | "Other"
  govtFundingRequestProofUrl?: string
  registrationFee?: number
  travelFare?: number
  totalAmountClaimed?: number;
  conferenceMode?: "Online" | "Offline"
  onlinePresentationOrder?: "First" | "Second" | "Third" | "Additional"
  wasPresentingAuthor?: boolean
  isPuNamePresent?: boolean
  abstractUrl?: string
  organizerName?: string
  eventWebsite?: string
  conferenceDate?: string // ISO String
  conferenceEndDate?: string;
  conferenceDuration?: string;
  presentationDate?: string // ISO String
  registrationFeeProofUrl?: string
  participationCertificateUrl?: string
  wonPrize?: boolean
  prizeDetails?: string
  prizeProofUrl?: string
  attendedOtherConference?: boolean
  travelPlaceVisited?: string
  travelMode?: "Bus" | "Train" | "Air" | "Other"
  travelReceiptsUrl?: string
  conferenceSelfDeclaration?: boolean
  totalAuthors?: string;


  // Book/Book Chapter Fields
  bookApplicationType?: "Book Chapter" | "Book"
  publicationTitle?: string // Title of the book chapter/Book
  bookTitleForChapter?: string // Title of the Book (for Book Chapter)
  bookEditor?: string // Name Of the Editor (for Book Chapter)
  bookChapterPages?: number
  bookTotalPages?: number
  bookTotalChapters?: number
  chaptersInSameBook?: number
  publicationYear?: number
  authorRole?: "Author" | "Editor"
  totalPuStudents?: number
  publisherName?: string
  publisherCity?: string
  publisherCountry?: string
  publisherType?: "National" | "International"
  isScopusIndexed?: boolean
  publicationMode?: "Print Only" | "Electronic Only" | "Print & Electronic"
  isbnPrint?: string
  isbnElectronic?: string
  publisherWebsite?: string
  bookProofUrl?: string
  scopusProofUrl?: string
  publicationOrderInYear?: "First" | "Second" | "Third"
  bookSelfDeclaration?: boolean
  bookType?: "Textbook" | "Reference Book"

  // Professional Body Membership fields
  professionalBodyName?: string
  membershipType?: 'Lifetime' | 'Yearly' | 'Other';
  membershipLocale?: 'National' | 'International';
  membershipNumber?: string;
  membershipAmountPaid?: number;
  membershipPaymentDate?: string; // ISO string
  membershipProofUrl?: string;
  membershipSelfDeclaration?: boolean

  // Seed Money for APC Fields
  apcTypeOfArticle?: string
  apcOtherArticleType?: string
  apcPaperTitle?: string
  apcAuthors?: string
  apcTotalStudentAuthors?: number
  apcStudentNames?: string
  apcJournalDetails?: string
  apcQRating?: string
  apcApcWaiverRequested?: boolean
  apcApcWaiverProofUrl?: string
  apcJournalWebsite?: string
  apcIssnNo?: string
  apcIndexingStatus?: string[]
  apcOtherIndexingStatus?: string
  apcSciImpactFactor?: number
  apcPublicationProofUrl?: string
  apcInvoiceProofUrl?: string
  apcPuNameInPublication?: boolean
  apcAmountClaimed?: number
  apcTotalAmount?: number
  apcSelfDeclaration?: boolean
}

export type FundingCall = {
  id: string
  callIdentifier?: string // Human-readable sequential ID
  title: string
  agency: string
  description?: string
  applyDeadline: string // ISO String
  interestDeadline: string // ISO String
  callType: "Fellowship" | "Grant" | "Collaboration" | "Other"
  detailsUrl?: string
  attachments?: { name: string; url: string }[]
  createdAt: string // ISO String
  createdBy: string // UID of the admin who created it
  status: "Open" | "Closed" | "Meeting Scheduled"
  meetingDetails?: {
    date: string // yyyy-MM-dd
    time?: string // HH:mm
    venue: string
    pptDeadline?: string // ISO String
    assignedEvaluators?: string[],
    absentEvaluators?: string[],
  }
  isAnnounced?: boolean
}

export type EmrInterest = {
  id: string // Auto-generated Firestore ID
  interestId?: string // Human-readable sequential ID
  callId: string
  callTitle?: string // For convenience, especially for bulk uploads
  userId: string
  userName: string
  userEmail: string
  faculty?: string
  department?: string
  registeredAt: string // ISO String
  pptUrl?: string
  pptSubmissionDate?: string // ISO String
  coPiDetails?: CoPiDetails[]
  coPiUids?: string[]
  coPiNames?: string[]
  coPiEmails?: string[]
  status:
    | "Registered"
    | "PPT Submitted"
    | "Revision Submitted"
    | "Evaluation Pending"
    | "Evaluation Done"
    | "Recommended"
    | "Not Recommended"
    | "Revision Needed"
    | "Endorsement Submitted"
    | "Endorsement Signed"
    | "Submitted to Agency"
    | "Sanctioned"
    | "Not Sanctioned"
    | "Process Complete"
    | "Awaiting Rescheduling"
  adminRemarks?: string
  revisedPptUrl?: string
  meetingSlot?: {
    date: string // yyyy-MM-dd
    time: string // HH:mm
    pptDeadline: string; // ISO string
  }
  endorsementFormUrl?: string
  signedEndorsementUrl?: string
  endorsementSignedAt?: string
  agencyReferenceNumber?: string
  agencyAcknowledgementUrl?: string
  submittedToAgencyAt?: string
  finalProofUrl?: string
  isBulkUploaded?: boolean
  agency?: string
  durationAmount?: string
  isOpenToPi?: boolean
  proofUrl?: string
  sanctionDate?: string // ISO String
  wasAbsent?: boolean
}

export type EmrEvaluation = {
  evaluatorUid: string
  evaluatorName: string
  evaluationDate: string // ISO String
  recommendation: "Recommended" | "Not Recommended" | "Revision is needed"
  comments: string
}

export type CroAssignment = {
    email: string;
    faculty: string;
    campus: string;
};

export type ApproverSetting = {
    email: string;
    stage: 1 | 2 | 3 | 4;
    signatureUrl?: string;
};

export type TemplateUrls = {
  INCENTIVE_RESEARCH_PAPER?: string;
  INCENTIVE_PATENT?: string;
  INCENTIVE_CONFERENCE?: string;
  INCENTIVE_BOOK_PUBLICATION?: string;
  INCENTIVE_BOOK_CHAPTER?: string;
  INCENTIVE_MEMBERSHIP?: string;
  IMR_RECOMMENDATION?: string;
  IMR_INSTALLMENT_NOTING?: string;
  IMR_OFFICE_NOTING?: string;
  INCENTIVE_PAYMENT_SHEET?: string;
  IMR_SANCTION_ORDER?: string;
};

export type ApiIntegrations = {
    scopus?: boolean;
    wos?: boolean;
    sci?: boolean;
};

export type AuthMethods = {
    email?: boolean;
    google?: boolean;
};

export type SystemSettings = {
  is2faEnabled: boolean
  authMethods?: AuthMethods;
  allowedDomains?: string[]
  croAssignments?: CroAssignment[]
  incentiveApprovers?: ApproverSetting[];
  incentiveApprovalWorkflows?: Record<string, number[]>;
  iqacEmail?: string;
  enabledIncentiveTypes?: Record<string, boolean>;
  imrMidTermReviewMonths?: number;
  imrEvaluationDays?: number;
  utilizationNotificationEmail?: string;
  dndEmail?: string;
  templateUrls?: TemplateUrls;
  apiIntegrations?: ApiIntegrations;
}

export type LoginOtp = {
  email: string
  otp: string
  expiresAt: number // Store as timestamp
}

export type FoundUser = {
  uid: string | null; // null if not yet registered on the portal
  name: string;
  email: string;
  misId: string;
  campus: string;
}
