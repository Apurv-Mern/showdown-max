'use client';

import { useCallback, useRef, useEffect } from 'react';

interface UseTimerSoundOptions {
  enabled?: boolean;
  /** Mute during music rounds */
  muted?: boolean;
}

/**
 * Generates timer tick/urgency sounds using Web Audio API.
 * - Normal tick every second (subtle)
 * - Urgent tick below 5 seconds (louder, higher pitch)
 * - No external audio files required
 */
export const useTimerSound = ({ enabled = true, muted = false }: UseTimerSoundOptions = {}) => {
  const ctxRef = useRef<AudioContext | null>(null);

  const getContext = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return ctxRef.current;
  }, []);

  useEffect(() => {
    return () => {
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    };
  }, []);

  const playTick = useCallback((urgent = false) => {
    if (!enabled || muted) return;

    try {
      const ctx = getContext();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.type = urgent ? 'square' : 'sine';
      oscillator.frequency.setValueAtTime(urgent ? 880 : 440, ctx.currentTime);

      const tickVolume = urgent ? 0.15 : 0.06;
      gainNode.gain.setValueAtTime(tickVolume, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (urgent ? 0.15 : 0.08));

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + (urgent ? 0.15 : 0.08));
    } catch {
      // Web Audio not available
    }
  }, [enabled, muted, getContext]);

  const playBuzz = useCallback(() => {
    if (!enabled || muted) return;

    try {
      const ctx = getContext();
      if (ctx.state === 'suspended') ctx.resume();

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(200, ctx.currentTime);
      oscillator.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.5);

      gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);
    } catch {
      // Web Audio not available
    }
  }, [enabled, muted, getContext]);

  return { playTick, playBuzz };
};
