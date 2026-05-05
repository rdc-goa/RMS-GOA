
import * as XLSX from 'xlsx';

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
  Campus?: 'Goa';
  Orcid?: string | number;
}

export const GOA_STAFF_DATA_URL = 'https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/goastaffdata.xlsx';

export const readStaffDataFromUrl = async (url: string): Promise<StaffData[]> => {
    try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
            console.warn(`Failed to fetch staff data from URL: ${url}. Status: ${response.status}`);
            return [];
        }
        const buffer = await response.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        return XLSX.utils.sheet_to_json<StaffData>(worksheet);
    } catch (error) {
        console.error(`Error reading staff data from ${url}:`, error);
        return [];
    }
}

export const formatUserRecord = (record: StaffData, defaultCampus: 'Goa' = 'Goa') => {
    const resolvedCampus = record.Campus || defaultCampus;

    return {
        name: record.Name,
        email: record.Email,
        phoneNumber: String(record.Phone || ''),
        institute: record.Type === 'Institutional' ? record.Name : record.Institute,
        department: record.Department,
        designation: record.Designation,
        faculty: record.Faculty,
        misId: String(record['MIS ID'] || ''),
        scopusId: String(record.Scopus_ID || ''),
        googleScholarId: String(record.Google_Scholar_ID || ''),
        orcidId: String(record.ORCID_ID || record.Orcid || ''),
        vidwanId: String(record.Vidwan_ID || ''),
        type: record.Type || 'faculty',
        campus: resolvedCampus,
    };
};
