import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

export function FirebaseNotConfigured() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-2xl shadow-xl border-destructive">
        <CardHeader>
          <div className="flex items-center gap-4">
            <AlertTriangle className="h-10 w-10 text-destructive flex-shrink-0" />
            <div>
              <CardTitle className="text-2xl text-destructive">Action Required: Configure Firebase</CardTitle>
              <CardDescription>
                Your application is not connected to Firebase. Please add your credentials to the <code>.env</code> file.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            The application cannot start until you provide your Firebase project's configuration keys.
          </p>
          <div className="space-y-2">
            <h3 className="font-semibold">How to Fix:</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>
                In the file explorer on the left, open the file named <code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">.env</code>
              </li>
              <li>
                Follow the instructions in that file to copy and paste the required keys from your Firebase project. You will need:
                <ul className="list-disc list-inside pl-6 mt-1">
                    <li><strong className="text-foreground">Client-side keys</strong> (prefixed with <code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">NEXT_PUBLIC_</code>) found under Project Settings &gt; General &gt; Your apps &gt; Config.</li>
                    <li><strong className="text-foreground">Server-side keys</strong> (like `FIREBASE_PRIVATE_KEY`) from a new service account file, found under Project Settings &gt; Service accounts &gt; Generate new private key.</li>
                </ul>
              </li>
              <li>
                After you save the <code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">.env</code> file, this page should automatically reload.
              </li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
