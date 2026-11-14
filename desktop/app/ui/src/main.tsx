import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ProveedorI18n } from './i18n/contexto';
import './estilos.css';

const raiz = document.getElementById('root');
if (!raiz) throw new Error('falta #root');

createRoot(raiz).render(
  <StrictMode>
    <ProveedorI18n>
      <App />
    </ProveedorI18n>
  </StrictMode>,
);
