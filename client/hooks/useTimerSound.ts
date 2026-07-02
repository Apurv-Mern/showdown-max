'use client';

import { useEffect, useRef } from 'react';

export const TIMER_COUNTDOWN_SOUND_SRC = '/sounds/CountdownTrack.m4a';
// export const TIMER_COUNTDOWN_SOUND_SRC = '/sounds/Countdown%20Track%202.mp4';

interface UseTimerSoundOptions {
  enabled?: boolean;
  /** Mute during music rounds and mini-games */
  muted?: boolean;
  timerRemaining?: number;
  timerDuration?: number;
  /** True while the server countdown is actively ticking */
  timerRunning?: boolean;
}

/**
 * Plays the countdown track on the venue display while the question timer runs.
 * Plays straight through from the start (no per-tick seeking). Pauses with the
 * host timer; stops when the question ends or time runs out.
 */
export const useTimerSound = ({
  enabled = true,
  muted = false,
  timerRemaining = 0,
  timerRunning = false,
}: UseTimerSoundOptions = {}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeSessionRef = useRef(false);

  useEffect(() => {
    const audio = new Audio(TIMER_COUNTDOWN_SOUND_SRC);
    audio.preload = 'auto';
    audio.loop = false;
    audio.volume = 0.85;
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
      activeSessionRef.current = false;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const reset = () => {
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        /* ignore */
      }
      activeSessionRef.current = false;
    };

    if (!enabled || muted || timerRemaining <= 0) {
      reset();
      return;
    }

    if (!timerRunning) {
      audio.pause();
      return;
    }

    if (!activeSessionRef.current) {
      activeSessionRef.current = true;
      try {
        audio.currentTime = 0;
      } catch {
        /* ignore */
      }
      void audio.play().catch(() => {});
      return;
    }

    if (audio.paused) {
      void audio.play().catch(() => {});
    }
  }, [enabled, muted, timerRemaining, timerRunning]);
};
