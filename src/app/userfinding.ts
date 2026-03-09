
'use server';

import { adminDb } from '@/lib/admin';
import type { User, FoundUser } from '@/types';

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
            name: userData.name,
            email: userData.email,
            misId: userData.misId!,
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
            name: userData.name,
            email: userData.email,
            misId: userData.misId!,
            campus: userData.campus || 'Goa',
        };
        if(userResult.email && !allFound.has(userResult.email.toLowerCase())) {
            allFound.set(userResult.email.toLowerCase(), userResult);
        }
      });
  
      // 2. Search staff data files via API by MIS ID
      const baseUrl = process.env.BASE_URL || 'http://localhost:9002';
      const staffResponse = await fetch(`${baseUrl}/api/get-staff-data?misId=${encodeURIComponent(searchTerm)}&fetchAll=true`);
      
      if (staffResponse.ok) {
        const staffResult = await staffResponse.json();
        if (staffResult.success && Array.isArray(staffResult.data)) {
          staffResult.data.forEach((staff: any) => {
            if (staff.email && !allFound.has(staff.email.toLowerCase())) {
                allFound.set(staff.email.toLowerCase(), {
                    uid: null, // No UID for staff not yet registered
                    name: staff.name,
                    email: staff.email,
                    misId: staff.misId,
                    campus: staff.campus,
                });
            }
          });
        }
      } else {
        console.warn(`API call to get-staff-data failed with status: ${staffResponse.status}`);
      }

      // 3. If no results yet, search by name in API
      if (allFound.size === 0) {
        const nameSearchResponse = await fetch(`${baseUrl}/api/find-users-by-name?name=${encodeURIComponent(searchTerm)}`);
        if (nameSearchResponse.ok) {
            const nameSearchResult = await nameSearchResponse.json();
            if (nameSearchResult.success && Array.isArray(nameSearchResult.users)) {
                 nameSearchResult.users.forEach((user: any) => {
                    if (user.email && !allFound.has(user.email.toLowerCase())) {
                        allFound.set(user.email.toLowerCase(), user);
                    }
                 });
            }
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
