import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial } from "@react-three/drei";
import type { Group } from "three";

function FloatingHeadset() {
  const groupRef = useRef<Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.25;
    }
  });

  return (
    <Float speed={1.4} rotationIntensity={0.3} floatIntensity={0.9}>
      <group ref={groupRef} scale={1}>
        {/* Headband */}
        <mesh position={[0, 0.4, 0]} rotation={[0, 0, 0]}>
          <torusGeometry args={[1, 0.08, 16, 64, Math.PI]} />
          <MeshDistortMaterial
            color="#2563eb"
            speed={1.5}
            distort={0.15}
            roughness={0.25}
            metalness={0.6}
          />
        </mesh>
        {/* Left ear cup */}
        <mesh position={[-1, -0.1, 0]}>
          <sphereGeometry args={[0.35, 32, 32]} />
          <MeshDistortMaterial
            color="#3b82f6"
            speed={2}
            distort={0.25}
            roughness={0.2}
            metalness={0.7}
          />
        </mesh>
        {/* Right ear cup */}
        <mesh position={[1, -0.1, 0]}>
          <sphereGeometry args={[0.35, 32, 32]} />
          <MeshDistortMaterial
            color="#3b82f6"
            speed={2}
            distort={0.25}
            roughness={0.2}
            metalness={0.7}
          />
        </mesh>
        {/* Mic boom */}
        <mesh position={[0.85, -0.5, 0.25]} rotation={[0, 0, -0.6]}>
          <cylinderGeometry args={[0.03, 0.03, 0.8, 16]} />
          <meshStandardMaterial color="#1e40af" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* Mic tip */}
        <mesh position={[0.55, -0.85, 0.35]}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshStandardMaterial color="#60a5fa" metalness={0.9} roughness={0.2} />
        </mesh>
      </group>
    </Float>
  );
}

/**
 * Lightweight 3D accent for the Agent Workspace.
 * - Lazy-loaded chunk so it only loads on the Agent route.
 * - Disabled on small screens & for prefers-reduced-motion.
 * - Pauses when tab hidden.
 * - pointer-events-none + low opacity so the form remains primary.
 */
export default function Hero3D() {
  const [enabled, setEnabled] = useState(true);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const small = window.matchMedia("(max-width: 640px)").matches;
    if (reduce || small) setEnabled(false);

    const onVis = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  if (!enabled) {
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute right-8 top-4 h-32 w-32 rounded-full bg-gradient-to-br from-blue-400/30 to-indigo-500/20 blur-3xl" />
      </div>
    );
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-70"
    >
      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 45 }}
        dpr={[1, 1.5]}
        frameloop={visible ? "always" : "never"}
        gl={{ antialias: false, powerPreference: "high-performance", alpha: true }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 4, 5]} intensity={1.1} />
        <Suspense fallback={null}>
          <FloatingHeadset />
        </Suspense>
      </Canvas>
    </div>
  );
}
