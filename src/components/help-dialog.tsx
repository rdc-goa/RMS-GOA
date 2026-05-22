'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from './ui/button';
import { HelpCircle, Mail } from 'lucide-react';
import { SopDialog } from './sop-dialog'; // Import the SOP Dialog

export function HelpDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Get Help">
          <HelpCircle className="h-[1.2rem] w-[1.2rem]" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center items-center">
            <Mail className="mx-auto h-12 w-12 text-primary" />
          <DialogTitle className="mt-4">Need Assistance?</DialogTitle>
          <DialogDescription>
            For any queries or technical issues, please contact our support team.
          </DialogDescription>
        </DialogHeader>
        <div className="text-center py-4">
            <a
                href="mailto:helpdesk.rdc@paruluniversity.ac.in"
                className="text-lg font-semibold text-primary hover:underline"
            >
                helpdesk.rdc@paruluniversity.ac.in
            </a>
            <div className="mt-4">
              <SopDialog />
              <p className="text-xs text-muted-foreground mt-1">View SOP</p>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
