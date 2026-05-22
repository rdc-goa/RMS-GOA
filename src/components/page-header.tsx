
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

interface PageHeaderProps {
  title?: string;
  description?: string;
  showBackButton?: boolean;
  backButtonHref?: string;
  backButtonText?: string;
  onBackClick?: () => void;
  children?: React.ReactNode;
}

export function PageHeader({ 
  title, 
  description, 
  showBackButton = true, 
  backButtonHref = '/dashboard',
  backButtonText = 'Back to Dashboard',
  onBackClick,
  children 
}: PageHeaderProps) {
  const BackButton = () => (
    <Button variant="ghost" onClick={onBackClick}>
      <ArrowLeft className="mr-2 h-4 w-4" />
      {backButtonText}
    </Button>
  );

  return (
    <div className="space-y-4">
      {showBackButton && (
        onBackClick ? <BackButton /> : (
          <Link href={backButtonHref}>
            <Button variant="ghost">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {backButtonText}
            </Button>
          </Link>
        )
      )}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          {description && <p className="text-muted-foreground">{description}</p>}
        </div>
        {children && <div className="flex items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}
