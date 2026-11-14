import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './pages/admin/AdminLayout';
import { ClaimPage, ForgotPage, LoginPage, RequireAuth, ResetPage } from './pages/admin/Auth';
import { OverviewPage } from './pages/admin/Overview';
import { SetupPage } from './pages/admin/Setup';
import { AccountPage, TeamPage, WebsiteContentPage } from './pages/admin/Pages';
import { HomePage } from './pages/public/Home';
import { PublicLayout } from './pages/public/PublicLayout';
import { BookPage } from './pages/public/Book';
import { ManageBookingPage } from './pages/public/ManageBooking';
import { AppointmentsPage } from './pages/admin/Appointments';
import { SchedulePage } from './pages/admin/Schedule';
import { NotFoundPage } from './pages/public/SimplePages';
import { MessagePage, MessagesPage } from './pages/public/Messages';
import { AdminMessagesPage, PostEditorPage } from './pages/admin/Messages';
import { AiDraftsPage } from './pages/admin/AiDrafts';

export function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="messages/:slug" element={<MessagePage />} />
        <Route path="book" element={<BookPage />} />
        <Route path="booking/:token" element={<ManageBookingPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route path="/admin/login" element={<LoginPage />} />
      <Route path="/admin/claim" element={<ClaimPage />} />
      <Route path="/admin/forgot" element={<ForgotPage />} />
      <Route path="/admin/reset/:token" element={<ResetPage />} />
      <Route path="/admin/setup" element={<RequireAuth roles={['OWNER']}><SetupPage /></RequireAuth>} />
      <Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
        <Route index element={<OverviewPage />} />
        <Route path="website" element={<WebsiteContentPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="team" element={<RequireAuth roles={['OWNER']}><TeamPage /></RequireAuth>} />
        <Route path="appointments" element={<RequireAuth roles={['OWNER']}><AppointmentsPage /></RequireAuth>} />
        <Route path="schedule" element={<RequireAuth roles={['OWNER']}><SchedulePage /></RequireAuth>} />
        <Route path="messages" element={<AdminMessagesPage />} />
        <Route path="messages/new" element={<PostEditorPage />} />
        <Route path="messages/:id" element={<PostEditorPage />} />
        <Route path="ai" element={<AiDraftsPage />} />
        <Route path="ai/:id" element={<AiDraftsPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}
