import axios from 'axios';
import { setAuth, clearAuth } from '../store/slices/auth';
import { setNewAlert } from './alert';
import { store } from '../store/store';

// Set up axios interceptor to dynamically attach token from store
axios.interceptors.request.use((config) => {
  const token = store.getState().auth.token;
  if (token) {
    config.headers['x-auth-token'] = token;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

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

const { _id, login, roles, fullName } = userRes.data;

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

    const { _id, login, roles, fullName: returnedFullName } = userRes.data;

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
