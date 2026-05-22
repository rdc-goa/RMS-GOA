import { unstable_cache } from 'next/cache';
import { readExcelFromUrl } from './excel-utils';

export interface StaffData {
    Name?: string;
    Email?: string;
    Phone?: string | number;
    Institute?: string;
    Department?: string;
    Designation?: string;
    Faculty?: string;
    'MIS ID'?: string | number;
    Scopus_ID?: string | number;
    Google_Scholar_ID?: string | number;
    LinkedIn_URL?: string;
    ORCID_ID?: string | number;
    Vidwan_ID?: string | number;
    Type?: 'CRO' | 'Institutional' | 'faculty';
    Campus?: 'Vadodara' | 'Ahmedabad' | 'Rajkot' | 'Goa';
    Orcid?: string | number;
}

export interface FormattedStaffUser {
    name: string;
    email: string;
    phoneNumber: string;
    institute: string;
    department: string;
    designation: string;
    faculty: string;
    misId: string;
    scopusId: string;
    googleScholarId: string;
    orcidId: string;
    vidwanId: string;
    type: string;
    campus: string;
    uid?: string;
}

const GOA_STAFF_DATA_URL = 'https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/goastaffdata.xlsx';
const VADODARA_STAFF_DATA_URL = 'https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/goastaffdata.xlsx';

const getCachedStaffData = unstable_cache(
    async (url: string) => {
        console.log(`[Cache Miss] Fetching staff data from: ${url}`);
        return await readExcelFromUrl<StaffData>(url);
    },
    ['staff-data-cache'],
    {
        revalidate: 86400, // 24 hours
        tags: ['staff']
    }
);

async function readStaffDataFromUrlWithCache(url: string): Promise<StaffData[]> {
    try {
        return await getCachedStaffData(url);
    } catch (error) {
        console.error(`Failed to fetch staff data from ${url}:`, error);
        return [];
    }
}

export function formatStaffRecord(record: StaffData, defaultCampus: string): FormattedStaffUser {
    const isGoaUser = record.Email?.toLowerCase().endsWith('@goa.paruluniversity.ac.in');
    const instituteName = record.Type === 'Institutional' ? record.Name : record.Institute;
    const resolvedCampus = record.Campus || (isGoaUser ? 'Goa' : defaultCampus);

    return {
        name: record.Name || '',
        email: record.Email || '',
        phoneNumber: String(record.Phone || ''),
        institute: instituteName || '',
        department: record.Department || '',
        designation: record.Designation || '',
        faculty: record.Faculty || '',
        misId: String(record['MIS ID'] || ''),
        scopusId: String(record.Scopus_ID || ''),
        googleScholarId: String(record.Google_Scholar_ID || ''),
        orcidId: String(record.ORCID_ID || record.Orcid || ''),
        vidwanId: String(record.Vidwan_ID || ''),
        type: record.Type || 'faculty',
        campus: resolvedCampus,
    };
}

/**
 * Core business logic for fetching staff data by email or MIS ID.
 */
export async function getStaffDataAction(params: {
    email?: string;
    misId?: string;
    userEmailForFileCheck?: string;
    fetchAll?: boolean;
}): Promise<FormattedStaffUser[]> {
    const { email, misId, userEmailForFileCheck, fetchAll } = params;

    const [staffdata, goastaffdata] = await Promise.all([
        readStaffDataFromUrlWithCache(VADODARA_STAFF_DATA_URL),
        readStaffDataFromUrlWithCache(GOA_STAFF_DATA_URL)
    ]);

    const allFoundRecords: FormattedStaffUser[] = [];
    const foundEmails = new Set<string>();

    const searchAndAdd = (data: StaffData[], defaultCampus: string) => {
        let foundRecord: StaffData | undefined;
        if (email) {
            foundRecord = data.find(row => row.Email && row.Email.toLowerCase() === email.toLowerCase());
        } else if (misId) {
            foundRecord = data.find(row => row['MIS ID'] && String(row['MIS ID']).toLowerCase() === misId.toLowerCase());
        }

        if (foundRecord) {
            const uniqueKey = foundRecord.Email ? foundRecord.Email.toLowerCase() : String(foundRecord['MIS ID']).toLowerCase();
            if (!foundEmails.has(uniqueKey)) {
                allFoundRecords.push(formatStaffRecord(foundRecord, defaultCampus));
                foundEmails.add(uniqueKey);
            }
        }
    };

    const searchAndAddAll = (data: StaffData[], defaultCampus: string) => {
        data.forEach(row => {
            if (row['MIS ID'] && String(row['MIS ID']).toLowerCase() === misId?.toLowerCase()) {
                const uniqueKey = row.Email ? row.Email.toLowerCase() : String(row['MIS ID']).toLowerCase();
                if (!foundEmails.has(uniqueKey)) {
                    allFoundRecords.push(formatStaffRecord(row, defaultCampus));
                    foundEmails.add(uniqueKey);
                }
            }
        });
    };

    if (fetchAll) {
        if (!email && !misId) {
            // Return everything from both sources
            staffdata.forEach(row => {
                const uniqueKey = row.Email ? row.Email.toLowerCase() : String(row['MIS ID']).toLowerCase();
                if (!foundEmails.has(uniqueKey)) {
                    allFoundRecords.push(formatStaffRecord(row, 'Goa'));
                    foundEmails.add(uniqueKey);
                }
            });
            goastaffdata.forEach(row => {
                const uniqueKey = row.Email ? row.Email.toLowerCase() : String(row['MIS ID']).toLowerCase();
                if (!foundEmails.has(uniqueKey)) {
                    allFoundRecords.push(formatStaffRecord(row, 'Goa'));
                    foundEmails.add(uniqueKey);
                }
            });
        } else {
            // Filter but allow multiple (e.g. searching for a shared MIS ID)
            searchAndAddAll(staffdata, 'Goa');
            searchAndAddAll(goastaffdata, 'Goa');
        }
    } else if (email) {
        const isGoaEmail = email.toLowerCase().endsWith('@goa.paruluniversity.ac.in');
        searchAndAdd(isGoaEmail ? goastaffdata : staffdata, isGoaEmail ? 'Goa' : 'Goa');
    } else if (misId) {
        if (userEmailForFileCheck) {
            const isGoaContext = userEmailForFileCheck.toLowerCase().endsWith('@goa.paruluniversity.ac.in');
            searchAndAdd(isGoaContext ? goastaffdata : staffdata, isGoaContext ? 'Goa' : 'Goa');
        } else {
            searchAndAdd(staffdata, 'Goa');
            searchAndAdd(goastaffdata, 'Goa');
        }
    }

    return allFoundRecords;
}

/**
 * Core business logic for searching users/staff by name.
 */
export async function searchStaffByNameAction(name: string): Promise<FormattedStaffUser[]> {
    if (!name || name.trim().length < 2) return [];

    const lowercasedName = name.toLowerCase();

    const [staffdata, goastaffdata] = await Promise.all([
        readStaffDataFromUrlWithCache(VADODARA_STAFF_DATA_URL),
        readStaffDataFromUrlWithCache(GOA_STAFF_DATA_URL)
    ]);

    const allStaffData = [...staffdata, ...goastaffdata];

    return allStaffData
        .filter(row => row.Name && row.Name.toLowerCase().includes(lowercasedName))
        .slice(0, 10)
        .map(row => formatStaffRecord(row, row.Campus || (row.Email?.toLowerCase().endsWith('@goa.paruluniversity.ac.in') ? 'Goa' : 'Goa')));
}
