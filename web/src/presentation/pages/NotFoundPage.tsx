import { ButtonLink } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { paths } from '../routes/paths';

export default function NotFoundPage() {
  useDocumentTitle('No encontrado');
  return (
    <EmptyState title="No encontramos esta página" action={<ButtonLink to={paths.games}>Ver juegos</ButtonLink>}>
      Puede que el enlace esté mal o que se haya borrado.
    </EmptyState>
  );
}
