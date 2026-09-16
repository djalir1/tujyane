import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import '@/i18n';
import { AuthProvider } from '@/auth/AuthProvider';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { AdminRoute } from '@/auth/AdminRoute';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ToastProvider } from '@/components/ds/Toast';
import { Header } from '@/components/layout/Header';
import { CookieConsent } from '@/components/CookieConsent';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { RoleAwareShell } from '@/components/dashboard/RoleAwareShell';
import { ScrollToTop } from '@/components/ScrollToTop';
import AuthPage from '@/pages/AuthPage';
import SearchPage from '@/pages/SearchPage';
import SearchResultsPage from '@/pages/SearchResultsPage';
import StyleguidePage from '@/pages/StyleguidePage';
import TermsPage from '@/pages/content/TermsPage';
import PrivacyPage from '@/pages/content/PrivacyPage';
import HowItWorksPage from '@/pages/content/HowItWorksPage';
import AboutPage from '@/pages/content/AboutPage';
import JourneyDetailPage from '@/pages/JourneyDetailPage';
import JourneyManagePage from '@/pages/JourneyManagePage';
import PostJourneyPage from '@/pages/PostJourneyPage';
import MyJourneysPage from '@/pages/MyJourneysPage';
import MyTripsPage from '@/pages/MyTripsPage';
import DriverVerificationPage from '@/pages/DriverVerificationPage';
import AdminQueuePage from '@/pages/AdminQueuePage';
import AdminReviewPage from '@/pages/AdminReviewPage';
import OverviewPage from '@/pages/dashboard/OverviewPage';
import ProfilePage from '@/pages/dashboard/ProfilePage';
import AdminOverviewPage from '@/pages/dashboard/AdminOverviewPage';
import AdminUsersPage from '@/pages/dashboard/AdminUsersPage';
import FindRidePage from '@/pages/dashboard/FindRidePage';
import ReceiptsPage from '@/pages/dashboard/ReceiptsPage';
import DriverRequestsPage from '@/pages/dashboard/DriverRequestsPage';
import DrivingCockpitPage from '@/pages/dashboard/DrivingCockpitPage';
import DriverEarningsPage from '@/pages/dashboard/DriverEarningsPage';
import AdminAuditPage from '@/pages/dashboard/AdminAuditPage';
import {
  AdminDriversPage, AdminJourneysPage, AdminBookingsPage,
  AdminContributionsPage, AdminLivePage, AdminPaymentsPage,
  AdminReportsPage, AdminSettingsPage,
} from '@/pages/dashboard/AdminSimplePages';

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <ScrollToTop />
            <Routes>
              {/* Public */}
              <Route element={<PublicShell />}>
                <Route path="/" element={<SearchPage />} />
                <Route path="/search" element={<SearchResultsPage />} />
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/styleguide" element={<StyleguidePage />} />
                <Route path="/journeys/:id" element={<JourneyDetailPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/how-it-works" element={<HowItWorksPage />} />
                <Route path="/about" element={<AboutPage />} />
              </Route>

              {/* Full-page driver manage (kept outside shell) */}
              <Route
                path="/journeys/:id/manage"
                element={<ProtectedRoute><PublicShell><JourneyManagePage /></PublicShell></ProtectedRoute>}
              />

              {/* Role-aware user dashboard */}
              <Route
                element={<ProtectedRoute><RoleAwareShell /></ProtectedRoute>}
              >
                <Route path="/dashboard"                     element={<OverviewPage />} />
                <Route path="/dashboard/trips"               element={<MyTripsPage />} />
                <Route path="/dashboard/find"                element={<FindRidePage />} />
                <Route path="/dashboard/receipts"            element={<ReceiptsPage />} />
                <Route path="/dashboard/journeys"            element={<MyJourneysPage />} />
                <Route path="/dashboard/journeys/new"        element={<PostJourneyPage />} />
                <Route path="/dashboard/journeys/:id/manage" element={<JourneyManagePage />} />
                <Route path="/dashboard/requests"            element={<DriverRequestsPage />} />
                <Route path="/dashboard/driving"             element={<DrivingCockpitPage />} />
                <Route path="/dashboard/verification"        element={<DriverVerificationPage />} />
                <Route path="/dashboard/earnings"            element={<DriverEarningsPage />} />
                <Route path="/dashboard/profile"             element={<ProfilePage />} />
              </Route>

              {/* Admin */}
              <Route
                element={<AdminRoute><DashboardLayout variant="admin" /></AdminRoute>}
              >
                <Route path="/admin"                    element={<AdminOverviewPage />} />
                <Route path="/admin/users"              element={<AdminUsersPage />} />
                <Route path="/admin/drivers"            element={<AdminDriversPage />} />
                <Route path="/admin/drivers/:driverId"  element={<AdminReviewPage />} />
                <Route path="/admin/queue"              element={<AdminQueuePage />} />
                <Route path="/admin/journeys"           element={<AdminJourneysPage />} />
                <Route path="/admin/bookings"           element={<AdminBookingsPage />} />
                <Route path="/admin/live"               element={<AdminLivePage />} />
                <Route path="/admin/contributions"      element={<AdminContributionsPage />} />
                <Route path="/admin/payments"           element={<AdminPaymentsPage />} />
                <Route path="/admin/audit"              element={<AdminAuditPage />} />
                <Route path="/admin/reports"            element={<AdminReportsPage />} />
                <Route path="/admin/settings"           element={<AdminSettingsPage />} />
              </Route>

              {/* Legacy redirects */}
              <Route path="/my-trips"             element={<Navigate to="/dashboard/trips" replace />} />
              <Route path="/my-journeys"          element={<Navigate to="/dashboard/journeys" replace />} />
              <Route path="/journeys/new"         element={<Navigate to="/dashboard/journeys/new" replace />} />
              <Route path="/driver/verification"  element={<Navigate to="/dashboard/verification" replace />} />
              <Route path="/trips"                element={<Navigate to="/dashboard/trips" replace />} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <CookieConsent />
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

function PublicShell({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <Header />
      <main>{children ?? <Outlet />}</main>
    </>
  );
}
