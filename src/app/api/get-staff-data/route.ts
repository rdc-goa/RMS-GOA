
'use server';

import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

// Define the expected structure of a row in the Excel sheet
interface StaffData {
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
  // Goa specific columns
  Orcid?: string | number;
}

const GOA_STAFF_DATA_URL = 'https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/goastaffdata.xlsx';

const readStaffDataFromUrl = async (url: string): Promise<StaffData[]> => {
    try {
        const response = await fetch(url, { cache: 'no-store' }); // Use no-store to ensure fresh data
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

const formatUserRecord = (record: StaffData) => {
    // Goa data might use 'Orcid' while others use 'ORCID_ID'
    const orcid = String(record.ORCID_ID || record.Orcid || '');

    return {
        name: record.Name,
        email: record.Email,
        phoneNumber: String(record.Phone || ''),
        institute: record.Institute,
        department: record.Department,
        designation: record.Designation,
        faculty: record.Faculty,
        misId: String(record['MIS ID'] || ''),
        scopusId: String(record.Scopus_ID || ''),
        googleScholarId: String(record.Google_Scholar_ID || ''),
        orcidId: orcid,
        vidwanId: String(record.Vidwan_ID || ''),
        type: record.Type || 'faculty',
        campus: 'Goa',
    };
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');
  const misId = searchParams.get('misId');
  const fetchAll = searchParams.get('fetchAll');

  if (!email && !misId) {
    return NextResponse.json({ success: false, error: 'Email or MIS ID query parameter is required.' }, { status: 400 });
  }

  const allFoundRecords: any[] = [];
  const foundEmails = new Set<string>();
  
  const goastaffdata = await readStaffDataFromUrl(GOA_STAFF_DATA_URL);

  if (goastaffdata.length === 0) {
      return NextResponse.json({ success: false, error: 'Could not load staff data source.' }, { status: 500 });
  }

  if (fetchAll && misId) {
      goastaffdata.forEach(row => {
          if (row['MIS ID'] && String(row['MIS ID']).toLowerCase() === misId.toLowerCase()) {
             if (row.Email && !foundEmails.has(row.Email.toLowerCase())) {
                allFoundRecords.push(formatUserRecord(row));
                foundEmails.add(row.Email.toLowerCase());
            }
          }
      });
  } else {
    let foundRecord: StaffData | undefined;
    if (email) {
        foundRecord = goastaffdata.find(row => row.Email && row.Email.toLowerCase() === email.toLowerCase());
    } else if (misId) {
        foundRecord = goastaffdata.find(row => row['MIS ID'] && String(row['MIS ID']).toLowerCase() === misId.toLowerCase());
    }
    
    if (foundRecord && foundRecord.Email && !foundEmails.has(foundRecord.Email.toLowerCase())) {
        allFoundRecords.push(formatUserRecord(foundRecord));
        foundEmails.add(foundRecord.Email.toLowerCase());
    }
  }

  if (allFoundRecords.length > 0) {
    return NextResponse.json({ success: true, data: allFoundRecords });
  } else {
    return NextResponse.json({ success: false, error: `User not found in the staff data file.` }, { status: 404 });
  }
}
