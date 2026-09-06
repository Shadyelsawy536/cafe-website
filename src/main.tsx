import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './website.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>
);
