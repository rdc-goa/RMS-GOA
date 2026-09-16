import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Logo } from '@/components/logo';

export default function Loading() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 overflow-x-hidden font-sans">
      {/* HEADER NAVBAR SKELETON */}
      <header className="fixed top-0 left-0 right-0 w-full z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-900">
        <div className="container mx-auto px-4 lg:px-8 h-24 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Logo />
          </div>
          <nav className="flex items-center gap-4 sm:gap-6">
            <div className="hidden md:flex items-center gap-6">
              <Skeleton className="h-4 w-12 bg-slate-900" />
              <Skeleton className="h-4 w-28 bg-slate-900" />
              <Skeleton className="h-4 w-16 bg-slate-900" />
              <Skeleton className="h-4 w-16 bg-slate-900" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-20 bg-slate-900" />
              <Skeleton className="h-9 w-24 bg-slate-900" />
            </div>
          </nav>
        </div>
      </header>

      <main className="flex-1 pt-24">
        {/* HERO SECTION SKELETON */}
        <section className="relative w-full py-28 md:py-40 overflow-hidden bg-slate-950">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-60"></div>
          <div className="container mx-auto px-4 lg:px-8 relative z-10">
            <div className="max-w-4xl mx-auto text-center flex flex-col items-center justify-center space-y-8">
              <div className="space-y-6 flex flex-col items-center">
                <Skeleton className="h-8 w-36 bg-slate-900 rounded-full" />
                <div className="space-y-4 flex flex-col items-center">
                  <Skeleton className="h-14 w-80 sm:w-[500px] bg-slate-900" />
                  <Skeleton className="h-1 w-24 bg-slate-900 rounded-full" />
                </div>
                <div className="space-y-2 flex flex-col items-center">
                  <Skeleton className="h-4 w-[280px] sm:w-[600px] bg-slate-900" />
                  <Skeleton className="h-4 w-[240px] sm:w-[480px] bg-slate-900" />
                </div>
              </div>
              <Skeleton className="h-12 w-48 bg-slate-900 rounded-xl" />
            </div>
          </div>
        </section>

        {/* SPECIAL CALLS SKELETON */}
        <section className="w-full py-20 bg-slate-900/30 border-t border-slate-900 relative">
          <div className="container mx-auto px-4 lg:px-8 space-y-12 relative z-10">
            <div className="text-center space-y-4 max-w-[800px] mx-auto flex flex-col items-center">
              <Skeleton className="h-6 w-60 bg-slate-900 rounded-full" />
              <Skeleton className="h-10 w-80 bg-slate-900" />
              <Skeleton className="h-4 w-96 bg-slate-900" />
            </div>
            <div className="grid gap-8 max-w-5xl mx-auto">
              <div className="border border-slate-900 bg-slate-950/45 rounded-3xl p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-8 shadow-2xl animate-pulse">
                <div className="space-y-4 flex-1 text-left">
                  <div className="flex flex-wrap items-center gap-3">
                    <Skeleton className="h-5 w-24 bg-slate-900" />
                    <Skeleton className="h-5 w-32 bg-slate-900" />
                  </div>
                  <Skeleton className="h-8 w-3/4 bg-slate-900" />
                  <Skeleton className="h-4 w-full bg-slate-900" />
                </div>
                <Skeleton className="h-12 w-36 bg-slate-900 rounded-xl shrink-0" />
              </div>
            </div>
          </div>
        </section>

        {/* ABOUT SECTION SKELETON */}
        <section className="w-full py-20 bg-slate-950 border-t border-slate-900">
          <div className="container mx-auto px-4 lg:px-8 space-y-16">
            <div className="grid gap-12 lg:grid-cols-2 items-center">
              <div className="space-y-6">
                <Skeleton className="h-6 w-36 bg-slate-900" />
                <Skeleton className="h-10 w-80 bg-slate-900" />
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full bg-slate-900" />
                  <Skeleton className="h-4 w-full bg-slate-900" />
                  <Skeleton className="h-4 w-3/4 bg-slate-900" />
                </div>
              </div>
              <div className="bg-slate-900/50 rounded-3xl p-8 border border-slate-800 space-y-6 animate-pulse">
                <Skeleton className="h-6 w-40 bg-slate-850" />
                <div className="space-y-4">
                  <div className="flex gap-3"><Skeleton className="h-5 w-5 bg-slate-850 shrink-0" /><Skeleton className="h-4 w-5/6 bg-slate-850" /></div>
                  <div className="flex gap-3"><Skeleton className="h-5 w-5 bg-slate-850 shrink-0" /><Skeleton className="h-4 w-5/6 bg-slate-850" /></div>
                  <div className="flex gap-3"><Skeleton className="h-5 w-5 bg-slate-850 shrink-0" /><Skeleton className="h-4 w-5/6 bg-slate-850" /></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FUNDING OPPORTUNITIES SKELETON */}
        <section className="w-full py-20 bg-slate-900/40 border-t border-slate-900">
          <div className="container mx-auto px-4 lg:px-8 space-y-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="space-y-4 flex-1">
                <Skeleton className="h-6 w-36 bg-slate-900" />
                <Skeleton className="h-10 w-[300px] sm:w-[400px] bg-slate-900" />
                <Skeleton className="h-4 w-full sm:w-[600px] bg-slate-900" />
              </div>
              <Skeleton className="h-10 w-64 bg-slate-900 rounded-xl shrink-0" />
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, index) => (
                <Card key={index} className="bg-slate-950 border-slate-900 flex flex-col justify-between w-full overflow-hidden min-h-[300px] animate-pulse">
                  <CardContent className="p-6 space-y-6 flex-1 flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="flex justify-between items-center gap-2">
                        <Skeleton className="h-4 w-1/3 bg-slate-900" />
                        <Skeleton className="h-4 w-16 bg-slate-900" />
                      </div>
                      <Skeleton className="h-6 w-full bg-slate-900" />
                      <Skeleton className="h-4 w-3/4 bg-slate-900" />
                      <div className="space-y-2 border-t border-slate-900 pt-4">
                        <div className="flex justify-between">
                          <Skeleton className="h-3 w-1/3 bg-slate-900" />
                          <Skeleton className="h-3 w-1/4 bg-slate-900" />
                        </div>
                        <div className="flex justify-between">
                          <Skeleton className="h-3 w-1/3 bg-slate-900" />
                          <Skeleton className="h-3 w-1/4 bg-slate-900" />
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-4">
                      <Skeleton className="h-9 w-full bg-slate-900" />
                      <Skeleton className="h-9 w-full bg-slate-900" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* RESEARCH EXCELLENCE STATS SKELETON */}
        <section className="w-full py-20 bg-slate-950 border-t border-slate-900">
          <div className="container mx-auto px-4 lg:px-8 space-y-16">
            <div className="text-center space-y-4 max-w-[800px] mx-auto flex flex-col items-center">
              <Skeleton className="h-6 w-36 bg-slate-900" />
              <Skeleton className="h-10 w-[300px] sm:w-[450px] bg-slate-900" />
              <Skeleton className="h-4 w-80 sm:w-96 bg-slate-900" />
            </div>

            <div className="grid gap-6 grid-cols-2 md:grid-cols-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="border border-slate-900 bg-slate-950 p-6 rounded-2xl space-y-4 animate-pulse min-h-[140px] flex flex-col justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-20 bg-slate-900" />
                    <Skeleton className="h-8 w-24 bg-slate-900" />
                  </div>
                  <Skeleton className="h-3.5 w-28 bg-slate-900" />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ADVANCED RESEARCH FACILITIES SKELETON */}
        <section className="w-full py-20 px-4 sm:px-6 lg:px-8 border-t border-slate-900 bg-slate-950">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12 md:mb-16 flex flex-col items-center">
              <Skeleton className="h-6 w-36 bg-slate-900 rounded-full mb-4" />
              <Skeleton className="h-10 w-96 bg-slate-900" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
              {[...Array(4)].map((_, index) => (
                <div key={index} className="relative h-[320px] sm:h-[360px] lg:h-[400px] rounded-2xl overflow-hidden border border-slate-900 bg-slate-950 p-6 flex flex-col justify-end animate-pulse">
                  <div className="space-y-3">
                    <Skeleton className="h-6 w-3/4 bg-slate-900" />
                    <Skeleton className="h-4 w-full bg-slate-900" />
                    <Skeleton className="h-4 w-5/6 bg-slate-900" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
