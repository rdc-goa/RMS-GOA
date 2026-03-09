
'use client';

import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileWarning, Upload, Loader2, Trash2, Download, XCircle, CheckCircle } from 'lucide-react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/config';
import type { Project } from '@/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from '@/components/ui/skeleton';
import { bulkUploadProjects, deleteImrProject } from '@/app/actions';

type ProjectData = {
  pi_email: string;
  project_title: string;
  status: string;
  grant_amount: number;
  sanction_date: string;
  Name_of_staff: string;
  Faculty: string;
  Institute: string;
  sanction_number: string;
  Department?: string;
};

type UploadResult = {
  successfulCount: number;
  failures: { projectTitle: string; piName: string; error: string }[];
};

export default function BulkUploadPage() {
  const [data, setData] = useState<ProjectData[]>([]);
  const [fileName, setFileName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const { toast } = useToast();

  const [history, setHistory] = useState<Project[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
        const projectsRef = collection(db, 'projects');
        const q = query(projectsRef, where('isBulkUploaded', '==', true), orderBy('submissionDate', 'desc'));
        const querySnapshot = await getDocs(q);
        const historyList = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Project));
        setHistory(historyList);
    } catch (error) {
        console.error("Error fetching upload history:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch upload history.' });
    } finally {
        setLoadingHistory(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setUploadResult(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const binaryStr = event.target?.result;
        const workbook = XLSX.read(binaryStr, { type: 'binary', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);

        const requiredColumns = ['pi_email', 'project_title', 'status', 'grant_amount', 'sanction_date', 'Name_of_staff', 'Faculty', 'Institute', 'sanction_number'];
        
        const firstRow = jsonData[0];
        if (!firstRow || !requiredColumns.every(col => col in firstRow)) {
            toast({
                variant: 'destructive',
                title: 'Invalid File Format',
                description: `The uploaded file must contain the following columns: ${requiredColumns.join(', ')}.`,
                duration: 8000
            });
            setData([]);
            setFileName('');
            return;
        }

        const formattedData = jsonData.map(row => ({
          pi_email: String(row.pi_email || ''),
          project_title: String(row.project_title || ''),
          status: String(row.status || ''),
          grant_amount: Number(row.grant_amount || 0),
          sanction_date: row.sanction_date instanceof Date ? row.sanction_date.toISOString() : new Date().toISOString(),
          Name_of_staff: String(row.Name_of_staff || ''),
          Faculty: String(row.Faculty || ''),
          Institute: String(row.Institute || ''),
          sanction_number: String(row.sanction_number || ''),
          Department: String(row.Department || ''),
        }));
        setData(formattedData);
      } catch (error) {
        console.error("Error parsing file:", error);
        toast({ variant: 'destructive', title: 'File Error', description: 'Could not parse the uploaded file.' });
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleUpload = async () => {
    if (data.length === 0) {
      toast({ variant: 'destructive', title: 'No Data', description: 'There is no data to upload.' });
      return;
    }
    setIsLoading(true);
    setUploadResult(null);
    try {
        const result = await bulkUploadProjects(data);
        if (result.success) {
            setUploadResult({
              successfulCount: result.data.successfulCount,
              failures: result.data.failures
            });

            if (result.data.successfulCount > 0) {
              toast({ title: 'Upload Processed', description: `${result.data.successfulCount} projects have been added successfully.` });
            }
            if (result.data.failures.length > 0) {
              toast({ variant: 'destructive', title: 'Some Uploads Failed', description: `Failed to upload ${result.data.failures.length} projects. See details below.` });
            }
            
            setData([]);
            setFileName('');
            fetchHistory(); // Refresh history after upload
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

  const handleDelete = async () => {
    if (!projectToDelete) return;
    const result = await deleteImrProject(projectToDelete.id, "Bulk uploaded project deleted by admin.", "Admin");
    if (result.success) {
        toast({ title: 'Project Deleted', description: `"${projectToDelete.title}" has been removed.`});
        fetchHistory(); // Refresh list
    } else {
        toast({ variant: 'destructive', title: 'Deletion Failed', description: result.error || "Could not delete project." });
    }
    setProjectToDelete(null);
  };
  
  const handleExport = () => {
    if (history.length === 0) {
      toast({ variant: 'destructive', title: 'No Data', description: 'There is no upload history to export.' });
      return;
    }
    const dataToExport = history.map(p => ({
        'Project ID': p.id,
        'Project Title': p.title,
        'PI Name': p.pi,
        'PI Email': p.pi_email,
        'Faculty': p.faculty,
        'Institute': p.institute,
        'Status': p.status,
        'Sanction Number': p.grant?.sanctionNumber || 'N/A',
        'Grant Amount': p.grant?.totalAmount || 0,
        'Sanction Date': new Date(p.submissionDate).toLocaleDateString(),
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Bulk Upload History");
    XLSX.writeFile(workbook, `bulk_upload_history_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  return (
    <div className="container mx-auto py-10">
      <PageHeader title="Bulk Upload Old Projects" description="Upload an Excel file to add historical project data to the system." />
      <div className="mt-8 space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Upload File</CardTitle>
            <CardDescription>
              Select an Excel (.xlsx) file with the required columns to upload project data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <FileWarning className="h-4 w-4" />
              <AlertTitle>Important: File Format</AlertTitle>
              <AlertDescription>
                Your Excel file must contain these columns: 
                <code className="font-mono text-sm bg-muted p-1 rounded-sm mx-1">pi_email</code>, 
                <code className="font-mono text-sm bg-muted p-1 rounded-sm mx-1">project_title</code>, 
                <code className="font-mono text-sm bg-muted p-1 rounded-sm mx-1">status</code>, 
                <code className="font-mono text-sm bg-muted p-1 rounded-sm mx-1">grant_amount</code>,
                <code className="font-mono text-sm bg-muted p-1 rounded-sm mx-1">sanction_date</code>,
                <code className="font-mono text-sm bg-muted p-1 rounded-sm mx-1">Name_of_staff</code>, 
                <code className="font-mono text-sm bg-muted p-1 rounded-sm mx-1">Faculty</code>, 
                <code className="font-mono text-sm bg-muted p-1 rounded-sm mx-1">Institute</code>, and
                <code className="font-mono text-sm bg-muted p-1 rounded-sm mx-1">sanction_number</code>.
                The <code className="font-mono text-sm bg-muted p-1 rounded-sm mx-1">Department</code> column is optional.
              </AlertDescription>
            </Alert>
            <div className="mt-6 flex flex-col sm:flex-row items-center gap-4">
              <Input id="file-upload" type="file" accept=".xlsx" onChange={handleFileUpload} className="max-w-xs" />
              <Button onClick={handleUpload} disabled={isLoading || data.length === 0}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Upload {data.length > 0 ? `${data.length} Records` : ''}
              </Button>
            </div>
            {fileName && <p className="mt-2 text-sm text-muted-foreground">Selected file: {fileName}</p>}
          </CardContent>
        </Card>

        {uploadResult && (
          <Card>
            <CardHeader>
                <CardTitle>Upload Report</CardTitle>
                <CardDescription>Summary of the bulk upload process.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div>
                    <h3 className="font-semibold flex items-center gap-2"><CheckCircle className="h-5 w-5 text-green-500" /> Successfully Added Projects ({uploadResult.successfulCount})</h3>
                    {uploadResult.successfulCount === 0 && <p className="text-sm text-muted-foreground mt-2">No new projects were added.</p>}
                </div>
                 {uploadResult.failures.length > 0 && (
                     <Alert variant="destructive">
                        <XCircle className="h-5 w-5" />
                        <AlertTitle>Failed Uploads ({uploadResult.failures.length})</AlertTitle>
                        <AlertDescription>
                            <ul className="mt-2 list-disc pl-5 text-sm">
                                {uploadResult.failures.map((f, i) => (
                                    <li key={i}>
                                        <strong>{f.projectTitle}</strong> (PI: {f.piName}) - <span className="italic">{f.error}</span>
                                    </li>
                                ))}
                            </ul>
                        </AlertDescription>
                    </Alert>
                 )}
            </CardContent>
          </Card>
        )}

        {data.length > 0 && !uploadResult && (
          <Card>
            <CardHeader>
              <CardTitle>Preview Data</CardTitle>
              <CardDescription>
                Review the data before uploading. A total of {data.length} records will be processed.
              </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="max-h-96 overflow-y-auto">
                    <Table>
                        <TableHeader>
                        <TableRow>
                            <TableHead>PI Name</TableHead>
                            <TableHead>Project Title</TableHead>
                            <TableHead>Institute</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {data.map((row, index) => (
                            <TableRow key={index}>
                            <TableCell>{row.Name_of_staff}</TableCell>
                            <TableCell className="font-medium">{row.project_title}</TableCell>
                            <TableCell>{row.Institute}</TableCell>
                            <TableCell>{row.status}</TableCell>
                            <TableCell className="text-right">₹{row.grant_amount.toLocaleString('en-IN')}</TableCell>
                            </TableRow>
                        ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                  <CardTitle>Upload History</CardTitle>
                  <CardDescription>
                    A list of all projects added via the bulk upload feature.
                  </CardDescription>
              </div>
              <Button onClick={handleExport} variant="outline" size="sm" disabled={loadingHistory || history.length === 0}>
                <Download className="mr-2 h-4 w-4"/>
                Export XLSX
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingHistory ? (
                <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </div>
            ) : history.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No bulk-uploaded projects found.</p>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Project Title</TableHead>
                            <TableHead>PI Email</TableHead>
                            <TableHead>Sanction Date</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {history.map((project) => (
                            <TableRow key={project.id}>
                                <TableCell className="font-medium">{project.title}</TableCell>
                                <TableCell>{project.pi_email}</TableCell>
                                <TableCell>{new Date(project.submissionDate).toLocaleDateString()}</TableCell>
                                <TableCell className="text-right">
                                    <Button variant="destructive" size="icon" onClick={() => setProjectToDelete(project)}>
                                        <Trash2 className="h-4 w-4" />
                                        <span className="sr-only">Delete Project</span>
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {projectToDelete && (
        <AlertDialog open={!!projectToDelete} onOpenChange={() => setProjectToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the project "<span className="font-bold">{projectToDelete.title}</span>" from the database.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-destructive hover:bg-destructive/90"
                    >
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
