import { isValidPackage } from '@domain/game/Game';
import { profileFileName, TITLE_MAX } from '@domain/profile/GameProfile';
import { CONF_MAX_BINDINGS, type Binding, type ProfileConfig } from '@domain/profile/conf/ProfileConfig';
import { newBinding, nextFreeKey } from '@domain/profile/conf/editConf';
import { serializeConf } from '@domain/profile/conf/serializeConf';
import { validateConf } from '@domain/profile/conf/validateConf';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { BindingPanel } from '../components/editor/BindingPanel';
import { EditorCanvas } from '../components/editor/EditorCanvas';
import { SettingsPanel } from '../components/editor/SettingsPanel';
import { StartScreen } from '../components/editor/StartScreen';
import { GameIcon } from '../components/profile/GameIcon';
import { Alert, ErrorAlert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { CopyIcon, DownloadIcon, UploadIcon } from '../components/ui/icons';
import { PageSpinner } from '../components/ui/Spinner';
import { useT } from '../i18n/I18nContext';
import { copyText, downloadText } from '../lib/files';
import { buttonLabel, shortLabel } from '../lib/labels';
import { loadDraft, saveDraft, UPLOAD_DRAFT_KEY } from '../lib/sessionDraft';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useAccount } from '../queries/account';
import { useGame } from '../queries/games';
import { useProfile } from '../queries/profiles';
import { paths } from '../routes/paths';

const DRAFT_KEY = 'gpm.editorDraft';
const EMPTY_DRAFT = { conf: '', profileId: '' };

/** Trabajo en curso guardado en esta pestana (sobrevive a recargar la pagina). */
function restore(): { config: ProfileConfig; profileId: string } | null {
  const draft = loadDraft(DRAFT_KEY, EMPTY_DRAFT);
  if (!draft.conf) return null;
  const result = validateConf(draft.conf);
  return result.ok ? { config: result.config, profileId: draft.profileId } : null;
}

export default function EditorPage() {
  const t = useT();
  useDocumentTitle(t('Editor visual'));
  const [params] = useSearchParams();
  const perfilId = params.get('perfil');
  const profile = useProfile(perfilId ?? undefined);
  const draft = restore();

  let body;
  if (perfilId && draft?.profileId === perfilId) {
    body = <Editor key={perfilId} initial={draft.config} originId={perfilId} />;
  } else if (perfilId) {
    if (profile.isPending) body = <PageSpinner />;
    else if (profile.error) body = <ErrorAlert error={profile.error} onRetry={() => void profile.refetch()} />;
    else if (!profile.data) body = <Alert tone="error">{t('No encontramos ese perfil.')}</Alert>;
    else {
      const result = validateConf(profile.data.conf);
      body = result.ok
        ? <Editor key={perfilId} initial={result.config} originId={perfilId} />
        : <Editor key="invalido" initial={null} originId={null} notice={t('El perfil de la comunidad no se pudo abrir: {error}', { error: result.error })} />;
    }
  } else {
    body = <Editor key="libre" initial={draft?.config ?? null} originId={draft?.profileId || null} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('Editor visual')}</h1>
        <p className="mt-1 text-muted">{t('Crea o ajusta un perfil desde el ordenador: arrastra los botones sobre la pantalla del juego y descarga el .conf.')}</p>
      </div>
      {body}
    </div>
  );
}

