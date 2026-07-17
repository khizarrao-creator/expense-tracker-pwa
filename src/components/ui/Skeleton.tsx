import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'rect' | 'circle';
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'rect',
  ...props
}) => {
  const baseStyle = 'animate-pulse bg-muted/60 dark:bg-muted/30';
  
  const variants = {
    text: 'h-4 w-3/4 rounded-lg',
    rect: 'h-24 w-full rounded-2xl',
    circle: 'h-12 w-12 rounded-full shrink-0',
  };

  return (
    <div
      className={`${baseStyle} ${variants[variant]} ${className}`}
      {...props}
    />
  );
};

export const CardSkeleton: React.FC = () => {
  return (
    <div className="border border-border bg-card p-6 rounded-3xl space-y-4 w-full shadow-sm">
      <div className="flex items-center gap-3">
        <Skeleton variant="circle" />
        <div className="space-y-1.5 flex-1">
          <Skeleton variant="text" className="w-1/3 h-4" />
          <Skeleton variant="text" className="w-1/2 h-3" />
        </div>
      </div>
      <Skeleton variant="rect" className="h-16" />
    </div>
  );
};

export const StatSkeleton: React.FC = () => {
  return (
    <div className="border border-border bg-card p-6 rounded-3xl space-y-3 w-full shadow-sm">
      <Skeleton variant="text" className="w-1/3 h-3" />
      <Skeleton variant="text" className="w-2/3 h-8" />
    </div>
  );
};

export const ListSkeleton: React.FC<{ rows?: number }> = ({ rows = 3 }) => {
  return (
    <div className="space-y-3 w-full">
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="flex items-center justify-between p-4 border border-border bg-card rounded-2xl">
          <div className="flex items-center gap-3 flex-1">
            <Skeleton variant="circle" className="h-8 w-8" />
            <div className="space-y-1.5 flex-1">
              <Skeleton variant="text" className="w-1/4 h-3.5" />
              <Skeleton variant="text" className="w-1/3 h-2.5" />
            </div>
          </div>
          <Skeleton variant="text" className="w-16 h-4" />
        </div>
      ))}
    </div>
  );
};
