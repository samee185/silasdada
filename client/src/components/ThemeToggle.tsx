import { useTheme } from '../theme/ThemeProvider';
import { Moon, Sun } from './Icons';

export function ThemeToggle({ onLight = false }: { onLight?: boolean }) {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className={`theme-toggle${onLight ? ' on-light' : ''}`}
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
    >
      {dark ? <Sun /> : <Moon />}
    </button>
  );
}
