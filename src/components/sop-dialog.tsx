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
import { HelpCircle } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import { SopContent } from './sop-content';

export function SopDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Help and SOP">
          <HelpCircle className="h-[1.2rem] w-[1.2rem]" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Standard Operating Procedures (SOP)</DialogTitle>
          <DialogDescription>
            This document outlines the standard procedures for various roles within the portal.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[70vh] rounded-md border p-4">
            <div 
                className="prose prose-sm dark:prose-invert max-w-none" 
            >
              <SopContent />
            </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