function Editor({
  initial, originId, notice = null,
}: { initial: ProfileConfig | null; originId: string | null; notice?: string | null }) {
  const t = useT();
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const [config, setConfig] = useState<ProfileConfig | null>(initial);
  const [origin, setOrigin] = useState(originId);
  const [selected, setSelected] = useState<number | null>(initial && initial.bindings.length > 0 ? 0 : null);
  const [overGame, setOverGame] = useState(true);
  const [copied, setCopied] = useState(false);

  const text = useMemo(() => (config ? serializeConf(config) : ''), [config]);
  const result = useMemo(() => (config ? validateConf(text) : null), [config, text]);
  const game = useGame(config && isValidPackage(config.packageName) ? config.packageName : undefined);
  const community = useProfile(origin ?? undefined);
  const { data: account } = useAccount();

  // Guarda el trabajo (solo si es valido) para no perderlo al recargar.
  useEffect(() => {
    if (config && result?.ok) saveDraft(DRAFT_KEY, { conf: text, profileId: origin ?? '' });
  }, [config, result, text, origin]);

  if (!config || !result) {
    return <StartScreen notice={notice} onStart={(c) => { setConfig(c); setSelected(c.bindings.length > 0 ? 0 : null); }} />;
  }

  const background = overGame ? (game.data?.backgroundUrl ?? null) : null;
  const sel = selected !== null ? config.bindings[selected] : undefined;
  const setBindings = (bindings: readonly Binding[]) => setConfig({ ...config, bindings });
  const replace = (index: number, b: Binding) => setBindings(config.bindings.map((x, i) => (i === index ? b : x)));
  const remove = (index: number) => {
    setBindings(config.bindings.filter((_, i) => i !== index));
    setSelected(config.bindings.length > 1 ? Math.min(index, config.bindings.length - 2) : null);
  };
  const add = () => {
    setBindings([...config.bindings, newBinding(nextFreeKey(config.bindings), config.screen)]);
    setSelected(config.bindings.length);
  };
  const reset = () => {
    saveDraft(DRAFT_KEY, null);
    setConfig(null);
    setOrigin(null);
    setSelected(null);
    setParams({}, { replace: true });
  };

  const title = (config.name ?? '').slice(0, TITLE_MAX);
  const fileName = profileFileName({ packageName: config.packageName, title });
  const valid = result.ok;
  const normalized = result.ok ? result.normalized : text;
  const owned = !!origin && !!community.data && !!account && community.data.author?.id === account.id
    && community.data.packageName === config.packageName;

  const publish = () => {
    const prev = loadDraft(UPLOAD_DRAFT_KEY, { conf: '', packageName: '', gameName: '', title: '', description: '', deviceModel: '' });
    saveDraft(UPLOAD_DRAFT_KEY, { ...prev, conf: normalized, packageName: config.packageName, title: prev.packageName === config.packageName ? prev.title : title });
    void navigate(paths.upload(config.packageName));
  };
  const saveChanges = () => {
    if (!origin) return;
    saveDraft(`gpm.editFromApp.${origin}`, { conf: normalized, model: community.data?.deviceModel ?? '' });
    void navigate(paths.editProfile(origin));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <GameIcon name={game.data?.name ?? config.packageName} iconUrl={game.data?.iconUrl ?? null} size={40} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{game.data?.name ?? config.packageName}</p>
            <p className="truncate text-xs text-muted">
              <span className="font-mono">{config.packageName}</span> · {t('pantalla {w}×{h}', { w: config.screen.width, h: config.screen.height })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {game.data?.backgroundUrl && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-primary" checked={overGame} onChange={(e) => setOverGame(e.target.checked)} />
              {t('Sobre el juego')}
            </label>
          )}
          <Button variant="ghost" size="sm" onClick={reset}>{t('Empezar de nuevo')}</Button>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-3">
          <EditorCanvas config={config} background={background} selected={selected} onSelect={setSelected}
            onChange={replace} onDelete={remove} />
          <p className="text-xs text-muted">
            {t('Arrastra los círculos con el ratón o el dedo. Con el teclado: flechas para mover (Mayús = pasos grandes) y Supr para borrar.')}
            {' '}{t('Morado: botones · Amarillo: capas (mantener otro botón) · Turquesa: joystick, cámara y deslizar.')}
            {background && ` ${t('La captura del juego es orientativa.')}`}
          </p>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('Botones del perfil')}>
            {config.bindings.map((b, i) => (
              <button key={`${i}:${b.key}`} type="button" aria-pressed={i === selected} onClick={() => setSelected(i)}
                title={buttonLabel(b.key, t)}
                className={`rounded-lg border px-2.5 py-1 font-mono text-xs ${i === selected ? 'border-primary bg-primary/15 text-ink' : 'border-line text-muted hover:text-ink'}`}>
                {b.modifier ? `${shortLabel(b.modifier)}+${shortLabel(b.button)}` : shortLabel(b.button)}
              </button>
            ))}
            <Button size="sm" variant="secondary" onClick={add} disabled={config.bindings.length >= CONF_MAX_BINDINGS}>
              + {t('Añadir botón')}
            </Button>
          </div>
        </div>

        <aside className="card p-4 lg:sticky lg:top-20" aria-label={t('Botón seleccionado')}>
          {sel && selected !== null
            ? <BindingPanel key={selected} binding={sel} screen={config.screen} onChange={(b) => replace(selected, b)} onDelete={() => remove(selected)} />
            : <p className="text-sm text-muted">{t('Selecciona un botón del dibujo o de la lista, o añade uno nuevo.')}</p>}
        </aside>
      </div>

      <section className="card space-y-3 p-4" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{t('Comprobación')}</h2>
          <span className="text-sm text-muted">{t('{n} botones', { n: config.bindings.length })}</span>
        </div>
        {result.ok
          ? <p className="text-sm text-success">{t('El perfil es válido.')}</p>
          : <Alert tone="error">{result.error}</Alert>}
        {!isValidPackage(config.packageName) && <Alert tone="warning">{t('El paquete del juego no es válido (ejemplo: com.empresa.juego).')}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button icon={<DownloadIcon />} disabled={!valid} onClick={() => downloadText(fileName, normalized + '\n')}>
            {t('Descargar .conf')}
          </Button>
          <Button variant="secondary" icon={<CopyIcon />} disabled={!valid} onClick={() => {
            void copyText(normalized).then((ok) => {
              setCopied(ok);
              if (ok) setTimeout(() => setCopied(false), 2000);
            });
          }}>
            {copied ? t('¡Copiado!') : t('Copiar')}
          </Button>
          <Button variant="secondary" icon={<UploadIcon />} disabled={!valid} onClick={publish}>
            {t('Publicar en la comunidad')}
          </Button>
          {owned && (
            <Button variant="secondary" disabled={!valid} onClick={saveChanges}>{t('Guardar cambios')}</Button>
          )}
        </div>
        <details>
          <summary className="cursor-pointer text-sm text-muted">{t('Ver el texto del perfil')}</summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded-xl border border-line bg-surface p-3 text-xs">{text}</pre>
        </details>
      </section>

      <section className="card p-4">
        <SettingsPanel config={config} onChange={setConfig} />
      </section>
    </div>
  );
}
