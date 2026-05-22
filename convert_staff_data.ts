// script to fetch xlsx, convert to json, and put in vercel blob
import { put } from '@vercel/blob';
import fetch from 'node-fetch';
import ExcelJS from 'exceljs';

const GOA_STAFF_DATA_URL = 'https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/goastaffdata.xlsx';
const VADODARA_STAFF_DATA_URL = 'https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/goastaffdata.xlsx';

async function readExcelFromBuffer(buffer: ArrayBuffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) return [];

    const data: any[] = [];
    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];

    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const value = cell.value;
        headers[colNumber] = value ? String(value).trim() : `Column${colNumber}`;
    });

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return;
        const rowData: any = {};
        let hasValue = false;
        for (let i = 1; i < headers.length; i++) {
            const header = headers[i];
            if (!header) continue;
            const cell = row.getCell(i);
            let value = cell.value;
            if (value && typeof value === 'object') {
                if ('richText' in value) value = (value as any).richText.map((rt: any) => rt.text).join('');
                else if ('result' in value) value = (value as any).result;
                else if ('text' in value) value = (value as any).text;
            }
            if (value !== undefined && value !== null && value !== '') {
                rowData[header] = value;
                hasValue = true;
            }
        }
        if (hasValue) data.push(rowData);
    });
    return data;
}

async function convertAndUpload(url: string, newFileName: string) {
    console.log(`Downloading ${url}...`);
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();

    console.log(`Parsing ${url}...`);
    const json = await readExcelFromBuffer(buffer);

    console.log(`Uploading ${newFileName}...`);
    const jsonString = JSON.stringify(json);

    const token = process.env.RDC_READ_WRITE_TOKEN;
    if (!token) throw new Error("RDC_READ_WRITE_TOKEN not found in env");

    const blob = await put(newFileName, jsonString, {
        access: 'public',
        contentType: 'application/json',
        token,
        addRandomSuffix: false,
        allowOverwrite: true
    });

    console.log(`Success! New URL: ${blob.url}`);
}

async function main() {
    try {
        await convertAndUpload(GOA_STAFF_DATA_URL, 'goastaffdata.json');
        await convertAndUpload(VADODARA_STAFF_DATA_URL, 'staffdatabrc.json');
    } catch (e) {
        console.error(e);
    }
}

main();
