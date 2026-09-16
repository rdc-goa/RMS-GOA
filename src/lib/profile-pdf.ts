import type { User, Project, EmrInterest, ResearchPaper, IncentiveClaim, ScopusPublication } from '@/types';
import { formatOpenAccessStatus, formatScopusDate } from './scopus-utils';

export interface ProfilePdfData {
  user: User;
  projects: Project[];
  emrInterests: EmrInterest[];
  researchPapers: ResearchPaper[];
  paperClaims: IncentiveClaim[];
  scopusPublications: ScopusPublication[];
  scopusSubjectAreas?: { name: string; count: number }[];
  scopusHIndex?: number;
  careerTimeline?: {
    startYear?: string | number;
    latestYear?: string | number;
    activeYears?: number;
  };
  uniqueCoAuthors?: number;
  topCoAuthors?: any[];
  affiliationsList?: any[];
  nameVariantsList?: string[];
  publicationCategoryCounts?: { name: string; count: number }[];
}

export async function generateProfilePdf(data: ProfilePdfData) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { user, projects, emrInterests, researchPapers, scopusPublications } = data;

  const primaryColor: [number, number, number] = [30, 58, 138]; // #1E3A8A
  const secondaryColor: [number, number, number] = [71, 85, 105]; // #475569
  const accentColor: [number, number, number] = [15, 23, 42];

  let currentY = 15;

  // Header Banner
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, 210, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(user.name || 'User Profile', 14, 15);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const subTitle = `${user.designation || 'Faculty Member'} | ${user.department || 'RMS Portal'}`;
  doc.text(subTitle, 14, 22);

  const dateStr = `Report Date: ${new Date().toLocaleDateString('en-GB')}`;
  doc.setFontSize(9);
  doc.text(dateStr, 196, 22, { align: 'right' });

  currentY = 36;

  // 1. Academic & Research Summary
  doc.setTextColor(...accentColor);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('1. Personal & Academic Overview', 14, currentY);
  currentY += 4;

  const infoRows = [
    [
      `Employee / MIS ID: ${user.misId || (user as any).employeeId || 'N/A'}`,
      `Email: ${user.email || 'N/A'}`,
      `Phone: ${user.phoneNumber || 'N/A'}`,
    ],
    [
      `Faculty: ${user.faculty || 'N/A'}`,
      `Scopus ID: ${user.scopusId || 'N/A'}`,
      `ORCID iD: ${user.orcidId || 'N/A'}`,
    ],
    [
      `Scopus h-Index: ${data.scopusHIndex ?? user.hIndex ?? '0'}`,
      `Citations Count: ${user.citationCount ?? '0'}`,
      `i10-Index: ${user.i10Index ?? '0'}`,
    ],
  ];

  autoTable(doc, {
    startY: currentY,
    body: infoRows,
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: 2, textColor: secondaryColor },
    margin: { left: 14, right: 14 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  let sectionIndex = 2;

  // 1b (or 2). Scopus Author Profile & Analytics (if scopusId exists)
  if (user.scopusId) {
    if (currentY > 240) { doc.addPage(); currentY = 15; }

    doc.setTextColor(...accentColor);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`${sectionIndex}. Scopus Author Profile & Analytics`, 14, currentY);
    currentY += 4;

    const timelineStr = data.careerTimeline?.startYear 
      ? `${data.careerTimeline.startYear} – ${data.careerTimeline.latestYear || 'Pres.'} (${data.careerTimeline.activeYears || 0} Years Active)` 
      : 'N/A';

    const totalCitations = scopusPublications.reduce((acc, p: any) => acc + (p.citationCount || 0), 0);

    const scopusAnalyticsRows = [
      [
        `Scopus Author ID: ${user.scopusId}`,
        `Career Timeline: ${timelineStr}`,
        `Co-Authors: ${data.uniqueCoAuthors ?? '0'} Collaborators`,
      ],
      [
        `Scopus h-Index: ${data.scopusHIndex ?? user.hIndex ?? '0'}`,
        `Total Citations: ${totalCitations}`,
        `i10-Index: ${user.i10Index ?? '0'}`,
      ]
    ];

    autoTable(doc, {
      startY: currentY,
      body: scopusAnalyticsRows,
      theme: 'plain',
      styles: { fontSize: 8.5, cellPadding: 2, textColor: secondaryColor },
      margin: { left: 14, right: 14 },
    });

    currentY = (doc as any).lastAutoTable.finalY + 4;

    // Affiliation & Author Registry
    const nameVariantsStr = data.nameVariantsList && data.nameVariantsList.length > 0
      ? data.nameVariantsList.join(', ')
      : user.name || 'N/A';

    const affiliationsStr = data.affiliationsList && data.affiliationsList.length > 0
      ? data.affiliationsList.map((aff: any) => `${aff.name || ''}${aff.city ? `, ${aff.city}` : ''}${aff.country ? `, ${aff.country}` : ''}${aff.current ? ' (Current)' : ''}`).join('\n')
      : user.institute || 'N/A';

    const registryRows = [
      [
        `Scopus Name Variants:\n${nameVariantsStr}`,
        `Institutional Affiliations:\n${affiliationsStr}`
      ]
    ];

    autoTable(doc, {
      startY: currentY,
      body: registryRows,
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: 2, textColor: secondaryColor, valign: 'top' },
      margin: { left: 14, right: 14 },
      columnStyles: {
        0: { cellWidth: 90 },
        1: { cellWidth: 90 }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 4;

    // Research Distribution & Co-Authors List
    const categoriesList = data.publicationCategoryCounts && data.publicationCategoryCounts.length > 0
      ? data.publicationCategoryCounts.map((cat: any) => `${cat.name} (${cat.count})`).join(', ')
      : 'N/A';

    const coAuthorsStr = data.topCoAuthors && data.topCoAuthors.length > 0
      ? data.topCoAuthors.map((ca: any) => `${ca.name || ca.authorName || 'N/A'} (${ca.count || ca.paperCount || 0} papers)`).join(', ')
      : 'N/A';

    const distributionRows = [
      [
        `Research Distribution / Subject Areas:\n${categoriesList}`,
      ],
      [
        `Top Co-Authors & Collaborators:\n${coAuthorsStr}`
      ]
    ];

    autoTable(doc, {
      startY: currentY,
      body: distributionRows,
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: 2, textColor: secondaryColor, valign: 'top' },
      margin: { left: 14, right: 14 },
      columnStyles: {
        0: { cellWidth: 180 }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;
    sectionIndex++;
  }

  // Intramural Research (IMR) Projects
  const sanctionedProjects = projects.filter(p =>
    ['sanctioned', 'in progress', 'completed', 'pending completion approval'].includes((p.status || '').toLowerCase())
  );
  if (sanctionedProjects.length > 0) {
    if (currentY > 250) { doc.addPage(); currentY = 15; }

    doc.setTextColor(...accentColor);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`${sectionIndex}. Intramural Research (IMR) Projects (${sanctionedProjects.length})`, 14, currentY);
    currentY += 4;

    const projectHead = [['Project Title', 'Role', 'Status', 'Submission Date']];
    const projectBody = sanctionedProjects.map(p => {
      const isPI = p.pi_uid === user.uid || p.pi_email === user.email;
      return [
        p.title || 'Untitled',
        isPI ? 'Principal Investigator (PI)' : 'Co-PI',
        p.status || 'N/A',
        p.submissionDate ? new Date(p.submissionDate).toLocaleDateString('en-GB') : 'N/A',
      ];
    });

    autoTable(doc, {
      startY: currentY,
      head: projectHead,
      body: projectBody,
      theme: 'striped',
      headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
      bodyStyles: { fontSize: 8, cellPadding: 2.5 },
      margin: { left: 14, right: 14 },
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;
    sectionIndex++;
  }

  // Extramural Research (EMR) Grants
  const sanctionedEmr = emrInterests.filter(i =>
    (i.status || '').toLowerCase() === 'sanctioned'
  );
  if (sanctionedEmr.length > 0) {
    if (currentY > 250) { doc.addPage(); currentY = 15; }

    doc.setTextColor(...accentColor);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`${sectionIndex}. Extramural Research (EMR) Grants (${sanctionedEmr.length})`, 14, currentY);
    currentY += 4;

    const emrHead = [['Project / Call Title', 'Funding Agency', 'Role', 'Grant Details', 'Sanction Date']];
    const emrBody = sanctionedEmr.map(i => [
      i.callTitle || 'N/A',
      i.agency || 'N/A',
      i.userId === user.uid ? 'PI' : 'Co-PI',
      i.durationAmount || 'N/A',
      i.sanctionDate ? new Date(i.sanctionDate).toLocaleDateString('en-GB') : 'N/A',
    ]);


    autoTable(doc, {
      startY: currentY,
      head: emrHead,
      body: emrBody,
      theme: 'striped',
      headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
      bodyStyles: { fontSize: 8, cellPadding: 2.5 },
      margin: { left: 14, right: 14 },
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;
    sectionIndex++;
  }

  // Research Publications Portfolio
  const isScopusUser = !!user.scopusId;
  const pubsToRender = isScopusUser ? scopusPublications : researchPapers;

  if (pubsToRender.length > 0) {
    if (currentY > 240) { doc.addPage(); currentY = 15; }

    doc.setTextColor(...accentColor);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`${sectionIndex}. Research Publications Portfolio (${pubsToRender.length})`, 14, currentY);
    currentY += 4;

    const pubHead = [['Title & Authors', 'Journal / Venue', 'Year / Month', 'Type', 'Access', 'Citations']];
    const pubBody = pubsToRender.map((p: any) => {
      const isScopus = 'eid' in p;
      const titleStr = p.title || 'Untitled';
      const authorsStr = p.authors || '';
      const journal = isScopus ? p.journalName : (p.journal || p.conferenceName || 'N/A');
      const year = isScopus ? formatScopusDate(p.coverDate, p.publicationYear) : (p.year || 'N/A');
      const type = isScopus ? (p.subtypeDescription || p.aggregationType || 'Article') : (p.publicationType || 'Paper');
      const citations = isScopus ? String(p.citationCount ?? 0) : String(p.citations ?? 0);

      let accessStr = 'N/A';
      if (isScopus) {
        const oaInfo = formatOpenAccessStatus(p.openAccess, p.openAccessStatus);
        accessStr = oaInfo.isOpen ? (oaInfo.label || 'Open Access') : 'Subscribed';
      } else {
        accessStr = p.openAccessOrSubscription || 'N/A';
      }

      const isSpringer = isScopus && (
        (p.publisher || '').toLowerCase().includes('springer') ||
        (p.journalName || '').toLowerCase().includes('springer') ||
        (p.doi || '').startsWith('10.1007') ||
        (p.doi || '').startsWith('10.1186') ||
        (p.doi || '').startsWith('10.1038') ||
        (p.doi || '').startsWith('10.2165')
      );

      let linkLabel = '';
      if (isSpringer && p.doi) {
        linkLabel = '\n[Springer Nature Link]';
      } else if (p.scopusUrl) {
        linkLabel = '\n[Scopus Link]';
      } else if (p.doi) {
        linkLabel = '\n[DOI Link]';
      }

      const row: any = [
        authorsStr ? `${titleStr}${linkLabel}\nAuthors: ${authorsStr}` : `${titleStr}${linkLabel}`,
        journal,
        year,
        type,
        accessStr,
        citations,
      ];
      row.pub = p;
      return row;
    });

    autoTable(doc, {
      startY: currentY,
      head: pubHead,
      body: pubBody,
      theme: 'striped',
      headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 7.5, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 62 },
        1: { cellWidth: 42 },
        2: { cellWidth: 24 },
        3: { cellWidth: 20 },
        4: { cellWidth: 20 },
        5: { cellWidth: 14, halign: 'right' },
      },
      margin: { left: 14, right: 14 },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 0) {
          const row = data.row.raw as any;
          const pub = row?.pub;
          if (!pub) return;
          const isScopus = 'eid' in pub;
          const isSpringer = isScopus && (
            (pub.publisher || '').toLowerCase().includes('springer') ||
            (pub.journalName || '').toLowerCase().includes('springer') ||
            (pub.doi || '').startsWith('10.1007') ||
            (pub.doi || '').startsWith('10.1186') ||
            (pub.doi || '').startsWith('10.1038') ||
            (pub.doi || '').startsWith('10.2165')
          );
          const url = isSpringer && pub.doi ? `https://link.springer.com/article/${pub.doi}` :
                      (pub.scopusUrl || (pub.doi ? `https://doi.org/${pub.doi}` : null));
          if (url) {
            doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
          }
        }
      }
    });

  }

  // Footer on all pages
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `RMS Portal Profile Report - ${user.name || 'User'} | Page ${page} of ${totalPages}`,
      105,
      290,
      { align: 'center' }
    );
  }

  const safeName = (user.name || 'User_Profile').replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`${safeName}_Profile_Report.pdf`);
}
