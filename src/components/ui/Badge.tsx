import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline' | 'plan-pro' | 'plan-max';
  size?: 'sm' | 'md';
  dot?: boolean;
  pulse?: boolean;
  icon?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  className = '',
  variant = 'default',
  size = 'md',
  dot = false,
  pulse = false,
  icon,
  ...props
}) => {
  const baseStyle = 'inline-flex items-center gap-1.5 font-bold uppercase tracking-wider select-none shrink-0';

  const variants = {
    default: 'bg-muted text-muted-foreground border border-transparent',
    success: 'bg-success/10 text-success border border-success/15',
    warning: 'bg-warning/10 text-warning border border-warning/15',
    danger: 'bg-destructive/10 text-destructive border border-destructive/15',
    info: 'bg-accent/15 text-primary dark:text-foreground border border-accent/20',
    outline: 'bg-transparent text-muted-foreground border border-border',
    'plan-pro': 'bg-brand/10 text-brand border border-brand/20 shadow-[0_0_8px_rgba(45,212,191,0.05)]',
    'plan-max': 'bg-warning/10 text-warning border border-warning/20 shadow-[0_0_8px_rgba(245,158,11,0.05)]',
  };

  const sizes = {
    sm: 'text-[9px] px-2 py-0.5 rounded-md',
    md: 'text-[10px] px-2.5 py-1 rounded-lg',
  };

  const dotColors = {
    default: 'bg-muted-foreground',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-destructive',
    info: 'bg-primary dark:bg-foreground',
    outline: 'bg-muted-foreground',
    'plan-pro': 'bg-brand',
    'plan-max': 'bg-warning',
  };

  return (
    <span
      className={`${baseStyle} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {/* Pulse Dot */}
      {dot && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          {pulse && (
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotColors[variant]}`} />
          )}
          <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${dotColors[variant]}`} />
        </span>
      )}

      {/* Lucide Icon */}
      {icon && <span className="inline-flex shrink-0">{icon}</span>}

      {children}
    </span>
  );
};
