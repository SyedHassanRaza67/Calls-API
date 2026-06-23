import { cn } from "@/lib/utils";

interface AnimatedBackgroundProps {
  className?: string;
}

export function AnimatedBackground({ className }: AnimatedBackgroundProps) {
  return (
    <div className={cn("fixed inset-0 overflow-hidden pointer-events-none -z-10", className)}>
      {/* Floating gradient orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/8 rounded-full blur-3xl animate-float-delayed" />
      <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-primary/5 rounded-full blur-2xl animate-float-slow" />
      
      {/* Glowing accent circles */}
      <div className="absolute top-20 right-20 w-4 h-4 bg-primary/40 rounded-full animate-pulse-glow" />
      <div className="absolute bottom-32 left-16 w-3 h-3 bg-accent/30 rounded-full animate-pulse-glow-delayed" />
      <div className="absolute top-1/3 left-10 w-2 h-2 bg-primary/50 rounded-full animate-pulse-glow" />
      
      {/* Floating particles */}
      <div className="absolute top-1/4 right-1/4 w-1 h-1 bg-primary/60 rounded-full animate-particle-1" />
      <div className="absolute bottom-1/3 left-1/3 w-1.5 h-1.5 bg-accent/40 rounded-full animate-particle-2" />
      <div className="absolute top-2/3 right-1/2 w-1 h-1 bg-primary/50 rounded-full animate-particle-3" />
      <div className="absolute bottom-1/4 right-1/3 w-0.5 h-0.5 bg-primary/70 rounded-full animate-particle-1" />
      <div className="absolute top-1/2 left-1/4 w-1.5 h-1.5 bg-accent/30 rounded-full animate-particle-2" />
      
      {/* Grid pattern overlay */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }}
      />
    </div>
  );
}
