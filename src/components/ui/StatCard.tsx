import React from 'react';
import { Card } from './Card';
import { TrendingUp, TrendingDown } from 'lucide-react';

export interface StatCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: {
    value: number | string;
    type: 'up' | 'down';
    label?: string;
  };
  className?: string;
  variant?: 'default' | 'elevated' | 'outlined' | 'interactive' | 'stat' | 'glass';
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  trend,
  className = '',
  variant = 'stat',
}) => {
  return (
    <Card variant={variant} className={`${className} p-5 md:p-6 text-left`}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs md:text-sm font-semibold text-muted-foreground uppercase tracking-wider truncate">
            {title}
          </span>
          {icon && (
            <div className="p-2 rounded-xl bg-muted text-muted-foreground shrink-0 flex items-center justify-center">
              {icon}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-2xl md:text-3xl font-black text-foreground tracking-tight">
            {value}
          </p>
          
          {trend && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${
                trend.type === 'up' ? 'text-success' : 'text-destructive'
              }`}>
                {trend.type === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {trend.value}
              </span>
              {trend.label && (
                <span className="text-[10px] text-muted-foreground font-semibold">
                  {trend.label}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};
