import React, { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'fyxinn-theme';

export const getStoredTheme = (): Theme =>
  localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';

export const applyTheme = (theme: Theme) => {
  document.documentElement.classList.toggle('light', theme === 'light');
  localStorage.setItem(STORAGE_KEY, theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f4f4f1' : '#0A0A0A');
};

export const initTheme = () => applyTheme(getStoredTheme());

export const ThemeToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  useEffect(() => { applyTheme(theme); }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`flex items-center gap-1.5 border border-border rounded-sm px-2 py-1 text-gray-500 hover:text-primary hover:border-primary transition-colors ${className}`}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
        {theme === 'dark' ? 'light_mode' : 'dark_mode'}
      </span>
      <span className="text-[9px] font-grotesk uppercase tracking-widest">
        {theme === 'dark' ? 'Light' : 'Dark'}
      </span>
    </button>
  );
};
