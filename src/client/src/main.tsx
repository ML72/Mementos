import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { persistor } from './store/store';

import App from './App';
import { store } from './store/store';
import { setupAxiosInterceptors } from './service/interceptors';
import { handleTokenInvalid } from './service/auth';

// Wire axios once, before anything can issue a request: attach the current token to every
// request, and sign the user out the moment the API reports that token is invalid (expired
// JWT, or one signed with a secret the server no longer uses).
setupAxiosInterceptors({
  getToken: () => store.getState().auth.token,
  onTokenInvalid: () => handleTokenInvalid(store.dispatch)
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
