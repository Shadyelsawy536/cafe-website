import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import OrderTracking from './OrderTracking';
import './index.css';
import './website.css';

const params = new URLSearchParams(window.location.search);
const root = document.getElementById('root')!;

// The current GitHub Pages deployment is the Cafe tenant. Keep explicit
// ?restaurant=<slug> support for other tenants and preserve ?order= tracking.
if (!params.has('restaurant') && !params.has('order')) {
  params.set('restaurant', 'cafe');
}

createRoot(root).render(
  <StrictMode>{params.has('order') ? <OrderTracking /> : <App />}</StrictMode>
);
