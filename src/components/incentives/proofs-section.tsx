'use client';

import React from 'react';
import type { IncentiveClaim } from '@/types';

export interface ClaimProofItem {
  id: string;
  label: string;
  url: string;
  type: 'file' | 'link';
}

export function ensureSecureUrl(url: string): string {
  if (!url) return url;
  if (url.includes('firebasestorage.googleapis.com') || url.includes('storage.googleapis.com')) {
    try {
      const urlObj = new URL(url);
      let path = '';
      if (url.includes('firebasestorage')) {
        const parts = urlObj.pathname.split('/o/');
        if (parts.length > 1) {
          path = decodeURIComponent(parts[1].split('?')[0]);
        }
      } else {
        const parts = urlObj.pathname.split('/');
        if (parts.length > 2) {
          path = parts.slice(2).join('/');
        }
      }
      if (path) return `/api/documents/${path}`;
    } catch (e) {
      console.error('Failed to rewrite storage URL:', e);
    }
  }
  return url;
}

export function getAllClaimProofs(claim: IncentiveClaim): ClaimProofItem[] {
  if (!claim) return [];
  const items: ClaimProofItem[] = [];

  const add = (id: string, label: string, url?: string | null, type: 'file' | 'link' = 'file') => {
    if (url && typeof url === 'string' && url.trim().length > 0) {
      items.push({ id, label, url: url.trim(), type });
    }
  };

  const addArray = (baseId: string, baseLabel: string, urls?: string[] | null, type: 'file' | 'link' = 'file') => {
    if (Array.isArray(urls)) {
      urls.forEach((u, i) => {
        if (u && typeof u === 'string' && u.trim().length > 0) {
          const suffix = urls.length > 1 ? ` (${i + 1})` : '';
          items.push({ id: `${baseId}_${i}`, label: `${baseLabel}${suffix}`, url: u.trim(), type });
        }
      });
    }
  };

  // Research Papers / General Links & Proofs
  if (claim.doi) {
    const doiUrl = claim.doi.startsWith('http') ? claim.doi : `https://doi.org/${claim.doi}`;
    add('doi', 'DOI Link', doiUrl, 'link');
  }
  add('relevantLink', 'Publication Link', claim.relevantLink, 'link');
  add('scopusLink', 'Scopus Link', claim.scopusLink, 'link');
  add('wosLink', 'Web of Science Link', claim.wosLink, 'link');
  addArray('publicationProofUrls', 'Publication Proof', claim.publicationProofUrls, 'file');

  // Patents
  add('patentForm1Url', 'Patent Form 1 (Proof of Status)', claim.patentForm1Url, 'file');
  add('patentApprovalProofUrl', 'Patent Approval Proof', claim.patentApprovalProofUrl, 'file');
  add('patentGovtReceiptUrl', 'Patent Govt. Payment Receipt', claim.patentGovtReceiptUrl, 'file');

  // Conferences
  add('eventWebsite', 'Conference Event Website', claim.eventWebsite, 'link');
  add('abstractUrl', 'Paper Abstract Proof', claim.abstractUrl, 'file');
  add('govtFundingRequestProofUrl', 'Govt. Funding Request Proof', claim.govtFundingRequestProofUrl, 'file');
  add('registrationFeeProofUrl', 'Registration Fee Proof', claim.registrationFeeProofUrl, 'file');
  add('participationCertificateUrl', 'Participation Certificate', claim.participationCertificateUrl, 'file');
  add('prizeProofUrl', 'Prize / Award Certificate', claim.prizeProofUrl, 'file');
  add('travelReceiptsUrl', 'Travel Receipts', claim.travelReceiptsUrl, 'file');
  add('flightTicketsUrl', 'Flight / Travel Tickets', claim.flightTicketsUrl, 'file');
  add('conferenceProofUrl', 'Conference Presentation Proof', claim.conferenceProofUrl, 'file');
  addArray('presencePhotographsUrls', 'Event Presence Photograph', claim.presencePhotographsUrls, 'file');

  // Workshop / FDP
  add('workshopCertificateUrl', 'Participation Certificate', claim.workshopCertificateUrl, 'file');
  add('accommodationProofUrl', 'Accommodation Bill', claim.accommodationProofUrl, 'file');
  add('miscellaneousProofUrl', 'Miscellaneous Expense Receipts', claim.miscellaneousProofUrl, 'file');

  // Books
  add('publisherWebsite', 'Publisher Website', claim.publisherWebsite, 'link');
  add('bookProofUrl', 'Book / Chapter Proof', claim.bookProofUrl, 'file');
  add('bookAiReportProofUrl', 'AI Reports of the Book', claim.bookAiReportProofUrl, 'file');
  add('scopusProofUrl', 'Scopus Indexing Proof', claim.scopusProofUrl, 'file');

  // Membership
  add('membershipProofUrl', 'Membership Payment Proof', claim.membershipProofUrl, 'file');

  // Honoring Awards
  addArray('awardProofUrls', 'Award Proof', claim.awardProofUrls, 'file');

  // APC Reimbursement / Seed Money
  add('apcApcWaiverProofUrl', 'Waiver Request Proof', claim.apcApcWaiverProofUrl, 'file');
  add('apcJournalWebsite', 'Journal Website', claim.apcJournalWebsite, 'link');
  add('apcPublicationProofUrl', 'Publication Proof', claim.apcPublicationProofUrl, 'file');
  add('apcInvoiceProofUrl', 'Financial Invoice', claim.apcInvoiceProofUrl, 'file');
  add('apcReceiptProofUrl', 'Receipt', claim.apcReceiptProofUrl, 'file');
  add('apcPaymentProofUrl', 'Payment Proof', claim.apcPaymentProofUrl, 'file');
  add('apcAcceptanceMailProofUrl', 'Acceptance Mail', claim.apcAcceptanceMailProofUrl, 'file');

  // EMR Sanction Projects
  add('sanctionProofUrl', 'Sanction Proof', claim.sanctionProofUrl, 'file');

  // Additional / Miscellaneous Documents
  addArray('additionalDocumentsUrls', 'Additional Document', claim.additionalDocumentsUrls, 'file');
  addArray('additionalDocuments', 'Additional Attachment', (claim as any).additionalDocuments, 'file');

  return items;
}

