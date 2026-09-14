'use client';
import { useEffect } from 'react';

// Progressive enhancement limited to the four editorial sections requested.
export function CardMotion() {
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const selector = '.memory-timeline > div, .purpose-rows article, .audience-list article';
    const cards = Array.from(document.querySelectorAll<HTMLElement>(selector));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) =>
          entry.target.classList.toggle('card-in-view', entry.isIntersecting),
        );
      },
      { threshold: 0.15 },
    );
    cards.forEach((card) => {
      card.classList.add('motion-card');
      observer.observe(card);
    });
    const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
    let frame = 0;
    let current: HTMLElement | null = null;
    const reset = () => {
      cancelAnimationFrame(frame);
      if (current) {
        current.style.removeProperty('--tilt-x');
        current.style.removeProperty('--tilt-y');
      }
      current = null;
    };
    const move = (event: PointerEvent) => {
      if (preference.matches || !finePointer.matches) return;
      const card = (event.target as Element).closest<HTMLElement>(selector + ', .flow-step');
      if (current !== card) reset();
      if (!card) return;
      current = card;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty(
          '--tilt-x',
          ((0.5 - (event.clientY - rect.top) / rect.height) * 3).toFixed(2) + 'deg',
        );
        card.style.setProperty(
          '--tilt-y',
          (((event.clientX - rect.left) / rect.width - 0.5) * 3).toFixed(2) + 'deg',
        );
      });
    };
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerleave', reset);
    preference.addEventListener('change', reset);
    return () => {
      reset();
      observer.disconnect();
      cards.forEach((card) => card.classList.remove('motion-card', 'card-in-view'));
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerleave', reset);
      preference.removeEventListener('change', reset);
    };
  }, []);
  return null;
}
