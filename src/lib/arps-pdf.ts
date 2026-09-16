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

export const getBypassedUrl = (url?: string) => {
    if (!url) return '';
    let target = url;
    if (target.startsWith('/api/documents/')) {
        target = target.replace('/api/documents/', '/api/unsecured-documents/');
    }
    if (target.startsWith('/')) {
        if (typeof window !== 'undefined') {
            target = `${window.location.origin}${target}`;
        }
    }
    return target;
};

export const getSanctionProofUrl = (project: { finalProofUrl?: string; proofUrl?: string; agencyAcknowledgementUrl?: string; proofUrls?: string[] }) => {
    const raw = project.finalProofUrl || project.proofUrl || project.agencyAcknowledgementUrl || project.proofUrls?.[0] || '';
    return getBypassedUrl(raw);
};

export const getPublicationProofUrl = (claim: { publicationProofUrls?: string[]; proofUrls?: string[] }) => {
    const raw = claim.publicationProofUrls?.[0] || claim.proofUrls?.[0] || '';
    return getBypassedUrl(raw);
};

export const getPatentProofUrl = (claim: { patentApprovalProofUrl?: string; proofUrls?: string[] }) => {
    const raw = claim.patentApprovalProofUrl || claim.proofUrls?.[0] || '';
    return getBypassedUrl(raw);
};

export const getGenericProofUrl = (claim: { proofUrls?: string[]; routingProofUrl?: string }) => {
    const raw = claim.proofUrls?.[0] || claim.routingProofUrl || '';
    return getBypassedUrl(raw);
};


