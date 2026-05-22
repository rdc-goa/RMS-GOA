'use client';

import { AdminDashboard } from './admin-dashboard';
import { FacultyDashboard } from './faculty-dashboard';
import type { User } from '@/types';

interface DashboardClientProps {
  user: User;
}

export function DashboardClient({ user }: DashboardClientProps) {
  return (
    <div className="transition-all duration-300">
      {user.role === 'admin' && <AdminDashboard user={user} />}
      {user.role === 'faculty' && <FacultyDashboard user={user} />}
    </div>
  );
}
