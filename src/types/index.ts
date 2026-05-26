

export type CoPiDetails = {
  uid?: string | null // Will exist for registered users
  name: string
  email: string
  misId?: string; // Stored when adding an unregistered user by MIS ID
  cvUrl?: string // URL to the uploaded CV
  cvFileName?: string // Original filename for display
  organization?: string;
  isExternal?: boolean;
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
  campus?: 'Vadodara' | 'Ahmedabad' | 'Rajkot' | 'Goa';
  faculties?: string[] // A user can be associated with multiple faculties, especially CROs
  faculty?: string // Primary faculty
  institute?: string
  department?: string | null
  misId?: string
  orcidId?: string
  scopusId?: string
  hIndex?: number
  i10Index?: number
  citationCount?: number
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
  organization?: string;
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
  isDraft?: boolean;
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
  | "Revision Submitted"
  | "Recommended"
  | "Sanctioned"
  | "Not Recommended"
  | "In Progress"
  | "Completed"
  | "Pending Completion Approval"
  teamInfo: string
  timelineAndOutcomes: string
  submissionDate: string // Should be ISO string
  sanctionDate?: string // ISO String - Date when project was sanctioned/approved by RDC
  seedMoneyReceivedDate?: string // ISO String - Date when seed money was first received/disbursed
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
  misId?: string;
  email?: string;
  uid?: string | null;
  isExternal?: boolean;
  organization?: string;
}

export type IncentiveClaim = {
  id: string
  uid: string
  userName: string
  userEmail: string
  claimId?: string; // Standardized, sequential ID like RDC/IC/PAPER/0001
  status: "Pending" | "Accepted" | "Rejected" | "Draft" | "Pending Stage 1 Approval" | "Pending Stage 2 Approval" | "Pending Stage 3 Approval" | "Pending Stage 4 Approval" | "Pending Stage 5 Approval" | "Submitted to Accounts" | "Payment Completed";
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
  aiVerification?: {
    isAuthentic: boolean;
    affiliationMentioned: boolean;
    authorsMatch: boolean;
    isIndexed: boolean;
    reasoning: string;
    confidenceScore: number;
    verifiedAt: string;
  };

  // Main selector
  claimType: string

  // Common fields
  benefitMode: string
  sdgGoals?: string[];
  authors?: Author[];
  authorUids?: string[];
  authorEmails?: string[];

  // Research Paper Fields
  publicationType?: string;
  indexType?: "wos" | "scopus" | "both" | "sci" | "other" | "esci";
  doi?: string;
  scopusLink?: string;
  wosLink?: string;
  journalClassification?: "Q1" | "Q2" | "Q3" | "Q4" | "Nature/Science/Lancet" | "Top 1% Journals";
  wosType?: "SCIE" | "SSCI" | "A&HCI";
  journalName?: string;
  journalWebsite?: string;
  paperTitle?: string;
  relevantLink?: string;
  authorPosition?: '1st' | '2nd' | '3rd' | '4th' | '5th' | '6th' | '7th' | '8th' | '9th' | '10th';
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
  flightTicketsUrl?: string
  conferenceSelfDeclaration?: boolean
  totalAuthors?: string;
  conferenceProofUrl?: string;

  // Workshop/Training/FDP fields
  workshopName?: string;
  workshopStartDate?: string; // ISO
  workshopEndDate?: string; // ISO
  attendanceMode?: "Online" | "Offline";
  eventTypeLevel?: "International" | "National" | "Regional/State" | "Other";
  workshopCertificateUrl?: string;
  workshopSelfDeclaration?: boolean;
  travelDetails?: string;

  // Book/Book Chapter Fields
  bookApplicationType?: "Book Chapter" | "Book"
  publicationTitle?: string // Title of the book chapter/Book
  bookTitleForChapter?: string // Title of the Book (for Book Chapter)
  bookEditor?: string // Name Of the Editor (for Book Chapter)
  bookChapterPages?: number
  bookTotalPages?: number
  bookTotalChapters?: number
  chaptersInSameBook?: number
  bookPublicationYear?: number
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

  // Award fields
  awardTitle?: string;
  awardingBody?: string;
  awardStature?: 'National' | 'International';
  awardBodyType?: 'Government' | 'NGO (Non-Governmental Organization)' | 'Any Other';
  awardLocale?: string;
  awardCategory?: 'International Award' | 'National Award' | 'Best Research Paper Award';
  isPaidAward?: boolean;
  amountPaid?: number; // Cash prize received (if any)
  paymentDate?: string; // ISO string
  awardDate?: string; // ISO string
  totalInternalAuthors?: number;
  totalInternalCoAuthors?: number;
  awardProofUrls?: string[]
  additionalDocumentsUrls?: string[];
  awardSelfDeclaration?: boolean;

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
  apcReceiptProofUrl?: string
  apcPaymentProofUrl?: string
  apcAcceptanceMailProofUrl?: string
  apcScopusLink?: string
  apcPuNameInPublication?: boolean
  apcAmountClaimed?: number
  apcTotalAmount?: number
  apcSelfDeclaration?: boolean

  // EMR Sanction Project Fields
  emrProjectName?: string;
  wasRoutedThroughRdc?: boolean;
  sanctionFrom?: string;
  sanctionAmount?: number;
  sanctionDate?: string; // ISO
  externalCoPis?: CoPiDetails[];
  sanctionProofUrl?: string;
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
  driveLink?: string
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
  proposalUrl?: string
  proposalSubmissionDate?: string // ISO String
  coPiDetails?: CoPiDetails[]
  coPiUids?: string[]
  coPiNames?: string[]
  coPiEmails?: string[]
  status:
  | "Registered"
  | "PPT Submitted"
  | "Documents Submitted"
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
  assignedEvaluators?: string[];
  evaluatedBy?: string[];
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
  campus?: string
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
  stage: 1 | 2 | 3 | 4 | 5;
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
  INCENTIVE_OFFICE_NOTING?: string;
};

