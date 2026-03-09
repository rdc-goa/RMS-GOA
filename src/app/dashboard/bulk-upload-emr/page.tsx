
'use client';

import { useState, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileWarning, Upload, Loader2, XCircle, CheckCircle } from 'lucide-react';
import { bulkUploadEmrProjects } from '@/app/emr-actions';
import { getEmrInterests,  } from '@/app/emr-actions';
import { getAllUsers } from '@/app/actions';
import HistoricalBulkUploads from './historical-bulk-uploads';
import { EmrInterest, User } from '@/types';

type EmrUploadData = {
  'Name of the Project': string;
  'Scheme'?: string;
  'Funding Agency': string;
  'Total Amount': number;
  'PI Name': string;
  'PI Email': string;
  'Duration of Project': string;
  [key: string]: any;
};

type UploadResult = {
  successfulCount: number;
  failures: { projectTitle: string; piName: string; error: string }[];
  linkedUserCount: number;
};

export default function BulkUploadEmrPage() {
  const [data, setData] = useState<EmrUploadData[]>([]);
  const [fileName, setFileName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [showHistorical, setShowHistorical] = useState(false);
  const [historicalInterests, setHistoricalInterests] = useState<EmrInterest[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const { toast } = useToast();


  const fetchHistoricalData = useCallback(async () => {
    try {
      const interests = await getEmrInterests('BULK_UPLOADED');
      const users = await getAllUsers();
      setHistoricalInterests(interests);
      setAllUsers(users);
    } catch (error) {
      console.error('Failed to fetch historical bulk upload data:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load historical bulk upload data.' });
    }
  }, [toast]);

  useEffect(() => {
    fetchHistoricalData();
  }, [fetchHistoricalData]);

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

        const requiredColumns = ['Name of the Project', 'Funding Agency', 'Total Amount', 'PI Name', 'Duration of Project'];
        
        const firstRow = jsonData[0];
        if (!firstRow || !requiredColumns.every(col => col in firstRow)) {
            toast({
                variant: 'destructive',
                title: 'Invalid File Format',
                description: `The file must contain columns: ${requiredColumns.join(', ')}.`,
                duration: 8000
            });
            setData([]);
            setFileName('');
            return;
        }

        setData(jsonData as EmrUploadData[]);
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
        // Sanitize the data to ensure it's a plain object array before sending to the server action
        const plainData = JSON.parse(JSON.stringify(data));
        const result = await bulkUploadEmrProjects(plainData);

        if (result.success) {
            setUploadResult(result.data);
            if(result.data.successfulCount > 0) {
                toast({ title: 'Upload Processed', description: `${result.data.successfulCount} EMR projects have been added.` });
            }
            if(result.data.failures.length > 0) {
                toast({ variant: 'destructive', title: 'Some Uploads Failed', description: `Failed to upload ${result.data.failures.length} projects. See details below.` });
            }
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

  return (
    <div className="container mx-auto py-10">
      <PageHeader title="Bulk Upload EMR Projects" description="Upload an Excel file to add sanctioned extramural project data to the system." />
      <div className="mt-8 space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Upload File</CardTitle>
            <CardDescription>Select an Excel (.xlsx) file with the required columns.</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <FileWarning className="h-4 w-4" />
              <AlertTitle>Required File Format</AlertTitle>
              <AlertDescription>
                Your file must contain: <code className="font-mono text-sm">Name of the Project</code>, <code className="font-mono text-sm">Funding Agency</code>, <code className="font-mono text-sm">Total Amount</code>, <code className="font-mono text-sm">PI Name</code>, <code className="font-mono text-sm">PI Email</code>, <code className="font-mono text-sm">Duration of Project</code>. You can add any number of Co-PI columns like <code className="font-mono text-sm">Co-PI 1 email id</code>.
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
                <CardDescription>Summary of the EMR bulk upload process.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div>
                    <h3 className="font-semibold flex items-center gap-2"><CheckCircle className="h-5 w-5 text-green-500" /> Successfully Added Projects ({uploadResult.successfulCount})</h3>
                    {uploadResult.successfulCount === 0 && <p className="text-sm text-muted-foreground mt-2">No new projects were added.</p>}
                    <p className="mt-2 text-sm text-muted-foreground">Projects linked to user profiles: {uploadResult.linkedUserCount}</p>
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
              <CardDescription>Review the data before uploading. A total of {data.length} records will be processed.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="max-h-96 overflow-y-auto">
                    <Table>
                        <TableHeader>
                        <TableRow>
                            <TableHead>Project Name</TableHead>
                            <TableHead>PI Name</TableHead>
                            <TableHead>Funding Agency</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {data.map((row, index) => (
                            <TableRow key={index}>
                            <TableCell className="font-medium">{row['Name of the Project']}</TableCell>
                            <TableCell>{row['PI Name']}</TableCell>
                            <TableCell>{row['Funding Agency']}</TableCell>
                            <TableCell className="text-right">₹{Number(row['Total Amount']).toLocaleString('en-IN')}</TableCell>
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
            <CardTitle>Historical Bulk Uploaded EMR Projects</CardTitle>
            <Button onClick={() => setShowHistorical(!showHistorical)} size="sm" variant="outline">
              {showHistorical ? 'Hide' : 'Show'} Historical Uploads
            </Button>
          </CardHeader>
          {showHistorical && (
            <CardContent>
              <HistoricalBulkUploads interests={historicalInterests} allUsers={allUsers} onUpdate={fetchHistoricalData} />
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}

    