import { Check, Clock, X } from 'lucide-react';

export interface TimelineStep {
  label: string;
  description?: React.ReactNode;
  status: 'pending' | 'success' | 'error' | 'upcoming';
  timestamp?: string;
}

export interface TimelineProps {
  steps: TimelineStep[];
}

export const Timeline: React.FC<TimelineProps> = ({ steps }) => {
  const getIcon = (status: TimelineStep['status']) => {
    switch (status) {
      case 'success':
        return (
          <div className="h-6 w-6 rounded-full bg-success/20 text-success flex items-center justify-center border border-success/30 shrink-0">
            <Check size={12} className="stroke-[3]" />
          </div>
        );
      case 'error':
        return (
          <div className="h-6 w-6 rounded-full bg-destructive/20 text-destructive flex items-center justify-center border border-destructive/30 shrink-0">
            <X size={12} className="stroke-[3]" />
          </div>
        );
      case 'pending':
        return (
          <div className="h-6 w-6 rounded-full bg-warning/20 text-warning flex items-center justify-center border border-warning/30 shrink-0 animate-pulse">
            <Clock size={12} className="stroke-[3]" />
          </div>
        );
      case 'upcoming':
      default:
        return (
          <div className="h-6 w-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center border border-border shrink-0">
            <div className="h-2 w-2 rounded-full bg-muted-foreground" />
          </div>
        );
    }
  };

  return (
    <div className="relative border-l border-border/80 pl-6 ml-3 py-1 space-y-8 text-left">
      {steps.map((step, idx) => {
        return (
          <div key={idx} className="relative">
            {/* Dot Indicator placed absolute relative to the border-l */}
            <div className="absolute -left-[37px] top-0.5 bg-background p-0.5 rounded-full z-10">
              {getIcon(step.status)}
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h4 className={`text-sm font-bold ${
                  step.status === 'success' ? 'text-foreground' : 
                  step.status === 'error' ? 'text-destructive' : 
                  step.status === 'pending' ? 'text-warning' : 'text-muted-foreground'
                }`}>
                  {step.label}
                </h4>
                {step.timestamp && (
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                    {step.timestamp}
                  </span>
                )}
              </div>
              {step.description && (
                <div className="text-xs text-muted-foreground leading-relaxed">
                  {step.description}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
