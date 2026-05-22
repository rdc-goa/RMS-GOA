import { type User } from '@/types';
import { type ArpsData } from '@/components/dashboard/arps/arps-results-display';

export const parseEmrAmountAndDuration = (durationAmount?: string) => {
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

export const formatEmrSanctionDate = (dateValue?: string) => {
    if (!dateValue) return 'N/A';
    const parsed = new Date(dateValue);
    if (isNaN(parsed.getTime())) return 'N/A';
    return parsed.toLocaleDateString('en-GB');
};

export const getSanctionProofUrl = (project: { finalProofUrl?: string; proofUrl?: string; agencyAcknowledgementUrl?: string }) => {
    return project.finalProofUrl || project.proofUrl || project.agencyAcknowledgementUrl || '';
};

export const getPublicationProofUrl = (claim: { publicationProofUrls?: string[] }) => {
    return claim.publicationProofUrls?.[0] || '';
};

export const generatePdfDocument = async (
    user: Partial<User> | null | undefined,
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

    const yearParts = year.split('-');
    const startYear = yearParts.length === 2 ? yearParts[0] : (Number(year) - 1).toString();
    const endYear = yearParts.length === 2 ? yearParts[1] : year;

    const evaluationWindow = `01-Jun-${startYear} to 31-May-20${endYear}`;
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
            ['Consultancy', (arpsData.consultancy?.raw || 0).toFixed(2), (arpsData.consultancy?.weighted || 0).toFixed(2), (arpsData.consultancy?.final || 0).toFixed(2)],
            ['Academic Activities', (arpsData.researchActivities?.raw || 0).toFixed(2), (arpsData.researchActivities?.weighted || 0).toFixed(2), (arpsData.researchActivities?.final || 0).toFixed(2)],
            ['', '', 'Total Score:', (
                arpsData.publications.final +
                arpsData.patents.final +
                arpsData.emr.final +
                (arpsData.consultancy?.final || 0) +
                (arpsData.researchActivities?.final || 0)
            ).toFixed(2)],
        ],
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
        ['Claim ID', 'Title', 'Type', 'Details/Quartile', 'Base', 'Type-Mult.', 'Author-Mult.', 'Raw Score'],
        arpsData.publications.contributingClaims.map(({ claim: originalClaim, score, calculation }) => {
            const claim = originalClaim as any;
            return [
            claim.submissionId || claim.id || 'N/A',
            claim.paperTitle || claim.publicationTitle || claim.title || 'Untitled',
            claim.claimType || claim.publicationType || claim.type || 'N/A',
            claim.journalClassification || claim.details || 'N/A',
            (calculation.base ?? 0).toFixed(2),
            (calculation.multiplier ?? calculation.quartileMultiplier ?? 1).toFixed(2),
            (calculation.authorMultiplier ?? 1).toFixed(2),
            score.toFixed(2),
            ];
        }),
        ['', '', '', 'Total', '', '', '', `Raw: ${arpsData.publications.raw.toFixed(2)} | Score: ${arpsData.publications.final.toFixed(2)}`],
        arpsData.publications.contributingClaims.reduce((acc, { claim }, index) => {
            const url = getPublicationProofUrl(claim);
            if (url) acc[index] = url;
            return acc;
        }, {} as Record<number, string>)
    );

    addSection(
        'Patents Details',
        ['Claim ID', 'Title', 'Category', '-', '-', 'Base', 'Appl-Mult.', 'Raw Score'],
        arpsData.patents.contributingClaims.map(({ claim: originalClaim, score, calculation }) => {
            const claim = originalClaim as any;
            return [
            claim.submissionId || claim.id || 'N/A',
            claim.patentTitle || claim.title || 'Untitled Patent',
            claim.currentStatus || claim.category || 'N/A',
            '-',
            '-',
            (calculation.base ?? 0).toFixed(2),
            (calculation.applicantMultiplier ?? 1).toFixed(2),
            score.toFixed(2),
            ];
        }),
        ['', '', '', 'Total', '', '', '', `Raw: ${arpsData.patents.raw.toFixed(2)} | Score: ${arpsData.patents.final.toFixed(2)}`]
    );

    addSection(
        'EMR Projects Details',
        ['Project ID', 'Project Title', 'Status', 'Role', 'Amount', 'Raw Score'],
        arpsData.emr.contributingProjects.map(({ project, score }) => {
            return [
                project.interestId || project.id || 'N/A',
                project.callTitle || (project as any).title || 'Untitled EMR',
                project.status || 'N/A',
                (project as any).role || 'Team Member',
                (project as any).amount != null ? `₹${(project as any).amount}` : 'N/A',
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

    if (arpsData.consultancy) {
        addSection(
            'Consultancy Projects Details',
            ['Project ID', 'Project Title', 'Revenue Amount', 'Raw Score'],
            arpsData.consultancy.contributingClaims.map(({ claim, score }) => {
                return [
                    claim.submissionId || claim.id || 'N/A',
                    claim.title || 'Untitled Consultancy',
                    claim.revenue != null ? `₹${claim.revenue.toLocaleString()}` : 'N/A',
                    score.toFixed(2),
                ];
            }),
            ['', 'Total', '', `Raw: ${arpsData.consultancy.raw.toFixed(2)} | Score: ${arpsData.consultancy.final.toFixed(2)}`]
        );
    }

    if (arpsData.researchActivities) {
        addSection(
            'Academic Activities & Students Guided Details',
            ['Claim ID', 'Title', 'Type', 'Category', 'Sub-category', 'Raw Score'],
            arpsData.researchActivities.contributingClaims.map(({ claim, score }) => {
                return [
                    claim.submissionId || claim.id || 'N/A',
                    claim.name || claim.title || 'Untitled',
                    claim.type === 'student' ? 'Student Guided' : 'Academic Activity',
                    claim.category || 'N/A',
                    claim.subcat || 'N/A',
                    score.toFixed(2),
                ];
            }),
            ['', '', '', '', 'Total', `Raw: ${arpsData.researchActivities.raw.toFixed(2)} | Score: ${arpsData.researchActivities.final.toFixed(2)}`]
        );
    }

    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
    }

    return doc;
};
