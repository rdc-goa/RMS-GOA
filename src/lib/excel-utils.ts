import ExcelJS from 'exceljs';

/**
 * Reads an Excel file from a buffer and converts the first worksheet to a JSON array.
 * This mimics the behavior of xlsx's sheet_to_json.
 */
export async function readExcelFromBuffer<T>(buffer: ArrayBuffer): Promise<T[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const worksheet = workbook.getWorksheet(1); // Get the first worksheet
  if (!worksheet) return [];

  const data: T[] = [];
  
  // Use the first row to determine headers
  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    // ExcelJS column numbers are 1-indexed
    const value = cell.value;
    headers[colNumber] = value ? String(value).trim() : `Column${colNumber}`;
  });

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header row

    const rowData: any = {};
    let hasValue = false;

    // Iterate through all columns that have headers
    for (let i = 1; i < headers.length; i++) {
        const header = headers[i];
        if (!header) continue;

        const cell = row.getCell(i);
        let value = cell.value;

        // Handle complex ExcelJS cell types
        if (value && typeof value === 'object') {
            if ('richText' in value) {
                value = (value as any).richText.map((rt: any) => rt.text).join('');
            } else if ('result' in value) {
                value = (value as any).result; // Formula result
            } else if ('text' in value) {
                value = (value as any).text; // Hyperlink
            } else if (value instanceof Date) {
               // Keep as date
            } else {
                // If it's something else we don't recognize, try to stringify
                // value = JSON.stringify(value);
            }
        }

        if (value !== undefined && value !== null && value !== '') {
            rowData[header] = value;
            hasValue = true;
        }
    }

    if (hasValue) {
        data.push(rowData as T);
    }
  });

  return data;
}

/**
 * Fetches an Excel file from a URL and converts it to a JSON array.
 */
export async function readExcelFromUrl<T>(url: string): Promise<T[]> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
        console.error(`Failed to fetch Excel from ${url}: ${response.statusText}`);
        return [];
    }
    const buffer = await response.arrayBuffer();
    return readExcelFromBuffer<T>(buffer);
  } catch (error) {
    console.error(`Error reading Excel from URL ${url}:`, error);
    return [];
  }
}

/**
 * Creates a simple workbook with one sheet and returns it as a buffer.
 */
export async function createExcelBuffer(data: any[], sheetName: string = 'Sheet1'): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName);

    if (data.length > 0) {
        // Extract headers from the first object
        const headers = Object.keys(data[0]);
        worksheet.columns = headers.map(header => ({ header, key: header, width: 20 }));

        // Add rows
        worksheet.addRows(data);

        // Optional: Style the header row
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
}

/**
 * Reads an Excel file from a local file path and converts it to a JSON array.
 */
export async function readExcelFromFile<T>(filePath: string): Promise<T[]> {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) return [];

    const data: T[] = [];
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
        if (hasValue) data.push(rowData as T);
    });
    return data;
  } catch (error) {
    console.error(`Error reading Excel from file ${filePath}:`, error);
    return [];
  }
}
