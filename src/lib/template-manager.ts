

'use server';

import fs from 'fs';
import path from 'path';

// This function is now deprecated and will be removed in a future update.
// Templates are now fetched from URLs specified in the system settings.
export async function getTemplateContent(url: string): Promise<Buffer | null> {
    try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
            console.error(`Failed to fetch template from ${url}, status: ${response.status}`);
            return null;
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (error) {
        console.error(`Error fetching template from ${url}:`, error);
        return null;
    }
}

// New function to fetch templates from a URL
export async function getTemplateContentFromUrl(url: string): Promise<Buffer | null> {
    try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
            console.error(`Failed to fetch template from ${url}, status: ${response.status}`);
            return null;
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (error) {
        console.error(`Error fetching template from ${url}:`, error);
        return null;
    }
}
