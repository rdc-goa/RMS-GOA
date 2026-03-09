// src/components/emr/emr-evaluation-form.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useToast } from '@/hooks/use-toast';
import type { User, EmrInterest, EmrEvaluation } from '@/types';
import { addEmrEvaluation } from '@/app/emr-actions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, ThumbsUp, ThumbsDown, History } from 'lucide-react';
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/config';

interface EmrEvaluationFormProps {
  interest: EmrInterest;
  user: User;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onEvaluationSubmitted: () => void;
}

export const EMR_EVALUATION_RECOMMENDATIONS = [
  { value: 'Recommended', label: 'Recommended', icon: ThumbsUp },
  { value: 'Not Recommended', label: 'Not Recommended', icon: ThumbsDown },
  { value: 'Revision is needed', label: 'Revision Is Needed', icon: History },
] as const;

const evaluationSchema = z.object({
  recommendation: z.enum(['Recommended', 'Not Recommended', 'Revision is needed'], {
    required_error: 'You must select a recommendation.',
  }),
  comments: z.string().min(10, 'Comments must be at least 10 characters long.'),
});

type EvaluationFormData = z.infer<typeof evaluationSchema>;

export function EmrEvaluationForm({ interest, user, isOpen, onOpenChange, onEvaluationSubmitted }: EmrEvaluationFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingEvaluation, setExistingEvaluation] = useState<EmrEvaluation | null>(null);
  const [loading, setLoading] = useState(true);

  const form = useForm<EvaluationFormData>({
    resolver: zodResolver(evaluationSchema),
  });

  useEffect(() => {
    const fetchExistingEvaluation = async () => {
      if (!isOpen) return;
      setLoading(true);
      try {
        const evalRef = doc(db, 'emrInterests', interest.id, 'evaluations', user.uid);
        const evalSnap = await getDoc(evalRef);
        if (evalSnap.exists()) {
          const data = evalSnap.data() as EmrEvaluation;
          setExistingEvaluation(data);
          form.reset({
            recommendation: data.recommendation,
            comments: data.comments,
          });
        } else {
            setExistingEvaluation(null);
            form.reset({ recommendation: undefined, comments: '' });
        }
      } catch (error) {
        console.error("Error fetching existing EMR evaluation:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not load your previous evaluation.' });
      } finally {
        setLoading(false);
      }
    };
    fetchExistingEvaluation();
  }, [interest.id, user.uid, isOpen, form, toast]);


  const handleSubmit = async (values: EvaluationFormData) => {
    setIsSubmitting(true);
    try {
      const result = await addEmrEvaluation(interest.id, user, values);
      if (result.success) {
        toast({ title: 'Success', description: 'Your evaluation has been submitted.' });
        onEvaluationSubmitted();
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.error });
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'An unexpected error occurred.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormDisabled = isSubmitting || loading || !!existingEvaluation;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>EMR Evaluation for {interest.userName}</DialogTitle>
          <DialogDescription>
             {existingEvaluation
              ? 'You have already submitted your evaluation for this project. It cannot be edited.'
              : 'Review the presentation and provide your recommendation.'}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
             <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        ) : (
        <Form {...form}>
          <form id="emr-evaluation-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6 py-4">
            <FormField
              control={form.control}
              name="recommendation"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Your Recommendation</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      className="grid grid-cols-1 md:grid-cols-3 gap-4"
                      disabled={isFormDisabled}
                    >
                      {EMR_EVALUATION_RECOMMENDATIONS.map((option) => (
                        <FormItem key={option.value}>
                          <FormControl>
                            <RadioGroupItem value={option.value} className="sr-only" />
                          </FormControl>
                           <FormLabel className={`flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground ${isFormDisabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'} ${field.value === option.value ? 'border-primary' : ''}`}>
                            <option.icon className="mb-3 h-6 w-6" />
                            {option.label}
                          </FormLabel>
                        </FormItem>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="comments"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Comments</FormLabel>
                  <FormControl>
                    <Textarea rows={5} {...field} disabled={isFormDisabled} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {!existingEvaluation && (
            <Button type="submit" form="emr-evaluation-form" disabled={isFormDisabled}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Evaluation
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
