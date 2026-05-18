import React, { useEffect, useRef, useState } from 'react';
import { Shield } from 'lucide-react';

interface AdminTransitionOverlayProps {
  isActive: boolean;
  onComplete: () => void;
}

// Particle data
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
  life: number;
  maxLife: number;
}

const NUM_PARTICLES = 60;

const AdminTransitionOverlay: React.FC<AdminTransitionOverlayProps> = ({ isActive, onComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);

  const [phase, setPhase] = useState<'idle' | 'enter' | 'auth' | 'unlock' | 'exit'>('idle');
  const [authProgress, setAuthProgress] = useState(0);
  const [shieldPulse, setShieldPulse] = useState(false);
  const [isDark, setIsDark] = useState(false);

  // Detect current theme
  useEffect(() => {
    const checkDark = () => setIsDark(document.documentElement.classList.contains('dark'));
    checkDark();
    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Main orchestration
  useEffect(() => {
    if (!isActive) {
      setPhase('idle');
      setAuthProgress(0);
      setShieldPulse(false);
      return;
    }

    setPhase('enter');
    initParticles();

    // Phase timeline
    const t1 = setTimeout(() => setPhase('auth'), 400);
    const t2 = setTimeout(() => setShieldPulse(true), 600);

    // Animate auth bar
    const authStart = Date.now();
    const authDuration = 1000;
    const animateAuth = () => {
      const elapsed = Date.now() - authStart;
      const p = Math.min(elapsed / authDuration, 1);
      // Eased progress
      const eased = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
      setAuthProgress(eased * 100);
      if (p < 1) requestAnimationFrame(animateAuth);
    };
    const t3 = setTimeout(() => requestAnimationFrame(animateAuth), 450);

    const t4 = setTimeout(() => setPhase('unlock'), 1500);
    const t5 = setTimeout(() => setPhase('exit'), 1750);
    const t6 = setTimeout(() => {
      onComplete();
      setPhase('idle');
    }, 2100);

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      clearTimeout(t4); clearTimeout(t5); clearTimeout(t6);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const initParticles = () => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    particlesRef.current = Array.from({ length: NUM_PARTICLES }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.4 + Math.random() * 1.2;
      const life = 80 + Math.random() * 80;
      return {
        x: cx + (Math.random() - 0.5) * 120,
        y: cy + (Math.random() - 0.5) * 120,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 1 + Math.random() * 2,
        opacity: 0.6 + Math.random() * 0.4,
        life,
        maxLife: life,
      };
    });
  };

  // Canvas particle animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const goldLight = 'rgba(212, 175, 90,';
    const goldDark  = 'rgba(184, 148, 60,';
    const silverLight = 'rgba(180, 190, 210,';

    const render = () => {
      if (phase === 'idle') {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.01; // subtle gravity drift
        p.life -= 1;

        const lifeRatio = p.life / p.maxLife;
        const alpha = p.opacity * lifeRatio;

        const color = isDark ? goldDark : silverLight;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `${color} ${alpha})`;
        ctx.fill();

        // Soft glow
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 3);
        grad.addColorStop(0, `${isDark ? goldLight : goldLight} ${alpha * 0.4})`);
        grad.addColorStop(1, `${isDark ? goldLight : goldLight} 0)`);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 3, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      });

      // Replenish dead particles
      particlesRef.current = particlesRef.current.filter(p => p.life > 0);
      if (particlesRef.current.length < NUM_PARTICLES && phase !== 'exit') {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const count = Math.min(3, NUM_PARTICLES - particlesRef.current.length);
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 0.4 + Math.random() * 1.2;
          const life = 80 + Math.random() * 80;
          particlesRef.current.push({
            x: cx + (Math.random() - 0.5) * 200,
            y: cy + (Math.random() - 0.5) * 200,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: 1 + Math.random() * 2,
            opacity: 0.6 + Math.random() * 0.4,
            life,
            maxLife: life,
          });
        }
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [phase, isDark]);

  if (phase === 'idle') return null;

  const isEnter  = phase === 'enter';
  const isAuth   = phase === 'auth' || phase === 'unlock';
  const isUnlock = phase === 'unlock';
  const isExit   = phase === 'exit';

  return (
    <div
      className={`admin-overlay ${isDark ? 'dark-mode' : 'light-mode'} ${isExit ? 'overlay-exit' : 'overlay-enter'}`}
      aria-modal="true"
      role="dialog"
      aria-label="Entering Admin Mode"
    >
      {/* Canvas for particles */}
      <canvas ref={canvasRef} className="admin-canvas" />

      {/* Radial ambient glow */}
      <div className={`admin-ambient-glow ${isDark ? 'glow-dark' : 'glow-light'}`} />

      {/* Scanline sweep */}
      <div className={`admin-scanline ${isAuth ? 'scanline-active' : ''}`} />

      {/* Corner accents */}
      <div className="corner-accent top-left" />
      <div className="corner-accent top-right" />
      <div className="corner-accent bottom-left" />
      <div className="corner-accent bottom-right" />

      {/* Central card */}
      <div className={`admin-card ${isDark ? 'card-dark' : 'card-light'} ${isEnter ? 'card-enter' : 'card-visible'} ${isExit ? 'card-exit' : ''}`}>

        {/* Metallic top stripe */}
        <div className={`card-stripe ${isDark ? 'stripe-dark' : 'stripe-light'}`} />

        {/* Shield icon */}
        <div className={`shield-wrap ${shieldPulse ? 'shield-pulse' : ''} ${isUnlock ? 'shield-unlock' : ''} ${isDark ? 'shield-dark' : 'shield-light'}`}>
          <div className="shield-ring-outer" />
          <div className="shield-ring-inner" />
          <Shield size={32} strokeWidth={1.5} className="shield-icon" />
        </div>

        {/* Label */}
        <div className={`admin-label ${isAuth ? 'label-visible' : 'label-hidden'}`}>
          <p className={`admin-title ${isDark ? 'title-dark' : 'title-light'}`}>
            {isUnlock ? 'ACCESS GRANTED' : 'AUTHENTICATING'}
          </p>
          <p className={`admin-subtitle ${isDark ? 'subtitle-dark' : 'subtitle-light'}`}>
            {isUnlock ? 'Welcome to Admin Command Center' : 'Verifying credentials…'}
          </p>
        </div>

        {/* Auth progress bar */}
        <div className={`auth-bar-track ${isDark ? 'track-dark' : 'track-light'} ${isAuth ? 'bar-visible' : 'bar-hidden'}`}>
          <div
            className={`auth-bar-fill ${isDark ? 'fill-dark' : 'fill-light'} ${isUnlock ? 'fill-complete' : ''}`}
            style={{ width: `${authProgress}%` }}
          />
          <div className="auth-bar-shimmer" />
        </div>

        {/* Status dots */}
        <div className={`status-dots ${isAuth ? 'dots-visible' : 'dots-hidden'}`}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`status-dot ${isDark ? 'dot-dark' : 'dot-light'}`}
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminTransitionOverlay;
