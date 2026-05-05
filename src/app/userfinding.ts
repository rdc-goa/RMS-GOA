'use server';

import { adminDb } from '@/lib/admin';
import type { User, FoundUser } from '@/types';
import { readStaffDataFromUrl, GOA_STAFF_DATA_URL, formatUserRecord } from '@/lib/staff-data';

async function logActivity(level: 'INFO' | 'WARNING' | 'ERROR', message: string, context: Record<string, any> = {}) {
    try {
        if (!message) {
            console.error("Log message is empty or undefined.");
            return;
        }

        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            ...context,
        };
        await adminDb.collection('logs').add(logEntry);
    } catch (error) {
        console.error("FATAL: Failed to write to logs collection.", error);
        console.error("Original Log Entry:", { level, message, context });
    }
}


export async function findUserByMisId(
    searchTerm: string,
  ): Promise<{ 
      success: boolean; 
      users?: FoundUser[];
      error?: string 
  }> {
    try {
      if (!searchTerm || searchTerm.trim() === "") {
        return { success: false, error: "Search term is required." };
      }
      
      const allFound = new Map<string, FoundUser>();
  
      // 1. Search existing users in Firestore by MIS ID and Name
      const usersRef = adminDb.collection("users");
      const userQuery = usersRef
        .where("misId", "==", searchTerm)
        .limit(10);
      const nameQuery = usersRef
        .where("name", "==", searchTerm)
        .limit(10);

      const [querySnapshot, nameSnapshot] = await Promise.all([
          userQuery.get(),
          nameQuery.get()
      ]);
  
      querySnapshot.forEach(doc => {
        const userData = doc.data() as User;
        const userResult: FoundUser = {
            uid: doc.id,
            name: userData.name || 'Unknown',
            email: userData.email || '',
            misId: userData.misId || String(searchTerm),
            campus: userData.campus || 'Goa',
        };
        if(userResult.email) {
            allFound.set(userResult.email.toLowerCase(), userResult);
        }
      });
      
      nameSnapshot.forEach(doc => {
        const userData = doc.data() as User;
        const userResult: FoundUser = {
            uid: doc.id,
            name: userData.name || 'Unknown',
            email: userData.email || '',
            misId: userData.misId || 'N/A',
            campus: userData.campus || 'Goa',
        };
        if(userResult.email && !allFound.has(userResult.email.toLowerCase())) {
            allFound.set(userResult.email.toLowerCase(), userResult);
        }
      });
  
      // 2. Search staff data files directly by MIS ID
      try {
        const staffData = await readStaffDataFromUrl(GOA_STAFF_DATA_URL);
        
        staffData.forEach((staff) => {
            const staffMisId = staff['MIS ID'] ? String(staff['MIS ID']).toLowerCase() : '';
            const isMatch = (staffMisId === searchTerm.toLowerCase());
            
            if (isMatch && staff.Email && !allFound.has(staff.Email.toLowerCase())) {
                const formatted = formatUserRecord(staff, 'Goa');
                allFound.set(staff.Email.toLowerCase(), {
                    uid: null,
                    name: formatted.name || 'Unknown',
                    email: formatted.email.toLowerCase(),
                    misId: formatted.misId || staffMisId,
                    campus: formatted.campus || 'Goa',
                });
            }
        });
      } catch (staffError) {
        console.error("Error fetching staff data directly:", staffError);
      }

      // 3. If no results yet, search by name directly in Firestore (partial match)
      if (allFound.size === 0) {
        try {
            const lowercasedName = searchTerm.toLowerCase();
            // Note: This matches the previous API route logic for partial name search
            const nameSearchSnapshot = await usersRef.orderBy('name').get();
            
            nameSearchSnapshot.docs.forEach((doc) => {
                const userData = doc.data() as User;
                const userName = userData.name || '';
                if (userName.toLowerCase().includes(lowercasedName)) {
                    if (userData.email && !allFound.has(userData.email.toLowerCase())) {
                        allFound.set(userData.email.toLowerCase(), {
                            uid: doc.id,
                            name: userName,
                            email: userData.email,
                            misId: userData.misId || 'N/A',
                            campus: userData.campus || 'Goa',
                        });
                    }
                }
            });
        } catch (nameError) {
            console.error("Error searching by name directly:", nameError);
        }
      }
  
      const foundUsers = Array.from(allFound.values());
      
      if (foundUsers.length > 0) {
          return { success: true, users: foundUsers };
      }
      
      return { success: false, error: "No user found with this name or MIS ID across any campus." };
  
    } catch (error: any) {
      console.error("Error finding user by MIS ID/Name:", error);
      await logActivity('ERROR', 'Failed to find user by MIS ID/Name', { searchTerm, error: error.message, stack: error.stack });
      return { success: false, error: error.message || "Failed to search for user." };
    }
  }
