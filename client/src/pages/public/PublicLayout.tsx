import { Outlet } from 'react-router-dom';
import { Preloader, SiteFooter, SiteHeader } from '../../components/SiteChrome';

export function PublicLayout() {
  return (
    <>
      <Preloader />
      <SiteHeader />
      <main id="main">
        <Outlet />
      </main>
      <SiteFooter />
    </>
  );
}
