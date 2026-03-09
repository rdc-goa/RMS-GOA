
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/admin';
import type { User } from '@/types';
import * as XLSX from 'xlsx';

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
  Campus?: 'Goa';
  Orcid?: string | number;
}

const GOA_STAFF_DATA_URL = 'https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/goastaffdata.xlsx';

const readStaffDataFromUrl = async (url: string): Promise<StaffData[]> => {
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
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    const misId = searchParams.get('misId');

    if ((!name || name.trim().length < 2) && (!misId || misId.trim().length < 2)) {
      return NextResponse.json({ success: true, users: [] });
    }

    const lowercasedName = name?.toLowerCase() || '';
    const lowercasedMisId = misId?.toLowerCase() || '';
    
    const usersRef = adminDb.collection('users');
    const querySnapshot = await usersRef.orderBy('name').get();
    
    const allUsers = querySnapshot.docs.map(doc => {
        const userData = doc.data() as User;
        return {
            uid: doc.id,
            name: userData.name,
            email: userData.email,
            misId: userData.misId || 'N/A',
        };
    });

    let filteredUsers = allUsers;
    if (lowercasedName) {
        filteredUsers = filteredUsers
            .filter(user => user.name.toLowerCase().includes(lowercasedName))
            .slice(0, 10);
    } else if (lowercasedMisId) {
        filteredUsers = filteredUsers
            .filter(user => user.misId && user.misId.toLowerCase().includes(lowercasedMisId))
            .slice(0, 10);
    }

    // If not enough results from Firestore, search staffdata.xlsx
    if (filteredUsers.length < 10) {
        try {
            const [staffdata, goastaffdata] = await Promise.all([
                readStaffDataFromUrl(GOA_STAFF_DATA_URL)
            ]);

            const allStaffData = [...staffdata, ...goastaffdata];
            const existingEmails = new Set(allUsers.map(u => u.email.toLowerCase()));

            let staffMatches: any[] = [];
            if (lowercasedName) {
                staffMatches = allStaffData
                    .filter(row => 
                        row.Name && row.Name.toLowerCase().includes(lowercasedName) &&
                        row.Email && !existingEmails.has(row.Email.toLowerCase())
                    )
                    .slice(0, 10 - filteredUsers.length)
                    .map(row => ({
                        uid: '',
                        name: row.Name,
                        email: row.Email,
                        misId: row['MIS ID'] ? String(row['MIS ID']) : 'N/A',
                    }));
            } else if (lowercasedMisId) {
                staffMatches = allStaffData
                    .filter(row => 
                        row['MIS ID'] && String(row['MIS ID']).toLowerCase().includes(lowercasedMisId) &&
                        row.Email && !existingEmails.has(row.Email.toLowerCase())
                    )
                    .slice(0, 10 - filteredUsers.length)
                    .map(row => ({
                        uid: '',
                        name: row.Name,
                        email: row.Email,
                        misId: row['MIS ID'] ? String(row['MIS ID']) : 'N/A',
                    }));
            }

            filteredUsers = [...filteredUsers, ...staffMatches];
        } catch (error) {
            console.error("Error fetching staffdata.xlsx:", error);
        }
    }

    return NextResponse.json({ success: true, users: filteredUsers });

  } catch (error: any) {
    console.error("Error finding users by name:", error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
