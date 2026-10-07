import { NextRequest, NextResponse } from 'next/server';
import { logEvent } from '@/lib/logger';
import { getStaffDataAction } from '@/lib/staff-service';

export async function GET(request: NextRequest) {
  const start = performance.now();
  const { searchParams } = new URL(request.url);
  const campus = searchParams.get('campus');

  try {
    const staffRecords = await getStaffDataAction({ fetchAll: true });
    
    if (!staffRecords || staffRecords.length === 0) {
      return NextResponse.json({ success: false, error: 'Staff data is empty or unavailable.' }, { status: 404 });
    }

    const departments = staffRecords
      .filter(record => !campus || record.campus === campus)
      .map(record => record.department)
      .filter((dept): dept is string => !!dept && dept.trim() !== '');

    let matrixDepartments: string[] = [];
    try {
      const { getSystemSettings } = await import('@/services/system-service');
      const { normalizeFacultyMatrix, defaultGoaMatrix } = await import('@/lib/academic-data');
      const settings = await getSystemSettings();
      const rawMatrix = (settings?.facultyMatrix && settings.facultyMatrix.length > 0)
        ? settings.facultyMatrix
        : defaultGoaMatrix;
      const normalized = normalizeFacultyMatrix(rawMatrix);
      normalized.forEach(f => {
        (f.institutes || []).forEach(i => {
          (i.departments || []).forEach(d => {
            if (d.name && d.name.trim()) matrixDepartments.push(d.name.trim());
          });
        });
      });
    } catch (e) {
      console.warn('Could not extract departments from matrix settings:', e);
    }

    const uniqueDepartments = [...new Set([...departments, ...matrixDepartments])].sort();

    await logEvent('APPLICATION', 'API Request successful', {
      metadata: { endpoint: '/api/get-departments', campus, method: 'GET', statusCode: 200, latency_ms: performance.now() - start },
      status: 'info'
    });

    return NextResponse.json({ success: true, data: uniqueDepartments }, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      }
    });

  } catch (error: any) {
    console.error('Error fetching departments:', error);
    return NextResponse.json({ success: false, error: 'Failed to process department data.' }, { status: 500 });
  }
}
