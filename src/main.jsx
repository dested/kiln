import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.jsx';

/* No StrictMode: the simulation console owns a rAF loop and a single mutable
   World instance, so the intentional double-mount would boot two worlds. */
createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
