
'use server';

import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

interface StaffData {
  Department?: string;
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
}

export async function GET() {
  try {
    const jsonData = await readStaffDataFromUrl(GOA_STAFF_DATA_URL);
    
    if (jsonData.length === 0) {
        return NextResponse.json({ success: false, error: 'Could not load department data source.' }, { status: 404 });
    }

    const departments = jsonData
      .map(row => row.Department)
      .filter((dept): dept is string => !!dept && typeof dept === 'string' && dept.trim() !== '');

    const uniqueDepartments = [...new Set(departments)].sort();

    return NextResponse.json({ success: true, data: uniqueDepartments });

  } catch (error: any) {
    console.error('Error fetching or processing Goa staff data file for departments:', error);
    return NextResponse.json({ success: false, error: 'Failed to process Goa department data.' }, { status: 500 });
  }
}
