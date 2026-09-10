import React from 'react';
import { RefreshCw, ArrowDown } from 'lucide-react';

interface PullToRefreshProps {
  pullDistance: number;
  isRefreshing: boolean;
  isTriggered: boolean;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  pullDistance,
  isRefreshing,
  isTriggered
}) => {
  if (pullDistance === 0 && !isRefreshing) return null;

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[120] flex justify-center pointer-events-none transition-all duration-150"
      style={{
        transform: `translateY(${Math.min(pullDistance, 80)}px)`,
        opacity: Math.min(pullDistance / 40, 1)
      }}
    >
      <div className="bg-card border border-border shadow-lg rounded-full p-2.5 flex items-center gap-2 text-foreground">
        <div
          className={`p-1.5 rounded-full transition-transform ${
            isRefreshing
              ? 'bg-primary/10 text-primary'
              : isTriggered
              ? 'bg-emerald-500/10 text-emerald-500 rotate-180'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {isRefreshing ? (
            <RefreshCw size={16} className="animate-spin text-primary" />
          ) : (
            <ArrowDown
              size={16}
              className={`transition-transform duration-200 ${
                isTriggered ? 'rotate-180 text-emerald-500' : ''
              }`}
            />
          )}
        </div>
        <span className="text-[11px] font-bold tracking-tight pr-1">
          {isRefreshing
            ? 'Syncing data...'
            : isTriggered
            ? 'Release to refresh'
            : 'Pull to refresh'}
        </span>
      </div>
    </div>
  );
};
