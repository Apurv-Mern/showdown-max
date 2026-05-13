'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseAudioOptions {
  src?: string;
  loop?: boolean;
  volume?: number;
  autoPlay?: boolean;
}

/**
 * HTMLAudioElement hook for MP3 playback on the venue display only.
 * Host and player UIs should not call play/setSource — they emit `music_control` for the projector.
 */
export const useAudio = ({
  src,
  loop = false,
  volume = 1,
  autoPlay = false,
}: UseAudioOptions = {}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = new Audio();
    audio.loop = loop;
    audio.volume = Math.max(0, Math.min(1, volume));
    audio.preload = 'auto';

    const onLoadedMetadata = () =>
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.src = '';
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.loop = loop;
  }, [loop]);

  useEffect(() => {
    if (!audioRef.current || !src) return;
    audioRef.current.src = src;
    audioRef.current.load();
    if (autoPlay) {
      audioRef.current.play().catch(() => {});
    }
  }, [src, autoPlay]);

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
    if (audioRef.current && newSrc) {
      audioRef.current.src = newSrc;
      audioRef.current.load();
    }
  }, []);

  return { play, pause, stop, seek, setSource, isPlaying, duration, currentTime };
};
