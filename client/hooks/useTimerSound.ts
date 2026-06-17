'use client';

import { useEffect, useRef } from 'react';

export const TIMER_COUNTDOWN_SOUND_SRC = '/sounds/Countdown Track 2.mp3';

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
 * Plays the countdown MP3 on the venue display, synced with the question timer.
 * Pauses when the host pauses the timer; muted during music rounds.
 * Host dashboard does not use this hook — audio is venue-only.
 */
export const useTimerSound = ({
  enabled = true,
  muted = false,
  timerRemaining = 0,
  timerDuration = 30,
  timerRunning = false,
}: UseTimerSoundOptions = {}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackDurationRef = useRef(0);

  useEffect(() => {
    const audio = new Audio(TIMER_COUNTDOWN_SOUND_SRC);
    audio.preload = 'auto';
    audio.volume = 0.85;

    const onMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        trackDurationRef.current = audio.duration;
      }
    };

    audio.addEventListener('loadedmetadata', onMetadata);
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onMetadata);
      audio.src = '';
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const stop = () => {
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        /* ignore */
      }
    };

    if (!enabled || muted || timerRemaining <= 0) {
      stop();
      return;
    }

    const questionSeconds = Math.max(1, timerDuration);
    const elapsed = Math.max(0, questionSeconds - timerRemaining);
    const trackSeconds =
      trackDurationRef.current > 0 ? trackDurationRef.current : questionSeconds;
    const targetTime = Math.min(trackSeconds, (elapsed / questionSeconds) * trackSeconds);

    const syncPosition = () => {
      if (Math.abs(audio.currentTime - targetTime) > 0.4) {
        try {
          audio.currentTime = targetTime;
        } catch {
          /* not seekable yet */
        }
      }
    };

    if (timerRunning) {
      if (audio.readyState >= 1) {
        syncPosition();
        audio.play().catch(() => {});
      } else {
        const onReady = () => {
          syncPosition();
          audio.play().catch(() => {});
        };
        audio.addEventListener('loadedmetadata', onReady, { once: true });
        return () => audio.removeEventListener('loadedmetadata', onReady);
      }
    } else {
      syncPosition();
      audio.pause();
    }
  }, [enabled, muted, timerRemaining, timerDuration, timerRunning]);
};
