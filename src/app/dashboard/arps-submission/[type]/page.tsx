'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, ArrowLeft, Save, Upload, FileText, CheckCircle, AlertCircle, Trash2, HelpCircle, Calculator, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { uploadFileToApi } from '@/lib/upload-client';
import { fetchAdvancedScopusData } from '@/app/scopus-actions';
import { fetchWosDataByUrl } from '@/app/wos-actions';
import { type ArpsSubmission, type User } from '@/types';
import { submitArpsSubmission, updateArpsSubmission, getPolicyRules, getArpsSubmissions, getArpsEvaluationCycles } from '@/app/arps-actions';
import { getDefaultModulesForRole } from '@/lib/modules';
const FIELD_LABELS: Record<string, string> = {
  // Publication
  paperTitle: 'Paper Title',
  doi: 'DOI',
  scopusLink: 'Scopus Link',
  journalName: 'Journal/Book Name',
  bookTitleForChapter: 'Book Name (for Chapter)',
  journalClassification: 'Journal Quartile',
  indexType: 'Indexing Type',
  articleType: 'Article Type',
  publicationType: 'Publication Type',
  authorPosition: 'Author Position',
  authorOrder: 'Author Order',
  totalAuthors: 'Total Authors',
  isSinglePuAuthorWithExternal: 'Single PU Author with Externals',
  hasImrAcknowledgement: 'IMR Acknowledgement',
  hasEmrAcknowledgement: 'EMR Acknowledgement',
  publicationDate: 'Publication Date',
  fundingAcknowledgement: 'Funding Acknowledgement',
  publisherName: 'Publisher Name',
  publisherWebsite: 'Publisher Website',
  isbn: 'ISBN',

  // Patent
  patentTitle: 'Patent Title',
  patentCategory: 'Patent Category',
  patentNumber: 'Patent Number',
  filingDate: 'Filing Date',
  grantDate: 'Grant Date',
  applicantStructure: 'Applicant Structure',
  isPuJointApplicant: 'PU Joint Applicant',
  isPuSoleApplicant: 'PU Sole Applicant',
  patentInventors: 'Patent Inventors',

  // Consultancy
  consultancyTitle: 'Consultancy Title',
  clientOrganization: 'Client Organization',
  revenueAmount: 'Revenue Amount',
  transactionDate: 'Transaction Date',

  // EMR
  projectTitle: 'Project Title',
  fundingAgency: 'Funding Agency',
  sanctionAmount: 'Sanction Amount',
  role: 'Role',
  projectStatus: 'Project Status',
  durationMonths: 'Duration (Months)',
  startDate: 'Start Date',
  endDate: 'End Date',

  // Student
  studentName: 'Student Name',
  studentEnrollmentNo: 'Student Enrollment No',
  studentInstitute: 'Student Institute',
  studentDepartment: 'Student Department',
  program: 'Program',
  studentStatus: 'Student Status',
  allotmentDetails: 'Allotment Details',

  // Activity
  activityCategory: 'Activity Category',
  eventName: 'Event Name',
  organization: 'Organization',
  eventDurationDays: 'Event Duration Days',
  location: 'Location',
  membershipType: 'Membership Type',
  societyType: 'Society Type',
  details: 'Details / Description',
  proofUrls: 'Proof Documents'
};

function getComparisonValue(val: any): string {
  if (val === undefined || val === null) return '';
  if (Array.isArray(val)) {
    if (val.length > 0 && typeof val[0] === 'object') {
      return val.map((item: any) => item.name || JSON.stringify(item)).join(', ');
    }
    return val.join(', ');
  }
  if (typeof val === 'boolean') {
    return val ? 'Yes' : 'No';
  }
  return String(val);
}

