import React, { Suspense, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AuthenticatedPage from './components/permissions/AuthenticatedPage';
import PublicPage from './components/permissions/PublicPage';
import PageErrorBoundary from './components/layout/PageErrorBoundary';
import PageLoading from './components/layout/PageLoading';
import { lazyPage, preloadWhenIdle } from './service/lazy_page';
import { RootState } from './store/store';

/* Page component imports */
import Landing from './pages/public/Landing';

/* Custom CSS */
import './App.css';

// Every page but the landing page downloads when first opened, so a visitor's first load doesn't
// include the signed-in app, or the Markdown and math libraries that notes are rendered with.
const Login = lazyPage(() => import('./pages/public/Login'));
const VerifyEmail = lazyPage(() => import('./pages/public/VerifyEmail'));
const ForgotPassword = lazyPage(() => import('./pages/public/ForgotPassword'));
const ResetPassword = lazyPage(() => import('./pages/public/ResetPassword'));
const About = lazyPage(() => import('./pages/public/About'));
const TermsOfService = lazyPage(() => import('./pages/public/TermsOfService'));
const HomePage = lazyPage(() => import('./pages/private/HomePage'));
const PeoplePage = lazyPage(() => import('./pages/private/PeoplePage'));
const ProfilePage = lazyPage(() => import('./pages/private/ProfilePage'));
const MyNotesPage = lazyPage(() => import('./pages/private/MyNotesPage'));
const NoteEditorPage = lazyPage(() => import('./pages/private/NoteEditorPage'));
const SettingsPage = lazyPage(() => import('./pages/private/SettingsPage'));

const PUBLIC_PAGES = [Login, VerifyEmail, ForgotPassword, ResetPassword, About, TermsOfService];
const ALL_PAGES = [...PUBLIC_PAGES, HomePage, PeoplePage, ProfilePage, MyNotesPage, NoteEditorPage, SettingsPage];

// Download the other pages in the background once this one has loaded, so moving between pages
// doesn't wait on the network. A signed-out visitor on the landing page gets only the public ones;
// the signed-in pages follow once they go anywhere else, such as the sign-in page.
const PreloadPages: React.FC = () => {
  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);
  const onLanding = useLocation().pathname === '/';
  const pages = isAuthenticated || !onLanding ? ALL_PAGES : PUBLIC_PAGES;
  useEffect(() => preloadWhenIdle(pages), [pages]);
  return null;
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <PreloadPages />
      <PageErrorBoundary>
        {/* Moving to a page that is still downloading keeps the current one on screen meanwhile:
            the router makes each navigation a transition. */}
        <Suspense fallback={<PageLoading />}>
          <Routes>
            {/* Public Routes */}
            <Route
              path="/"
              element={
                <PublicPage>
                  <Landing />
                </PublicPage>
              }
            />
            <Route
              path="/login"
              element={
                <PublicPage>
                  <Login />
                </PublicPage>
              }
            />
            <Route
              path="/verify-email"
              element={
                <PublicPage>
                  <VerifyEmail />
                </PublicPage>
              }
            />
            <Route
              path="/forgot-password"
              element={
                <PublicPage>
                  <ForgotPassword />
                </PublicPage>
              }
            />
            <Route
              path="/reset-password"
              element={
                <PublicPage restrictAuthenticated={false}>
                  <ResetPassword />
                </PublicPage>
              }
            />
            <Route
              path="/about"
              element={
                <PublicPage restrictAuthenticated={false}>
                  <About />
                </PublicPage>
              }
            />
            <Route
              path="/terms"
              element={
                <PublicPage restrictAuthenticated={false}>
                  <TermsOfService />
                </PublicPage>
              }
            />

            {/* Private Routes */}
            <Route
              path="/home"
              element={
                <AuthenticatedPage allowedRoles={["USER"]}>
                  <HomePage />
                </AuthenticatedPage>
              }
            />
            <Route
              path="/people"
              element={
                <AuthenticatedPage allowedRoles={["USER"]}>
                  <PeoplePage />
                </AuthenticatedPage>
              }
            />
            <Route
              path="/profile/:userId"
              element={
                <AuthenticatedPage allowedRoles={["USER"]}>
                  <ProfilePage />
                </AuthenticatedPage>
              }
            />
            <Route
              path="/settings"
              element={
                <AuthenticatedPage allowedRoles={["USER"]}>
                  <SettingsPage />
                </AuthenticatedPage>
              }
            />
            <Route
              path="/notes"
              element={
                <AuthenticatedPage allowedRoles={["USER"]}>
                  <MyNotesPage />
                </AuthenticatedPage>
              }
            />
            <Route
              path="/notes/:noteId/edit"
              element={
                <AuthenticatedPage allowedRoles={["USER"]}>
                  <NoteEditorPage />
                </AuthenticatedPage>
              }
            />
            <Route
              path="/notes/new"
              element={
                <AuthenticatedPage allowedRoles={["USER"]}>
                  <NoteEditorPage />
                </AuthenticatedPage>
              }
            />

            {/* Fallback Route */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </PageErrorBoundary>
    </BrowserRouter>
  );
};


export default App;
