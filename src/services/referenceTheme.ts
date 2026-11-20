import { useSyncExternalStore } from 'react';

export type ReferenceTheme = 'light' | 'dark';
const storageKey = 'jyz-reference-theme';
const listeners = new Set<() => void>();
let theme: ReferenceTheme = 'light';
let transitioning = false;

function applyTheme(next: ReferenceTheme, persist = false) {
  theme = next;
  // Only explicitly scoped surfaces consume this attribute. Do not set .dark or root color-scheme.
  document.documentElement.dataset.referenceTheme = next;
  if (persist) {
    try { localStorage.setItem(storageKey, next); } catch { /* Storage may be unavailable. */ }
  }
  listeners.forEach((listener) => listener());
}

try { theme = localStorage.getItem(storageKey) === 'dark' ? 'dark' : 'light'; } catch { /* Default to light. */ }
applyTheme(theme);
window.addEventListener('storage', (event) => {
  if (event.key === storageKey || event.key === null) applyTheme(event.newValue === 'dark' ? 'dark' : 'light');
});

export function useReferenceTheme() {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, () => theme, () => 'light' as ReferenceTheme);
}

/** Reference app.js circular reveal, with an immediate accessible fallback. */
export async function toggleReferenceTheme(trigger: HTMLElement) {
  if (transitioning) return;
  const next = theme === 'dark' ? 'light' : 'dark';
  const bounds = trigger.getBoundingClientRect();
  const x = bounds.left + bounds.width / 2;
  const y = bounds.top + bounds.height / 2;
  if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    applyTheme(next, true);
    return;
  }
  transitioning = true;
  document.documentElement.dataset.referenceThemeTransition = '';
  try {
    const transition = document.startViewTransition(() => { applyTheme(next, true); });
    // Observe finished immediately so a skipped transition never rejects unhandled.
    const finished = transition.finished.catch(() => undefined);
    try {
      await transition.ready;
      const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      document.documentElement.animate({ clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] }, {
        duration: 680, easing: 'cubic-bezier(.22, 1, .36, 1)', pseudoElement: '::view-transition-new(root)',
      });
    } catch { applyTheme(next, true); }
    await finished;
  } catch { applyTheme(next, true); }
  finally {
    delete document.documentElement.dataset.referenceThemeTransition;
    transitioning = false;
  }
}
