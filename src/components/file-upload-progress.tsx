import React from 'react';

interface FileUploadProgressProps {
  uploadProgress: { [key: string]: number };
  isUploading: boolean;
}

export function FileUploadProgress({ uploadProgress, isUploading }: FileUploadProgressProps) {
  const progressEntries = Object.entries(uploadProgress);

  if (progressEntries.length === 0 && !isUploading) {
    return null;
  }

  return (
    <div className="space-y-2">
      {progressEntries.map(([key, progress]) => {
        const fileName = key.split('-').slice(1, -2).join('-');
        return (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground truncate flex-1">{fileName}</span>
              <span className="text-muted-foreground ml-2">{progress}%</span>
            </div>
            <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
              <div
                className="bg-primary h-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        );
      })}
      {isUploading && progressEntries.length === 0 && (
        <div className="flex items-center text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin mr-2 border-2 border-muted-foreground border-t-primary rounded-full" />
          Preparing upload...
        </div>
      )}
    </div>
  );
}
