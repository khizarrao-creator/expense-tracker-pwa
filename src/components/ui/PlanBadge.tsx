import React from 'react';
import { Shield, Zap, Crown } from 'lucide-react';
import { Badge } from './Badge';

export interface PlanBadgeProps {
  plan?: 'standard' | 'pro' | 'max';
  size?: 'sm' | 'md';
  pulse?: boolean;
}

export const PlanBadge: React.FC<PlanBadgeProps> = ({
  plan = 'standard',
  size = 'md',
  pulse = false,
}) => {
  const plans = {
    standard: {
      name: 'Standard',
      variant: 'default' as const,
      icon: <Shield size={size === 'sm' ? 10 : 12} />,
    },
    pro: {
      name: 'Pro',
      variant: 'plan-pro' as const,
      icon: <Zap size={size === 'sm' ? 10 : 12} className="fill-brand/20" />,
    },
    max: {
      name: 'Max',
      variant: 'plan-max' as const,
      icon: <Crown size={size === 'sm' ? 10 : 12} className="fill-warning/20" />,
    },
  };

  const currentPlan = plans[plan] || plans.standard;

  return (
    <Badge
      variant={currentPlan.variant}
      size={size}
      dot={pulse}
      pulse={pulse}
      icon={currentPlan.icon}
    >
      {currentPlan.name}
    </Badge>
  );
};