export default function ArpsSubmissionForm() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  let rawType = params.type as string;
  const type = rawType === 'emr' ? 'EMR' : rawType as ArpsSubmission['submissionType'];
  const editId = searchParams.get('edit');

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [policyRules, setPolicyRules] = useState<any>(null);
  const [existingSubmission, setExistingSubmission] = useState<ArpsSubmission | null>(null);
  const [cycleLocked, setCycleLocked] = useState(false);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [proofs, setProofs] = useState<{ url: string; name: string }[]>([]);
  const [isFetchingMeta, setIsFetchingMeta] = useState(false);

  // Generic form values
  const academicYear = '2025-26';

  // Form Fields State
  const [formData, setFormData] = useState<Partial<ArpsSubmission>>({
    // Common fields
    academicYear: '2025-26',

    // Publication
    paperTitle: '',
    doi: '',
    scopusLink: '',
    journalName: '',
    bookTitleForChapter: '',
    journalClassification: '' as any,
    indexType: '' as any,
    articleType: '' as any,
    publicationType: 'Journal',
    authorPosition: '' as any,
    authorOrder: 2,
    totalAuthors: '' as any,
    isSinglePuAuthorWithExternal: false,
    hasImrAcknowledgement: false,
    hasEmrAcknowledgement: false,
    publicationDate: '',
    fundingAcknowledgement: '',
    publisherName: '',
    publisherWebsite: '',

    // Patent
    patentTitle: '',
    patentCategory: 'Published',
    patentNumber: '',
    filingDate: '',
    grantDate: '',
    applicantStructure: '',
    isPuJointApplicant: false,
    isPuSoleApplicant: false,

    // Consultancy
    consultancyTitle: '',
    clientOrganization: '',
    revenueAmount: 0,
    transactionDate: '',

    // EMR
    projectTitle: '',
    fundingAgency: '',
    sanctionAmount: 0,
    role: 'PI',
    projectStatus: 'Sanctioned',
    durationMonths: 12,
    startDate: '',
    endDate: '',

    // Student
    studentName: '',
    studentEnrollmentNo: '',
    studentInstitute: '',
    studentDepartment: '',
    program: 'PhD',
    studentStatus: 'Ongoing',
    allotmentDetails: '',

    // Activity
    activityCategory: 'Conference presentation',
    eventName: '',
    organization: '',
    eventDurationDays: 1,
    location: 'In PU',
    membershipType: 'Yearly',
    societyType: 'National',
    details: '',
  });

  const validTypes = ['publication', 'patent', 'consultancy', 'EMR', 'student', 'activity', 'other'];

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      const allowedModules = parsedUser.allowedModules || getDefaultModulesForRole(parsedUser.role, parsedUser.designation);
      if (!allowedModules.includes('arps-submission')) {
        toast({
          title: 'Access Denied',
          description: "You don't have permission to view this page.",
          variant: 'destructive',
        });
        router.replace('/dashboard');
        return;
      }
      setCurrentUser(parsedUser);
    } else {
      router.push('/login');
    }
  }, [router, toast]);

  useEffect(() => {
    if (!type || !validTypes.includes(type)) {
      toast({ variant: 'destructive', title: 'Invalid Route', description: 'The requested form type does not exist.' });
      router.push('/dashboard/arps-submission');
      return;
    }

    const initData = async () => {
      setLoading(true);
      try {
        const rulesRes = await getPolicyRules();
        if (rulesRes.success) {
          setPolicyRules(rulesRes.rules);
        }

        const cycleRes = await getArpsEvaluationCycles();
        let isLocked = false;
        if (cycleRes.success && cycleRes.cycles && cycleRes.cycles[academicYear]) {
          const cycle = cycleRes.cycles[academicYear];
          if (cycle.finalDate && new Date() > new Date(cycle.finalDate)) {
            isLocked = true;
          }
          if (cycle.status === 'frozen') {
            isLocked = true;
          }
        }
        if (currentUser?.manualArpsEnabled) {
          isLocked = false;
        }
        setCycleLocked(isLocked);

        if (editId) {
          const subRes = await getArpsSubmissions({ uid: currentUser?.uid });
          if (subRes.success && subRes.submissions) {
            const currentSub = subRes.submissions.find(s => s.id === editId);
            if (currentSub) {
              if (currentSub.status === 'Locked' || currentSub.status === 'Finalized' || currentSub.status === 'Approved') {
                toast({ variant: 'destructive', title: 'Locked Submission', description: 'This submission has already been locked/finalized and cannot be edited.' });
                router.push('/dashboard/arps-submission');
                return;
              }

              if (isLocked && currentSub.status !== 'Resubmission Required') {
                toast({ variant: 'destructive', title: 'Submission Window Closed', description: 'You can only edit applications that were explicitly returned for correction.' });
                router.push('/dashboard/arps-submission');
                return;
              }
              setExistingSubmission(currentSub);
              setFormData(currentSub);
              if (currentSub.proofUrls) {
                setProofs(currentSub.proofUrls.map((url, idx) => ({
                  url,
                  name: url.split('/').pop()?.split('?')[0] || `Document_${idx + 1}.pdf`
                })));
              }
            } else {
              toast({ variant: 'destructive', title: 'Not Found', description: 'Submission details could not be loaded.' });
              router.push('/dashboard/arps-submission');
            }
          }
        } else {
          if (isLocked) {
            toast({ variant: 'destructive', title: 'Submission Window Closed', description: 'The deadline for new submissions has passed.' });
            router.push('/dashboard/arps-submission');
            return;
          }
        }
      } catch (err: any) {
        console.error('Failed to load form initialization details:', err);
      } finally {
        setLoading(false);
      }
    };

    if (currentUser) {
      initData();
    }
  }, [currentUser, type, editId]);

  useEffect(() => {
    const pos = formData.authorPosition;
    if (pos === 'First Author' || pos === 'First & Corresponding Author' || pos === 'Single Author') {
      if (formData.authorOrder !== 1) {
        setFormData(prev => ({ ...prev, authorOrder: 1 }));
      }
    }
  }, [formData.authorPosition]);

  const handleInputChange = (field: keyof ArpsSubmission, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleFetchMetadata = async (source: 'scopus' | 'wos') => {
    if (!currentUser) {
      toast({ variant: 'destructive', title: 'Not authenticated', description: 'User must be signed in to perform fetch.' });
      return;
    }
    const identifier = (formData.doi || '').trim();
    if (!identifier) {
      toast({ variant: 'destructive', title: 'Missing DOI', description: 'Please enter a DOI or identifier first.' });
      return;
    }

    setIsFetchingMeta(true);
    toast({ title: `Connecting to ${source.toUpperCase()}`, description: 'Retrieving article metadata...' });
    try {
      let result: any;
      if (source === 'scopus') {
        result = await fetchAdvancedScopusData(identifier, currentUser.name, currentUser.uid);
      } else {
        result = await fetchWosDataByUrl(identifier, currentUser.name, currentUser.uid);
      }

      if (result && result.success && result.data) {
        const d = result.data;
        const publicationDate = d.publicationYear ? `${d.publicationYear}-01-01` : (d.publicationDate || formData.publicationDate);

        setFormData(prev => ({
          ...prev,
          paperTitle: d.paperTitle || d.title || prev.paperTitle,
          journalName: d.journalName || prev.journalName,
          bookTitleForChapter: d.journalName || prev.bookTitleForChapter,
          doi: prev.doi || identifier,
          publicationDate,
          publisherName: d.publisherName || d.publisher || prev.publisherName,
          publisherWebsite: d.publisherWebsite || prev.publisherWebsite,
          fetchedFrom: source,
        }));

        toast({ title: 'Auto-fill Complete', description: `Publication fields updated and verified via ${source.toUpperCase()}.` });
      } else {
        toast({ variant: 'destructive', title: 'Fetch Failed', description: result?.error || 'No data returned.' });
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Connection Error', description: err?.message || String(err) });
    } finally {
      setIsFetchingMeta(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];

    // File validation
    if (file.size > 25 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File Too Large', description: 'Maximum file size is 25MB.' });
      return;
    }

    setUploading(true);
    try {
      const uploadPath = `arps-proofs/${currentUser?.uid}/${type}/${Date.now()}-${file.name}`;
      const uploadRes = await uploadFileToApi(file, { path: uploadPath });

      if (uploadRes.success && uploadRes.url) {
        setProofs(prev => [...prev, { url: uploadRes.url!, name: file.name }]);
        toast({ title: 'Upload Successful', description: `${file.name} uploaded successfully.` });
      } else {
        toast({ variant: 'destructive', title: 'Upload Failed', description: uploadRes.error || 'Failed to upload proof document.' });
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Upload Error', description: error.message || 'An error occurred during file upload.' });
    } finally {
      setUploading(false);
    }
  };

  const removeProof = (index: number) => {
    setProofs(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async (submitStatus: ArpsSubmission['status']) => {
    if (!currentUser) return;

    if (submitStatus === 'Draft' && existingSubmission?.status === 'Resubmission Required') {
      toast({
        variant: 'destructive',
        title: 'Draft Not Allowed',
        description: 'Applications requiring revision must be fully submitted for verification and cannot be saved as drafts.'
      });
      return;
    }

    // Common validations
    if (proofs.length === 0 && submitStatus === 'Submitted' && type !== 'other') {
      toast({ variant: 'destructive', title: 'Proof Required', description: 'Please upload at least one documentary proof before submitting.' });
      return;
    }

    // Specific validations
    if (type === 'publication') {
      if (!formData.paperTitle?.trim()) {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Title is required.' });
        return;
      }
      if (!formData.authorPosition) {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Your Role is required.' });
        return;
      }
      const order = formData.authorOrder;
      if (order === undefined || order === null || isNaN(order as any)) {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Your Author Position is required.' });
        return;
      }
      if (Number(order) < 1 || Number(order) > 10) {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Your Author Position must be an integer between 1 and 10.' });
        return;
      }
      if (
        formData.publicationType === 'Journal' ||
        formData.publicationType === 'Book Chapter' ||
        formData.publicationType === 'Conference Proceedings'
      ) {
        if (!formData.doi?.trim()) {
          toast({ variant: 'destructive', title: 'Validation Error', description: 'DOI is required for Journal, Book Chapter, and Conference Proceedings submissions.' });
          return;
        }

        const requiresScopus =
          formData.publicationType === 'Book Chapter' ||
          formData.publicationType === 'Conference Proceedings' ||
          (formData.publicationType === 'Journal' && (formData.indexType === 'scopus' || formData.indexType === 'both'));

        if (requiresScopus) {
          if (!formData.scopusLink?.trim()) {
            toast({ variant: 'destructive', title: 'Validation Error', description: 'Scopus Link is required for Scopus-indexed publications.' });
            return;
          }
          if (formData.scopusLink && !formData.scopusLink.startsWith('http')) {
            toast({ variant: 'destructive', title: 'Validation Error', description: 'Please enter a valid Scopus URL.' });
            return;
          }
        }
      }
      if (!formData.publicationDate) {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Publication Date is required.' });
        return;
      }
      if (!formData.publisherName?.trim()) {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Publisher Name is required.' });
        return;
      }
      if (!formData.publisherWebsite?.trim()) {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Article Link is required.' });
        return;
      }
      if (formData.publicationType === 'Book Editor' && !formData.isbn?.trim()) {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'ISBN is required for book submissions.' });
        return;
      }
      if (formData.publicationType === 'Book Chapter' && !formData.bookTitleForChapter?.trim()) {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Book Name is required for Book Chapter.' });
        return;
      }
    } else if (type === 'patent') {
      if (!formData.patentTitle?.trim()) {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Patent Title is required.' });
        return;
      }
      if (!formData.patentNumber?.trim()) {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Patent Number is required.' });
        return;
      }
    } else if (type === 'consultancy') {
      if (!formData.consultancyTitle?.trim()) {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Consultancy Title is required.' });
        return;
      }
      if (!formData.revenueAmount || formData.revenueAmount <= 0) {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Revenue Amount must be greater than zero.' });
        return;
      }
    } else if (type === 'EMR') {
      if (!formData.projectTitle?.trim()) {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Project Title is required.' });
        return;
      }
      if (!formData.sanctionAmount || formData.sanctionAmount < 2000000) {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Sanction Amount must be at least 20 Lacs (2,000,000).' });
        return;
      }
      if (academicYear === '2025-26' && formData.projectStatus === 'Ongoing') {
        if (!formData.sanctionDate) {
          toast({ variant: 'destructive', title: 'Validation Error', description: 'Sanction Date is required for Ongoing EMR projects.' });
          return;
        }
        const cutoffDate = new Date('2025-06-01');
        const sDate = new Date(formData.sanctionDate);
        if (sDate >= cutoffDate) {
          toast({ variant: 'destructive', title: 'Validation Error', description: 'Sanction Date for ongoing EMR Project should be before 1st June, 2025 for Cycle of 2025-26.' });
          return;
        }
      }
      if (formData.startDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const start = new Date(formData.startDate);
        if (start > today) {
          toast({ variant: 'destructive', title: 'Validation Error', description: 'Project Start Date cannot be in the future.' });
          return;
        }
      }
    } else if (type === 'student') {
      if (!formData.studentName?.trim()) {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Student Name is required.' });
        return;
      }
      if (!formData.studentEnrollmentNo?.trim()) {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Enrollment Number is required.' });
        return;
      }
      if (!formData.studentInstitute?.trim()) {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Institute is required.' });
        return;
      }
      if (!formData.studentDepartment?.trim()) {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Department is required.' });
        return;
      }
    } else if (type === 'activity') {
      if (!formData.eventName?.trim()) {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Event Name is required.' });
        return;
      }
      if (formData.activityCategory !== 'Membership' && formData.activityCategory !== 'EMR team member') {
        if (!formData.startDate) {
          toast({ variant: 'destructive', title: 'Validation Error', description: 'Event Start Date is required.' });
          return;
        }
        if (!formData.endDate) {
          toast({ variant: 'destructive', title: 'Validation Error', description: 'Event End Date is required.' });
          return;
        }
        const yearParts = academicYear.split('-');
        const startYear = parseInt(yearParts[0], 10);
        const endYear = startYear + 1;
        const minDate = new Date(`${startYear}-06-01`);
        const maxDate = new Date(`${endYear}-05-31`);

        const sDate = new Date(formData.startDate);
        const eDate = new Date(formData.endDate);

        if (sDate < minDate || sDate > maxDate) {
          toast({ variant: 'destructive', title: 'Validation Error', description: `Start Date must be within the current evaluation year (01/06/${startYear} to 31/05/${endYear}).` });
          return;
        }
        if (eDate < minDate || eDate > maxDate) {
          toast({ variant: 'destructive', title: 'Validation Error', description: `End Date must be within the current evaluation year (01/06/${startYear} to 31/05/${endYear}).` });
          return;
        }
        if (sDate > eDate) {
          toast({ variant: 'destructive', title: 'Validation Error', description: 'Start Date cannot be after the End Date.' });
          return;
        }
      }
    } else if (type === 'other') {
      if (!formData.details?.trim()) {
        toast({ variant: 'destructive', title: 'Validation Error', description: 'Paragraph & Description is required.' });
        return;
      }
    }

    setSaving(true);
    try {
      const payload: Partial<ArpsSubmission> = {
        ...formData,
        academicYear,
        submissionType: type,
        status: submitStatus,
        proofUrls: proofs.map(p => p.url),
        uid: currentUser.uid,
        userName: currentUser.name,
        userEmail: currentUser.email,
        faculty: currentUser.faculty || 'N/A',
      };

      if (editId && existingSubmission && existingSubmission.status === 'Resubmission Required') {
        const diffs: Record<string, { oldValue: any; newValue: any }> = {};
        Object.keys(FIELD_LABELS).forEach((key) => {
          const oldRaw = (existingSubmission as any)[key];
          const newRaw = (payload as any)[key];
          const oldVal = getComparisonValue(oldRaw);
          const newVal = getComparisonValue(newRaw);
          if (oldVal !== newVal) {
            diffs[key] = {
              oldValue: oldRaw === undefined ? null : oldRaw,
              newValue: newRaw === undefined ? null : newRaw
            };
          }
        });
        if (Object.keys(diffs).length > 0) {
          payload.revisionDiffs = diffs;
        }
      }

      let result;
      if (editId) {
        result = await updateArpsSubmission(editId, payload);
      } else {
        result = await submitArpsSubmission(payload);
      }

      if (result.success) {
        toast({
          title: submitStatus === 'Submitted' ? 'Submission Sent' : 'Draft Saved',
          description: submitStatus === 'Submitted'
            ? 'Your entry has been submitted to the reviewer successfully.'
            : 'Your draft has been saved successfully.'
        });
        router.push('/dashboard/arps-submission');
      } else {
        toast({ variant: 'destructive', title: 'Action Failed', description: result.error || 'Failed to process submission.' });
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message || 'An unexpected error occurred.' });
    } finally {
      setSaving(false);
    }
  };

  // Real-time local raw score calculator
  const estimateRawScore = (): number => {
    if (!policyRules) return 0;
    const rules = policyRules;

    try {
      if (type === 'publication') {
        const pubType = formData.publicationType || 'Journal';
        if (pubType === 'Journal') {
          const quart = (formData.journalClassification || 'Q4').toLowerCase();
          const base = rules.publications[quart] || 10;
          let multiplier = 1.0;
          if (formData.articleType === 'Original Research') {
            multiplier = rules.publications.originalResearchMultiplier;
          } else if (formData.articleType === 'Review') {
            multiplier = (quart === 'q1' || quart === 'q2')
              ? rules.publications.reviewQ1Q2Multiplier
              : rules.publications.reviewQ3Q4Multiplier;
          } else if (formData.articleType === 'Case Report' || formData.articleType === 'Short Survey') {
            multiplier = rules.publications.caseReportMultiplier;
          }

          let authorMultiplier = 1.0;
          const pos = formData.authorPosition;
          if (pos === 'Single Author') {
            authorMultiplier = rules.publications.singleAuthorMultiplier;
          } else if (pos === 'First Author' || pos === 'Corresponding Author' || pos === 'First & Corresponding Author') {
            authorMultiplier = rules.publications.firstCorrespondingMultiplier;
          } else if (pos === 'Co-Author') {
            const order = Number(formData.authorOrder) || 2;
            authorMultiplier = order <= 5
              ? rules.publications.coAuthorUpTo5Multiplier
              : rules.publications.coAuthor6OnwardsMultiplier;
            if (formData.isSinglePuAuthorWithExternal) {
              authorMultiplier = rules.publications.singlePuCoAuthorWithExternalMultiplier;
            }
          }
          return base * multiplier * authorMultiplier;
        } else if (pubType === 'Book Chapter') {
          const base = rules.publications.bookChapterBase || 6;
          const pos = formData.authorPosition;
          const authorMultiplier = (pos === 'First Author' || pos === 'Corresponding Author' || pos === 'First & Corresponding Author' || pos === 'Single Author')
            ? rules.publications.firstCorrespondingMultiplier
            : rules.publications.coAuthorUpTo5Multiplier;
          return base * authorMultiplier;
        } else if (pubType === 'Book Editor') {
          const base = rules.publications.bookEditorBase || 18;
          const editors = Number(formData.totalAuthors) || 1;
          return base / editors;
        } else if (pubType === 'Conference Proceedings') {
          const base = rules.publications.conferenceProceedingsBase || 3;
          const pos = formData.authorPosition;
          const authorMultiplier = (pos === 'First Author' || pos === 'Corresponding Author' || pos === 'First & Corresponding Author' || pos === 'Single Author')
            ? rules.publications.firstCorrespondingMultiplier
            : rules.publications.coAuthorUpTo5Multiplier;
          return base * authorMultiplier;
        }
      }

      if (type === 'patent') {
        let base = 0;
        const cat = formData.patentCategory || 'Published';
        if (cat === 'Published') base = rules.patents.publishedBase;
        else if (cat === 'Granted India') base = rules.patents.grantedIndiaBase;
        else if (cat === 'Granted International') base = rules.patents.grantedInternationalBase;

        const mult = formData.isPuSoleApplicant
          ? rules.patents.puSoleApplicantMultiplier
          : (formData.isPuJointApplicant ? rules.patents.coApplicantMultiplier : 0.8);
        return base * mult;
      }

      if (type === 'consultancy') {
        const rev = Number(formData.revenueAmount) || 0;
        let score = 0;
        const slabs = rules.consultancy.slabs;
        let matched = false;
        for (const slab of slabs) {
          if (rev >= slab.min && rev < slab.max) {
            score = slab.points;
            matched = true;
            break;
          }
        }
        if (!matched && rev >= 500000) {
          const base = rules.consultancy.baseAbove500k;
          const extraRev = rev - 500000;
          const steps = Math.floor(extraRev / rules.consultancy.extraSlabStep);
          score = base + (steps * rules.consultancy.extraSlabPoints);
        }
        return score;
      }

      if (type === 'EMR') {
        const amt = Number(formData.sanctionAmount) || 0;
        const isSanctioned = formData.projectStatus === 'Sanctioned';
        const role = formData.role || 'Team Member';
        let score = 0;
        const tiers = isSanctioned ? rules.emr.sanctioned : rules.emr.ongoing;
        for (const tier of tiers) {
          if (amt >= tier.min && amt < tier.max) {
            if (role === 'PI') score = tier.pi;
            else if (role === 'Co-PI') score = tier.copi;
            break;
          }
        }
        return score;
      }

      if (type === 'student') {
        const prog = formData.program || 'PhD';
        const isCompleted = formData.studentStatus === 'Completed';
        if (prog === 'PhD') {
          return isCompleted ? rules.activities.phdCompleted : rules.activities.phdOngoing;
        } else {
          return isCompleted ? rules.activities.pgCompleted : rules.activities.pgOngoing;
        }
      }

      if (type === 'activity') {
        const cat = formData.activityCategory || 'Conference presentation';
        const days = Number(formData.eventDurationDays) || 1;
        if (cat === 'Conference presentation') {
          const isIndia = formData.location === 'In PU' || formData.location === 'Outside PU';
          const rate = isIndia ? rules.activities.conferencePresentationIndia : rules.activities.conferencePresentationOutsideIndia;
          return days * rate;
        } else if (cat === 'Convener') return rules.activities.convener;
        else if (cat === 'Coordinator') return rules.activities.coordinator;
        else if (cat === 'Expert talk') {
          return formData.location === 'In PU' ? rules.activities.expertTalkInPu : rules.activities.expertTalkOutsidePu;
        } else if (cat === 'Participation') {
          return formData.location === 'In PU' ? rules.activities.participationInPu : rules.activities.participationOutsidePu;
        } else if (cat === 'Membership') {
          return formData.membershipType === 'Lifetime' ? 0 : rules.activities.membership;
        } else if (cat === 'EMR team member') return rules.activities.emrTeamMember;
      }
      if (type === 'other') {
        return 0;
      }
    } catch (e) {
      console.error(e);
    }
    return 0;
  };

  const estimatedScore = estimateRawScore();

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center py-40 space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <span className="text-muted-foreground text-sm font-medium">Loading...</span>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto pb-20 pt-10 px-4 md:px-8">
      <div className="flex items-center gap-4 mb-8">
        <Button variant="outline" size="icon" onClick={() => router.push('/dashboard/arps-submission')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex justify-center">
        {/* Form panel */}
        <Card className="w-full shadow-2xl border-t-4 border-t-primary overflow-hidden">
          <CardHeader className="bg-primary/5 pb-8">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="capitalize text-3xl font-bold tracking-tight text-primary">
                  {type} Submission Form
                </CardTitle>
                <CardDescription className="text-base text-muted-foreground/80">Complete all required details to secure your ARPS increment.</CardDescription>
              </div>
              <div className="bg-primary/10 p-3 rounded-2xl hidden md:block">
                <FileText className="h-10 w-10 text-primary" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-8 space-y-10 bg-card">

            {/* A. Publication Form */}
            {type === 'publication' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="publicationType">Publication Type <span className="text-rose-500">*</span></Label>
                  <select
                    id="publicationType"
                    value={formData.publicationType}
                    onChange={(e) => handleInputChange('publicationType', e.target.value)}
                    className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="Journal">Journal Article</option>
                    <option value="Book Chapter">Book Chapter (Scopus-indexed)</option>
                    <option value="Book Editor">Book (Editor)</option>
                    <option value="Conference Proceedings">Conference Proceedings (Scopus-indexed)</option>
                  </select>
                </div>

                {(formData.publicationType === 'Journal' || formData.publicationType === 'Book Chapter' || formData.publicationType === 'Conference Proceedings') && (
                  <div className="space-y-2">
                    <Label htmlFor="doi">Digital Object Identifier (DOI) <span className="text-rose-500">*</span></Label>
                    <Input
                      id="doi"
                      value={formData.doi || ''}
                      onChange={(e) => handleInputChange('doi', e.target.value)}
                      placeholder={formData.publicationType === 'Conference Proceedings' ? 'e.g. 10.1007/978-3-030-12345-6_7' : 'e.g. 10.1016/j.cell.2026.05.01'}
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <Button size="sm" onClick={() => handleFetchMetadata('scopus')} disabled={!formData.doi || isFetchingMeta}>
                        Fetch from Scopus
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleFetchMetadata('wos')} disabled={!formData.doi || isFetchingMeta}>
                        Fetch from WoS
                      </Button>
                      {isFetchingMeta && <span className="text-xs text-muted-foreground ml-2">Fetching metadata…</span>}
                    </div>
                  </div>
                )}

                {formData.publicationType === 'Book Editor' && (
                  <div className="space-y-2">
                    <Label htmlFor="isbn">Book ISBN <span className="text-rose-500">*</span></Label>
                    <Input
                      id="isbn"
                      value={formData.isbn || ''}
                      onChange={(e) => handleInputChange('isbn', e.target.value)}
                      placeholder="Enter ISBN for the book"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="paperTitle">Title of the Work / Paper <span className="text-rose-500">*</span></Label>
                  <Input
                    id="paperTitle"
                    value={formData.paperTitle || ''}
                    onChange={(e) => handleInputChange('paperTitle', e.target.value)}
                    placeholder="Enter full title of publication"
                  />
                </div>                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="publisherName">Publisher Name <span className="text-rose-500">*</span></Label>
                    <Input
                      id="publisherName"
                      value={formData.publisherName || ''}
                      onChange={(e) => handleInputChange('publisherName', e.target.value)}
                      placeholder="Enter publisher name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="publisherWebsite">Article Link <span className="text-rose-500">*</span></Label>
                    <Input
                      id="publisherWebsite"
                      type="url"
                      value={formData.publisherWebsite || ''}
                      onChange={(e) => handleInputChange('publisherWebsite', e.target.value)}
                      placeholder="Link to the article on publisher's site"
                    />
                  </div>
                </div>

                {formData.publicationType === 'Book Chapter' && (
                  <div className="space-y-2 animate-in slide-in-from-top-2">
                    <Label htmlFor="bookTitleForChapter">Book Name <span className="text-rose-500">*</span></Label>
                    <Input
                      id="bookTitleForChapter"
                      value={formData.bookTitleForChapter || ''}
                      onChange={(e) => handleInputChange('bookTitleForChapter', e.target.value)}
                      placeholder="Title of the Book"
                    />
                  </div>
                )}

                {(formData.publicationType === 'Book Chapter' || formData.publicationType === 'Conference Proceedings') && (
                  <div className="space-y-2">
                    <Label htmlFor="scopusLink">Scopus Link of Publication <span className="text-rose-500">*</span></Label>
                    <Input
                      id="scopusLink"
                      type="url"
                      value={formData.scopusLink || ''}
                      onChange={(e) => handleInputChange('scopusLink', e.target.value)}
                      placeholder="https://www.scopus.com/pages/publications/..."
                    />
                  </div>
                )}

                {(formData.publicationType === 'Journal' || formData.publicationType === 'Book Chapter' || formData.publicationType === 'Conference Proceedings') && (
                  <>
                    {formData.publicationType === 'Journal' && (
                      <div className="space-y-2">
                        <Label htmlFor="journalName">Journal Name <span className="text-rose-500">*</span></Label>
                        <Input
                          id="journalName"
                          value={formData.journalName || ''}
                          onChange={(e) => handleInputChange('journalName', e.target.value)}
                          placeholder="Full name of the journal"
                        />
                      </div>
                    )}

                    {formData.publicationType === 'Journal' && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="journalClassification">Journal Quartile Rating <span className="text-rose-500">*</span></Label>
                          <select
                            id="journalClassification"
                            value={formData.journalClassification}
                            onChange={(e) => handleInputChange('journalClassification', e.target.value)}
                            className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                          >
                            <option value="">Select Quartile</option>
                            <option value="Q1">Q1</option>
                            <option value="Q2">Q2</option>
                            <option value="Q3">Q3</option>
                            <option value="Q4">Q4</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="indexType">Indexing Verification <span className="text-rose-500">*</span></Label>
                          <select
                            id="indexType"
                            value={formData.indexType}
                            onChange={(e) => handleInputChange('indexType', e.target.value)}
                            className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                          >
                            <option value="">Select Indexing</option>
                            <option value="scopus">Scopus</option>
                            <option value="wos">Web of Science (WoS)</option>
                            <option value="both">Both (Scopus & WoS)</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="articleType">Article Type Category <span className="text-rose-500">*</span></Label>
                          <select
                            id="articleType"
                            value={formData.articleType}
                            onChange={(e) => handleInputChange('articleType', e.target.value)}
                            className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                          >
                            <option value="">Select Article Type</option>
                            <option value="Original Research">Original Research / Short Comm.</option>
                            <option value="Review">Review Article</option>
                            <option value="Case Report">Case Report</option>
                            <option value="Short Survey">Short Survey / Case Study</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {formData.publicationType === 'Journal' && (formData.indexType === 'scopus' || formData.indexType === 'both') && (
                      <div className="space-y-2 mt-4 animate-in slide-in-from-top-2">
                        <Label htmlFor="scopusLink">Scopus Link of Publication <span className="text-rose-500">*</span></Label>
                        <Input
                          id="scopusLink"
                          type="url"
                          value={formData.scopusLink || ''}
                          onChange={(e) => handleInputChange('scopusLink', e.target.value)}
                          placeholder="https://www.scopus.com/pages/publications/..."
                        />
                      </div>
                    )}
                  </>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="authorPosition">Your Role <span className="text-rose-500">*</span></Label>
                    <select
                      id="authorPosition"
                      value={formData.authorPosition}
                      onChange={(e) => {
                        const val = e.target.value;
                        handleInputChange('authorPosition', val);
                        if (val === 'Single Author' || val === 'First Author' || val === 'First & Corresponding Author') {
                          handleInputChange('authorOrder', 1);
                        } else if (val === 'Co-Author' || val === 'Corresponding Author') {
                          handleInputChange('authorOrder', 2);
                        }
                      }}
                      className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">Select Your Role</option>
                      <option value="Single Author">Single Author</option>
                      <option value="First Author">First Author</option>
                      <option value="Corresponding Author">Corresponding Author</option>
                      <option value="First & Corresponding Author">First & Corresponding Author</option>
                      <option value="Co-Author">Co-Author</option>
                    </select>
                  </div>

                  <div className="space-y-2 animate-in slide-in-from-top-2">
                    <Label htmlFor="authorOrder">Your Author Position (1-10) <span className="text-rose-500">*</span></Label>
                    <Input
                      id="authorOrder"
                      type="number"
                      min="1"
                      max="10"
                      value={formData.authorOrder !== undefined ? formData.authorOrder : ''}
                      disabled={!formData.authorPosition || formData.authorPosition === 'First Author' || formData.authorPosition === 'First & Corresponding Author' || formData.authorPosition === 'Single Author'}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') {
                          handleInputChange('authorOrder', '');
                          return;
                        }
                        let num = parseInt(val, 10);
                        if (isNaN(num)) return;
                        if (num > 10) num = 10;
                        if (num < 1) num = 1;
                        handleInputChange('authorOrder', num);
                      }}
                      placeholder="e.g. 1"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="totalAuthors">Total Authors count <span className="text-rose-500">*</span></Label>
                    <Input
                      id="totalAuthors"
                      type="number"
                      min="1"
                      value={formData.totalAuthors !== undefined ? formData.totalAuthors : ''}
                      onChange={(e) => handleInputChange('totalAuthors', e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="publicationDate">Publication Date (As in Scopus)<span className="text-rose-500">*</span></Label>
                    <Input
                      id="publicationDate"
                      type="date"
                      value={formData.publicationDate || ''}
                      onChange={(e) => handleInputChange('publicationDate', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fundingAcknowledgement">Funding Agency Acknowledged (Optional)</Label>
                    <Input
                      id="fundingAcknowledgement"
                      value={formData.fundingAcknowledgement || ''}
                      onChange={(e) => handleInputChange('fundingAcknowledgement', e.target.value)}
                      placeholder="e.g. DST-SERB, ISRO, PU seed grant"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isSinglePuAuthorWithExternal"
                      checked={formData.isSinglePuAuthorWithExternal || false}
                      onCheckedChange={(checked) => handleInputChange('isSinglePuAuthorWithExternal', !!checked)}
                    />
                    <label htmlFor="isSinglePuAuthorWithExternal" className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      I am the single Parul University co-author working with external international/national authors
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="hasImrAcknowledgement"
                      checked={formData.hasImrAcknowledgement || false}
                      onCheckedChange={(checked) => handleInputChange('hasImrAcknowledgement', !!checked)}
                    />
                    <label htmlFor="hasImrAcknowledgement" className="text-xs font-medium leading-none">
                      Includes explicit acknowledgment to internal IMR research grants
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* B. Patent Form */}
            {type === 'patent' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="patentTitle">Patent Title / Invention Description <span className="text-rose-500">*</span></Label>
                  <Input
                    id="patentTitle"
                    value={formData.patentTitle || ''}
                    onChange={(e) => handleInputChange('patentTitle', e.target.value)}
                    placeholder="Enter patent description title"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="patentCategory">Patent Status Category <span className="text-rose-500">*</span></Label>
                    <select
                      id="patentCategory"
                      value={formData.patentCategory}
                      onChange={(e) => handleInputChange('patentCategory', e.target.value)}
                      className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="Published">Patent Published</option>
                      <option value="Granted India">Patent Granted India</option>
                      <option value="Granted International">Patent Granted International</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="patentNumber">Filing / Grant / Application Number <span className="text-rose-500">*</span></Label>
                    <Input
                      id="patentNumber"
                      value={formData.patentNumber || ''}
                      onChange={(e) => handleInputChange('patentNumber', e.target.value)}
                      placeholder="e.g. Patent application reference number"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="filingDate">Publishing Date <span className="text-rose-500">*</span></Label>
                    <Input
                      id="filingDate"
                      type="date"
                      value={formData.filingDate || ''}
                      onChange={(e) => handleInputChange('filingDate', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="grantDate">Grant Date (if applicable)</Label>
                    <Input
                      id="grantDate"
                      type="date"
                      value={formData.grantDate || ''}
                      onChange={(e) => handleInputChange('grantDate', e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="applicantStructure">Applicant Structure Details</Label>
                  <Input
                    id="applicantStructure"
                    value={formData.applicantStructure || ''}
                    onChange={(e) => handleInputChange('applicantStructure', e.target.value)}
                    placeholder="Names of joint institutional applicants or individual co-applicants"
                  />
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isPuSoleApplicant"
                      checked={formData.isPuSoleApplicant || false}
                      onCheckedChange={(checked) => {
                        handleInputChange('isPuSoleApplicant', !!checked);
                        if (checked) handleInputChange('isPuJointApplicant', false);
                      }}
                    />
                    <label htmlFor="isPuSoleApplicant" className="text-xs font-medium leading-none">
                      Parul University is the SOLE applicant of the patent
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isPuJointApplicant"
                      checked={formData.isPuJointApplicant || false}
                      onCheckedChange={(checked) => {
                        handleInputChange('isPuJointApplicant', !!checked);
                        if (checked) handleInputChange('isPuSoleApplicant', false);
                      }}
                    />
                    <label htmlFor="isPuJointApplicant" className="text-xs font-medium leading-none">
                      Parul University is a JOINT co-applicant of the patent
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* C. Consultancy Form */}
            {type === 'consultancy' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="consultancyTitle">Consultancy Project Assignment Title <span className="text-rose-500">*</span></Label>
                  <Input
                    id="consultancyTitle"
                    value={formData.consultancyTitle || ''}
                    onChange={(e) => handleInputChange('consultancyTitle', e.target.value)}
                    placeholder="Enter consulting project name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="clientOrganization">Client Sponsoring Organization <span className="text-rose-500">*</span></Label>
                  <Input
                    id="clientOrganization"
                    value={formData.clientOrganization || ''}
                    onChange={(e) => handleInputChange('clientOrganization', e.target.value)}
                    placeholder="Company or external agency that requested consultancy"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="revenueAmount">Revenue Amount Received (₹) <span className="text-rose-500">*</span></Label>
                    <Input
                      id="revenueAmount"
                      type="number"
                      min="1"
                      value={formData.revenueAmount || 0}
                      onChange={(e) => handleInputChange('revenueAmount', Number(e.target.value))}
                      placeholder="Enter consulting revenue"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="transactionDate">Financial Transaction Date <span className="text-rose-500">*</span></Label>
                    <Input
                      id="transactionDate"
                      type="date"
                      value={formData.transactionDate || ''}
                      onChange={(e) => handleInputChange('transactionDate', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* D. EMR Form */}
            {type === 'EMR' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="projectTitle">EMR Sponsoring Project Title <span className="text-rose-500">*</span></Label>
                  <Input
                    id="projectTitle"
                    value={formData.projectTitle || ''}
                    onChange={(e) => handleInputChange('projectTitle', e.target.value)}
                    placeholder="Enter sanctioned EMR project title"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="emrTeamMembers">PI / Co-PI / Team Member (within PU) Names</Label>
                  <Textarea
                    id="emrTeamMembers"
                    value={formData.emrTeamMembers || ''}
                    onChange={(e) => handleInputChange('emrTeamMembers', e.target.value)}
                    placeholder="Enter names of PU members involved in this EMR project..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fundingAgency">External Funding Sponsoring Agency <span className="text-rose-500">*</span></Label>
                    <Input
                      id="fundingAgency"
                      value={formData.fundingAgency || ''}
                      onChange={(e) => handleInputChange('fundingAgency', e.target.value)}
                      placeholder="e.g. DST, DBT, AYUSH, GUJCOST"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sanctionAmount">Sanction Grant Value Amount (₹) <span className="text-rose-500">*</span></Label>
                    <Input
                      id="sanctionAmount"
                      type="number"
                      min="2000000"
                      value={formData.sanctionAmount || 0}
                      onChange={(e) => handleInputChange('sanctionAmount', Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="role">Your Role performed <span className="text-rose-500">*</span></Label>
                    <select
                      id="role"
                      value={formData.role}
                      onChange={(e) => handleInputChange('role', e.target.value)}
                      className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="PI">Principal Investigator (PI)</option>
                      <option value="Co-PI">Co-Investigator (Co-PI)</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="projectStatus">Project Active State <span className="text-rose-500">*</span></Label>
                    <select
                      id="projectStatus"
                      value={formData.projectStatus}
                      onChange={(e) => handleInputChange('projectStatus', e.target.value)}
                      className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="Sanctioned">Newly Sanctioned Cycle</option>
                      <option value="Ongoing">Active Ongoing Project Cycle</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="durationMonths">Sanction Duration (Months) <span className="text-rose-500">*</span></Label>
                    <Input
                      id="durationMonths"
                      type="number"
                      min="1"
                      value={formData.durationMonths || 12}
                      onChange={(e) => handleInputChange('durationMonths', Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="sanctionDate">Sanction Date <span className="text-rose-500">*</span></Label>
                    <Input
                      id="sanctionDate"
                      type="date"
                      value={formData.sanctionDate || ''}
                      onChange={(e) => handleInputChange('sanctionDate', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="startDate">Project Start Date <span className="text-rose-500">*</span></Label>
                    <Input
                      id="startDate"
                      type="date"
                      max={new Date().toISOString().split('T')[0]}
                      value={formData.startDate || ''}
                      onChange={(e) => handleInputChange('startDate', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endDate">Project Scheduled End Date</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={formData.endDate || ''}
                      onChange={(e) => handleInputChange('endDate', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* E. Student Guidance Form */}
            {type === 'student' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="studentName">Student Researcher Name <span className="text-rose-500">*</span></Label>
                    <Input
                      id="studentName"
                      value={formData.studentName || ''}
                      onChange={(e) => handleInputChange('studentName', e.target.value)}
                      placeholder="Full name of student"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="program">Enrolled Program Type <span className="text-rose-500">*</span></Label>
                    <select
                      id="program"
                      value={formData.program}
                      onChange={(e) => handleInputChange('program', e.target.value)}
                      className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="PhD">PhD Scholar</option>
                      <option value="PG Dissertation">Post-Graduate Dissertation</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="studentEnrollmentNo">Enrollment Number <span className="text-rose-500">*</span></Label>
                    <Input
                      id="studentEnrollmentNo"
                      value={formData.studentEnrollmentNo || ''}
                      onChange={(e) => handleInputChange('studentEnrollmentNo', e.target.value)}
                      placeholder="Student ID / Enrollment"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="studentInstitute">Institute <span className="text-rose-500">*</span></Label>
                    <select
                      id="studentInstitute"
                      value={formData.studentInstitute || ''}
                      onChange={(e) => handleInputChange('studentInstitute', e.target.value)}
                      className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">Select Institute</option>
                      <option value="PIET">Parul Institute of Engineering & Technology (PIET)</option>
                      <option value="PIT">Parul Institute of Technology (PIT)</option>
                      <option value="PIAR">Parul Institute of Architecture & Research (PIAR)</option>
                      <option value="PIPR">Parul Institute of Pharmacy & Research (PIPR)</option>
                      <option value="PIA">Parul Institute of Ayurved (PIA)</option>
                      <option value="PIMR">Parul Institute of Management & Research (PIMR)</option>
                      <option value="PIAHS">Parul Institute of Applied Health Sciences (PIAHS)</option>
                      <option value="PIMSR">Parul Institute of Medical Sciences & Research (PIMSR)</option>
                      <option value="PIAS">Parul Institute of Applied Sciences (PIAS)</option>
                      <option value="PIFA">Parul Institute of Fine Arts (PIFA)</option>
                      <option value="PIPA">Parul Institute of Performing Arts (PIPA)</option>
                      <option value="PID">Parul Institute of Design (PID)</option>
                      <option value="PIL">Parul Institute of Law (PIL)</option>
                      <option value="PIN">Parul Institute of Nursing (PIN)</option>
                      <option value="PIIT">Parul Institute of IT & Computer Science (PIIT)</option>
                      <option value="Other">Other / Not Listed</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="studentDepartment">Department <span className="text-rose-500">*</span></Label>
                    <Input
                      id="studentDepartment"
                      value={formData.studentDepartment || ''}
                      onChange={(e) => handleInputChange('studentDepartment', e.target.value)}
                      placeholder="e.g. Computer Science"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="studentStatus">Degree Status <span className="text-rose-500">*</span></Label>
                    <select
                      id="studentStatus"
                      value={formData.studentStatus}
                      onChange={(e) => handleInputChange('studentStatus', e.target.value)}
                      className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="Ongoing">Active Ongoing Guidance</option>
                      <option value="Completed">Degree Awarded / Completed</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="allotmentDetails">Allotment Order Reference</Label>
                    <Input
                      id="allotmentDetails"
                      value={formData.allotmentDetails || ''}
                      onChange={(e) => handleInputChange('allotmentDetails', e.target.value)}
                      placeholder="Order number or letter ID"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* F. Academic Activity Form */}
            {type === 'activity' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="activityCategory">Activity Category Type <span className="text-rose-500">*</span></Label>
                    <select
                      id="activityCategory"
                      value={formData.activityCategory}
                      onChange={(e) => handleInputChange('activityCategory', e.target.value)}
                      className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="Conference presentation">Conference presentation (Scopus/WoS indexed only)</option>
                      <option value="Convener">Convener / Event Organizer</option>
                      <option value="Coordinator">Coordinator / Moderator</option>
                      <option value="Expert talk">Invited Expert Talk Delivered</option>
                      <option value="Participation">FDP/Workshop Participation</option>
                      <option value="Membership">Professional Society Board Membership</option>
                      <option value="EMR team member">Assigned EMR Team Member</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="eventName">Event / Professional Body Name <span className="text-rose-500">*</span></Label>
                    <Input
                      id="eventName"
                      value={formData.eventName || ''}
                      onChange={(e) => handleInputChange('eventName', e.target.value)}
                      placeholder="Title of event, journal board, or association"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="organization">Sponsoring / Host Organization <span className="text-rose-500">*</span></Label>
                  <Input
                    id="organization"
                    value={formData.organization || ''}
                    onChange={(e) => handleInputChange('organization', e.target.value)}
                    placeholder="Name of institute, university, or society hosting the event"
                  />
                </div>

                {/* Conditional fields: membership vs. event-based */}
                {formData.activityCategory === 'Membership' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="membershipType">Membership Duration Type <span className="text-rose-500">*</span></Label>
                      <select
                        id="membershipType"
                        value={formData.membershipType || 'Yearly'}
                        onChange={(e) => handleInputChange('membershipType', e.target.value)}
                        className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="Lifetime">Lifetime</option>
                        <option value="Yearly">Yearly</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="societyType">Society / Board Type <span className="text-rose-500">*</span></Label>
                      <select
                        id="societyType"
                        value={formData.societyType || 'National'}
                        onChange={(e) => handleInputChange('societyType', e.target.value)}
                        className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="National">National</option>
                        <option value="International">International</option>
                      </select>
                    </div>
                  </div>
                ) : formData.activityCategory === 'EMR team member' ? null : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="startDate">Event Start Date <span className="text-rose-500">*</span></Label>
                        <Input
                          id="startDate"
                          type="date"
                          min={`${parseInt(academicYear.split('-')[0], 10)}-06-01`}
                          max={`${parseInt(academicYear.split('-')[0], 10) + 1}-05-31`}
                          value={formData.startDate || ''}
                          onChange={(e) => {
                            const sVal = e.target.value;
                            handleInputChange('startDate', sVal);
                            if (sVal && formData.endDate) {
                              const start = new Date(sVal);
                              const end = new Date(formData.endDate);
                              const diffTime = end.getTime() - start.getTime();
                              const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
                              if (diffDays >= 1) {
                                handleInputChange('eventDurationDays', diffDays);
                              } else {
                                handleInputChange('eventDurationDays', 0);
                              }
                            }
                          }}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="endDate">Event End Date <span className="text-rose-500">*</span></Label>
                        <Input
                          id="endDate"
                          type="date"
                          min={`${parseInt(academicYear.split('-')[0], 10)}-06-01`}
                          max={`${parseInt(academicYear.split('-')[0], 10) + 1}-05-31`}
                          value={formData.endDate || ''}
                          onChange={(e) => {
                            const eVal = e.target.value;
                            handleInputChange('endDate', eVal);
                            if (formData.startDate && eVal) {
                              const start = new Date(formData.startDate);
                              const end = new Date(eVal);
                              const diffTime = end.getTime() - start.getTime();
                              const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
                              if (diffDays >= 1) {
                                handleInputChange('eventDurationDays', diffDays);
                              } else {
                                handleInputChange('eventDurationDays', 0);
                              }
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="eventDurationDays">Event Duration (Days) <span className="text-rose-500">*</span></Label>
                        <Input
                          id="eventDurationDays"
                          type="number"
                          value={formData.eventDurationDays || 0}
                          disabled
                          placeholder="Calculated from dates"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="location">Event Location Stature <span className="text-rose-500">*</span></Label>
                        <select
                          id="location"
                          value={formData.location}
                          onChange={(e) => handleInputChange('location', e.target.value)}
                          className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="In PU">Internal (Hosted inside PU)</option>
                          <option value="Outside PU">National (Hosted in India, outside PU)</option>
                          <option value="Outside India">International (Outside India)</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="rolePerformed">Specific Role performed</Label>
                        <Input
                          id="rolePerformed"
                          value={formData.rolePerformed || ''}
                          onChange={(e) => handleInputChange('rolePerformed', e.target.value)}
                          placeholder="e.g. Session chair, Keynote, Moderator"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* G. Other Details Form */}
            {type === 'other' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="details">Paragraph & Description <span className="text-rose-500">*</span></Label>
                  <Textarea
                    id="details"
                    rows={6}
                    value={formData.details || ''}
                    onChange={(e) => handleInputChange('details', e.target.value)}
                    placeholder="Enter the Paragraph and Description of your achievement here."
                  />
                  <p className="text-xs text-muted-foreground">
                    Please provide a clear and concise description of the achievement.
                  </p>
                </div>
              </div>
            )}

            {/* Document upload zone */}
            <div className="space-y-4 pt-6 border-t border-border/50">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                <Upload className="h-5 w-5 text-indigo-500" /> Documentary Proof Document Uploads
              </h3>

              <div className="border-2 border-dashed border-muted rounded-xl p-6 flex flex-col items-center justify-center bg-muted/20 relative">
                <input
                  type="file"
                  id="proof-upload"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  accept=".pdf,image/png,image/jpeg,.doc,.docx"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
                <div className="flex flex-col items-center space-y-2 text-center pointer-events-none">
                  {uploading ? (
                    <>
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <span className="text-xs text-muted-foreground">Uploading files...</span>
                    </>
                  ) : (
                    <>
                      <div className="bg-primary/10 p-3 rounded-full text-primary">
                        <Upload className="h-6 w-6" />
                      </div>
                      <span className="text-xs font-semibold">Click or drag files to upload proofs</span>
                      <span className="text-[10px] text-muted-foreground">Accepted formats: PDF, PNG, JPEG, DOCX up to 10MB</span>
                    </>
                  )}
                </div>
              </div>

              {/* Uploaded proofs listing */}
              {proofs.length > 0 && (
                <div className="space-y-2 pt-2">
                  <Label>Uploaded Proof Files ({proofs.length})</Label>
                  <div className="space-y-2">
                    {proofs.map((proof, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-muted/40 rounded-lg border text-xs">
                        <div className="flex items-center gap-2 max-w-[80%]">
                          <FileText className="h-4 w-4 text-primary shrink-0" />
                          <span className="font-medium truncate">{proof.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="ghost" className="text-primary hover:underline h-auto p-0" onClick={() => window.open(proof.url, '_blank')}>
                            Preview
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-500 hover:text-rose-600 shrink-0" onClick={() => removeProof(index)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Error displays */}
            {existingSubmission?.remarks && (
              <div className="flex gap-2 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-800 dark:text-rose-200 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Returned for Correction remarks:</span>
                  <p className="mt-1">{existingSubmission.remarks}</p>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col md:flex-row justify-between items-center mt-10 pt-8 border-t gap-4">
              <div className="flex items-center gap-2 w-full md:w-auto">
                <Button variant="ghost" type="button" onClick={() => router.back()} className="flex-1 md:flex-none rounded-xl h-12 font-semibold hover:bg-muted">Cancel</Button>
                {existingSubmission?.status !== 'Resubmission Required' && (
                  <Button variant="outline" type="button" disabled={saving} onClick={() => handleSave('Draft')} className="flex-1 md:flex-none rounded-xl h-12 border-primary/30 text-primary hover:bg-primary/5">Save for later</Button>
                )}
              </div>
              <Button type="button" size="lg" disabled={saving} onClick={() => handleSave('Submitted')} className="w-full md:w-auto rounded-xl h-12 px-12 font-black shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all">
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 h-4 w-4" />
                )}
                Submit for Verification
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
