import axios from 'axios';
import { setAuth, clearAuth, updateToken } from '../store/slices/auth';
import { setNewAlert, setApiErrorAlert } from './alert';
// The axios request/response interceptors live in ./interceptors.ts and are installed in main.tsx.

// Helper function to set axios auth header (legacy, now handled by interceptor but kept for compatibility)
const setAuthHeader = (token: string) => {
  axios.defaults.headers.common['x-auth-token'] = token;
};

// Helper function to remove axios auth header (legacy, now handled by interceptor but kept for compatibility)
const removeAuthHeader = () => {
  delete axios.defaults.headers.common['x-auth-token'];
};

// What a sign-in attempt can lead to: a session, nothing, or the code-entry page.
export type SignInOutcome = 'signed-in' | 'needs-verification' | 'failed';

// Shared tail of login, registration, verification and password reset: load the profile for a
// fresh token and put the session in the store (redux-persist handles persistence).
const completeSignIn = async (dispatch: any, token: string) => {
  // Store the token first: the request interceptor stamps the store's token on every request,
  // and a password reset made while signed in has just revoked the old one.
  dispatch(updateToken(token));
  const userRes = await axios.get('/api/auth', {
    headers: { 'x-auth-token': token }
  });
  const { _id, login, roles, profile } = userRes.data;

  setAuthHeader(token);
  dispatch(
    setAuth({
      token,
      userId: _id,
      email: login?.email,
      fullName: profile?.fullName,
      accountRoles: roles || ['USER']
    })
  );
};

// Login handler
export const login = async (
  dispatch: any,
  { email, password }: { email: string; password: string }
): Promise<SignInOutcome> => {
  try {
    const res = await axios.post('/api/auth', { email, password });
    await completeSignIn(dispatch, res.data.token);
    setNewAlert(dispatch, { msg: 'Login successful.', alertType: 'success' });
    return 'signed-in';
  } catch (err: any) {
    // Right password, unverified address: the API has (re)sent a code.
    if (err?.response?.data?.email_unverified) {
      setNewAlert(dispatch, { msg: 'Please verify your email. We sent you a code.', alertType: 'info' });
      return 'needs-verification';
    }
    setApiErrorAlert(dispatch, err, 'Login failed. Please try again.');
    return 'failed';
  }
};

// Logout handler
export const logout = (dispatch: any, displaySuccessAlert: boolean = true) => {
  // Remove axios default header
  removeAuthHeader();

  // Clear Redux store (redux-persist will handle persistence)
  dispatch(clearAuth());

  // Show logout success alert
  if (displaySuccessAlert) {
  setNewAlert(dispatch, { msg: 'Logged out.', alertType: 'success' });
  }
};

// Register handler
export const register = async (
  dispatch: any,
  {
    email,
    password,
    fullName
  }: {
    email: string;
    password: string;
    fullName: string;
  }
): Promise<SignInOutcome> => {
  try {
    const res = await axios.post('/api/users', { email, password, fullName });
    if (res.data.verificationRequired) {
      setNewAlert(dispatch, { msg: 'Account created. We emailed you a verification code.', alertType: 'success' });
      return 'needs-verification';
    }

    // Verification is switched off on this server: registration signs in directly.
    await completeSignIn(dispatch, res.data.token);
    setNewAlert(dispatch, { msg: 'Registration successful.', alertType: 'success' });
    return 'signed-in';
  } catch (err: any) {
    setApiErrorAlert(dispatch, err, 'Registration failed');
    return 'failed';
  }
};

// Redeem the emailed verification code; success verifies the account and signs in.
export const verifyEmail = async (
  dispatch: any,
  { email, code }: { email: string; code: string }
): Promise<boolean> => {
  try {
    const res = await axios.post('/api/auth/verify-email', { email, code });
    await completeSignIn(dispatch, res.data.token);
    setNewAlert(dispatch, { msg: 'Email verified. Welcome!', alertType: 'success' });
    return true;
  } catch (err: any) {
    setApiErrorAlert(dispatch, err, 'Verification failed. Please try again.');
    return false;
  }
};

// Ask for a fresh verification code. The API answers the same way whatever the address is.
export const resendVerification = async (dispatch: any, email: string): Promise<boolean> => {
  try {
    const res = await axios.post('/api/auth/resend-verification', { email });
    setNewAlert(dispatch, { msg: res.data?.msg || 'A new code has been sent.', alertType: 'success' });
    return true;
  } catch (err: any) {
    setApiErrorAlert(dispatch, err, 'Could not send a new code. Please try again.');
    return false;
  }
};

// Ask for a password reset code. The API answers the same way whatever the address is.
export const forgotPassword = async (dispatch: any, email: string): Promise<boolean> => {
  try {
    const res = await axios.post('/api/auth/forgot-password', { email });
    setNewAlert(dispatch, { msg: res.data?.msg || 'A reset code has been sent.', alertType: 'success' });
    return true;
  } catch (err: any) {
    setApiErrorAlert(dispatch, err, 'Could not send a reset code. Please try again.');
    return false;
  }
};

// Redeem a reset code and set a new password. Signs in, and signs every other session out.
export const resetPassword = async (
  dispatch: any,
  { email, code, password }: { email: string; code: string; password: string }
): Promise<boolean> => {
  try {
    const res = await axios.post('/api/auth/reset-password', { email, code, password });
    await completeSignIn(dispatch, res.data.token);
    setNewAlert(dispatch, { msg: 'Password reset. You are signed in, and signed out everywhere else.', alertType: 'success' });
    return true;
  } catch (err: any) {
    setApiErrorAlert(dispatch, err, 'Could not reset your password. Please try again.');
    return false;
  }
};

// Change the signed-in user's password. The API revokes every session's token, this one's
// included, and returns a fresh token for this session.
export const changePassword = async (
  dispatch: any,
  { currentPassword, newPassword }: { currentPassword: string; newPassword: string }
): Promise<boolean> => {
  try {
    const res = await axios.post('/api/auth/change-password', { currentPassword, newPassword });
    dispatch(updateToken(res.data.token));
    setNewAlert(dispatch, { msg: 'Password changed. Your other sessions have been signed out.', alertType: 'success' });
    return true;
  } catch (err: any) {
    setApiErrorAlert(dispatch, err, 'Could not change your password. Please try again.');
    return false;
  }
};

// Handles token invalidation: shows alert and logs out

export const handleTokenInvalid = (dispatch: any, msg?: string) => {
  setNewAlert(dispatch, {
    msg: (msg || 'Your login has expired. Please log in again.') + (msg && !msg.trim().endsWith('.') ? '.' : ''),
    alertType: 'error'
  });
  logout(dispatch, false);
}

// Initialize auth state from persisted store
export const initializeAuth = (token: string | null) => {
  if (token) {
    setAuthHeader(token);
  }
};
