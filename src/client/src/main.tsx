import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { persistor } from './store/store';

import App from './App';
import { store, PERSIST_STORAGE_KEY } from './store/store';
import { replaceAuth } from './store/slices/auth';
import { setupAxiosInterceptors } from './service/interceptors';
import { adoptNewerSession, setupSessionSync, SessionSyncDeps } from './service/session_sync';
import { handleTokenInvalid } from './service/auth';
import { setNewAlert } from './service/alert';

// Every tab shares one saved session: follow it, so signing in, signing out or a new token in one
// tab reaches the others too.
const session: SessionSyncDeps = {
  storageKey: PERSIST_STORAGE_KEY,
  // Reading localStorage throws when the browser blocks storage for the site; nothing is shared then.
  readSaved: () => {
    try {
      return window.localStorage.getItem(PERSIST_STORAGE_KEY);
    } catch {
      return null;
    }
  },
  getSession: () => store.getState().auth,
  adoptSession: (auth) => store.dispatch(replaceAuth(auth)),
  onSignedOutElsewhere: () =>
    setNewAlert(store.dispatch, { msg: 'You were signed out in another tab.', alertType: 'info' })
};
setupSessionSync(session, window);

// Wire axios once, before anything can issue a request: attach the current token to every
// request, and sign the user out the moment the API reports that token is invalid (expired
// JWT, one signed with a secret the server no longer uses, or a password changed since) —
// unless another tab has saved a newer session, which signing out would erase.
setupAxiosInterceptors({
  getToken: () => store.getState().auth.token,
  onTokenInvalid: (msg) => {
    if (!adoptNewerSession(session)) handleTokenInvalid(store.dispatch, msg);
  }
});

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <App />
      </PersistGate>
    </Provider>
  </React.StrictMode>
);
