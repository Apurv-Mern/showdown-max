'use client';

import { useEffect, useRef } from 'react';

interface ShortcutMap {
  [key: string]: () => void;
}

export const useKeyboardShortcuts = (shortcuts: ShortcutMap) => {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const key = e.key === ' ' ? ' ' : e.key.toLowerCase();
      const action = shortcutsRef.current[key];
      if (action) {
        e.preventDefault();
        e.stopPropagation();
        action();
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);
};
