import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, ArrowRight, Check } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { useApp } from '../contexts/AppContext';

interface UpgradePromptProps {
  featureId: string;
}

export const UpgradePrompt: React.FC<UpgradePromptProps> = ({ featureId }) => {
  const navigate = useNavigate();
  const { plansConfig } = useApp();

  // Find the lowest plan that includes this feature
  const requiredPlan = Object.entries(plansConfig).find(([_, details]) => 
    details.features.includes(featureId)
  )?.[0] || 'pro';

  const requiredPlanDetails = plansConfig[requiredPlan];

  const featureLabels: Record<string, { title: string; desc: string }> = {
    'ai-chat': {
      title: 'AI Financial Copilot',
      desc: 'Unlock personalized deep-learning chat, automated transactions, debt tracking, and spending forecasts.',
    },
    whatsapp: {
      title: 'WhatsApp Bridge Integration',
      desc: 'Sync messaging histories, broadcast notification alerts, read status updates, and chat with AI from your WhatsApp.',
    },
    investments: {
      title: 'Real-Time Portfolio Tracking',
      desc: 'Integrate dynamic crypto exchange feeds (MEXC), evaluate net worth distributions, and trace profit/loss metrics.',
    },
  };

  const currentFeature = featureLabels[featureId] || {
    title: 'Premium Financial Tool',
    desc: 'This premium feature is restricted under your current tier plan.',
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <Card variant="default" className="max-w-md w-full border border-border/80 shadow-2xl p-8 relative overflow-hidden bg-card text-center space-y-6">
        {/* Glow decoration */}
        <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-brand/10 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-warning/10 blur-3xl" />

        <div className="w-16 h-16 bg-muted text-primary rounded-2xl flex items-center justify-center mx-auto border border-border shadow-sm">
          <Lock size={28} className="stroke-[2.5]" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-extrabold text-foreground tracking-tight">
            Feature Locked
          </h2>
          <div className="flex items-center justify-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Requires</span>
            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border ${
              requiredPlan === 'max' ? 'bg-warning/10 text-warning border-warning/20' : 'bg-brand/10 text-brand border-brand/20'
            }`}>
              {requiredPlanDetails?.name || requiredPlan} Plan
            </span>
          </div>
        </div>

        <div className="bg-muted/30 border border-border/50 rounded-2xl p-4 text-left space-y-2">
          <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-brand" />
            {currentFeature.title}
          </h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {currentFeature.desc}
          </p>
        </div>

        <div className="space-y-3">
          <Button
            variant="primary"
            fullWidth
            onClick={() => navigate('/upgrade')}
            rightIcon={<ArrowRight size={16} />}
          >
            Upgrade Plan
          </Button>
          <Button
            variant="ghost"
            fullWidth
            onClick={() => navigate('/more')}
            size="sm"
          >
            Back to More Tools
          </Button>
        </div>

        <div className="pt-4 border-t border-border/40 text-[10px] text-muted-foreground leading-normal flex items-center justify-center gap-4">
          <span className="flex items-center gap-1"><Check size={12} className="text-success" /> Secure payment</span>
          <span className="flex items-center gap-1"><Check size={12} className="text-success" /> Dynamic rate conversion</span>
        </div>
      </Card>
    </div>
  );
};
