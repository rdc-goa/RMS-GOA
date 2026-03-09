import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 });
    }

    const filePath = path.resolve(process.cwd(), 'goastaffdata.xlsx');
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ success: false, error: 'goastaffdata.xlsx not found' }, { status: 500 });
    }

    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData: Array<Record<string, any>> = XLSX.utils.sheet_to_json(worksheet);

    // Find staff by email (case-insensitive)
    const staff = jsonData.find((row) => {
      return row['Email'] && row['Email'].toLowerCase() === email.toLowerCase();
    });

    if (staff && staff['Name']) {
      return NextResponse.json({ success: true, name: staff['Name'] });
    } else {
      return NextResponse.json({ success: true, name: null });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
