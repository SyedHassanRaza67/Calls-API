import { useEffect, useRef, useState, useCallback, memo } from "react";
import { cn } from "@/lib/utils";

interface InteractiveBackgroundProps {
  className?: string;
}

interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  twinkleSpeed: number;
  twinkleOffset: number;
}

interface GalaxyParticle {
  id: number;
  angle: number;
  radius: number;
  size: number;
  speed: number;
  opacity: number;
  hue: number;
  arm: number;
}

// Memoized star component for performance
const StarField = memo(({ stars }: { stars: Star[] }) => (
  <>
    {stars.map((star) => (
      <div
        key={star.id}
        className="absolute rounded-full bg-white will-change-[opacity]"
        style={{
          left: `${star.x}%`,
          top: `${star.y}%`,
          width: `${star.size}px`,
          height: `${star.size}px`,
          opacity: star.opacity,
          animation: `twinkle ${star.twinkleSpeed}s ease-in-out infinite`,
          animationDelay: `${star.twinkleOffset}s`,
        }}
      />
    ))}
  </>
));
StarField.displayName = "StarField";

// Memoized galaxy spiral with GPU acceleration
const GalaxySpiral = memo(({ particles, centerX, centerY, rotation }: { 
  particles: GalaxyParticle[]; 
  centerX: number; 
  centerY: number;
  rotation: number;
}) => (
  <div 
    className="absolute inset-0 will-change-transform"
    style={{ 
      transform: `rotate(${rotation}deg)`,
      transition: 'transform 0.5s linear',
    }}
  >
    {particles.map((particle) => {
      // Spiral arm calculation
      const armOffset = (particle.arm * Math.PI * 2) / 3;
      const spiralAngle = particle.angle + armOffset + (particle.radius * 0.15);
      const x = centerX + Math.cos(spiralAngle) * particle.radius;
      const y = centerY + Math.sin(spiralAngle) * particle.radius;

      return (
        <div
          key={particle.id}
          className="absolute rounded-full"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            backgroundColor: `hsla(${particle.hue}, 80%, 70%, ${particle.opacity})`,
            boxShadow: `0 0 ${particle.size * 2}px hsla(${particle.hue}, 80%, 60%, ${particle.opacity * 0.5})`,
            transform: "translate(-50%, -50%)",
          }}
        />
      );
    })}
  </div>
));
GalaxySpiral.displayName = "GalaxySpiral";

// Cosmic dust - static, no re-renders
const CosmicDust = memo(() => {
  const dust = Array.from({ length: 8 }, (_, i) => ({
    id: i,
    left: 10 + Math.random() * 80,
    top: 10 + Math.random() * 80,
    size: Math.random() * 4 + 1,
    hue: 220 + Math.random() * 60,
    opacity: Math.random() * 0.4 + 0.1,
    duration: 15 + Math.random() * 10,
    delay: Math.random() * 10,
  }));

  return (
    <>
      {dust.map((d) => (
        <div
          key={`dust-${d.id}`}
          className="absolute rounded-full"
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: `${d.size}px`,
            height: `${d.size}px`,
            backgroundColor: `hsla(${d.hue}, 70%, 70%, ${d.opacity})`,
            animation: `cosmicDrift ${d.duration}s ease-in-out infinite`,
            animationDelay: `${d.delay}s`,
          }}
        />
      ))}
    </>
  );
});
CosmicDust.displayName = "CosmicDust";

