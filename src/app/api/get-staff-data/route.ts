

import { NextRequest, NextResponse } from 'next/server';
import { readStaffDataFromUrl, GOA_STAFF_DATA_URL, formatUserRecord, StaffData } from '@/lib/staff-data';

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

  const searchAndAdd = (data: StaffData[], defaultCampus: 'Goa') => {
      let foundRecord: StaffData | undefined;
      if (email) {
          foundRecord = data.find(row => row.Email && row.Email.toLowerCase() === email.toLowerCase());
      } else if (misId) {
          foundRecord = data.find(row => row['MIS ID'] && String(row['MIS ID']).toLowerCase() === misId.toLowerCase());
      }
      
      if (foundRecord && foundRecord.Email && !foundEmails.has(foundRecord.Email.toLowerCase())) {
          allFoundRecords.push(formatUserRecord(foundRecord, defaultCampus));
          foundEmails.add(foundRecord.Email.toLowerCase());
      }
  };
  
  const searchAndAddAll = (data: StaffData[], defaultCampus: 'Goa') => {
      data.forEach(row => {
          if (row['MIS ID'] && String(row['MIS ID']).toLowerCase() === misId?.toLowerCase()) {
             if (row.Email && !foundEmails.has(row.Email.toLowerCase())) {
                allFoundRecords.push(formatUserRecord(row, defaultCampus));
                foundEmails.add(row.Email.toLowerCase());
            }
          }
      });
  };

  const goastaffdata = await readStaffDataFromUrl(GOA_STAFF_DATA_URL);

  if (fetchAll) {
      searchAndAddAll(goastaffdata, 'Goa');
  } else if (email || misId) {
    searchAndAdd(goastaffdata, 'Goa');
  }

  if (allFoundRecords.length > 0) {
    return NextResponse.json({ success: true, data: allFoundRecords });
  } else {
    return NextResponse.json({ success: false, error: `User not found in the staff data file.` }, { status: 404 });
  }
}
