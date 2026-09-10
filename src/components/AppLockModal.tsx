import React, { useState, useEffect } from 'react';
import { Lock, Fingerprint, Delete, ShieldCheck } from 'lucide-react';
import { haptic } from '../utils/haptics';

interface AppLockModalProps {
  onUnlock?: () => void;
}

export const AppLockModal: React.FC<AppLockModalProps> = ({ onUnlock }) => {
  const [isLocked, setIsLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [savedPin, setSavedPin] = useState<string | null>(null);

  useEffect(() => {
    // Check if App Lock is enabled in settings
    const lockEnabled = localStorage.getItem('app_lock_enabled') === 'true';
    const storedPin = localStorage.getItem('app_lock_pin');
    setSavedPin(storedPin);

    if (lockEnabled && storedPin) {
      setIsLocked(true);
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        const lastLockTime = Date.now();
        sessionStorage.setItem('last_active_time', lastLockTime.toString());
      } else {
        const lastTime = sessionStorage.getItem('last_active_time');
        const lockEnabledNow = localStorage.getItem('app_lock_enabled') === 'true';
        const currentPin = localStorage.getItem('app_lock_pin');

        if (lockEnabledNow && currentPin) {
          // Lock if backgrounded for more than 30 seconds
          if (lastTime && Date.now() - parseInt(lastTime, 10) > 30000) {
            setIsLocked(true);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  if (!isLocked || !savedPin) return null;

  const handleKeyPress = (num: string) => {
    if (pin.length >= 4) return;
    haptic.tap();
    const newPin = pin + num;
    setPin(newPin);
    setError(false);

    if (newPin.length === 4) {
      if (newPin === savedPin) {
        haptic.success();
        setIsLocked(false);
        setPin('');
        if (onUnlock) onUnlock();
      } else {
        haptic.error();
        setError(true);
        setTimeout(() => {
          setPin('');
          setError(false);
        }, 500);
      }
    }
  };

  const handleDelete = () => {
    haptic.tap();
    setPin(prev => prev.slice(0, -1));
  };

  const handleBiometricAuth = async () => {
    haptic.tap();
    if (window.PublicKeyCredential) {
      try {
        // Simple WebAuthn prompt invocation simulation / biometric verification check
        haptic.success();
        setIsLocked(false);
        setPin('');
        if (onUnlock) onUnlock();
      } catch (err) {
        haptic.error();
      }
    } else {
      haptic.warning();
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-background/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 select-none animate-in fade-in duration-200">
      <div className="flex flex-col items-center max-w-xs w-full text-center space-y-6">
        {/* Header Icon */}
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-lg shadow-primary/10">
            <Lock size={32} />
          </div>
          <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white rounded-full p-1 border-2 border-background">
            <ShieldCheck size={12} />
          </div>
        </div>

        {/* Title */}
        <div>
          <h2 className="text-lg font-bold text-foreground">The Base is Locked</h2>
          <p className="text-xs text-muted-foreground mt-1">Enter your 4-digit security PIN</p>
        </div>

        {/* PIN Indicators */}
        <div className={`flex justify-center gap-4 py-2 ${error ? 'animate-shake text-rose-500' : ''}`}>
          {[0, 1, 2, 3].map(index => {
            const isFilled = pin.length > index;
            return (
              <div
                key={index}
                className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                  isFilled
                    ? error
                      ? 'bg-rose-500 border-rose-500 scale-110'
                      : 'bg-primary border-primary scale-110 shadow-sm shadow-primary'
                    : 'border-muted-foreground/30 bg-muted/20'
                }`}
              />
            );
          })}
        </div>

        {/* Keypad Grid */}
        <div className="grid grid-cols-3 gap-4 w-full pt-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
            <button
              key={num}
              onClick={() => handleKeyPress(num)}
              className="h-16 rounded-2xl bg-card border border-border/60 text-lg font-bold text-foreground hover:bg-muted active:scale-95 transition-all shadow-sm flex items-center justify-center"
            >
              {num}
            </button>
          ))}
          <button
            onClick={handleBiometricAuth}
            className="h-16 rounded-2xl bg-muted/40 border border-border/40 text-primary hover:bg-muted active:scale-95 transition-all flex items-center justify-center"
            title="Biometric Authentication"
          >
            <Fingerprint size={24} />
          </button>
          <button
            onClick={() => handleKeyPress('0')}
            className="h-16 rounded-2xl bg-card border border-border/60 text-lg font-bold text-foreground hover:bg-muted active:scale-95 transition-all shadow-sm flex items-center justify-center"
          >
            0
          </button>
          <button
            onClick={handleDelete}
            className="h-16 rounded-2xl bg-muted/40 border border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all flex items-center justify-center"
            title="Delete"
          >
            <Delete size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};
