'use client';

import { useState, useEffect, useRef } from 'react';
import { Sun, Moon, Laptop, Check } from 'lucide-react';
import { useT } from '@/components/ui';

export type ThemePreference = 'light' | 'dark' | 'system';

export function ThemeToggle() {
  const t = useT();
  const [theme, setTheme] = useState<ThemePreference>('light');
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Apply theme to document element
  function applyTheme(pref: ThemePreference) {
    if (typeof window === 'undefined') return;
    let effective = pref;
    if (pref === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      effective = isDark ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', effective);
    document.documentElement.style.colorScheme = effective;
  }

  useEffect(() => {
    setMounted(true);
    const saved = (localStorage.getItem('genios-theme') as ThemePreference) || 'light';
    setTheme(saved);
    applyTheme(saved);

    // Listen for system theme changes if system mode is selected
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = () => {
      const current = (localStorage.getItem('genios-theme') as ThemePreference) || 'light';
      if (current === 'system') {
        applyTheme('system');
      }
    };
    media.addEventListener('change', handleSystemChange);

    return () => media.removeEventListener('change', handleSystemChange);
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  function selectTheme(pref: ThemePreference) {
    setTheme(pref);
    localStorage.setItem('genios-theme', pref);
    applyTheme(pref);
    setIsOpen(false);
  }

  // Determine which icon to display in topbar button
  const isEffectiveDark =
    mounted &&
    (theme === 'dark' ||
      (theme === 'system' &&
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches));

  const CurrentIcon = !mounted
    ? Sun
    : theme === 'system'
      ? Laptop
      : isEffectiveDark
        ? Moon
        : Sun;

  return (
    <div className="theme-toggle-container" ref={dropdownRef}>
      <button
        type="button"
        className="icon-button theme-toggle-btn"
        aria-label={t('theme')}
        title={t('theme')}
        onClick={() => setIsOpen(!isOpen)}
      >
        <CurrentIcon size={19} />
      </button>

      {isOpen && (
        <div className="theme-dropdown-menu" role="menu">
          <div className="theme-dropdown-header">{t('theme')}</div>
          <button
            type="button"
            className={`theme-dropdown-item ${theme === 'light' ? 'active' : ''}`}
            onClick={() => selectTheme('light')}
            role="menuitem"
          >
            <span className="theme-item-left">
              <Sun size={16} />
              <span>Light</span>
            </span>
            {theme === 'light' && <Check size={14} className="theme-check" />}
          </button>

          <button
            type="button"
            className={`theme-dropdown-item ${theme === 'dark' ? 'active' : ''}`}
            onClick={() => selectTheme('dark')}
            role="menuitem"
          >
            <span className="theme-item-left">
              <Moon size={16} />
              <span>Dark</span>
            </span>
            {theme === 'dark' && <Check size={14} className="theme-check" />}
          </button>

          <button
            type="button"
            className={`theme-dropdown-item ${theme === 'system' ? 'active' : ''}`}
            onClick={() => selectTheme('system')}
            role="menuitem"
          >
            <span className="theme-item-left">
              <Laptop size={16} />
              <span>System</span>
            </span>
            {theme === 'system' && <Check size={14} className="theme-check" />}
          </button>
        </div>
      )}
    </div>
  );
}
