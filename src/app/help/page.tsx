import { Logo } from '@/components/logo';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail } from 'lucide-react';

export default function HelpPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background dark:bg-transparent">
      <header className="container mx-auto px-4 lg:px-6 h-20 flex items-center justify-between sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b">
        <Logo />
        <nav>
          <Link href="/">
            <Button variant="ghost">Back to Home</Button>
          </Link>
        </nav>
      </header>
      <main className="flex-1 flex items-center justify-center py-12 md:py-16 lg:py-20">
        <div className="container mx-auto px-4 md:px-6 max-w-2xl">
          <Card>
            <CardHeader className="text-center">
              <Mail className="mx-auto h-12 w-12 text-primary" />
              <CardTitle className="mt-4 text-2xl">Need Assistance?</CardTitle>
              <CardDescription>
                We're here to help.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-muted-foreground">
                For any queries, technical issues, or assistance with the Research Project Portal, please do not hesitate to reach out to our dedicated support team.
              </p>
              <a
                href="mailto:rdc@goa.paruluniversity.ac.in"
                className="mt-4 inline-block text-lg font-semibold text-primary hover:underline"
              >
                rdc@goa.paruluniversity.ac.in
              </a>
            </CardContent>
          </Card>
        </div>
      </main>
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} Parul University Goa. All rights reserved.</p>
        <nav className="sm:ml-auto flex gap-4 sm:gap-6">
          <Link className="text-xs hover:underline underline-offset-4" href="/help">
            Help
          </Link>
          <Link className="text-xs hover:underline underline-offset-4" href="/terms-of-use">
            Terms of Service
          </Link>
          <Link className="text-xs hover:underline underline-offset-4" href="/privacy-policy">
            Privacy
          </Link>
        </nav>
      </footer>
    </div>
  );
}