export function ClaimProofsSection({ claim, className = '' }: { claim: IncentiveClaim; className?: string }) {
  const proofs = getAllClaimProofs(claim);

  if (proofs.length === 0) return null;

  return (
    <div className={className}>
      <hr className="my-2" />
      <h4 className="font-semibold text-base mt-2 mb-1">Uploaded Documents</h4>
      <div className="space-y-0.5 text-sm">
        {proofs.map((item) => {
          const secureUrl = ensureSecureUrl(item.url);
          return (
            <div key={item.id} className="grid grid-cols-3 gap-2 py-1 items-center">
              <dt className="font-semibold text-muted-foreground col-span-1">{item.label}</dt>
              <dd className="col-span-2">
                <a
                  href={secureUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-medium"
                >
                  View Document
                </a>
              </dd>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ClaimProofsApprovalSection({ claim }: { claim: IncentiveClaim }) {
  const proofs = getAllClaimProofs(claim);

  if (proofs.length === 0) return null;

  return (
    <div className="space-y-1 rounded-lg border bg-muted/40 p-4">
      <h4 className="font-semibold text-sm mb-2">Uploaded Documents</h4>
      {proofs.map((item) => {
        const secureUrl = ensureSecureUrl(item.url);
        return (
          <div key={item.id} className="grid grid-cols-12 gap-2 text-sm items-center py-1 border-t border-border/40 first:border-0">
            <span className="text-muted-foreground col-span-5">{item.label}</span>
            <div className="col-span-7">
              <a
                href={secureUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-medium"
              >
                View Document
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}
