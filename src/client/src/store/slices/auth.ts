import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
  token: string | null;
  userId: string | null;
  email: string | null;
  accountRoles: string[];
  isAuthenticated: boolean;
}

const initialState: AuthState = {
  token: null,
  userId: null,
  email: null,
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
        accountRoles: string[];
      }>
    ) => {
      state.token = action.payload.token;
      state.userId = action.payload.userId;
      state.email = action.payload.email;
      state.accountRoles = action.payload.accountRoles;
      state.isAuthenticated = true;
    },
    clearAuth: (state) => {
      state.token = null;
      state.userId = null;
      state.email = null;
      state.accountRoles = [];
      state.isAuthenticated = false;
    },
    updateEmail: (state, action: PayloadAction<string>) => {
      state.email = action.payload;
    }
  }
});

export const { setAuth, clearAuth, updateEmail } = authSlice.actions;
export default authSlice.reducer;
