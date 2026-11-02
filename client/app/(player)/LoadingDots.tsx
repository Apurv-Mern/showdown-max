'use client';

import { motion } from 'framer-motion';

type LoadingDotsProps = {
  className?: string;
  gapClass?: string;
  /** pulse = all dots breathe together; sequential = one cyan dot at a time (wager locked). */
  variant?: 'pulse' | 'sequential';
};

/** Staggered pulse for lobby / “waiting for host” states on mobile play. */
export function LoadingDots({
  className = '',
  gapClass = 'gap-3',
  variant = 'pulse',
}: LoadingDotsProps) {
  if (variant === 'sequential') {
    return (
      <div className={`flex items-center justify-center ${gapClass} ${className}`} aria-hidden>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-2.5 w-2.5 rounded-full bg-[#2a3a5c]"
            animate={{
              backgroundColor: ['#2a3a5c', '#2a3a5c', '#1de8ff', '#2a3a5c', '#2a3a5c'],
              boxShadow: [
                '0 0 0 rgba(29,232,255,0)',
                '0 0 0 rgba(29,232,255,0)',
                '0 0 10px rgba(29,232,255,0.65)',
                '0 0 0 rgba(29,232,255,0)',
                '0 0 0 rgba(29,232,255,0)',
              ],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: i * 0.4,
            }}
          />
        ))}
      </div>
    );
  }

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
