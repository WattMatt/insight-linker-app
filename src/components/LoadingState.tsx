import { Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface LoadingStateProps {
  variant?: 'spinner' | 'skeleton' | 'full-page';
  message?: string;
  skeletonCount?: number;
  className?: string;
}

export function LoadingState({ 
  variant = 'spinner', 
  message, 
  skeletonCount = 3,
  className 
}: LoadingStateProps) {
  if (variant === 'full-page') {
    return (
      <div className={cn('min-h-screen flex items-center justify-center', className)}>
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          {message && (
            <p className="text-sm text-muted-foreground">{message}</p>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'skeleton') {
    return (
      <div className={cn('space-y-4', className)}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  // Default spinner variant
  return (
    <div className={cn('flex items-center justify-center p-8', className)}>
      <div className="text-center space-y-2">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
        {message && (
          <p className="text-sm text-muted-foreground">{message}</p>
        )}
      </div>
    </div>
  );
}
