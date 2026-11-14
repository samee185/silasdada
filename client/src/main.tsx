import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './hooks/useAuth';
import { SiteProvider } from './hooks/useSite';
import { ThemeProvider } from './theme/ThemeProvider';
import './styles/tokens.css';
import './styles/base.css';
import './styles/motion.css';
import './styles/public.css';
import './styles/admin.css';
import './styles/booking.css';
import './styles/messages.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <SiteProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </SiteProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
