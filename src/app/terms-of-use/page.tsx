import { Logo } from '@/components/logo';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function TermsOfUsePage() {
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
                <h1>Terms of Use</h1>

                <h2>Right of use</h2>
                <p>You have the right to utilise this platform in any manner permissible by the site administrators, and University officials, you may not transfer to another individual any rights or access granted to you upon your registration.</p>

                <h2>External Information</h2>
                <p>The website may contain other information relating to non-Parul University entities or any other companies, please note that for any such information, Parul University does not endorse any such companies or recommend such entities for any purpose to our users accessing such sites shall strictly be at the user’s discretion.</p>

                <h2>Regarding Press Releases and external Publications</h2>
                <p>The website may contain press releases and publications about the University or related to the University from other sources, it shall be noted that upon placing reliance on such information it was believed to be accurate at the time and we disclaim any liability or obligation which may arise out of the untimeliness or any such discrepancies such publications.</p>

                <h2>Disclaimer</h2>
                <p>Any of the users or visitors to this site are advised not to assume or presume the accuracy, up to date , or completeness of the information provided in this site. Users are advised to get confirmation regarding the accuracy or credibility of such information with our concerned officials before placing any reliance or making any commitments.</p>
                <p>In providing this information, the University has taken due care, hence Parul University Goa hereby disclaims any warranty made whatsoever, either in an expressed manner or implied therein, including and not limiting any such warranties as to the title, non-infringement, merchantability, non-interruptions, relating to the usage of this site.</p>
                <p>In furtherance of the same, the University hereby disclaims any warranty that this website will operate without any form of interruptions either technical or otherwise, which may be intended or unintended at any point during the use of this site.</p>
                <p>We create no warranty as to the usefulness, adequacy, reliability, authenticity, of any information or content provided either original or outsourced, written or graphical, in relation to our services, products and operations.</p>
                <p>Parul University Goa and its affiliated parties will not be held liable for any direct, indirect, special or consequential damages which may arise out of any manner of use, or reliance of any information provided on this site. Thus, you are advised to make use of this site at your own risk, with the necessary caution. Such damages may include but not limited to loss of business, loss of profits, arising out of any breach of contract, breach of warranty, tort (including negligence), product liability or otherwise relating to the use of this site.</p>
                <p>This exclusion from liability shall also extend to any claims of copyright infringement on this site or any other claims made in whatsoever manner.</p>
                <p>Any link from other sources including google search engine sources is simply for the convenience of the users and creates no obligation between Parul University Goa and such sites. In regards to any links provided on the site, the University disclaims any liability which may arise out of any inconvenience, or violations caused by any such sites, as they have only been provided for reference and for enhancing the user experience of our visitors.</p>
                <p>We may use your information to respond to your inquiries, provide customer service support, send you important information about the services, and send you marketing communications (with your consent) via different channels, including but not limited to SMS, Email, RCS, WhatsApp, and Voice.</p>
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
