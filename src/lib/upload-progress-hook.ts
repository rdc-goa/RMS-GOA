import { useState } from 'react';
import { uploadFileToApi } from './upload-client';
import { useToast } from '@/hooks/use-toast';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

interface UploadProgressState {
  [key: string]: number;
}

export function useFileUploadProgress() {
  const { toast } = useToast();
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState>({});

  const uploadFilesWithProgress = async (
    files: FileList | null,
    fieldName: string,
    onSuccess: (urls: string[]) => void,
    options?: {
      accept?: string[];
      maxFiles?: number;
      maxFileSize?: number;
    }
  ) => {
    if (!files || files.length === 0) return;

    const maxFiles = options?.maxFiles ?? 10;
    const maxFileSize = options?.maxFileSize ?? MAX_FILE_SIZE;
    const acceptedTypes = options?.accept ?? ['application/pdf'];

    const uploadedUrls: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileKey = `${fieldName}-${file.name}-${Date.now()}-${i}`;

      // Validate file size
      if (file.size > maxFileSize) {
        toast({
          variant: 'destructive',
          title: 'File too large',
          description: `${file.name} exceeds ${maxFileSize / 1024 / 1024} MB limit.`,
        });
        continue;
      }

      // Validate file type
      if (!acceptedTypes.includes(file.type)) {
        toast({
          variant: 'destructive',
          title: 'Invalid file type',
          description: `${file.name} is not an accepted file type.`,
        });
        continue;
      }

      // Set initial progress
      setUploadProgress((prev) => ({ ...prev, [fileKey]: 0 }));

      try {
        const result = await uploadFileToApi(file);
        if (result.success && result.url) {
          uploadedUrls.push(result.url);
          setUploadProgress((prev) => ({ ...prev, [fileKey]: 100 }));
        } else {
          toast({
            variant: 'destructive',
            title: 'Upload failed',
            description: `Failed to upload ${file.name}`,
          });
        }
      } catch (error) {
        console.error(`Error uploading ${file.name}:`, error);
        toast({
          variant: 'destructive',
          title: 'Upload failed',
          description: `Failed to upload ${file.name}`,
        });
      } finally {
        // Remove progress after a short delay
        setTimeout(() => {
          setUploadProgress((prev) => {
            const newProgress = { ...prev };
            delete newProgress[fileKey];
            return newProgress;
          });
        }, 1000);
      }
    }

    if (uploadedUrls.length > 0) {
      onSuccess(uploadedUrls);
      toast({
        title: 'Success',
        description: `${uploadedUrls.length} file(s) uploaded successfully.`,
      });
    }
  };

  return {
    uploadProgress,
    uploadFilesWithProgress,
  };
}
