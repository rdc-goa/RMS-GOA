
import type { Metadata } from 'next';
import { Inter, Source_Code_Pro } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { Toaster } from '@/components/ui/toaster';
import { isFirebaseInitialized } from '@/lib/config';
import { FirebaseNotConfigured } from '@/components/firebase-not-configured';
import { AuthInitializer } from '@/components/AuthInitializer';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/react';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const sourceCodePro = Source_Code_Pro({ subsets: ['latin'], variable: '--font-source-code-pro' });

export const metadata: Metadata = {
  title: 'R&D Portal | Parul University Goa | Goa, India',
  description: 'The official Research & Development (R&D) Portal of Parul University Goa. Streamline Intramural (IMR) and Extramural (EMR) research projects, manage grants, and foster academic innovation.',
  keywords: ['Parul University Goa', 'Research Portal', 'R&D', 'IMR', 'EMR', 'Intramural Research', 'Extramural Research', 'Vadodara', 'Gujarat', 'University Grants'],
  openGraph: {
    title: 'R&D Portal | Parul University Goa',
    description: 'A comprehensive portal to manage the entire research lifecycle at Parul University Goa.',
    url: 'https://rndprojects.paruluniversity.ac.in',
    siteName: 'Parul University Goa Research & Development Portal',
    images: [
      {
        url: 'https://www.paruluniversity.ac.in/images/header-logo.png',
        width: 800,
        height: 600,
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'R&D Portal | Parul University Goa',
    description: 'A comprehensive portal to manage the entire research lifecycle at Parul University Goa.',
    images: ['https://www.paruluniversity.ac.in/images/header-logo.png'],
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "CollegeOrUniversity",
  "name": "Parul University Goa",
  "url": "https://goa.paruluniversity.ac.in/",
  "logo": "https://goa.paruluniversity.ac.in/wp-content/uploads/2024/04/Logo-PNG-1.png",
  "sameAs": [
    "https://www.facebook.com/paruluniversitygoa",
    "https://twitter.com/paruluniversitygoa",
    "https://www.instagram.com/paruluniversitygoa/",
    "https://www.linkedin.com/school/parul-university-goa/"
  ],
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Goa",
    "addressLocality": "Goa",
    "addressRegion": "Goa",
    "postalCode": "403726",
    "addressCountry": "IN"
  },
  "contactPoint": {
    "@type": "ContactPoint",
    "telephone": "+91-2668-260300",
    "contactType": "customer service",
    "email": "rdc@goa.paruluniversity.ac.in"
  }
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // If Firebase isn't configured, show a helpful message instead of crashing.
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
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-QV5WLS9XRG"
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());

gtag('config', 'G-QV5WLS9XRG');`}
        </Script>
      </head>
      <body className={`${inter.variable} ${sourceCodePro.variable} font-sans`} suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <AuthInitializer>
            {children}
          </AuthInitializer>
          <Toaster />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
