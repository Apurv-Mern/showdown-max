'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseAudioOptions {
  src?: string;
  loop?: boolean;
  volume?: number;
  autoPlay?: boolean;
}

/**
 * Web Audio API hook for MP3 playback on host/venue screens.
 * No audio plays on player devices.
 */
export const useAudio = ({ src, loop = false, volume = 1, autoPlay = false }: UseAudioOptions = {}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    if (!src) return;

    const audio = new Audio(src);
    audio.loop = loop;
    audio.volume = Math.max(0, Math.min(1, volume));
    audio.preload = 'auto';

    audio.addEventListener('loadedmetadata', () => setDuration(audio.duration));
    audio.addEventListener('timeupdate', () => setCurrentTime(audio.currentTime));
    audio.addEventListener('ended', () => setIsPlaying(false));
    audio.addEventListener('play', () => setIsPlaying(true));
    audio.addEventListener('pause', () => setIsPlaying(false));

    audioRef.current = audio;

    if (autoPlay) {
      audio.play().catch(() => {});
    }

    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [src, loop, autoPlay]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.max(0, Math.min(1, volume));
    }
  }, [volume]);

  const play = useCallback(() => {
    audioRef.current?.play().catch(() => {});
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  }, []);

  const setSource = useCallback((newSrc: string) => {
    if (audioRef.current) {
      audioRef.current.src = newSrc;
      audioRef.current.load();
    }
  }, []);

  return { play, pause, stop, seek, setSource, isPlaying, duration, currentTime };
};
