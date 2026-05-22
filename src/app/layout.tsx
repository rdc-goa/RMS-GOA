
import type { Metadata } from 'next';
import { Inter, Source_Code_Pro } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { Toaster } from '@/components/ui/toaster';
import { ErrorInterceptor } from '@/components/error-interceptor';
import { isFirebaseInitialized } from '@/lib/config';
import { FirebaseNotConfigured } from '@/components/firebase-not-configured';
import { AuthInitializer } from '@/components/AuthInitializer';
import { AuthProvider } from '@/components/contexts/AuthContext';
import Script from 'next/script';
import { SWRProvider } from '@/components/providers/swr-provider';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const sourceCodePro = Source_Code_Pro({ subsets: ['latin'], variable: '--font-source-code-pro' });

export const metadata: Metadata = {
  title: 'R&D Portal | Parul University Goa',
  description: 'The official Research & Development (R&D) Portal of Parul University Goa. Streamline Intramural (IMR) and Extramural (EMR) research projects, manage grants, and foster academic innovation.',
  keywords: ['Parul University Goa', 'Research Portal', 'R&D', 'IMR', 'EMR', 'Intramural Research', 'Extramural Research', 'Goa', 'University Grants'],
  openGraph: {
    title: 'R&D Portal | Parul University Goa',
    description: 'A comprehensive portal to manage the entire research lifecycle at Parul University Goa.',
    url: 'https://rndprojects.goa.paruluniversity.ac.in',
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
    "streetAddress": "Near ONGC, Betul, Quitol, Taluka - Quepem",
    "addressLocality": "South Goa",
    "addressRegion": "Goa",
    "postalCode": "403723",
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
  const activeFirebaseProject = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'undefined';

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
          <SWRProvider>
            <AuthProvider>
              <AuthInitializer>
                <ErrorInterceptor />
                {children}
              </AuthInitializer>
            </AuthProvider>
          </SWRProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
