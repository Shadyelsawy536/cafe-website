import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import OrderTracking from './OrderTracking';
import './index.css';
import './website.css';

const params = new URLSearchParams(window.location.search);
const root = document.getElementById('root')!;

createRoot(root).render(
  <StrictMode>{params.has('order') ? <OrderTracking /> : <App />}</StrictMode>
);
