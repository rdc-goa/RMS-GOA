import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseDeadlineDate(dateStr?: string): Date {
  if (!dateStr) return new Date(0);

  const trimmed = dateStr.trim();

  // Format DD/MM/YYYY or DD-MM-YYYY
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    if (parts.length === 3) {
      const d = Number(parts[0]);
      const m = Number(parts[1]) - 1;
      const y = Number(parts[2]);
      return new Date(y, m, d, 23, 59, 59, 999);
    }
  }

  // Format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parts = trimmed.split('-');
    const y = Number(parts[0]);
    const m = Number(parts[1]) - 1;
    const d = Number(parts[2]);
    return new Date(y, m, d, 23, 59, 59, 999);
  }

  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) return new Date(0);

  const isUtc = trimmed.includes('Z') || trimmed.includes('T');
  const year = isUtc ? parsed.getUTCFullYear() : parsed.getFullYear();
  const month = isUtc ? parsed.getUTCMonth() : parsed.getMonth();
  const date = isUtc ? parsed.getUTCDate() : parsed.getDate();

  return new Date(year, month, date, 23, 59, 59, 999);
}

export function isCfpDeadlinePast(applyDeadline?: string, status?: string): boolean {
  if (status === 'Closed') return true;
  if (!applyDeadline) return false;
  const deadlineDate = parseDeadlineDate(applyDeadline);
  return new Date() > deadlineDate;
}

