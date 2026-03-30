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
import { Combobox } from '@/components/ui/combobox';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { getDefaultModulesForRole } from '@/lib/modules';
import { Download } from 'lucide-react';
import JSZip from 'jszip';
import { utils as xlsxUtils, writeFile as xlsxWriteFile } from 'xlsx';

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

    const parseEmrAmountAndDuration = (durationAmount?: string) => {
        const raw = durationAmount || '';
        const amountMatch = raw.match(/Amount\s*:\s*[^\d]*([\d,]+(?:\.\d+)?)/i);
        const durationMatch = raw.match(/Duration\s*:\s*([^|]+)/i);

        const amount = amountMatch ? amountMatch[1].trim() : '';
        const duration = durationMatch ? durationMatch[1].trim() : '';

        return {
            amount: amount ? `₹${amount}` : 'N/A',
            duration: duration || 'N/A',
        };
    };

    const formatEmrSanctionDate = (dateValue?: string) => {
        if (!dateValue) return 'N/A';
        const parsed = new Date(dateValue);
        if (isNaN(parsed.getTime())) return 'N/A';
        return parsed.toLocaleDateString('en-GB');
    };

    const getSanctionProofUrl = (project: { finalProofUrl?: string; proofUrl?: string; agencyAcknowledgementUrl?: string }) => {
        return project.finalProofUrl || project.proofUrl || project.agencyAcknowledgementUrl || '';
    };

    const getPublicationProofUrl = (claim: { publicationProofUrls?: string[] }) => {
        return claim.publicationProofUrls?.[0] || '';
    };

    const isSuperAdmin = currentUser?.role === 'Super-admin';

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            const parsedUser = JSON.parse(storedUser);
            setCurrentUser(parsedUser);
            if (parsedUser.role !== 'Super-admin') {
                setSelectedUserId(parsedUser.uid);
            }
        } else {
            router.push('/login');
        }
    }, [router]);

    useEffect(() => {
        async function loadData() {
            if (currentUser) {
                if (currentUser.role === 'Super-admin') {
                    const users = await getAllUsers();
                    setAllUsers(users.filter(u => {
                        const userModules = u.allowedModules || getDefaultModulesForRole(u.role, u.designation);
                        const hasClaimModule = userModules.includes('incentive-claim');
                        const isEligibleRole = (u.role === 'faculty' || u.role === 'CRO' || u.role === 'Super-admin');
                        return isEligibleRole && hasClaimModule;
                    }));
                }
                setLoading(false);
            }
        }
        loadData();
    }, [currentUser]);

    const handleCalculate = async () => {
        if (!selectedUserId || !selectedYear) {
            toast({
                variant: 'destructive',
                title: 'Selection Required',
                description: 'Please select a user and a year.',
            });
            return;
        }
        setIsCalculating(true);
        setResults(null);
        const result = await calculateArpsForUser(selectedUserId, parseInt(selectedYear, 10));
        if (result.success) {
            setResults(result.data!);
        } else {
            toast({
                variant: 'destructive',
                title: 'Error Calculating Score',
                description: result.error || 'An unexpected error occurred.',
            });
        }
        setIsCalculating(false);
    };

    // Helper function to generate PDF document
    const generatePdfDocument = async (
        user: User | null | undefined,
        arpsData: ArpsData,
        year: string,
        jsPDF: any,
        autoTable: any
    ) => {
        const getFullInstituteName = (institute?: string) => {
            if (!institute) return 'N/A';
            const normalized = institute.trim();
            const shortToFullMap: Record<string, string> = {
                RDC: 'Research & Development Cell (RDC)',
            };
            return shortToFullMap[normalized] || normalized;
        };

        const evaluationWindow = `01-Jun-${Number(year) - 1} to 31-May-${year}`;
        const instituteFullName = getFullInstituteName(user?.institute);

        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 12;

        const svgToPngDataUrl = async (url: string, targetWidth = 180, targetHeight = 48): Promise<string> => {
            const svgText = await fetch(url).then(res => res.text());
            const svgBase64 = btoa(unescape(encodeURIComponent(svgText)));
            const img = new Image();
            img.src = `data:image/svg+xml;base64,${svgBase64}`;

            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });

            const canvas = document.createElement('canvas');
            canvas.width = targetWidth * 4;
            canvas.height = targetHeight * 4;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Failed to render logo');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/png');
        };

        const logoUrl = 'https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/RDC-PU-LOGO-BLACK.svg';
        let logoPng: string | null = null;
        try {
            logoPng = await svgToPngDataUrl(logoUrl);
        } catch {
            // Fallback if logo fetch/render fails
        }

        if (logoPng) {
            doc.addImage(logoPng, 'PNG', margin, 8, 100, 16);
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('ARPS Calculation Report', pageWidth - margin, 16, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, pageWidth - margin, 21, { align: 'right' });

        let currentY = 30;

        autoTable(doc, {
            startY: currentY,
            head: [['Field', 'Value']],
            body: [
                ['Faculty Name', user?.name || 'N/A'],
                ['MIS ID', user?.misId || 'N/A'],
                ['Institute (Full Name)', instituteFullName],
                ['Department', user?.department || 'N/A'],
                ['Evaluation Year', year],
                ['Evaluation Window', evaluationWindow],
                ['Total ARPS', arpsData.totalArps.toFixed(2)],
                ['Grade', arpsData.grade],
                ['Papers as First/Corresponding Author', arpsData.authorCounts?.firstCorrespondingAuthor || 0],
                ['Papers as Co-Author', arpsData.authorCounts?.coAuthor || 0],
            ],
            theme: 'grid',
            headStyles: { fillColor: [15, 23, 42], textColor: 255 },
            styles: { fontSize: 9, cellPadding: 2 },
            margin: { left: margin, right: margin },
            columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 'auto' } },
        });

        currentY = ((doc as any).lastAutoTable?.finalY || currentY) + 6;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Score Summary', margin, currentY);
        currentY += 2;

        autoTable(doc, {
            startY: currentY,
            head: [['Component', 'Raw', 'Weighted', 'Final']],
            body: [
                ['Publications', arpsData.publications.raw.toFixed(2), arpsData.publications.weighted.toFixed(2), arpsData.publications.final.toFixed(2)],
                ['Patents', arpsData.patents.raw.toFixed(2), arpsData.patents.weighted.toFixed(2), arpsData.patents.final.toFixed(2)],
                ['EMR Projects', arpsData.emr.raw.toFixed(2), arpsData.emr.weighted.toFixed(2), arpsData.emr.final.toFixed(2)],
            ],
            foot: [['Total', (arpsData.publications.raw + arpsData.patents.raw + arpsData.emr.raw).toFixed(2), (arpsData.publications.weighted + arpsData.patents.weighted + arpsData.emr.weighted).toFixed(2), arpsData.totalArps.toFixed(2)]],
            theme: 'grid',
            headStyles: { fillColor: [30, 41, 59], textColor: 255 },
            footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: 'bold' },
            styles: { fontSize: 9, cellPadding: 2 },
            margin: { left: margin, right: margin },
        });

        const addSection = (
            title: string,
            head: string[],
            body: (string | number)[][],
            footerRow?: (string | number)[],
            linkByRowIndex?: Record<number, string>
        ) => {
            let y = ((doc as any).lastAutoTable?.finalY || 20) + 8;
            if (y > pageHeight - 40) {
                doc.addPage();
                y = 20;
            }

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.text(title, margin, y);

            autoTable(doc, {
                startY: y + 2,
                head: [head],
                body: body.length ? body : [Array(head.length).fill('No records found')],
                foot: footerRow ? [footerRow] : undefined,
                theme: 'striped',
                headStyles: { fillColor: [51, 65, 85], textColor: 255 },
                footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: 'bold' },
                styles: { fontSize: 8, cellPadding: 1.8, overflow: 'linebreak' },
                margin: { left: margin, right: margin },
                didParseCell: (data: any) => {
                    if (!linkByRowIndex) return;
                    if (data.section !== 'body') return;
                    if (data.column.index !== 1) return;
                    const url = linkByRowIndex[data.row.index];
                    if (!url) return;
                    data.cell.styles.textColor = [37, 99, 235];
                },
                didDrawCell: (data: any) => {
                    if (!linkByRowIndex) return;
                    if (data.section !== 'body') return;
                    if (data.column.index !== 1) return;
                    const url = linkByRowIndex[data.row.index];
                    if (!url) return;
                    doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
                },
            });
        };

        addSection(
            'Publications Details',
            ['Claim ID', 'Title', 'Type', 'Quartile', 'Base', 'Type-Mult.', 'Author-Mult.', 'Raw Score'],
            arpsData.publications.contributingClaims.map(({ claim, score, calculation }) => [
                claim.claimId || claim.id,
                claim.paperTitle || claim.publicationTitle || '',
                claim.publicationType || '',
                claim.journalClassification || '',
                (calculation.base ?? 0).toFixed(2),
                (calculation.multiplier ?? calculation.quartileMultiplier ?? 1).toFixed(2),
                (calculation.authorMultiplier ?? 1).toFixed(2),
                score.toFixed(2),
            ]),
            ['', '', '', 'Total', '', '', '', `Raw: ${arpsData.publications.raw.toFixed(2)} | Score: ${arpsData.publications.final.toFixed(2)}`],
            arpsData.publications.contributingClaims.reduce((acc, { claim }, index) => {
                const url = getPublicationProofUrl(claim);
                if (url) acc[index] = url;
                return acc;
            }, {} as Record<number, string>)
        );

        addSection(
            'Patents Details',
            ['Claim ID', 'Title', 'Status', 'Locale', 'Sole Applicant', 'Base', 'Appl-Mult.', 'Raw Score'],
            arpsData.patents.contributingClaims.map(({ claim, score, calculation }) => [
                claim.claimId || claim.id,
                claim.patentTitle || '',
                claim.currentStatus || '',
                claim.patentLocale || '',
                claim.isPuSoleApplicant ? 'Yes' : 'No',
                (calculation.base ?? 0).toFixed(2),
                (calculation.applicantMultiplier ?? 1).toFixed(2),
                score.toFixed(2),
            ]),
            ['', '', '', 'Total', '', '', '', `Raw: ${arpsData.patents.raw.toFixed(2)} | Score: ${arpsData.patents.final.toFixed(2)}`]
        );

        addSection(
            'EMR Projects Details',
            ['Project ID', 'Project Title', 'Sanction Date', 'Amount', 'Duration', 'Raw Score'],
            arpsData.emr.contributingProjects.map(({ project, score }) => {
                const { amount, duration } = parseEmrAmountAndDuration(project.durationAmount);
                return [
                    project.interestId || project.id,
                    project.callTitle || '',
                    formatEmrSanctionDate(project.sanctionDate),
                    amount,
                    duration,
                    score.toFixed(2),
                ];
            }),
            ['', 'Total', '', '', '', `Raw: ${arpsData.emr.raw.toFixed(2)} | Score: ${arpsData.emr.final.toFixed(2)}`],
            arpsData.emr.contributingProjects.reduce((acc, { project }, index) => {
                const url = getSanctionProofUrl(project);
                if (url) acc[index] = url;
                return acc;
            }, {} as Record<number, string>)
        );

        const totalPages = doc.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(100);
            doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
        }

        return doc;
    };

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
                    const result = await calculateArpsForUser(user.uid, parseInt(selectedYear, 10));
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
            const result = await generateArpsStatisticsReport(parseInt(selectedYear, 10));
            
            if (!result.success || !result.data) {
                toast({
                    variant: 'destructive',
                    title: 'Report Generation Failed',
                    description: result.error || 'Could not generate the statistics report.',
                });
                return;
            }

            // Create workbook and worksheet
            const ws_data = [
                [
                    'Faculty Name',
                    'MIS ID',
                    'Department',
                    'Papers as First/Corresponding Author',
                    'Papers as Co-Author',
                    'EMR Count',
                    'EMR Total Amount (₹)',
                    'Consultancy Amount (₹)',
                    'Patents Published',
                    'Patents Granted',
                ],
                ...result.data.map(stat => [
                    stat.name,
                    stat.misId,
                    stat.department,
                    stat.papersFirstCorresponding,
                    stat.papersCoAuthor,
                    stat.emrCount,
                    stat.emrTotalAmount,
                    stat.consultancyAmount,
                    stat.patentsPublished,
                    stat.patentsGranted,
                ]),
            ];

            const ws = xlsxUtils.aoa_to_sheet(ws_data);
            
            // Set column widths
            ws['!cols'] = [
                { wch: 25 }, // Faculty Name
                { wch: 12 }, // MIS ID
                { wch: 18 }, // Department
                { wch: 18 }, // Papers as First/Corresponding Author
                { wch: 15 }, // Papers as Co-Author
                { wch: 12 }, // EMR Count
                { wch: 18 }, // EMR Total Amount
                { wch: 18 }, // Consultancy Amount
                { wch: 15 }, // Patents Published
                { wch: 15 }, // Patents Granted
            ];

            const wb = xlsxUtils.book_new();
            xlsxUtils.book_append_sheet(wb, ws, 'ARPS Statistics');

            // Add summary sheet with evaluation period
            const summary_data = [
                ['ARPS Statistics Report'],
                ['Evaluation Year', selectedYear],
                ['Evaluation Period', `${result.yearRange.startDate} to ${result.yearRange.endDate}`],
                ['Total Faculty', result.data.length],
                ['Report Generated', new Date().toLocaleString('en-IN')],
            ];

            const ws_summary = xlsxUtils.aoa_to_sheet(summary_data);
            ws_summary['!cols'] = [{ wch: 30 }, { wch: 30 }];
            xlsxUtils.book_append_sheet(wb, ws_summary, 'Summary');

            // Generate and download file
            xlsxWriteFile(wb, `ARPS_Statistics_${selectedYear}.xlsx`);

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
                        <Button onClick={handleCalculate} disabled={!selectedUserId || !selectedYear || isCalculating}>
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
