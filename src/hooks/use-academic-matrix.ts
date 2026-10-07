'use client';

import useSWR from 'swr';
import { FacultyMatrixItem } from '@/types';
import {
  defaultGoaMatrix,
  normalizeFacultyMatrix,
  getFacultiesFromMatrix,
  getInstitutesForFacultyFromMatrix,
  getDepartmentsForInstituteFromMatrix,
  getPrincipalEmailForInstitute,
  InstituteOption
} from '@/lib/academic-data';

interface AcademicMatrixResponse {
  success: boolean;
  data: FacultyMatrixItem[];
  faculties: string[];
}

/**
 * Centrally manages and caches the Academic Hierarchy Matrix configured by Super Admin.
 * Used for cascading dropdowns (Faculty -> Institute -> Department), CRO faculty assignment,
 * authority scope determination, and incentive calculations.
 */
export function useAcademicMatrix() {
  const { data, error, isLoading, mutate } = useSWR<AcademicMatrixResponse>(
    '/api/academic-matrix',
    null, // Uses global SWR fetcher
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000, // 1 minute client cache
      fallbackData: {
        success: true,
        data: normalizeFacultyMatrix(defaultGoaMatrix),
        faculties: getFacultiesFromMatrix(defaultGoaMatrix),
      }
    }
  );

  const matrix: FacultyMatrixItem[] = (data?.success && data.data && data.data.length > 0)
    ? data.data
    : normalizeFacultyMatrix(defaultGoaMatrix);

  const faculties: string[] = (data?.success && data.faculties && data.faculties.length > 0)
    ? data.faculties
    : getFacultiesFromMatrix(matrix);

  const getInstitutes = (facultyName: string): InstituteOption[] => {
    return getInstitutesForFacultyFromMatrix(facultyName, matrix);
  };

  const getDepartments = (instituteName: string): string[] => {
    return getDepartmentsForInstituteFromMatrix(instituteName, matrix);
  };

  const getPrincipalEmail = (instituteName: string): string | null => {
    return getPrincipalEmailForInstitute(instituteName, matrix);
  };

  return {
    matrix,
    faculties,
    getInstitutes,
    getDepartments,
    getPrincipalEmail,
    isLoading,
    isError: error,
    mutate
  };
}
