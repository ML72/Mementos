import { configureStore } from '@reduxjs/toolkit';
import { combineReducers } from 'redux';
import storage from 'redux-persist/lib/storage';
import { persistReducer, persistStore, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER, KEY_PREFIX } from 'redux-persist';

import { uiSlice } from "./slices/ui";
import { authSlice } from "./slices/auth";

const combinedReducer = combineReducers({
    [uiSlice.name]: uiSlice.reducer,
    [authSlice.name]: authSlice.reducer
});

const persistConfig = {
  key: 'mementos-root',
  whitelist: ['auth'], // Only persist auth slice
  storage
}

// The localStorage key the persisted state lives under. Every tab shares it; see
// service/session_sync.ts.
export const PERSIST_STORAGE_KEY = `${KEY_PREFIX}${persistConfig.key}`;

const persistedReducer = persistReducer(persistConfig, combinedReducer);

export const store = configureStore({
  reducer: persistedReducer,
  devTools: true,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

export const persistor = persistStore(store);

// Export RootState type for use in selectors
export type RootState = ReturnType<typeof store.getState>;