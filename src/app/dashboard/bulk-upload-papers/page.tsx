'use client';

import { useState } from 'react';
import { readExcelFromBuffer } from '@/lib/excel-utils';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileWarning, Upload, Loader2, CheckCircle, XCircle, Link as LinkIcon, Send, AlertTriangle } from 'lucide-react';
import { bulkUploadPapers, sendCoAuthorRequest } from '@/app/actions';
import type { User, ResearchPaper, Author } from '@/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type PaperUploadData = {
  PublicationTitle: string;
  PublicationURL: string;
  PublicationYear?: number;
  PublicationMonthName?: string;
  ImpactFactor?: number;
  JournalName?: string;
  JournalWebsite?: string;
  QRating?: string;
};

type UploadResult = {
  newPapers: { title: string }[];
  linkedPapers: { paper: ResearchPaper; role: Author['role'] }[];
  errors: { title: string; reason: string }[];
};

const AUTHOR_ROLES: Author['role'][] = ['First Author', 'Corresponding Author', 'Co-Author', 'First & Corresponding Author'];

export default function BulkUploadPapersPage() {
  const [data, setData] = useState<PaperUploadData[]>([]);
  const [fileName, setFileName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const { toast } = useToast();
  const [roles, setRoles] = useState<Record<number, Author['role']>>({});
  const [isSendingRequest, setIsSendingRequest] = useState<string | null>(null);


  useState(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setUploadResult(null);
    setRoles({}); // Reset roles on new file upload
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        const jsonData = await readExcelFromBuffer<any>(arrayBuffer);

        const requiredColumns = ['PublicationTitle', 'PublicationURL', 'PublicationYear'];
        const firstRow = jsonData[0];
        if (!firstRow || !requiredColumns.every(col => col in firstRow)) {
          toast({
            variant: 'destructive',
            title: 'Invalid File Format',
            description: `The file must contain columns: ${requiredColumns.join(', ')}.`,
            duration: 6000
          });
          setData([]);
          setFileName('');
          return;
        }

        const formattedData: PaperUploadData[] = jsonData.map(row => ({
          PublicationTitle: String(row.PublicationTitle || ''),
          PublicationURL: String(row.PublicationURL || ''),
          PublicationYear: row.PublicationYear ? Number(row.PublicationYear) : undefined,
          PublicationMonthName: row.PublicationMonthName ? String(row.PublicationMonthName) : undefined,
          ImpactFactor: row.ImpactFactor ? Number(row.ImpactFactor) : undefined,
          JournalName: row.JournalName ? String(row.JournalName) : undefined,
          JournalWebsite: row.JournalWebsite ? String(row.JournalWebsite) : undefined,
          QRating: row.Quartile ? String(row.Quartile) : undefined,
        }));
        setData(formattedData);
      } catch (error) {
        console.error("Error parsing file:", error);
        toast({ variant: 'destructive', title: 'File Error', description: 'Could not parse the uploaded file.' });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const allRolesSelected = data.length > 0 && data.every((_, index) => !!roles[index]);

  const handleUpload = async () => {
    if (data.length === 0 || !user) {
      toast({ variant: 'destructive', title: 'No Data', description: 'There is no data to upload or user is not identified.' });
      return;
    }
    if (!allRolesSelected) {
      toast({ variant: 'destructive', title: 'Role Required', description: 'Please select your role for every paper in the list.' });
      return;
    }
    setIsLoading(true);
    setUploadResult(null);
    try {
      const rolesArray = data.map((_, index) => roles[index]);
      const result = await bulkUploadPapers(data, user, rolesArray);
      if (result.success) {
        setUploadResult(result.data);
        toast({ title: 'Upload Processed', description: `Successfully processed ${data.length} records.` });
        setData([]);
        setFileName('');
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error('Upload failed:', error);
      toast({ variant: 'destructive', title: 'Upload Failed', description: error.message || 'An unexpected error occurred.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendRequest = async (paper: ResearchPaper, role: Author['role'] | undefined) => {
    if (!role || !user) {
      toast({ title: 'Please select your role for this paper', variant: 'destructive' });
      return;
    }
    setIsSendingRequest(paper.id);
    try {
      const result = await sendCoAuthorRequest(paper, user, role);
      if (result.success) {
        toast({ title: 'Request Sent!', description: `A request has been sent to the main author of "${paper.title}".` });
        // Remove the paper from the list of actionable items
        if (uploadResult) {
          setUploadResult({
            ...uploadResult,
            linkedPapers: uploadResult.linkedPapers.filter(p => p.paper.id !== paper.id)
          });
        }
      } else {
        toast({ title: 'Error', description: result.error, variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to send request.', variant: 'destructive' });
    } finally {
      setIsSendingRequest(null);
    }
  };


  return (
    <div className="container mx-auto py-10">
      <PageHeader title="Bulk Upload Research Papers" description="Upload an Excel file to add your published papers to the portal." />
      <div className="mt-8 space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Upload File</CardTitle>
            <CardDescription>Select an Excel (.xlsx) file with your publication data.</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <FileWarning className="h-4 w-4" />
              <AlertTitle>Required File Format</AlertTitle>
              <AlertDescription>
                Your Excel file must contain these columns:
                <code className="mx-1 rounded-sm bg-muted p-1 font-mono text-sm">PublicationTitle</code>,
                <code className="mx-1 rounded-sm bg-muted p-1 font-mono text-sm">PublicationURL</code>, and
                <code className="mx-1 rounded-sm bg-muted p-1 font-mono text-sm">PublicationYear</code>.
                Optional columns are <code className="mx-1 rounded-sm bg-muted p-1 font-mono text-sm">PublicationMonthName</code>, <code className="mx-1 rounded-sm bg-muted p-1 font-mono text-sm">ImpactFactor</code>, <code className="mx-1 rounded-sm bg-muted p-1 font-mono text-sm">JournalName</code>, <code className="mx-1 rounded-sm bg-muted p-1 font-mono text-sm">JournalWebsite</code>, and <code className="mx-1 rounded-sm bg-muted p-1 font-mono text-sm">Quartile</code>.
              </AlertDescription>
            </Alert>
            <div className="mt-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <Input id="file-upload" type="file" accept=".xlsx" onChange={handleFileUpload} className="w-full sm:max-w-xs" />
              <Button onClick={handleUpload} disabled={isLoading || !allRolesSelected}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Upload {data.length > 0 ? `${data.length} Rows` : ''}
              </Button>
            </div>
            {fileName && <p className="mt-2 text-sm text-muted-foreground">Selected file: {fileName}</p>}
          </CardContent>
        </Card>

        {data.length > 0 && !uploadResult && (
          <Card>
            <CardHeader>
              <CardTitle>Preview Data ({data.length} rows)</CardTitle>
              <CardDescription>Review the data and assign your role for each paper before uploading.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>URL</TableHead><TableHead>Year</TableHead><TableHead className="w-[220px]">Your Role</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.map((row, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium max-w-sm whitespace-normal break-words">{row.PublicationTitle}</TableCell>
                        <TableCell className="whitespace-nowrap truncate max-w-xs">{row.PublicationURL}</TableCell>
                        <TableCell>{row.PublicationYear}</TableCell>
                        <TableCell>
                          <Select value={roles[index] || ''} onValueChange={(value) => setRoles(prev => ({ ...prev, [index]: value as Author['role'] }))}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select your role..." />
                            </SelectTrigger>
                            <SelectContent>
                              {AUTHOR_ROLES.map(role => (
                                <SelectItem key={role} value={role}>{role}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {uploadResult && (
          <Card>
            <CardHeader>
              <CardTitle>Upload Report</CardTitle>
              <CardDescription>Summary of the bulk upload process.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {uploadResult.linkedPapers.length > 0 && (
                <Alert variant="default" className="border-amber-500/50 text-amber-900 dark:border-amber-500/60 dark:text-amber-200 [&>svg]:text-amber-500">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Action Required: Potential Duplicates Found</AlertTitle>
                  <AlertDescription>
                    The following papers already exist in the portal. Please confirm and send a request to be added as a co-author.
                    <div className="mt-4 space-y-4">
                      {uploadResult.linkedPapers.map(({ paper, role }) => (
                        <div key={paper.id} className="p-3 bg-background/50 dark:bg-background/20 rounded-md border border-amber-500/30">
                          <p className="font-semibold text-sm">{paper.title}</p>
                          <p className="text-xs text-muted-foreground">Main Author: {paper.authors.find(a => a.uid === paper.mainAuthorUid)?.name || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground mt-1">Your requested role: <span className="font-medium">{role || 'Not Selected'}</span></p>
                          <div className="mt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            <Button size="sm" className="h-9" onClick={() => handleSendRequest(paper, role)} disabled={isSendingRequest === paper.id}>
                              {isSendingRequest === paper.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                              <span className="ml-2">Send Request</span>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
              <div>
                <h3 className="font-semibold flex items-center gap-2"><CheckCircle className="h-5 w-5 text-green-500" /> New Papers Added ({uploadResult.newPapers.length})</h3>
                {uploadResult.newPapers.length > 0 ? (
                  <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground max-h-48 overflow-y-auto">
                    {uploadResult.newPapers.map(p => <li key={p.title} className="whitespace-normal break-words">{p.title}</li>)}
                  </ul>
                ) : <p className="text-sm text-muted-foreground mt-2">No new papers were created.</p>}
              </div>
              <div>
                <h3 className="font-semibold flex items-center gap-2"><XCircle className="h-5 w-5 text-destructive" /> Errors ({uploadResult.errors.length})</h3>
                {uploadResult.errors.length > 0 ? (
                  <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground max-h-48 overflow-y-auto">
                    {uploadResult.errors.map((f, i) => <li key={i} className="whitespace-normal break-words">{f.title}: <span className="text-destructive">{f.reason}</span></li>)}
                  </ul>
                ) : <p className="text-sm text-muted-foreground mt-2">No errors occurred.</p>}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
