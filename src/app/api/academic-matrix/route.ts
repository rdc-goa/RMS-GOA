import { NextResponse } from 'next/server';
import { getSystemSettings } from '@/services/system-service';
import { normalizeFacultyMatrix, defaultGoaMatrix, getFacultiesFromMatrix } from '@/lib/academic-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const settings = await getSystemSettings();
    const rawMatrix = (settings?.facultyMatrix && settings.facultyMatrix.length > 0)
      ? settings.facultyMatrix
      : defaultGoaMatrix;
    const matrix = normalizeFacultyMatrix(rawMatrix);
    const faculties = getFacultiesFromMatrix(matrix);

    return NextResponse.json({
      success: true,
      data: matrix,
      faculties,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      }
    });
  } catch (error: any) {
    console.error('Error in /api/academic-matrix:', error);
    const fallbackMatrix = normalizeFacultyMatrix(defaultGoaMatrix);
    return NextResponse.json({
      success: true,
      data: fallbackMatrix,
      faculties: getFacultiesFromMatrix(fallbackMatrix),
    });
  }
}
