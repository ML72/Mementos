import axios from 'axios';
import { setAuth, clearAuth } from '../store/slices/auth';
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

// Login handler
export const login = async (
  dispatch: any,
  { email, password }: { email: string; password: string }
) => {
  try {
    // Login request
    const res = await axios.post('/api/auth', { email, password });
    const { token } = res.data;

    // Fetch user info using the token
    const userRes = await axios.get('/api/auth', {
      headers: { 'x-auth-token': token }
    });

    const { _id, login, roles, profile } = userRes.data;
    const fullName = profile?.fullName;

    // Set axios default header for future requests
    setAuthHeader(token);

    // Dispatch to Redux store (redux-persist will handle persistence)
    dispatch(
      setAuth({
        token,
        userId: _id,
        email: login?.email,
        fullName,
        accountRoles: roles || ['USER']
      })
    );
    
  setNewAlert(dispatch, { msg: 'Login successful.', alertType: 'success' });
    return true;
  } catch (err: any) {
    setNewAlert(dispatch, {
      msg:
        err?.response?.data?.errors?.[0]?.msg ||
  'Login failed. Please try again.',
      alertType: 'error'
    });
    return false;
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
) => {
  try {
    const res = await axios.post('/api/users', { email, password, fullName });
    const { token } = res.data;

    // Login immediately after registration
    const userRes = await axios.get('/api/auth', {
      headers: { 'x-auth-token': token }
    });

    const { _id, login, roles, profile: returnedProfile } = userRes.data;
    const returnedFullName = returnedProfile?.fullName;

    setAuthHeader(token);

    dispatch(
      setAuth({
        token,
        userId: _id,
        email: login?.email,
        fullName: returnedFullName,
        accountRoles: roles || ['USER']
      })
    );

    setNewAlert(dispatch, { msg: 'Registration successful.', alertType: 'success' });
    return true;
  } catch (err: any) {
    setNewAlert(dispatch, {
      msg: err.response?.data?.errors?.[0]?.msg || 'Registration failed',
      alertType: 'error'
    });
    return false;
  }
};

// Ask for a password reset code to be emailed. The API answers the same way whether or not
// the address is registered, so the only failure surfaced is a validation/network error.
export const requestPasswordReset = async (dispatch: any, email: string): Promise<boolean> => {
  try {
    const res = await axios.post('/api/auth/forgot-password', { email });
    setNewAlert(dispatch, { msg: res.data?.msg || 'If an account exists for that email, a reset code has been sent.', alertType: 'success' });
    return true;
  } catch (err: any) {
    setApiErrorAlert(dispatch, err, 'Could not request a reset code. Please try again.');
    return false;
  }
};

// Redeem an emailed reset code. On success every existing session for the account is signed out
// server-side (including this device's, if any), so the caller should send the user to sign in.
export const resetPassword = async (
  dispatch: any,
  { email, code, password }: { email: string; code: string; password: string }
): Promise<boolean> => {
  try {
    const res = await axios.post('/api/auth/reset-password', { email, code, password });
    setNewAlert(dispatch, { msg: res.data?.msg || 'Password updated. Please sign in.', alertType: 'success' });
    return true;
  } catch (err: any) {
    setApiErrorAlert(dispatch, err, 'Password reset failed. Please try again.');
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
