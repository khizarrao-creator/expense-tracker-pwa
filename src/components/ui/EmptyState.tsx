import React from 'react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center max-w-sm mx-auto my-6 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="p-4 bg-muted/50 text-muted-foreground rounded-3xl border border-border/40 shrink-0">
        {icon}
      </div>
      <div className="space-y-1.5">
        <h3 className="text-base font-bold text-foreground">
          {title}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>
      {actionLabel && onAction && (
        <Button
          variant="outline"
          size="sm"
          onClick={onAction}
          className="active:scale-[0.97]"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
