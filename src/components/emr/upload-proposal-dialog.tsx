
'use client';

import { useState } from 'react';
import type { FundingCall, User, EmrInterest } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Loader2, Upload, File, Trash2, MessageSquareWarning } from 'lucide-react';
import { uploadEmrProposal, removeEmrProposal } from '@/app/emr-actions';
import { format, isAfter, parseISO } from 'date-fns';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

interface UploadProposalDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  interest: EmrInterest;
  call: FundingCall;
  user: User;
  adminUser?: User;
  onUploadSuccess: () => void;
}

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
};

const MAX_PROPOSAL_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

export function UploadProposalDialog({ isOpen, onOpenChange, interest, call, user, adminUser, onUploadSuccess }: UploadProposalDialogProps) {
  const [proposalFile, setProposalFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      if (file.size > MAX_PROPOSAL_FILE_SIZE) {
        setProposalFile(null);
        setFileError('File is too large. Please upload a file smaller than 15 MB.');
        return;
      }

      const allowedTypes = ['application/pdf', 'application/zip', 'application/x-zip-compressed'];
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (extension && !['pdf', 'zip'].includes(extension)) {
        setProposalFile(null);
        setFileError('Only ZIP and PDF files are allowed.');
        return;
      }

      if (file.type && !allowedTypes.includes(file.type) && !['pdf', 'zip'].includes(extension || '')) {
        setProposalFile(null);
        setFileError('Only ZIP and PDF files are allowed.');
        return;
      }

      setProposalFile(file);
    }
  };

  const handleUpload = async () => {
    if (!proposalFile) return;
    setIsUploading(true);
    try {
      const dataUrl = await fileToDataUrl(proposalFile);
      const result = await uploadEmrProposal(interest.id, dataUrl, proposalFile.name, user, adminUser?.name);

      if (result.success) {
        toast({ title: 'Success', description: 'Your proposal has been uploaded.' });
        onUploadSuccess();
        onOpenChange(false);
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Upload Failed', description: error.message || 'An unexpected error occurred.' });
    } finally {
      setIsUploading(false);
    }
  };

    /* 
       REMOVED: handleDelete - Mandatory documents cannot be deleted once registered.
       Users must use the 'Replace' functionality instead to ensure integrity.
    */

  const deadlineWithTime = interest.meetingSlot?.pptDeadline ? parseISO(interest.meetingSlot.pptDeadline) : null;
  const isDeadlinePast = deadlineWithTime ? isAfter(new Date(), deadlineWithTime) : false;
  const isSuperAdmin = adminUser?.role === 'Super-admin';
  const isUploadDisabled = isDeadlinePast && !isSuperAdmin;

  let dialogDescription = 'Upload your proposal (ZIP or PDF).';
  if (deadlineWithTime && !isSuperAdmin) {
    dialogDescription = `The presentation deadline is ${format(deadlineWithTime, 'PPpp')}. Please share your proposal on the portal before then.`;
  } else if (isSuperAdmin) {
    dialogDescription = 'As a Super Admin, you can upload or replace proposals at any time, bypassing the presentation deadline.';
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!isUploading) onOpenChange(open); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Proposal</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        {isUploadDisabled && !isSuperAdmin && (
          <Alert variant="destructive">
            <MessageSquareWarning className="h-4 w-4" />
            <AlertTitle>Deadline Passed</AlertTitle>
            <AlertDescription>The deadline for uploading the proposal has passed. Please contact the RDC for assistance.</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 py-4">
          {interest.proposalUrl && (
            <div className="flex items-center justify-between p-3 rounded-lg border bg-secondary">
              <a href={interest.proposalUrl} target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline flex items-center gap-2">
                <File className="h-4 w-4" /> View Current Proposal
              </a>
            </div>
          )}
          <div className="space-y-2">
            <Input type="file" accept=".zip,.pdf" onChange={handleFileChange} disabled={isUploadDisabled && !isSuperAdmin} />
            <p className="text-xs text-muted-foreground">Accepted formats: PDF or ZIP. Max file size: 15 MB.</p>
            {fileError && <p className="text-xs text-destructive">{fileError}</p>}
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isUploading}>Cancel</Button>
          </DialogClose>
          <Button onClick={handleUpload} disabled={isUploading || !proposalFile || (isUploadDisabled && !isSuperAdmin)}>
            {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {interest.proposalUrl ? 'Replace' : 'Upload'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
