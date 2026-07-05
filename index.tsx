import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import PublicBookViewerPage from './components/book/PublicBookViewerPage';
import { installClientErrorReporting } from './lib/clientErrorTelemetry';
import { parseBookRouteFromLocation } from './lib/bookShare';

installClientErrorReporting();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const publicBookId = parseBookRouteFromLocation(window.location);

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      {publicBookId ? <PublicBookViewerPage bookId={publicBookId} /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>
);
