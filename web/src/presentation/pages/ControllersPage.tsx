import type { ControllerMapping } from '@domain/controller/ControllerMapping';
import { parseSdlLine, sdlFields, SDL_ERROR_MESSAGE, SDL_MAX_BYTES } from '@domain/controller/sdlMapping';
import { useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { RequireAccount } from '../components/auth/RequireAccount';
import { MappingFields, MappingLine, StatusBadge } from '../components/controllers/MappingParts';
import { Alert, ErrorAlert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { SearchIcon } from '../components/ui/icons';
import { PageSpinner } from '../components/ui/Spinner';
import { useI18n } from '../i18n/I18nContext';
import { errorMessage } from '../lib/errorMessage';
import { MAPPING_DRAFT_KEY, readMappingLink } from '../lib/mappingLink';
import { saveDraft } from '../lib/sessionDraft';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useFormat } from '../lib/useFormat';
import { useApprovedMappings, useDeleteMapping, useMyMappings, useSubmitMapping } from '../queries/controllers';

/** Un mando aprobado: nombre, plataforma y fecha; al abrirlo, sus controles y la linea. */
function MappingItem({ item }: { item: ControllerMapping }) {
  const { formatDate } = useFormat();
  const fields = useMemo(() => sdlFields(item.mapping), [item.mapping]);
  return (
    <li>
      <details className="card group p-4">
        <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
          <span className="min-w-0 font-medium break-words">{item.name}</span>
          <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted">{item.platform}</span>
          <span className="text-xs text-muted">{formatDate(item.createdAt)}</span>
          {item.author && <span className="text-xs text-muted">· {item.author.username}</span>}
        </summary>
        <div className="mt-3 space-y-3">
          <p className="font-mono text-xs break-all text-muted">GUID {item.guid}</p>
          <MappingFields fields={fields} />
          <MappingLine mapping={item.mapping} />
        </div>
      </details>
    </li>
  );
}

function ApprovedList() {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search.trim());
  const list = useApprovedMappings(deferred);
  return (
    <section className="space-y-4" aria-labelledby="aprobados">
      <h2 id="aprobados" className="text-xl font-semibold">{t('Mandos reconocidos')}</h2>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input type="search" className="input pl-9" placeholder={t('Buscar por nombre o GUID…')}
          aria-label={t('Buscar mando')} maxLength={40} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {list.isPending ? <PageSpinner /> : list.error ? <ErrorAlert error={list.error} onRetry={() => void list.refetch()} /> :
        list.data.length === 0 ? (
          <EmptyState title={deferred ? t('Ningún mando con ese nombre') : t('Todavía no hay mandos aprobados')} />
        ) : (
          <ul className="space-y-2">
            {list.data.map((m) => <MappingItem key={m.id} item={m} />)}
          </ul>
        )}
    </section>
  );
}

/** Formulario con validacion en vivo y vista previa de los controles. */
function SubmitForm({ initial, focus }: { initial: string; focus: boolean }) {
  const { t } = useI18n();
  const [line, setLine] = useState(initial);
  const [sent, setSent] = useState(false);
  const submit = useSubmitMapping();
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!focus) return;
    ref.current?.scrollIntoView({ block: 'center' });
    ref.current?.focus({ preventScroll: true });
  }, [focus]);
  const parsed = useMemo(() => (line.trim() ? parseSdlLine(line) : null), [line]);
  const change = (value: string) => {
    setLine(value);
    setSent(false);
    submit.reset();
    saveDraft(MAPPING_DRAFT_KEY, value ? { line: value } : null);
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!parsed?.ok) return;
    submit.mutate(line, {
      onSuccess: () => {
        setLine('');
        setSent(true);
        saveDraft(MAPPING_DRAFT_KEY, null);
      },
    });
  };
  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-4">
      <label className="block space-y-2">
        <span className="text-sm font-medium">{t('Línea SDL del mando')}</span>
        <textarea ref={ref} className="input min-h-28 font-mono text-xs break-all" spellCheck={false} autoComplete="off"
          maxLength={SDL_MAX_BYTES * 2} value={line} onChange={(e) => change(e.target.value)}
          placeholder="03000000c82d00000161000000000000,8BitDo SN30 Pro,a:b1,b:b0,…,platform:Linux," />
      </label>
      {parsed && !parsed.ok && (
        <Alert tone="warning">{t(SDL_ERROR_MESSAGE[parsed.code], { key: parsed.key ?? '' })}</Alert>
      )}
      {parsed?.ok && (
        <div className="space-y-3">
          <p className="text-sm">
            <span className="font-medium break-words">{parsed.value.name}</span>
            <span className="text-muted"> · {parsed.value.platform} · {t('{n} controles', { n: parsed.value.fields.length })}</span>
          </p>
          <p className="font-mono text-xs break-all text-muted">GUID {parsed.value.guid}</p>
          <MappingFields fields={parsed.value.fields} />
        </div>
      )}
      {submit.error && <Alert tone="error">{errorMessage(submit.error)}</Alert>}
      {sent && <Alert tone="success">{t('Enviado. Pendiente de revisión: aparecerá en la lista cuando lo apruebe la moderación.')}</Alert>}
      <div className="flex justify-end">
        <Button type="submit" loading={submit.isPending} disabled={!parsed?.ok}>{t('Enviar mando')}</Button>
      </div>
    </form>
  );
}

