

'use client';

import { useState } from 'react';
import type { User } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { updateUserTutorialStatus } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import {
  FilePlus2,
  Book,
  ClipboardCheck,
  History,
  FileCheck2,
  LineChart,
  Users,
  CalendarClock,
  ShieldCheck,
  Settings,
  GraduationCap,
  Calendar,
  NotebookPen,
  Award
} from 'lucide-react';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';

interface WelcomeTutorialProps {
  user: User;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const tutorialSteps = {
  faculty: [
    {
      icon: Settings,
      title: 'First Step: Complete Your Profile',
      description: "Welcome! Before you begin, please go to 'Settings' from the sidebar. It's crucial to complete your academic profile and add your bank account details, as this is required for any grant payments.",
    },
    {
      icon: FilePlus2,
      title: 'Submit IMR Projects',
      description: "Click 'New Submission' in the sidebar to start a multi-step form to apply for Intramural Research (IMR) project funding. You can save your progress as a draft anytime.",
    },
    {
      icon: Calendar,
      title: 'Browse EMR Opportunities',
      description: "Navigate to the 'EMR Calendar' to see all available externally funded research calls. Register your interest for any open call before the deadline.",
    },
    {
        icon: Award,
        title: 'Claim Incentives',
        description: "Visit the 'Incentive Claims' module to apply for incentives for your published research papers, patents, books, and more. Track your claim status from the same page.",
    },
    {
      icon: Book,
      title: 'Track All Your Projects',
      description: "The 'My Projects' page lists all IMR and EMR projects you are associated with. Here you can track statuses, see feedback, and manage your applications.",
    },
  ],
  Evaluator: [
    {
      icon: ClipboardCheck,
      title: 'Your IMR Evaluation Queue',
      description: "The 'IMR Evaluation Queue' page shows all Intramural projects currently assigned to you for review. Important: You can only evaluate projects on the day of the scheduled meeting.",
    },
    {
      icon: NotebookPen,
      title: 'EMR Evaluations',
      description: "The 'EMR Evaluations' page is where you will find Extramural project presentations assigned to you for review.",
    },
    {
      icon: History,
      title: 'View Your History',
      description: "The 'My IMR Evaluations' page keeps a record of all the projects you have previously reviewed, allowing you to see your past contributions.",
    },
  ],
  admin: [
     {
      icon: FileCheck2,
      title: 'Oversee All Projects',
      description: "From the 'All Projects' page, you can view, manage, and track every IMR project submission across the university.",
    },
    {
      icon: CalendarClock,
      title: 'Schedule IMR Meetings',
      description: "Use the 'Schedule Meeting' module to assign multiple IMR projects to an evaluation meeting and notify all relevant parties.",
    },
    {
      icon: Calendar,
      title: 'Manage EMR Calendar',
      description: 'You can manage all Extramural Research calls from the EMR Calendar page, including scheduling presentation meetings for interested faculty.',
    },
    {
      icon: LineChart,
      title: 'Analyze Data',
      description: "The 'Analytics' dashboard provides a high-level overview of submission trends, funding, and research activity across faculties.",
    },
     {
      icon: Users,
      title: 'Manage Users',
      description: "The 'Manage Users' page allows you to assign roles and permissions to all users in the system.",
    },
  ],
  CRO: [
    {
      icon: FileCheck2,
      title: 'Oversee Faculty Projects',
      description: "Your 'All Projects' and 'Analytics' pages are automatically filtered to show data from your assigned faculties. Use the dropdown filter on these pages to switch between faculties.",
    },
    {
      icon: ClipboardCheck,
      title: 'Serve as an Evaluator',
      description: "You can be assigned as an evaluator for both IMR and EMR projects. Your assigned tasks will appear in the 'IMR Evaluation Queue' and 'EMR Evaluations' modules.",
    },
    {
      icon: GraduationCap,
      title: 'Get Started',
      description: 'Explore your dashboard to see these features in action. You can always refer to the SOP document for more details.',
    },
  ],
  Principal: [
    {
      icon: FileCheck2,
      title: 'Oversee Institute Projects',
      description: "Your 'All Projects' view is automatically filtered to show every project submitted from your institute, giving you a complete overview.",
    },
    {
      icon: LineChart,
      title: 'Institute Analytics',
      description: "The 'Analytics' dashboard is tailored for your role. Project data is aggregated by Department, allowing you to see which departments are leading in research.",
    },
    {
      icon: GraduationCap,
      title: 'Get Started',
      description: 'Explore your dashboard to see these features in action. You can always refer to the SOP document for more details.',
    },
  ],
  HOD: [
     {
      icon: FileCheck2,
      title: 'Oversee Department Projects',
      description: "Your 'All Projects' view is automatically filtered to show every project submitted from your specific department.",
    },
    {
      icon: LineChart,
      title: 'Department Analytics',
      description: "The 'Analytics' dashboard provides data specifically for your department, allowing you to track submission trends and funding success.",
    },
     {
      icon: GraduationCap,
      title: 'Get Started',
      description: 'Explore your dashboard to see these features in action. You can always refer to the SOP document for more details.',
    },
  ],
  'Super-admin': [
     {
      icon: FileCheck2,
      title: 'Complete Oversight',
      description: "You have access to all projects, users, and data across the entire university. Your dashboards provide a global view of all activities.",
    },
    {
      icon: Calendar,
      title: 'Manage EMR Calls',
      description: "From the 'EMR Calendar' page, you can add new funding calls, manage registrations, and schedule evaluation meetings for all applicants.",
    },
    {
      icon: ShieldCheck,
      title: 'Manage Modules',
      description: "Use 'Module Management' to dynamically grant or revoke access to any feature for any user, allowing for fine-grained permission control.",
    },
     {
      icon: Users,
      title: 'Manage Users & Roles',
      description: "You have the highest level of control in 'Manage Users', including the ability to assign users to the CRO role and manage their faculty assignments.",
    },
  ]
};

export function WelcomeTutorial({ user, isOpen, onOpenChange }: WelcomeTutorialProps) {
  // If isOpen is provided, this is a controlled dialog. Otherwise, it's self-controlled for the first login.
  const [internalOpen, setInternalOpen] = useState(isOpen === undefined ? true : isOpen);
  const { toast } = useToast();

  const open = isOpen === undefined ? internalOpen : isOpen;
  const setOpen = onOpenChange || setInternalOpen;
  
  const handleFinish = async () => {
    setOpen(false);
    // Only mark tutorial as completed if it was the initial auto-popup, not a manually triggered one.
    if (isOpen === undefined) { 
        const result = await updateUserTutorialStatus(user.uid);
        if (!result.success) {
        toast({
            variant: 'destructive',
            title: 'Error',
            description: result.error,
        });
        }
    }
  };

  const getRoleKey = (): keyof typeof tutorialSteps => {
    if (user.role === 'faculty') {
        if (user.designation === 'Principal') return 'Principal';
        if (user.designation === 'HOD') return 'HOD';
        return 'faculty';
    }
    if (user.role === 'admin') return 'admin';
    if (user.role === 'CRO') return 'CRO';
    if (user.role === 'Super-admin') return 'Super-admin';
    if (user.role === 'Evaluator') return 'Evaluator';
    return 'faculty'; // Default fallback
  }

  const steps = tutorialSteps[getRoleKey()];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleFinish() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl text-center">Welcome, {user.name}!</DialogTitle>
          <DialogDescription className="text-center">
            Here’s a quick tour of the features available for your role.
          </DialogDescription>
        </DialogHeader>
        
        <Carousel className="w-full max-w-xs mx-auto">
          <CarouselContent>
            {steps.map((step, index) => (
              <CarouselItem key={index}>
                <div className="p-1">
                  <div className="flex aspect-square items-center justify-center p-6 flex-col text-center">
                    <step.icon className="h-16 w-16 text-primary mb-4" />
                    <h3 className="text-lg font-semibold">{step.title}</h3>
                    <p className="text-sm text-muted-foreground mt-2">{step.description}</p>
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>

        <DialogFooter>
          <Button onClick={handleFinish} className="w-full">Get Started</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
