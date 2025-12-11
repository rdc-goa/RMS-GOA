
import Image from 'next/image';

interface LogoProps {
  variant?: 'public' | 'dashboard';
}

export function Logo({ variant = 'public' }: LogoProps) {
  if (variant === 'dashboard') {
    return (
      <div className="flex items-center justify-center p-6" style={{ maxHeight: 40 }}>
        {/* Expanded Light mode logo */}
        <Image
          src="/PU GOA BLACK.svg"
          alt="RDC Logo"
          width={250}
          height={70}
          className="block dark:hidden group-data-[collapsible=icon]:hidden"
          priority
        />
        {/* Expanded Dark mode logo */}
        <Image
          src="/PU GOA White.svg"
          alt="RDC Logo"
          width={250}
          height={70}
          className="hidden dark:block group-data-[collapsible=icon]:hidden"
          priority
        />
        {/* Collapsed Logo Icon */}
        <div className="hidden h-7 w-7 items-center justify-center rounded-sm bg-primary text-primary-foreground group-data-[collapsible=icon]:flex">
          <span className="text-sm font-bold">PU Goa</span>
        </div>
      </div>
    );
  }

  // Default public logo
  return (
    <div className="flex items-center justify-center p-2" style={{ minHeight: 49 }}>
      <Image
        src="/PU GOA BLACK.svg"
        alt="RDC Logo"
        width={350}
        height={100}
        className="block dark:hidden"
        priority
      />
      <Image
        src="/PU GOA White.svg"
        alt="RDC Logo"
        width={350}
        height={100}
        className="hidden dark:block"
        priority
      />
    </div>
  );
}
