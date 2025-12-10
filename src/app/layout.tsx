
'use client';

import type { Metadata } from 'next';
import { Inter, Source_Code_Pro } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { Toaster } from '@/components/ui/toaster';
import { isFirebaseInitialized, app, auth, db } from '@/lib/config';
import { FirebaseNotConfigured } from '@/components/firebase-not-configured';
import { AuthInitializer } from '@/components/AuthInitializer';
import { Analytics } from '@vercel/analytics/react';
import { FirebaseProvider } from '@/components/providers/FirebaseProvider';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const sourceCodePro = Source_Code_Pro({ subsets: ['latin'], variable: '--font-source-code-pro' });

// Since this is now a client component, we can't export metadata directly.
// This should be moved to a parent layout if needed, but for this app structure it's okay here.
// export const metadata: Metadata = { ... };

const structuredData = {
  "@context": "https://schema.org",
  "@type": "CollegeOrUniversity",
  "name": "Parul University",
  "url": "https://www.paruluniversity.ac.in/",
  "logo": "https://www.paruluniversity.ac.in/images/header-logo.png",
  "sameAs": [
    "https://www.facebook.com/paruluniversity",
    "https://twitter.com/paruluniversity",
    "https://www.instagram.com/paruluniversity/",
    "https://www.linkedin.com/school/parul-university/"
  ],
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "P.O. Limda, Waghodia",
    "addressLocality": "Vadodara",
    "addressRegion": "Gujarat",
    "postalCode": "391760",
    "addressCountry": "IN"
  },
  "contactPoint": {
    "@type": "ContactPoint",
    "telephone": "+91-2668-260300",
    "contactType": "customer service",
    "email": "helpdesk.rdc@paruluniversity.ac.in"
  }
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (!isFirebaseInitialized) {
    return (
      <html lang="en" suppressHydrationWarning>
        <body className={`${inter.variable} ${sourceCodePro.variable} font-sans`} suppressHydrationWarning>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            <FirebaseNotConfigured />
          </ThemeProvider>
        </body>
      </html>
    );
  }

  return (
    <html lang="en" suppressHydrationWarning>
       <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body className={`${inter.variable} ${sourceCodePro.variable} font-sans`} suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <FirebaseProvider firebaseApp={app} auth={auth} firestore={db}>
            <AuthInitializer>
              {children}
            </AuthInitializer>
          </FirebaseProvider>
          <Toaster />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
