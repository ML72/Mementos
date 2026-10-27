import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
  token: string | null;
  userId: string | null;
  email: string | null;
  fullName: string | null;
  accountRoles: string[];
  isAuthenticated: boolean;
}

const initialState: AuthState = {
  token: null,
  userId: null,
  email: null,
  fullName: null,
  accountRoles: [],
  isAuthenticated: false
};

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuth: (
      state,
      action: PayloadAction<{
        token: string;
        userId: string;
        email: string;
        fullName: string;
        accountRoles: string[];
      }>
    ) => {
      state.token = action.payload.token;
      state.userId = action.payload.userId;
      state.email = action.payload.email;
      state.fullName = action.payload.fullName;
      state.accountRoles = action.payload.accountRoles;
      state.isAuthenticated = true;
    },
    clearAuth: (state) => {
      state.token = null;
      state.userId = null;
      state.email = null;
      state.fullName = null;
      state.accountRoles = [];
      state.isAuthenticated = false;
    },
    updateEmail: (state, action: PayloadAction<string>) => {
      state.email = action.payload;
    },
    // A password change or reset revokes the old token and hands out a new one.
    updateToken: (state, action: PayloadAction<string>) => {
      state.token = action.payload;
    }
  }
});

export const { setAuth, clearAuth, updateEmail, updateToken } = authSlice.actions;
export default authSlice.reducer;
