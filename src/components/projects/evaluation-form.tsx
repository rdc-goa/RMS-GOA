
'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/config';
import { doc, getDoc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import type { Project, User, Evaluation } from '@/types';
import { notifySuperAdminsOnEvaluation } from '@/app/actions';
import { Loader2, Wand2, ThumbsUp, ThumbsDown, History, AlertCircle } from 'lucide-react';
import { Skeleton } from '../ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

interface EvaluationFormProps {
  project: Project;
  user: User;
  onEvaluationSubmitted: () => void;
  isEvaluationPeriodActive: boolean;
}

const evaluationSchema = z.object({
  recommendation: z.enum(['Recommended', 'Not Recommended', 'Revision Is Needed'], {
    required_error: 'You must select a recommendation.',
  }),
  comments: z.string().min(20, 'Comments must be at least 20 characters.'),
});

type EvaluationFormData = z.infer<typeof evaluationSchema>;

const recommendationOptions = [
  { value: 'Recommended', label: 'Recommended', icon: ThumbsUp },
  { value: 'Not Recommended', label: 'Not Recommended', icon: ThumbsDown },
  { value: 'Revision Is Needed', label: 'Revision Is Needed', icon: History },
] as const;


export function EvaluationForm({ project, user, onEvaluationSubmitted, isEvaluationPeriodActive }: EvaluationFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingEvaluation, setExistingEvaluation] = useState<Evaluation | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);


  const form = useForm<EvaluationFormData>({
    resolver: zodResolver(evaluationSchema),
    defaultValues: {
      recommendation: undefined,
      comments: '',
    },
  });

  useEffect(() => {
    async function fetchExistingEvaluation() {
        setLoadingExisting(true);
        try {
            const evalRef = doc(db, 'projects', project.id, 'evaluations', user.uid);
            const evalSnap = await getDoc(evalRef);
            if (evalSnap.exists()) {
                const data = evalSnap.data() as Evaluation;
                setExistingEvaluation(data);
                form.reset({
                    recommendation: data.recommendation,
                    comments: data.comments,
                });
            }
        } catch (error) {
            console.error("Error fetching existing evaluation:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not load your previous evaluation.' });
        } finally {
            setLoadingExisting(false);
        }
    }
    fetchExistingEvaluation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, user.uid]);

  const handleSubmit = async (values: EvaluationFormData) => {
    setIsSubmitting(true);
    try {
      const evaluationRef = doc(db, 'projects', project.id, 'evaluations', user.uid);
      const projectRef = doc(db, 'projects', project.id);

      const newEvaluation: Evaluation = {
        evaluatorUid: user.uid,
        evaluatorName: user.name,
        evaluationDate: new Date().toISOString(),
        recommendation: values.recommendation,
        comments: values.comments,
      };

      // With the new security rules, we can write directly from the client.
      await setDoc(evaluationRef, newEvaluation, { merge: true });
      await updateDoc(projectRef, {
        evaluatedBy: arrayUnion(user.uid)
      });
      
      await notifySuperAdminsOnEvaluation(project.id, project.title, user.name);

      onEvaluationSubmitted();
      toast({ title: 'Success', description: 'Your evaluation has been submitted.' });
    } catch (error: any) {
      console.error("Error submitting evaluation: ", error);
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to submit evaluation. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const isFormDisabled = isSubmitting || loadingExisting || !!existingEvaluation;

  return (
    <Card className="mt-8 border-primary/50">
      <CardHeader>
        <div className="flex items-center gap-2">
            <Wand2 className="h-6 w-6" />
            <CardTitle>{existingEvaluation ? 'Your Submitted Evaluation' : 'Submit Your Evaluation'}</CardTitle>
        </div>
        <CardDescription>
          {existingEvaluation 
            ? 'You have already submitted your evaluation for this project. It cannot be edited.' 
            : 'Please provide your recommendation and comments for this project.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loadingExisting ? (
             <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
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
                      {recommendationOptions.map((option) => (
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
                  <FormLabel>Overall Comments</FormLabel>
                  <FormControl>
                    <Textarea rows={5} {...field} disabled={isFormDisabled} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {!existingEvaluation && (
              <Button type="submit" disabled={isFormDisabled}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Evaluation
              </Button>
            )}
          </form>
        </Form>
        )}
      </CardContent>
    </Card>
  );
}