export type ApiIntegrations = {
  scopus?: boolean;
  wos?: boolean;
  sci?: boolean;
};

export type SystemSettings = {
  is2faEnabled: boolean
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
  driveParentFolderId?: string;
  principalEmails?: Record<string, string>;
}

export type LoginOtp = {
  email: string
  otp: string
  expiresAt: number // Store as timestamp
  isPasswordVerified?: boolean
}

export type FoundUser = {
  uid: string | null; // null if not yet registered on the portal
  name: string;
  email: string;
  misId: string;
  campus: string;
}

// New types for Project Recruitment
export type ProjectRecruitment = {
  id: string;
  projectId: string; // IMR or EMR project ID
  projectName: string;
  positionTitle: string;
  positionType: 'Intern' | 'Project Associate' | 'JRF' | 'SRF' | 'Other';
  jobDescription: string;
  responsibilities?: string;
  qualifications: string;
  targetBranches: string[];
  targetDepartments: string[];
  salary?: string;
  applicationDeadline: string; // ISO String
  postedByUid: string;
  postedByName: string;
  status: 'Draft' | 'Pending Approval' | 'Approved' | 'Rejected' | 'Closed';
  createdAt: string; // ISO String
  approvedAt?: string;
  adminRemarks?: string;
};

export type RecruitmentApplication = {
  id: string;
  recruitmentId: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  applicantMisId?: string;
  department?: string;
  institute?: string;
  cvUrl: string;
  coverLetterUrl?: string;
  appliedAt: string; // ISO String
};

export type ArpsSubmissionHistory = {
  timestamp: string;
  user: string;
  action: string;
  remarks?: string;
};

export type ArpsSubmission = {
  id: string;
  uid: string;
  userName: string;
  userEmail: string;
  faculty: string;
  submissionId?: string; // e.g., RDC/ARPS/2025-26/PUB/0001
  status: "Draft" | "Submitted" | "Under Review" | "Approved" | "Rejected" | "Resubmission Required" | "Locked" | "Finalized";
  submissionDate: string; // ISO string
  academicYear: string; // e.g., "2025-2026"
  submissionType: "publication" | "patent" | "consultancy" | "emr" | "student" | "activity";
  remarks?: string; // Review remarks
  comments?: string;
  history?: ArpsSubmissionHistory[];
  proofUrls?: string[];
  verifiedFields?: Record<string, boolean>;

  // A. Publication fields
  paperTitle?: string;
  doi?: string;
  journalName?: string;
  journalClassification?: "Q1" | "Q2" | "Q3" | "Q4";
  indexType?: "scopus" | "wos" | "both";
  articleType?: "Original Research" | "Review" | "Case Report" | "Short Survey";
  publicationType?: "Journal" | "Book Chapter" | "Book Editor" | "Conference Proceedings";
  authorPosition?: "Single Author" | "First Author" | "Corresponding Author" | "Co-Author" | "First & Corresponding Author";
  authorOrder?: number; // Position in co-authorship (1-indexed)
  totalAuthors?: number;
  isSinglePuAuthorWithExternal?: boolean;
  hasImrAcknowledgement?: boolean;
  hasEmrAcknowledgement?: boolean;
  publicationDate?: string;
  fundingAcknowledgement?: string;
  publisherName?: string;
  publisherWebsite?: string;
  isbn?: string;

  // B. Patent fields
  patentTitle?: string;
  patentCategory?: "Published" | "Granted India" | "Granted International";
  patentNumber?: string;
  filingDate?: string;
  grantDate?: string;
  applicantStructure?: string;
  isPuJointApplicant?: boolean;
  isPuSoleApplicant?: boolean;
  patentInventors?: { name: string; email?: string; uid?: string; organization?: string }[];

  // C. Consultancy fields
  consultancyTitle?: string;
  clientOrganization?: string;
  revenueAmount?: number;
  transactionDate?: string;
  routingProofUrl?: string;

  // D. EMR fields
  projectTitle?: string;
  fundingAgency?: string;
  sanctionAmount?: number;
  emrTeamMembers?: string;
  role?: "PI" | "Co-PI" | "Team Member";
  projectStatus?: "Ongoing" | "Sanctioned";
  durationMonths?: number;
  startDate?: string;
  endDate?: string;
  sanctionDate?: string;

  // E. Students fields
  studentName?: string;
  studentEnrollmentNo?: string;
  studentInstitute?: string;
  studentDepartment?: string;
  program?: "PhD" | "PG Dissertation";
  studentStatus?: "Ongoing" | "Completed"; // renamed from status to avoid collision
  allotmentDetails?: string;

  // F. Academic Activities fields
  activityCategory?: "Conference presentation" | "Convener" | "Coordinator" | "Expert talk" | "Participation" | "Membership" | "EMR team member";
  eventName?: string;
  organization?: string;
  eventDurationDays?: number;
  location?: "In PU" | "Outside PU" | "Outside India";
  rolePerformed?: string;
};