export const generatePdfDocument = async (
    user: Partial<User> | null | undefined,
    arpsData: ArpsData,
    year: string,
    jsPDF: any,
    autoTable: any,
    existingDoc?: any
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

    const doc = existingDoc || new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const startPage = existingDoc ? doc.getNumberOfPages() + 1 : 1;
    if (existingDoc) {
        doc.addPage();
    }
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

    // ── Faculty info: two side-by-side 2-col tables (= 4 columns) ──────────
    const halfWidth = (pageWidth - margin * 2 - 4) / 2; // 4 mm gutter
    const leftX = margin;
    const rightX = margin + halfWidth + 4;
    const labelW = 44;
    const valueW = halfWidth - labelW;

    const leftRows: [string, string][] = [
        ['Faculty Name', user?.name || 'N/A'],
        ['MIS ID', user?.misId || 'N/A'],
        ['Institute', instituteFullName],
        ['Department', user?.department || 'N/A'],
        ['h-Index', user?.hIndex !== undefined ? String(user.hIndex) : 'N/A'],
        ['i10-Index', user?.i10Index !== undefined ? String(user.i10Index) : 'N/A'],
        ['Citations Count', user?.citationCount !== undefined ? String(user.citationCount) : 'N/A'],
    ];

    const rightRows: [string, string][] = [
        ['Evaluation Year', year],
        ['Evaluation Window', evaluationWindow],
        ['Total ARPS', arpsData.totalArps.toFixed(2)],
        ['Grade', arpsData.grade],
        ['1st/Corr. Author Papers', String(arpsData.authorCounts?.firstCorrespondingAuthor || 0)],
        ['Co-Author Papers', String(arpsData.authorCounts?.coAuthor || 0)],
    ];

    const sharedInfoStyle = {
        theme: 'grid' as const,
        headStyles: { fillColor: [15, 23, 42] as [number, number, number], textColor: 255, fontSize: 8.5 },
        styles: { fontSize: 8.5, cellPadding: 1.8, overflow: 'linebreak' as const },
        columnStyles: { 0: { cellWidth: labelW, fontStyle: 'bold' as const }, 1: { cellWidth: valueW } },
    };

    autoTable(doc, {
        startY: currentY,
        head: [['Attribute', 'Information']],
        body: leftRows,
        ...sharedInfoStyle,
        margin: { left: leftX, right: rightX + halfWidth - margin },
        tableWidth: halfWidth,
    });
    const leftEndY = (doc as any).lastAutoTable?.finalY || currentY;

    autoTable(doc, {
        startY: currentY,
        head: [['Attribute', 'Information']],
        body: rightRows,
        ...sharedInfoStyle,
        margin: { left: rightX, right: margin },
        tableWidth: halfWidth,
    });
    const rightEndY = (doc as any).lastAutoTable?.finalY || currentY;

    currentY = Math.max(leftEndY, rightEndY) + 6;

    // ── Score Summary ────────────────────────────────────────────────────────
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
            ['Academic & Students Guided', (arpsData.researchActivities?.raw || 0).toFixed(2), (arpsData.researchActivities?.weighted || 0).toFixed(2), (arpsData.researchActivities?.final || 0).toFixed(2)],
            ['Totals', (
                arpsData.publications.raw + arpsData.patents.raw + arpsData.emr.raw +
                (arpsData.consultancy?.raw || 0) + (arpsData.researchActivities?.raw || 0)
            ).toFixed(2), (
                arpsData.publications.weighted + arpsData.patents.weighted + arpsData.emr.weighted +
                (arpsData.consultancy?.weighted || 0) + (arpsData.researchActivities?.weighted || 0)
            ).toFixed(2), (
                arpsData.publications.final + arpsData.patents.final + arpsData.emr.final +
                (arpsData.consultancy?.final || 0) + (arpsData.researchActivities?.final || 0)
            ).toFixed(2)],
        ],
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], textColor: 255 },
        footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 2 },
        margin: { left: margin, right: margin },
        didParseCell: (data: any) => {
            if (data.section === 'body' && data.row.index === 5) {
                data.cell.styles.fontStyle = 'bold';
            }
        },
    });

    const addSection = (
        title: string,
        head: string[],
        body: (string | number)[][],
        footerRow?: (string | number)[],
        linkByRowIndex?: Record<number, string>,
        columnStyles?: any
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
            columnStyles,
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
        ['Claim ID', 'Title', 'Type', 'Details/Quartile', 'Author Role', 'Base', 'Type-Mult.', 'Author-Mult.', 'Raw Score'],
        arpsData.publications.contributingClaims.map(({ claim: originalClaim, score, calculation }) => {
            const claim = originalClaim as any;
            return [
                claim.submissionId || claim.id || 'N/A',
                claim.paperTitle || claim.publicationTitle || claim.title || 'Untitled',
                claim.claimType || claim.publicationType || claim.type || 'N/A',
                (() => {
                    const pubType = (claim.publicationType || claim.type || '').trim().toLowerCase();
                    if (pubType === 'conference proceedings') {
                        return 'N/A';
                    }
                    if (pubType === 'book chapter') {
                        return claim.bookTitleForChapter ? `Book: ${claim.bookTitleForChapter}` : 'N/A';
                    }
                    if (pubType === 'journal') {
                        const articleType = claim.articleType || '';
                        const artMap: Record<string, string> = {
                            'Original Research': 'Original Research / Short Comm.',
                            'Review': 'Review Article',
                            'Case Report': 'Case Report',
                            'Short Survey': 'Short Survey / Case Study'
                        };
                        const articleTypeLabel = artMap[articleType] || articleType || 'N/A';
                        const quartile = claim.journalClassification || 'N/A';
                        return `${articleTypeLabel} (${quartile})`;
                    }
                    return claim.journalClassification || claim.details || 'N/A';
                })(),
                claim.authorPosition || claim.authorRole || 'N/A',
                (calculation.base ?? 0).toFixed(2),
                (calculation.multiplier ?? calculation.quartileMultiplier ?? 1).toFixed(2),
                (calculation.authorMultiplier ?? 1).toFixed(2),
                score.toFixed(2),
            ];
        }),
        ['', '', '', 'Total', '', '', '', '', `Raw: ${arpsData.publications.raw.toFixed(2)} | Score: ${arpsData.publications.final.toFixed(2)}`],
        arpsData.publications.contributingClaims.reduce((acc, { claim }, index) => {
            const url = getPublicationProofUrl(claim);
            if (url) acc[index] = url;
            return acc;
        }, {} as Record<number, string>),
        {
            0: { cellWidth: 35 },
            1: { cellWidth: 60 },
            2: { cellWidth: 25 },
            3: { cellWidth: 45 },
            4: { cellWidth: 30 }
        }
    );

    if (arpsData.patents.contributingClaims.length > 0) {
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
            ['', '', '', 'Total', '', '', '', `Raw: ${arpsData.patents.raw.toFixed(2)} | Score: ${arpsData.patents.final.toFixed(2)}`],
            arpsData.patents.contributingClaims.reduce((acc, { claim }, index) => {
                const url = getPatentProofUrl(claim);
                if (url) acc[index] = url;
                return acc;
            }, {} as Record<number, string>)
        );
    }

    if (arpsData.emr.contributingProjects.length > 0) {
        addSection(
            'EMR Projects Details',
            ['Claim ID', 'Project Title', 'Status', 'Role', 'Amount', 'Raw Score'],
            arpsData.emr.contributingProjects.map(({ project, score }) => {
                return [
                    (project as any).submissionId || project.interestId || project.id || 'N/A',
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
            }, {} as Record<number, string>),
            {
                0: { cellWidth: 35 },
                1: { cellWidth: 90 },
                2: { cellWidth: 30 },
                3: { cellWidth: 30 },
                4: { cellWidth: 50 },
                5: { cellWidth: 30 }
            }
        );
    }

    if (arpsData.consultancy && arpsData.consultancy.contributingClaims.length > 0) {
        addSection(
            'Consultancy Projects Details',
            ['Claim ID', 'Project Title', 'Revenue Amount', 'Raw Score'],
            arpsData.consultancy.contributingClaims.map(({ claim, score }) => {
                return [
                    claim.submissionId || claim.id || 'N/A',
                    claim.title || 'Untitled Consultancy',
                    claim.revenue != null ? `₹${claim.revenue.toLocaleString()}` : 'N/A',
                    score.toFixed(2),
                ];
            }),
            ['', '', 'Total', `Raw: ${arpsData.consultancy.raw.toFixed(2)} | Score: ${arpsData.consultancy.final.toFixed(2)}`],
            arpsData.consultancy.contributingClaims.reduce((acc, { claim }, index) => {
                const url = getGenericProofUrl(claim);
                if (url) acc[index] = url;
                return acc;
            }, {} as Record<number, string>)
        );
    }

    if (arpsData.researchActivities) {
        const activityClaims = arpsData.researchActivities.contributingClaims.filter(({ claim }) => claim.type !== 'student');
        const studentClaims = arpsData.researchActivities.contributingClaims.filter(({ claim }) => claim.type === 'student');

        if (activityClaims.length > 0) {
            const activityRaw = activityClaims.reduce((sum, { score }) => sum + score, 0);
            addSection(
                'Academic Activities Details',
                ['Claim ID', 'Title', 'Category', 'Raw Score'],
                activityClaims.map(({ claim, score }) => [
                    claim.submissionId || claim.id || 'N/A',
                    claim.name || claim.title || 'Untitled',
                    claim.category || 'N/A',
                    score.toFixed(2),
                ]),
                ['', '', 'Total', `Raw: ${activityRaw.toFixed(2)} | Score: ${arpsData.researchActivities.final.toFixed(2)}`],
                activityClaims.reduce((acc, { claim }, index) => {
                    const url = getGenericProofUrl(claim);
                    if (url) acc[index] = url;
                    return acc;
                }, {} as Record<number, string>)
            );
        }

        if (studentClaims.length > 0) {
            const studentRaw = studentClaims.reduce((sum, { score }) => sum + score, 0);
            addSection(
                'Students Guided Details',
                ['Claim ID', 'Student / Thesis Title', 'Category', 'Status', 'Allotment Order Reference', 'Raw Score'],
                studentClaims.map(({ claim, score }) => [
                    claim.submissionId || claim.id || 'N/A',
                    claim.name || claim.title || 'Untitled',
                    claim.category || 'N/A',
                    claim.status || 'N/A',
                    claim.allotmentDetails || 'N/A',
                    score.toFixed(2),
                ]),
                ['', '', '', '', 'Total', `Raw: ${studentRaw.toFixed(2)} | Score: ${arpsData.researchActivities.final.toFixed(2)}`],
                studentClaims.reduce((acc, { claim }, index) => {
                    const url = getGenericProofUrl(claim);
                    if (url) acc[index] = url;
                    return acc;
                }, {} as Record<number, string>)
            );
        }
    }

    if (arpsData.otherDetails && arpsData.otherDetails.length > 0) {
        addSection(
            'Other Details',
            ['Details'],
            arpsData.otherDetails.map((detail: any) => [
                detail.details || 'N/A'
            ])
        );
    }

    const endPage = doc.getNumberOfPages();
    const generationDateTime = new Date().toLocaleString('en-IN');
    for (let i = startPage; i <= endPage; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(100);
        
        // Left footer: Faculty Name and Generation Date/Time
        const facultyName = user?.name || 'N/A';
        doc.text(`Faculty: ${facultyName}  |  Generated: ${generationDateTime}`, margin, pageHeight - 6, { align: 'left' });
        
        // Right footer: Page number
        doc.text(`Page ${i - startPage + 1} of ${endPage - startPage + 1}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
    }

    return doc;
};
