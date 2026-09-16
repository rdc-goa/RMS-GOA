

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

export type ScopusPublication = {
  eid: string
  title: string
  journalName?: string
  coverDate?: string
  publicationYear?: string
  doi?: string
  scopusUrl?: string
  citationCount?: number
  authors?: string
  aggregationType?: string
  subtypeDescription?: string
  volume?: string
  issue?: string
  pageRange?: string
  issn?: string
  fetchedAt?: string
  openAccess?: boolean
  openAccessStatus?: string
  publisher?: string
  fundingSponsor?: string
  isPuNameInPublication?: boolean

  quartile?: 'Q1' | 'Q2' | 'Q3' | 'Q4' | string
  citeScore?: number
  keywords?: string[]
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
  authorityFaculties?: string[]
  authorityInstitutes?: string[]
  authorityDepartments?: string[]
  bankDetails?: UserBankDetails
  hasCompletedTutorial?: boolean
  sidebarOrder?: string[]
  researchDomain?: string
  notificationSettings?: NotificationSettings;
  slug?: string;
  disabled?: boolean;
  absentCount?: number;
  manualArpsEnabled?: boolean;
  arpsScores?: Record<string, any>;
  scopusPublications?: ScopusPublication[];
  scopusLastFetchedAt?: string;
  scopusHIndex?: number;
  scopusAffiliations?: { name: string; city?: string; country?: string; current?: boolean }[];
  scopusNameVariants?: string[];
  scopusTopCoAuthors?: { name: string; count: number }[];
  scopusSubjectAreas?: { name: string; count: number }[];
  scopusCoAuthorCount?: number;
  scopusCareerStartYear?: string;
}

export type Author = {
  uid?: string | null // Present for internal authors who are registered on the portal
  email: string
  name: string
  role: "First Author" | "Corresponding Author" | "Co-Author" | "First & Corresponding Author" | "Presenting Author" | "First & Presenting Author";
  isExternal: boolean
  status: 'approved' | 'pending' | 'Applied';
  organization?: string;
  position?: string;
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
  isDisbursementDateSavedByUser?: boolean
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
  sanctionLetterUrl?: string
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
    mode?: string
    type?: string
    assignedEvaluators?: string[]
    absentEvaluators?: string[];
  }
  wasAbsent?: boolean;
  pastMeetings?: {
    date: string;
    time: string;
    venue: string;
    mode?: string;
    type?: string;
    assignedEvaluators?: string[];
    absentEvaluators?: string[];
    wasAbsent?: boolean;
    status?: string;
  }[];
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
  nonTechnicalComments?: string
  associatedCallId?: string
  associatedCallTitle?: string
}

export type Notification = {
  id: string
  uid: string // The user this notification is for
  projectId?: string // The ID of the project, or a profile link
  title: string
  description?: string // Detailed message about the notification
  createdAt: string // ISO String
  isRead: boolean
  type?: 'coAuthorRequest' | 'default';
  paperId?: string;
  requester?: Author;
}

export type ApprovalStage = {
  approverUid: string;
  approverName: string;
  status: 'Approved' | 'Rejected' | 'Not Approved' | 'On Hold';
  timestamp: string; // ISO string
  comments: string;
  approvedAmount: number;
  approvedTravelFare?: number;
  approvedAccommodationExpense?: number;
  approvedMiscellaneousExpense?: number;
  approvedRegistrationFee?: number;
  stage: number; // 1, 2, 3 or 4
  verifiedFields?: { [key: string]: boolean };
  suggestions?: { [key: string]: string };
  additionalDocuments?: string[];
  rdcRecord?: boolean;
  needsSpecialIntervention?: boolean;
  specialInterventionSuggestedAmount?: number;
  specialInterventionRemarks?: string;
};

export type PatentInventor = {
  name: string;
  misId?: string;
  email?: string;
  uid?: string | null;
  isExternal?: boolean;
  organization?: string;
  status?: 'pending' | 'Applied' | 'approved' | 'Not Approved' | 'Rejected';
  role?: string;
}

