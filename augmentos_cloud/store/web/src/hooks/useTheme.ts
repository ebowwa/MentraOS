import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export type Theme = 'light' | 'dark';

export const useTheme = () => {
  const [searchParams] = useSearchParams();
  
  const [theme, setTheme] = useState<Theme>(() => {
    // Priority: URL param > localStorage > default to 'dark'
    const urlTheme = searchParams.get('theme') as Theme;
    if (urlTheme === 'light' || urlTheme === 'dark') {
      return urlTheme;
    }
    
    const storedTheme = localStorage.getItem('theme') as Theme;
    if (storedTheme === 'light' || storedTheme === 'dark') {
      return storedTheme;
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

  // Apply theme to DOM and persist to localStorage
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  return { theme, setTheme };
}; 