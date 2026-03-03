import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useSelector } from 'react-redux';
import AuthenticatedPage from './components/permissions/AuthenticatedPage';
import PublicPage from './components/permissions/PublicPage';
import { RootState } from './store/store';
import { initializeAuth } from './service/auth';

/* Page component imports */
import Landing from './pages/public/Landing';
import Login from './pages/public/Login';
import HomePage from './pages/private/HomePage';
import ProfilePage from './pages/private/ProfilePage';
import MyNotesPage from './pages/private/MyNotesPage';
import NoteEditorPage from './pages/private/NoteEditorPage';

/* Custom CSS */
import './App.css';

const App: React.FC = () => {
  const token = useSelector((state: RootState) => state.auth.token);

  useEffect(() => {
    // Initialize axios headers from persisted Redux state
    initializeAuth(token);
  }, [token]);

  return (
    <BrowserRouter>
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
          path="/profile/:userId"
          element={
            <AuthenticatedPage allowedRoles={["USER"]}>
              <ProfilePage />
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
    </BrowserRouter>
  );
};


export default App;
