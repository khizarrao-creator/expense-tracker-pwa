import React, { useState, useEffect } from 'react';
import { Download, Share, PlusSquare, X, Sparkles } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { haptic } from '../utils/haptics';

export const PWAInstallBanner: React.FC = () => {
  const { canInstall, isStandalone, isIOS, triggerInstall } = usePWAInstall();
  const [dismissed, setDismissed] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    const isDismissed = localStorage.getItem('pwa_banner_dismissed') === 'true';
    if (isDismissed) {
      setDismissed(true);
    }
  }, []);

  if (dismissed || isStandalone || (!canInstall && !isIOS)) {
    return null;
  }

  const handleDismiss = () => {
    haptic.tap();
    setDismissed(true);
    localStorage.setItem('pwa_banner_dismissed', 'true');
  };

  const handleInstallClick = async () => {
    haptic.tap();
    if (canInstall) {
      const installed = await triggerInstall();
      if (installed) {
        setDismissed(true);
      }
    } else if (isIOS) {
      setShowIOSGuide(true);
    }
  };

  return (
    <>
      <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:w-96 z-[110] bg-card border border-primary/20 p-3.5 rounded-2xl shadow-xl backdrop-blur-md animate-in slide-in-from-bottom duration-300">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 text-primary rounded-xl shrink-0">
              <Sparkles size={18} className="animate-pulse" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-foreground leading-none">Install The Base App</h4>
              <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
                Add to home screen for faster loading, offline access & app gestures.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleInstallClick}
              className="px-3 py-1.5 bg-primary text-primary-foreground font-bold text-xs rounded-xl hover:opacity-90 active:scale-95 transition-all shadow-sm flex items-center gap-1"
            >
              <Download size={13} />
              <span>Install</span>
            </button>
            <button
              onClick={handleDismiss}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
              title="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* iOS Safari Installation Guide Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-[160] flex items-end sm:items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-sm rounded-3xl p-6 border border-border shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-between items-center pb-2 border-b border-border">
              <h3 className="text-sm font-bold text-foreground">Install on iPhone / iPad</h3>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="p-1 text-muted-foreground hover:text-foreground rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
              <div className="flex items-center gap-3 p-2.5 bg-muted/40 rounded-xl border border-border">
                <div className="p-2 bg-primary/10 text-primary rounded-lg font-bold">1</div>
                <p>Tap the <span className="font-bold text-foreground inline-flex items-center gap-1"><Share size={12} /> Share</span> button in Safari menu.</p>
              </div>

              <div className="flex items-center gap-3 p-2.5 bg-muted/40 rounded-xl border border-border">
                <div className="p-2 bg-primary/10 text-primary rounded-lg font-bold">2</div>
                <p>Scroll down and tap <span className="font-bold text-foreground inline-flex items-center gap-1"><PlusSquare size={12} /> Add to Home Screen</span>.</p>
              </div>

              <div className="flex items-center gap-3 p-2.5 bg-muted/40 rounded-xl border border-border">
                <div className="p-2 bg-primary/10 text-primary rounded-lg font-bold">3</div>
                <p>Tap <span className="font-bold text-primary">Add</span> in top-right corner to launch app from Home Screen!</p>
              </div>
            </div>

            <button
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2.5 bg-primary text-primary-foreground font-bold rounded-xl text-xs uppercase tracking-wider transition-all"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};
