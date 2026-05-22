'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { type User } from '@/types';
import { calculateArpsForUser, generateArpsStatisticsReport } from '@/app/arps-actions';
import { ArpsResultsDisplay, type ArpsData } from '@/components/dashboard/arps/arps-results-display';
import { useRouter } from 'next/navigation';
import { getAllUsers } from '@/app/actions';
import { generatePdfDocument } from '@/lib/arps-pdf';
import { Combobox } from '@/components/ui/combobox';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { getDefaultModulesForRole } from '@/lib/modules';
import { Download } from 'lucide-react';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';

export default function ArpsCalculatorPage() {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string>('');
    const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
    const [loading, setLoading] = useState(true);
    const [isCalculating, setIsCalculating] = useState(false);
    const [isDownloadingAll, setIsDownloadingAll] = useState(false);
    const [isDownloadingStats, setIsDownloadingStats] = useState(false);
    const [results, setResults] = useState<ArpsData | null>(null);
    const router = useRouter();
    const { toast } = useToast();



    const handleDownloadReport = async () => {
        if (!results) return;

        try {
            const [{ jsPDF }, { default: autoTable }] = await Promise.all([
                import('jspdf'),
                import('jspdf-autotable'),
            ]);

            const selectedUser = isSuperAdmin
                ? allUsers.find(u => u.uid === selectedUserId)
                : currentUser;

            const safeName = (selectedUser?.name || 'faculty').replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '_');
            const doc = await generatePdfDocument(selectedUser, results, selectedYear, jsPDF, autoTable);
            
            doc.save(`ARPS_Report_${safeName}_${selectedYear}.pdf`);
            toast({ title: 'Report Downloaded', description: 'ARPS report PDF generated successfully.' });
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'PDF Export Failed',
                description: error?.message || 'Could not generate the PDF report.',
            });
        }
    };

    const handleDownloadAllReports = async () => {
        if (!selectedYear || !isSuperAdmin) return;

        setIsDownloadingAll(true);
        try {
            const zip = new JSZip();
            const [{ jsPDF }, { default: autoTable }] = await Promise.all([
                import('jspdf'),
                import('jspdf-autotable'),
            ]);

            // Process each user
            for (const user of allUsers) {
                try {
                    const result = await calculateArpsForUser(user.uid, selectedYear);
                    if (!result.success || !result.data) continue;

                    const arpsData = result.data;
                    const safeName = (user.name || 'faculty').replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '_');

                    // Generate PDF using the shared function
                    const doc = await generatePdfDocument(user, arpsData, selectedYear, jsPDF, autoTable);

                    // Add PDF to zip
                    const pdfBlob = doc.output('blob');
                    zip.file(`ARPS_Report_${safeName}_${selectedYear}.pdf`, pdfBlob);

                } catch (userError) {
                    console.error(`Error generating report for ${user.name}:`, userError);
                    // Continue with next user
                }
            }

            // Generate and download zip
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(zipBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `ARPS_Reports_All_${selectedYear}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            toast({ title: 'Reports Downloaded', description: `Generated ARPS reports for ${allUsers.length} users.` });

        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'ZIP Export Failed',
                description: error?.message || 'Could not generate the ZIP file.',
            });
        } finally {
            setIsDownloadingAll(false);
        }
    };

    const handleDownloadArpsStatistics = async () => {
        if (!selectedYear || !isSuperAdmin) return;

        setIsDownloadingStats(true);
        try {
            const result = await generateArpsStatisticsReport(selectedYear);
            
            if (!result.success || !result.data) {
                toast({
                    variant: 'destructive',
                    title: 'Report Generation Failed',
                    description: result.error || 'Could not generate the statistics report.',
                });
                return;
            }

            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('ARPS Statistics');
            
            const columns = [
                { header: 'Faculty Name', key: 'name', width: 25 },
                { header: 'MIS ID', key: 'misId', width: 12 },
                { header: 'Department', key: 'department', width: 18 },
                { header: 'Papers as First/Corresponding Author', key: 'papersFirstCorresponding', width: 18 },
                { header: 'Papers as Co-Author', key: 'papersCoAuthor', width: 15 },
                { header: 'EMR Count', key: 'emrCount', width: 12 },
                { header: 'EMR Total Amount (₹)', key: 'emrTotalAmount', width: 18 },
                { header: 'Consultancy Amount (₹)', key: 'consultancyAmount', width: 18 },
                { header: 'Patents Published', key: 'patentsPublished', width: 15 },
                { header: 'Patents Granted', key: 'patentsGranted', width: 15 },
            ];
            worksheet.columns = columns;

            result.data.forEach(stat => {
                worksheet.addRow(stat);
            });

            // Add summary sheet
            const summarySheet = workbook.addWorksheet('Summary');
            summarySheet.addRow(['ARPS Statistics Report']);
            summarySheet.addRow(['Evaluation Year', selectedYear]);
            summarySheet.addRow(['Evaluation Period', `${result.yearRange.startDate} to ${result.yearRange.endDate}`]);
            summarySheet.addRow(['Total Faculty', result.data.length]);
            summarySheet.addRow(['Report Generated', new Date().toLocaleString('en-IN')]);
            summarySheet.getColumn(1).width = 30;
            summarySheet.getColumn(2).width = 30;

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ARPS_Statistics_${selectedYear}.xlsx`;
            a.click();
            window.URL.revokeObjectURL(url);

            toast({ title: 'Report Downloaded', description: 'ARPS statistics Excel report generated successfully.' });
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Excel Export Failed',
                description: error?.message || 'Could not generate the Excel report.',
            });
        } finally {
            setIsDownloadingStats(false);
        }
    };

    const yearOptions = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());
    const userOptions = allUsers.map(u => ({ label: u.name, value: u.uid }));

    if (loading || !currentUser) {
        return (
            <div className="container mx-auto py-10">
                <PageHeader
                    title="ARPS Calculator"
                    description="Calculate the Annual Research Performance Score."
                />
                 <div className="flex justify-center items-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            </div>
        );
    }

    if (!isSuperAdmin) {
        return (
            <div className="container mx-auto py-10 px-4 md:px-8 space-y-8 max-w-3xl">
                <PageHeader title="ARPS Calculator — Restricted" description="ARPS calculation reports are restricted to Super-admins. Please contact your administrator to request access." />
                <Card>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">You do not have permission to view ARPS calculation details.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-10">
            <PageHeader
                title="ARPS Calculator"
                description="Calculate the Annual Research Performance Score for an evaluation year (June 1st to May 31st)."
            >
                {isSuperAdmin && (
                    <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={handleDownloadAllReports} disabled={isDownloadingAll || !selectedYear}>
                            {isDownloadingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                            {isDownloadingAll ? 'ZIP...' : 'Download All Reports'}
                        </Button>
                        <Button type="button" variant="outline" onClick={handleDownloadArpsStatistics} disabled={isDownloadingStats || !selectedYear}>
                            {isDownloadingStats ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                            {isDownloadingStats ? 'Excel...' : 'Download Statistics'}
                        </Button>
                    </div>
                )}
            </PageHeader>
            <Card className="mt-8">
                <CardHeader>
                    <CardTitle>Calculate Score</CardTitle>
                    <CardDescription>Select a user and evaluation year to calculate the ARPS based on approved claims and projects.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {isSuperAdmin ? (
                            <Combobox
                                options={userOptions}
                                value={selectedUserId}
                                onChange={setSelectedUserId}
                                placeholder="Select a faculty member..."
                                searchPlaceholder="Search faculty..."
                                emptyPlaceholder="No user found."
                            />
                        ) : (
                            <Input value={currentUser.name} disabled />
                        )}
                        <Select value={selectedYear} onValueChange={setSelectedYear}>
                            <SelectTrigger><SelectValue placeholder="Select year..." /></SelectTrigger>
                            <SelectContent>
                                {yearOptions.map(year => (
                                    <SelectItem key={year} value={year}>{year}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button id="auto-calc-btn" onClick={handleCalculate} disabled={!selectedUserId || !selectedYear || isCalculating}>
                            {isCalculating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isSuperAdmin ? 'Calculate ARPS' : 'Calculate My ARPS'}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {isCalculating && (
                <div className="flex justify-center items-center p-8 mt-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="ml-4 text-muted-foreground">Calculating score...</p>
                </div>
            )}
            
            {results && (
                <div className="space-y-4">
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={handleDownloadReport}>
                            <Download className="mr-2 h-4 w-4" />
                            Download PDF Report
                        </Button>
                    </div>
                    <ArpsResultsDisplay 
                        results={results} 
                        evaluationYear={selectedYear}
                        evaluationWindow={`01-Jun-${Number(selectedYear) - 1} to 31-May-${selectedYear}`}
                    />
                </div>
            )}
        </div>
    );
}
