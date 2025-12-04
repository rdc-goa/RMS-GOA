

'use server';

import fs from 'fs';
import path from 'path';

// This function is now deprecated and will be removed in a future update.
// Templates are now fetched from URLs specified in the system settings.
// The implementation has been moved to document-actions.ts to keep it server-only.
export async function getTemplateContent(url: string): Promise<Buffer | null> {
    console.warn("getTemplateContent is deprecated and should not be used.");
    return null;
}

// New function to fetch templates from a URL
// The implementation has been moved to document-actions.ts to keep it server-only.
export async function getTemplateContentFromUrl(url: string): Promise<Buffer | null> {
    console.warn("getTemplateContentFromUrl is deprecated. Use the server-action implementation.");
    return null;
}