export default function InteractiveBackground({ className }: InteractiveBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 50, y: 50 });
  const [galaxyRotation, setGalaxyRotation] = useState(0);
  
  // Reduced star count: 100 -> 50
  const [stars] = useState<Star[]>(() =>
    Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 0.5,
      opacity: Math.random() * 0.8 + 0.2,
      twinkleSpeed: Math.random() * 3 + 2,
      twinkleOffset: Math.random() * 5,
    }))
  );

  // Reduced galaxy particles: 80 -> 40
  const [galaxyParticles] = useState<GalaxyParticle[]>(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      angle: Math.random() * Math.PI * 2,
      radius: Math.random() * 35 + 5,
      size: Math.random() * 3 + 1,
      speed: Math.random() * 0.5 + 0.1,
      opacity: Math.random() * 0.6 + 0.2,
      hue: Math.random() * 60 + 180,
      arm: Math.floor(Math.random() * 3),
    }))
  );

  // Slower galaxy rotation: 100ms -> 250ms, larger increment
  useEffect(() => {
    const interval = setInterval(() => {
      setGalaxyRotation((prev) => (prev + 0.25) % 360);
    }, 250);
    return () => clearInterval(interval);
  }, []);

  // Handle mouse movement with throttling
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMousePosition({ x, y });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let ticking = false;
    const throttledHandler = (e: MouseEvent) => {
      if (!ticking) {
        requestAnimationFrame(() => {
          handleMouseMove(e);
          ticking = false;
        });
        ticking = true;
      }
    };

    container.addEventListener("mousemove", throttledHandler, { passive: true });
    return () => container.removeEventListener("mousemove", throttledHandler);
  }, [handleMouseMove]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "fixed inset-0 overflow-hidden pointer-events-auto -z-10 bg-[hsl(222,47%,4%)]",
        className
      )}
    >
      {/* Deep space gradient */}
      <div
        className="absolute inset-0 will-change-[background]"
        style={{
          background: `
            radial-gradient(ellipse at ${mousePosition.x}% ${mousePosition.y}%, 
              hsla(260, 60%, 15%, 0.4) 0%,
              hsla(220, 60%, 8%, 0.3) 30%,
              transparent 60%
            ),
            radial-gradient(ellipse at 30% 70%, hsla(280, 50%, 12%, 0.3) 0%, transparent 50%),
            radial-gradient(ellipse at 70% 30%, hsla(200, 60%, 10%, 0.3) 0%, transparent 50%)
          `,
        }}
      />

      {/* Star field layer */}
      <StarField stars={stars} />

      {/* Galaxy core glow */}
      <div
        className="absolute rounded-full blur-3xl"
        style={{
          left: "50%",
          top: "50%",
          width: "300px",
          height: "300px",
          transform: "translate(-50%, -50%)",
          background: `
            radial-gradient(circle,
              hsla(270, 80%, 60%, 0.3) 0%,
              hsla(220, 70%, 50%, 0.2) 30%,
              hsla(200, 60%, 40%, 0.1) 50%,
              transparent 70%
            )
          `,
        }}
      />

      {/* Galaxy spiral arms */}
      <GalaxySpiral
        particles={galaxyParticles}
        centerX={50}
        centerY={50}
        rotation={galaxyRotation}
      />

      {/* Nebula clouds - reduced from 3 to 2 */}
      <div
        className="absolute w-[500px] h-[500px] rounded-full blur-[100px] animate-float opacity-30"
        style={{
          left: "20%",
          top: "20%",
          background: "radial-gradient(circle, hsla(280, 70%, 50%, 0.3) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute w-[400px] h-[400px] rounded-full blur-[80px] animate-float-delayed opacity-25"
        style={{
          right: "15%",
          bottom: "25%",
          background: "radial-gradient(circle, hsla(200, 80%, 50%, 0.3) 0%, transparent 70%)",
        }}
      />

      {/* Mouse-following cosmic glow */}
      <div
        className="absolute pointer-events-none transition-all duration-500 ease-out"
        style={{
          left: `${mousePosition.x}%`,
          top: `${mousePosition.y}%`,
          width: "200px",
          height: "200px",
          transform: "translate(-50%, -50%)",
          background: `
            radial-gradient(circle,
              hsla(260, 100%, 70%, 0.15) 0%,
              hsla(220, 80%, 60%, 0.08) 40%,
              transparent 70%
            )
          `,
          filter: "blur(20px)",
        }}
      />

      {/* Shooting stars - reduced from 3 to 2 */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute w-[2px] h-[80px] bg-gradient-to-b from-white via-white/50 to-transparent"
          style={{
            left: "20%",
            top: "-80px",
            transform: "rotate(45deg)",
            animation: "shootingStar 8s ease-in-out infinite",
            animationDelay: "0s",
          }}
        />
        <div
          className="absolute w-[1px] h-[60px] bg-gradient-to-b from-white via-white/40 to-transparent"
          style={{
            left: "70%",
            top: "-60px",
            transform: "rotate(35deg)",
            animation: "shootingStar 12s ease-in-out infinite",
            animationDelay: "4s",
          }}
        />
      </div>

      {/* Cosmic dust particles - memoized component */}
      <CosmicDust />
    </div>
  );
}
