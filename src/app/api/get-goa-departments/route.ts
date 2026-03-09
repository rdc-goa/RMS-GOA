
'use server';

import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

interface StaffData {
  Department?: string;
}

export async function GET() {
  const filePath = path.join(process.cwd(), 'goastaffdata.xlsx');

  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`Goa staff data file not found at: ${filePath}. Cannot fetch departments.`);
      return NextResponse.json({ success: false, error: 'Goa department data source not found on the server.' }, { status: 404 });
    }

    const buffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<StaffData>(worksheet);

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
