import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/admin';
import type { User } from '@/types';
import { searchStaffByNameAction } from '@/lib/staff-service';
import { checkRateLimit } from '@/lib/rate-limit';
import { unstable_cache } from 'next/cache';

const getCachedUsers = unstable_cache(
    async () => {
        console.log("[Cache Miss] Fetching all users for search index...");
        const usersRef = adminDb.collection('users');
        const querySnapshot = await usersRef.orderBy('name').get();
        return querySnapshot.docs.map(doc => {
            const userData = doc.data() as User;
            return {
                uid: doc.id,
                name: userData.name,
                email: userData.email,
                misId: userData.misId || 'N/A',
                campus: userData.campus || 'Goa'
            };
        });
    },
    ['all-users-search-index'],
    { revalidate: 3600, tags: ['users'] }
);

export async function GET(request: NextRequest) {
    try {
        // --- Security: Authenticate Request ---
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        const token = authHeader.split('Bearer ')[1];
        try {
            await adminAuth.verifyIdToken(token);
        } catch (error) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        // --- Security: Rate Limiting ---
        const ip = request.headers.get('x-forwarded-for') || 'anonymous';
        const rateLimitKey = `rl_find_users_${ip}`;
        const rateLimit = await checkRateLimit(rateLimitKey, { points: 20, duration: 300 });

        if (!rateLimit.success) {
            return NextResponse.json({ 
                success: false, 
                error: 'Too many requests. Please try again later.' 
            }, { status: 429 });
        }

        const { searchParams } = new URL(request.url);
        const name = searchParams.get('name');
        const misId = searchParams.get('misId');

        if ((!name || name.trim().length < 2) && (!misId || misId.trim().length < 2)) {
            return NextResponse.json({ success: true, users: [] });
        }

        const lowercasedName = name?.toLowerCase() || '';
        const lowercasedMisId = misId?.toLowerCase() || '';

        // 1. Search existing users in Firestore (Cached)
        const allUsers = await getCachedUsers();

        let filteredUsers: any[] = allUsers;
        if (lowercasedName) {
            filteredUsers = filteredUsers
                .filter(user => user.name.toLowerCase().includes(lowercasedName))
                .slice(0, 10);
        } else if (lowercasedMisId) {
            filteredUsers = filteredUsers
                .filter(user => user.misId && String(user.misId).toLowerCase().includes(lowercasedMisId))
                .slice(0, 10);
        }

        // 2. If not enough results from Firestore, search cached staff data
        if (filteredUsers.length < 10) {
            try {
                const staffMatches = await searchStaffByNameAction(name || misId || '');
                const existingEmails = new Set(allUsers.map(u => u.email.toLowerCase()));

                const newStaffMatches = staffMatches
                    .filter(staff => staff.email && !existingEmails.has(staff.email.toLowerCase()))
                    .slice(0, 10 - filteredUsers.length)
                    .map(staff => ({
                        uid: '',
                        name: staff.name,
                        email: staff.email,
                        misId: staff.misId || 'N/A',
                        campus: staff.campus
                    }));

                filteredUsers = [...filteredUsers, ...newStaffMatches];
            } catch (error) {
                console.error("Error fetching staff data from service:", error);
            }
        }

        return NextResponse.json({ success: true, users: filteredUsers });

    } catch (error: any) {
        console.error("Error finding users by name:", error);
        return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
