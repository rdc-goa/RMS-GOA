import { Logo } from '@/components/logo';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function PrivacyPolicyPage() {
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
      <main className="flex-1 py-12 md:py-16 lg:py-20">
        <div className="container mx-auto px-4 md:px-6 max-w-4xl">
            <div className="prose prose-lg dark:prose-invert max-w-none">
                <h1>Privacy Policy</h1>
                <p><strong>Last updated:</strong> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                
                <p>This Privacy Policy describes Our policies and procedures on the collection, use and disclosure of Your information when You use the Service and tells You about Your privacy rights and how the law protects You.</p>
                
                <h2>Interpretation and Definitions</h2>
                <h3>Interpretation</h3>
                <p>The words of which the initial letter is capitalized have meanings defined under the following conditions. The following definitions shall have the same meaning regardless of whether they appear in singular or in plural.</p>
                
                <h3>Definitions</h3>
                <p>For the purposes of this Privacy Policy:</p>
                <ul>
                    <li><strong>Account</strong> means a unique account created for You to access our Service or parts of our Service.</li>
                    <li><strong>University</strong> (referred to as either "the University", "We", "Us" or "Our" in this Agreement) refers to Parul University Goa.</li>
                    <li><strong>Service</strong> refers to the Research & Development Portal website.</li>
                    <li><strong>Personal Data</strong> is any information that relates to an identified or identifiable individual.</li>
                    <li><strong>You</strong> means the individual accessing or using the Service, or the company, or other legal entity on behalf of which such individual is accessing or using the Service, as applicable.</li>
                </ul>

                <h2>Collecting and Using Your Personal Data</h2>
                <h3>Types of Data Collected</h3>
                <h4>Personal Data</h4>
                <p>While using Our Service, We may ask You to provide Us with certain personally identifiable information that can be used to contact or identify You. Personally identifiable information may include, but is not limited to:</p>
                <ul>
                    <li>Email address</li>
                    <li>First name and last name</li>
                    <li>Phone number</li>
                    <li>Academic information (Faculty, Institute, Department, Designation, MIS ID)</li>
                    <li>Researcher IDs (ORCID, Scopus, etc.)</li>
                    <li>Bank account details for grant disbursement and incentive claims</li>
                </ul>

                <h4>Usage Data</h4>
                <p>Usage Data is collected automatically when using the Service. This may include information such as Your device's Internet Protocol address (e.g. IP address), browser type, browser version, the pages of our Service that You visit, the time and date of Your visit, the time spent on those pages, unique device identifiers and other diagnostic data.</p>

                <h3>Use of Your Personal Data</h3>
                <p>The University may use Personal Data for the following purposes:</p>
                <ul>
                    <li><strong>To provide and maintain our Service</strong>, including to monitor the usage of our Service.</li>
                    <li><strong>To manage Your Account:</strong> to manage Your registration as a user of the Service. The Personal Data You provide can give You access to different functionalities of the Service that are available to You as a registered user.</li>
                    <li><strong>For the performance of a contract:</strong> the development, compliance and undertaking of the research grant or incentive claim process.</li>
                    <li><strong>To contact You:</strong> To contact You by email, telephone calls, SMS, or other equivalent forms of electronic communication, such as a mobile application's push notifications regarding updates or informative communications related to the functionalities, products or contracted services, including the security updates, when necessary or reasonable for their implementation.</li>
                    <li><strong>To manage Your requests:</strong> To attend and manage Your requests to Us.</li>
                </ul>

                <h2>Security of Your Personal Data</h2>
                <p>The security of Your Personal Data is important to Us, but remember that no method of transmission over the Internet, or method of electronic storage is 100% secure. While We strive to use commercially acceptable means to protect Your Personal Data, We cannot guarantee its absolute security. All data is stored within Google's Firebase platform, which provides robust security measures for data in transit and at rest.</p>
                
                <h2>Changes to this Privacy Policy</h2>
                <p>We may update Our Privacy Policy from time to time. We will notify You of any changes by posting the new Privacy Policy on this page.</p>
                <p>You are advised to review this Privacy Policy periodically for any changes. Changes to this Privacy Policy are effective when they are posted on this page.</p>
                
                <h2>Contact Us</h2>
                <p>If you have any questions about this Privacy Policy, You can contact us at: <a href="mailto:helpdesk.rdc@paruluniversity.ac.in">helpdesk.rdc@paruluniversity.ac.in</a></p>
            </div>
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
