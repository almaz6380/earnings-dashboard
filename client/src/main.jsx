import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { initApi } from './api.js';
import { nativeStart } from './native.js';
import './styles.css';

// Erst Server-Adresse und Token laden (nur in der App relevant), dann rendern -
// sonst würde die Login-Maske kurz aufblitzen, obwohl man angemeldet ist.
Promise.all([initApi(), nativeStart()]).finally(() => {
  createRoot(document.getElementById('root')).render(<App />);
});
