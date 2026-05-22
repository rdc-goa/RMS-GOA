'use client';

import useSWR from 'swr';
import { FormattedStaffUser } from '@/lib/staff-service';
import { IncentiveClaim } from '@/types';

/**
 * Hook to fetch staff data with client-side caching and deduplication.
 */
export function useStaffData(params: { email?: string; misId?: string }) {
  const { email, misId } = params;
  const queryString = email ? `email=${email}` : misId ? `misId=${misId}` : '';
  const key = queryString ? `/api/get-staff-data?${queryString}` : null;

  const { data, error, isLoading, mutate } = useSWR<{ success: boolean; data: FormattedStaffUser[] }>(
    key as any,
    null, // Uses global fetcher from SWRConfig
    {
      revalidateOnFocus: false,
      dedupingInterval: 3600000, // 1 hour
    }
  );

  return {
    staff: data?.success ? data.data : [],
    isLoading,
    isError: error,
    mutate
  };
}

/**
 * Hook to fetch departments with aggressive caching.
 */
export function useDepartments(campus?: string) {
  const url = campus ? `/api/get-departments?campus=${campus}` : '/api/get-departments';
  const { data, error, isLoading } = useSWR<{ success: boolean; data: string[] }>(
    url as any,
    null,
    {
      revalidateOnFocus: false,
      dedupingInterval: 3600000, // 1 hour
    }
  );

  return {
    departments: data?.success ? data.data : [],
    isLoading,
    isError: error
  };
}

/**
 * Hook to fetch EMR details/funding calls.
 */
export function useEmrDetails(callId?: string) {
  const url = callId ? `/api/get-emr-details?callId=${callId}` : '/api/get-emr-details';
  const { data, error, isLoading } = useSWR<{ success: boolean; data: { call?: any, calls?: any[] } }>(
    url as any,
    null,
    {
        revalidateOnFocus: false,
        dedupingInterval: 300000, // 5 minutes
    }
  );

  return {
    call: data?.data?.call,
    calls: data?.data?.calls || [],
    isLoading,
    isError: error
  };
}

/**
 * Hook to search users by name or MIS ID.
 */
export function useUserSearch(query: string, type: 'name' | 'misId' = 'name') {
  const url = query.length >= 2 ? `/api/find-users-by-name?${type}=${encodeURIComponent(query)}` : null;
  const { data, error, isLoading } = useSWR<{ success: boolean; users: any[] }>(
    url as any,
    null,
    {
        revalidateOnFocus: false,
        dedupingInterval: 60000, // 1 minute
    }
  );

  return {
    users: data?.success ? data.users : [],
    isLoading,
    isError: error
  };
}

/**
 * Hook to fetch research papers for a user.
 */
export function useResearchPapers(userUid?: string) {
  const url = userUid ? `/api/get-research-papers?userUid=${userUid}` : null;
  const { data, error, isLoading } = useSWR<{ success: boolean; papers: any[] }>(
    url as any,
    null,
    {
        revalidateOnFocus: false,
        dedupingInterval: 600000, // 10 minutes
    }
  );

  return {
    papers: data?.success ? data.papers : [],
    isLoading,
    isError: error
  };
}

/**
 * Hook to fetch incentive claims for a user.
 */
export function useIncentiveClaims(userUid?: string) {
  const url = '/api/incentive-claims/get-all';
  const key = userUid ? `${url}?userUid=${userUid}` : url;
  
  const { data, error, isLoading, mutate } = useSWR<{ success: boolean; claims: IncentiveClaim[] }>(
    key as any,
    null,
    {
        revalidateOnFocus: false,
        dedupingInterval: 300000, // 5 minutes
    }
  );

  return {
    claims: data?.success ? data.claims : [],
    isLoading,
    isError: error,
    mutate
  };
}
