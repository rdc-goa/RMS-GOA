
import { doc, getDoc } from 'firebase/firestore';
import { adminDb } from '@/lib/admin';
import type { Metadata } from 'next';
import type { ProjectRecruitment } from '@/types';
import { ApplyForm } from '@/components/recruitment/apply-form';
import { notFound } from 'next/navigation';
import { Logo } from '@/components/logo';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

type Props = {
  params: { id: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const id = params.id;
    try {
        const docRef = doc(adminDb, 'projectRecruitments', id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const job = docSnap.data() as ProjectRecruitment;
            const description = `Apply for the ${job.positionTitle} position on the ${job.projectName} project at Parul University Goa. ${job.jobDescription.substring(0, 100)}...`;
            return {
                title: `${job.positionTitle} | ${job.projectName}`,
                description: description,
                openGraph: {
                    title: `${job.positionTitle} | ${job.projectName}`,
                    description: description,
                },
                twitter: {
                     title: `${job.positionTitle} | ${job.projectName}`,
                    description: description,
                }
            };
        } else {
            return {
                title: 'Job Not Found',
                description: 'This job opening could not be found.',
            };
        }
    } catch (error) {
        console.error("Error generating metadata for job page:", error);
        return {
            title: 'Error',
            description: 'Could not load job details.',
        };
    }
}

async function getJob(id: string): Promise<ProjectRecruitment | null> {
    try {
        const docRef = doc(adminDb, 'projectRecruitments', id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() } as ProjectRecruitment;
        } else {
            return null;
        }
    } catch (error) {
        console.error("Error fetching job data on server:", error);
        return null;
    }
}

export default async function ApplyPage({ params }: Props) {
    const job = await getJob(params.id);

    if (!job) {
        notFound();
    }

    return (
        <div className="flex flex-col min-h-screen bg-background dark:bg-transparent">
            <header className="container mx-auto px-4 lg:px-6 h-20 flex items-center justify-between sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b">
                <Logo />
                 <nav>
                    <Link href="/hiring">
                        <Button variant="ghost">Back to Listings</Button>
                    </Link>
                </nav>
            </header>
            <main className="flex-1 flex items-center justify-center py-12 md:py-16">
                 <div className="w-full max-w-2xl px-4">
                    <ApplyForm job={job} />
                 </div>
            </main>
        </div>
    );
}