function MySubmissions() {
  const { t } = useI18n();
  const { formatDate } = useFormat();
  const mine = useMyMappings();
  const remove = useDeleteMapping();
  if (mine.isPending) return null;
  if (mine.error) return <ErrorAlert error={mine.error} onRetry={() => void mine.refetch()} />;
  return (
    <section className="space-y-3" aria-labelledby="mis-envios">
      <h3 id="mis-envios" className="font-semibold">{t('Mis envíos')}</h3>
      {remove.error && <Alert tone="error">{errorMessage(remove.error)}</Alert>}
      {mine.data.length === 0 ? <p className="text-sm text-muted">{t('Aún no has enviado ningún mando.')}</p> : (
        <ul className="space-y-2">
          {mine.data.map((m) => (
            <li key={m.id} className="card flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <span className="min-w-0 font-medium break-words">{m.name}</span>
                <span className="text-xs text-muted">{m.platform} · {formatDate(m.createdAt)}</span>
                <StatusBadge status={m.status} />
              </div>
              {m.status !== 'approved' && (
                <Button size="sm" variant="ghost" loading={remove.isPending && remove.variables === m.id}
                  onClick={() => remove.mutate(m.id)}>{t('Borrar')}</Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function ControllersPage() {
  const { t, tr } = useI18n();
  useDocumentTitle(t('Mandos de la comunidad'), t('Mandos que reconoce la app de escritorio, compartidos por la comunidad.'));
  // El enlace de la app (#linea=...) se lee una sola vez y se quita de la barra de direcciones.
  const [link] = useState(readMappingLink);
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (link.fromLink) sectionRef.current?.scrollIntoView({ block: 'start' });
  }, [link.fromLink]);

  return (
    <div className="min-w-0 space-y-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{t('Mandos de la comunidad')}</h1>
        <p className="text-muted">
          {tr('Estos son los mandos que la app de escritorio (Linux y Windows) reconoce gracias a la comunidad. Si tu mando no aparece, configúralo en la app y pulsa <b>«Exportar SDL»</b> para obtener su línea.')}
        </p>
        <p className="text-sm text-muted">
          {t('Los envíos quedan vinculados a tu nombre de usuario de GitHub y solo se publican después de que los revise la moderación.')}
        </p>
      </div>

      <ApprovedList />

      <section ref={sectionRef} id="enviar" className="scroll-mt-24 space-y-4" aria-labelledby="enviar-titulo">
        <h2 id="enviar-titulo" className="text-xl font-semibold">{t('Enviar un mando')}</h2>
        <RequireAccount reason={link.fromLink
          ? t('Inicia sesión con GitHub para enviarlo. Guardaremos la línea mientras tanto.')
          : t('Para enviar un mando hace falta iniciar sesión con GitHub.')}>
          {() => (
            <div className="space-y-6">
              {link.fromLink && (
                <Alert tone="info">{t('La línea que llegó desde la app ya está en el formulario. Revísala antes de enviarla.')}</Alert>
              )}
              <SubmitForm initial={link.line} focus={link.fromLink} />
              <MySubmissions />
            </div>
          )}
        </RequireAccount>
      </section>
    </div>
  );
}
