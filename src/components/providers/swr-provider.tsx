'use client';

import { SWRConfig } from 'swr';
import React from 'react';

import { auth } from '@/lib/config';

export const SWRProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        dedupingInterval: 60000, // Deduplicate requests within 60 seconds
        fetcher: async (resource, init) => {
          let headers = new Headers(init?.headers);
          if (auth?.currentUser) {
            try {
              const token = await auth.currentUser.getIdToken();
              headers.set('Authorization', `Bearer ${token}`);
            } catch (e) {
              console.warn("Failed to get auth token for SWR fetcher", e);
            }
          }
          return fetch(resource, { ...init, headers }).then(res => res.json());
        }
      }}
    >
      {children}
    </SWRConfig>
  );
};
