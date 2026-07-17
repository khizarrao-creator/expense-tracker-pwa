import React from 'react';

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: 'default' | 'elevated' | 'outlined' | 'interactive' | 'stat' | 'glass';
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  footer?: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  variant = 'default',
  title,
  subtitle,
  icon,
  badge,
  footer,
  onClick,
  ...props
}) => {
  const isInteractive = variant === 'interactive' || !!onClick;

  const baseStyle = 'rounded-3xl border border-border bg-card text-card-foreground transition-all duration-200';
  
  const variants = {
    default: 'shadow-sm',
    elevated: 'shadow-md border-transparent',
    outlined: 'border border-border shadow-none',
    interactive: 'shadow-sm hover:shadow-md hover:border-primary/40 cursor-pointer active:scale-[0.99]',
    stat: 'p-6 flex flex-col justify-between shadow-sm border border-border/80',
    glass: 'bg-card/70 backdrop-blur-md border border-border/50 shadow-sm',
  };

  const interactiveStyle = isInteractive ? 'cursor-pointer hover:border-primary/40 active:scale-[0.99] hover:shadow-md' : '';

  return (
    <div
      onClick={onClick}
      className={`${baseStyle} ${variants[variant]} ${interactiveStyle} ${className}`}
      {...props}
    >
      {/* Header */}
      {(title || subtitle || icon || badge) && (
        <div className="p-6 pb-4 flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            {title && (
              <h3 className="font-bold text-base text-foreground leading-tight truncate">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-xs text-muted-foreground leading-normal">
                {subtitle}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {badge && <div className="inline-flex shrink-0">{badge}</div>}
            {icon && <div className="p-2 rounded-xl bg-muted text-muted-foreground inline-flex shrink-0">{icon}</div>}
          </div>
        </div>
      )}

      {/* Content */}
      {children && (
        <div className={`px-6 ${title || subtitle || icon || badge ? 'pt-0 pb-6' : 'py-6'}`}>
          {children}
        </div>
      )}

      {/* Footer */}
      {footer && (
        <div className="px-6 py-4 border-t border-border/40 bg-muted/10 rounded-b-3xl">
          {footer}
        </div>
      )}
    </div>
  );
};