export type IncentiveClaim = {
  id: string
  uid: string
  userName: string
  userEmail: string
  claimId?: string; // Standardized, sequential ID like RDC/IC/PAPER/0001
  status: "Pending" | "Accepted" | "Approved" | "Rejected" | "Not Approved" | "Draft" | "Pending Stage 1 Approval" | "Pending Stage 2 Approval" | "Pending Stage 3 Approval" | "Pending Stage 4 Approval" | "Pending Stage 5 Approval" | "Submitted to Accounts" | "Payment Completed" | "On Hold";
  submissionDate: string // ISO String
  faculty: string
  bankDetails?: UserBankDetails
  originalClaimId?: string // Link to the primary author's claim
  misId?: string
  orcidId?: string
  externalId?: string;
  paperProofLink?: string;
  calculatedIncentive?: number
  finalApprovedAmount?: number | null;
  approvals?: ApprovalStage[];
  autoFetchedFields?: (keyof IncentiveClaim)[];
  needsSpecialIntervention?: boolean;
  specialInterventionSuggestedAmount?: number;
  specialInterventionRemarks?: string;
  paperId?: string; // Link to the entry in the 'papers' collection
  paymentSheetRef?: string;
  paymentSheetRemarks?: string;
  paymentSheetDate?: string;
  lastSyncedAt?: string;
  source?: string;
  iqacClaimType?: string;
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
  scopusLink?: string
  apcScopusLink?: string;
  wosLink?: string;
  journalClassification?: "Q1" | "Q2" | "Q3" | "Q4" | "Nature/Science/Lancet" | "Top 1% Journals";
  wosType?: "SCIE" | "SSCI" | "A&HCI";
  journalName?: string;
  asjcCategory?: string;
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
  openAccessOrSubscription?: 'Open Access' | 'Subscription-Based';
  openAccessType?: 'Received Full Fee Waiver' | 'Received Partial Fee Waiver' | 'Publisher is currently offering Free Open Access Publication' | 'Paid Full Publication Fee';
  alreadyClaimedApcReimbursement?: boolean;
  totalCorrespondingAuthors?: number;
  totalPuStudentAuthors?: number;
  puStudentNames?: string;
  authorType?: string;
  paperIncentivePaid?: number;
  paperClaimId?: string;
  numberOfAffiliations?: number;
  previousOfflinePresentationsCount?: number;


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
  patentRoutedViaSsip?: boolean
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
  | "South Korea, Japan and Middle East"
  | "Europe and Australia"
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
  presencePhotographsUrls?: string[];

  // Workshop/Training/FDP fields
  workshopName?: string;
  workshopStartDate?: string; // ISO
  workshopEndDate?: string; // ISO
  attendanceMode?: "Online" | "Offline";
  eventTypeLevel?: "International" | "National" | "Regional/State" | "Other";
  workshopCertificateUrl?: string;
  workshopSelfDeclaration?: boolean;
  travelDetails?: string;
  accommodationExpense?: number;
  accommodationProofUrl?: string;
  miscellaneousExpense?: number;
  miscellaneousProofUrl?: string;
  approvedTravelFare?: number;
  approvedAccommodationExpense?: number;
  approvedMiscellaneousExpense?: number;
  approvedRegistrationFee?: number;

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
  isbn?: string
  publisherWebsite?: string
  bookProofUrl?: string
  bookAiReportProofUrl?: string
  scopusProofUrl?: string
  publicationOrderInYear?: "First" | "Second" | "Third" | "Fourth" | "Fifth" | "Sixth" | "Seventh" | "Eighth" | "Ninth" | "Tenth" | "";
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
  apcPublicationProofUrl?: string;
  apcInvoiceProofUrl?: string;
  apcReceiptProofUrl?: string;
  apcPaymentProofUrl?: string;
  apcAcceptanceMailProofUrl?: string;
  apcPuNameInPublication?: boolean;
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
  status: "Open" | "Closed" | "Meeting Scheduled" | "Draft"
  meetingDetails?: {
    date: string // yyyy-MM-dd
    time?: string // HH:mm
    venue: string
    pptDeadline?: string // ISO String
    assignedEvaluators?: string[],
    absentEvaluators?: string[],
    mode?: string;
  }
  isAnnounced?: boolean
  announcedAt?: string // ISO String
  attachments?: { name: string; url: string }[]
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
  absentEvaluators?: string[];
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
  amount?: number
  sanctionAmount?: number
  duration?: number
  institute?: string
  meetingDetails?: {
    date?: string
    time?: string
    venue?: string
    mode?: string
  }
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

export type DepartmentMatrixItem = {
  id: string
  name: string
  authorityEmail?: string
}

export type InstituteMatrixItem = {
  id: string
  name: string
  authorityEmail?: string
  departments: DepartmentMatrixItem[]
}

export type FacultyMatrixItem = {
  id: string
  name: string
  authorityEmail?: string
  institutes: InstituteMatrixItem[]
}

export type SystemSettings = {
  is2faEnabled: boolean
  allowedDomains?: string[]
  croAssignments?: CroAssignment[]
  incentiveApprovers?: ApproverSetting[];
  principalEmails?: Record<string, string>;
  patentStage2Approver?: ApproverSetting;
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
  facultyMatrix?: FacultyMatrixItem[];
}

export type LoginOtp = {
  email: string
  otp: string
  expiresAt: number // Store as timestamp
  isPasswordVerified?: boolean;
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
  academicYear: string; // e.g., "2025-26"
  submissionType: "publication" | "patent" | "consultancy" | "emr" | "EMR" | "student" | "activity" | "other";
  remarks?: string; // Review remarks
  comments?: string;
  details?: string; // Paragraph / Description for others
  history?: ArpsSubmissionHistory[];
  proofUrls?: string[];
  verifiedFields?: Record<string, boolean>;
  fetchedFrom?: "scopus" | "wos";

  // A. Publication fields
  paperTitle?: string;
  doi?: string;
  scopusLink?: string;
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
  bookTitleForChapter?: string;

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
  // F1. Professional Society Board Membership-specific fields
  membershipType?: "Lifetime" | "Yearly";
  societyType?: "National" | "International";
  revisionDiffs?: Record<string, { oldValue: any; newValue: any }>;
};

export type SpecialCfp = {
  id: string;
  callIdentifier?: string; // Sequential identifier like RDC/CFP/2026/0001
  title: string;
  description: string;
  department: string; // Announcing department
  applyDeadline: string; // ISO date string
  status: "Open" | "Closed";
  createdAt: string; // ISO date string
  createdBy: string; // Admin User ID
  announcedBy: string; // Admin/Faculty Name
  files?: { name: string; url: string }[]; // Optional attachment PDFs
};

export type CfpSubmission = {
  id: string;
  submissionId?: string; // Sequential ID like RDC/CFP/SUB/0001
  cfpId: string; // Reference to the Call announcement
  cfpTitle: string; // Title of the associated call

  // Principal Investigator Details
  piName: string;
  piEmail: string;
  piPhone: string;
  piOrganization: string; // "Parul University" or external institution name
  piFaculty?: string;     // If Parul University
  piDepartment?: string;  // If Parul University
  piCvUrl: string;        // PDF link
  piCvFileName?: string;

  // Project Details
  title: string;
  abstract: string;
  projectType: string;    // "Unidisciplinary" | "Multi-Disciplinary" | "Inter-Disciplinary"
  sdgGoals?: string[];

  // Team Info
  coPiDetails?: CoPiDetails[];
  studentInfo?: string;

  // File Uploads
  proposalUrl: string;
  ethicsUrl?: string;
  proposalUrls?: string[];
  proposalFileNames?: string[];

  // Timeline & Outcomes
  expectedOutcomes: string;
  guidelinesAgreement: boolean;

  // Metadata
  status: "Draft" | "Submitted" | "Under Review" | "Recommended" | "Revision Needed" | "Revision Submitted" | "Sanctioned" | "Not Recommended";
  submissionDate: string; // ISO string
  pi_uid?: string;        // Null for unregistered external users

  // Meetings, Evaluations, Revisions, Durations & Grants
  meetingDetails?: {
    date: string;
    time: string;
    venue: string;
    mode: "Online" | "Offline";
    assignedEvaluators?: string[];
    absentEvaluators?: string[];
  };
  wasAbsent?: boolean;
  evaluatedBy?: string[];
  remarks?: string;
  rejectionComments?: string;
  revisionComments?: string;
  revisedProposalUrl?: string;
  revisionSubmissionDate?: string;
  projectStartDate?: string;
  projectEndDate?: string;
  grant?: GrantDetails;
  allowEditAfterDeadline?: boolean;
};
