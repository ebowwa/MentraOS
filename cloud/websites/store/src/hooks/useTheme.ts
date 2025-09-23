import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export type Theme = 'light' | 'dark';

export const useTheme = () => {
  const [searchParams] = useSearchParams();

  const [theme, setTheme] = useState<Theme>(() => {
    // Priority: URL param > localStorage > os theme > default to 'dark'
    const urlTheme = searchParams.get('theme') as Theme;
    if (urlTheme === 'light' || urlTheme === 'dark') {
      return urlTheme;
    }

    const storedTheme = localStorage.getItem('theme') as Theme;
    if (storedTheme === 'light' || storedTheme === 'dark') {
      return storedTheme;
    }

    const osTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    if (osTheme === 'dark' || osTheme === 'light') {
      return osTheme;
    }

    return 'dark'; // Default theme
  });

  // Update theme when URL param changes
  useEffect(() => {
    const urlTheme = searchParams.get('theme') as Theme;
    if (urlTheme === 'light' || urlTheme === 'dark') {
      setTheme(urlTheme);
    }
  }, [searchParams]);

  // Apply theme to DOM and persist to localStorage only if it came from URL param
  useEffect(() => {
    document.documentElement.dataset.theme = theme;

    // Only persist to localStorage if the theme came from a URL parameter
    const urlTheme = searchParams.get('theme') as Theme;
    if (urlTheme === 'light' || urlTheme === 'dark') {
      localStorage.setItem('theme', theme);
    }
  }, [theme, searchParams]);

  return { theme, setTheme };
};