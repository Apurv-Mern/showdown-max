'use client';

import { motion } from 'framer-motion';

type LoadingDotsProps = {
  className?: string;
  gapClass?: string;
};

/** Staggered pulse for lobby / “waiting for host” states on mobile play. */
export function LoadingDots({ className = '', gapClass = 'gap-3' }: LoadingDotsProps) {
  return (
    <div className={`flex items-center justify-center ${gapClass} ${className}`} aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-3.5 w-3.5 rounded-full bg-[#00d8ff] shadow-[0_0_9px_rgba(0,216,255,0.6)]"
          animate={{
            opacity: [0.35, 1, 0.35],
            scale: [0.88, 1.12, 0.88],
            y: [0, -5, 0],
          }}
          transition={{
            duration: 1.75,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.18,
          }}
        />
      ))}
    </div>
  );
}
