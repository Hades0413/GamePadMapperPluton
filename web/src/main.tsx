import { createServices } from '@app/container';
import { readEnv } from '@infrastructure/config/env';
import { App, ConfigError } from '@presentation/App';
import '@presentation/styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

/** La web no se muestra dentro de otra (clickjacking): GitHub Pages no deja enviar X-Frame-Options. */
function isFramed(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function start(root: ReturnType<typeof createRoot>) {
  if (isFramed()) {
    root.render(<ConfigError title="Abre esta web directamente" message="Por seguridad no se puede usar dentro de otra página." />);
    return;
  }
  try {
    const env = readEnv();
    const basename = env.basePath.replace(/\/$/, '') || '/';
    root.render(
      <StrictMode>
        <App services={createServices(env)} basename={basename} />
      </StrictMode>,
    );
  } catch (error) {
    root.render(<ConfigError message={error instanceof Error ? error.message : String(error)} />);
  }
}

start(createRoot(document.getElementById('root') as HTMLElement));
