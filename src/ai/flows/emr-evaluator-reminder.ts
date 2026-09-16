import { ai, z } from '../genkit';
import { googleAI } from '@genkit-ai/google-genai';

export const EmrEvaluatorReminderInputSchema = z.object({
  evaluatorName: z.string(),
  evaluatorEmail: z.string(),
  meetings: z.array(z.object({
    interestId: z.string(),
    callTitle: z.string(),
    agency: z.string(),
    applicantName: z.string(),
    applicantEmail: z.string(),
    meetingDate: z.string(),
    meetingTime: z.string(),
    venue: z.string(),
    mode: z.string(),
    pptUrl: z.string().optional(),
    proposalUrl: z.string().optional(),
  })),
});

export const EmrEvaluatorReminderOutputSchema = z.object({
  subject: z.string().describe('Highly professional email subject line indicating an EMR presentation evaluation reminder.'),
  html: z.string().describe('Personalized, visually elegant HTML email content formatted with clean styles matching Parul University RDC branding. Must NOT include outer HTML/body tags or markdown block backticks.'),
});

export const emrEvaluatorReminderFlow = ai.defineFlow({
  name: 'emrEvaluatorReminderFlow',
  inputSchema: EmrEvaluatorReminderInputSchema,
  outputSchema: EmrEvaluatorReminderOutputSchema,
}, async ({ evaluatorName, evaluatorEmail, meetings }) => {
  const prompt = `
    You are an advanced AI assistant for the Research & Development Cell (RDC) at Parul University.
    Your task is to generate a personalized, professional, and highly accurate email reminder for an EMR evaluation meeting.

    We are sending a notification to the evaluator: "${evaluatorName}" (Email: "${evaluatorEmail}").
    They have ${meetings.length} EMR evaluation presentation(s) scheduled in exactly 2 days (48 hours).

    Raw EMR Scheduling Data for this evaluator:
    ${JSON.stringify(meetings, null, 2)}

    Requirements for the generated content:
    1. Subject Line: Must be professional, clear, and include that they have an EMR presentation evaluation in 2 days (e.g. "REMINDER: EMR Presentation Evaluation in 2 Days").
    2. HTML Body:
       - Must use professional styling matching Parul University RDC portal.
       - Use a container <div> instead of full <html> / <body> tags.
       - Font-family must be clean (e.g., Arial, sans-serif) and colors should be professional (dark gray text #333333, clean margins, modern accents).
       - Address the evaluator formally (e.g. "Dear Prof. ${evaluatorName}" or "Dear Dr. ${evaluatorName}").
       - List the scheduled presentations clearly, stating the applicant's name, call title, agency, date, time, mode, and venue/meeting link.
       - If the mode is "Online", present the meeting link clearly as a clickable link.
       - Provide links to the PPT and Proposal if available in the raw data.
       - Remind the evaluator that they can log in to the RDC Portal to submit their evaluations.
       - End with a professional sign-off:
         Best Regards,
         Research & Development Cell Team,
         Parul University
       - Ensure all dates, times, venues, and links are extracted exactly from the raw data. Do not hallucinate or change timezones.
  `;

  const result = await ai.generate({
    model: googleAI.model('gemini-2.5-flash'),
    prompt: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: EmrEvaluatorReminderOutputSchema,
    }
  });

  if (!result.output) {
    throw new Error('Genkit failed to generate output');
  }

  return result.output;
});
