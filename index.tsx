import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import PublicBookViewerPage from './components/book/PublicBookViewerPage';
import { parseBookRouteFromLocation } from './lib/bookShare';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const publicBookId = parseBookRouteFromLocation(window.location);

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {publicBookId ? <PublicBookViewerPage bookId={publicBookId} /> : <App />}
  </React.StrictMode>
);
