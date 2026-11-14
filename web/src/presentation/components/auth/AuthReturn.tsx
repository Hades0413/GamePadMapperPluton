import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useUseCases } from '../../di/ServicesContext';
import { useAccount, useSessionSync } from '../../queries/account';

/** Mantiene la sesion al dia y, al volver de GitHub, regresa a la pagina donde estaba el usuario. */
export function AuthReturn() {
  useSessionSync();
  const { takeReturnPath } = useUseCases();
  const { data: account } = useAccount();
  const navigate = useNavigate();

  useEffect(() => {
    if (!account) return;
    const path = takeReturnPath.execute();
    if (path && path !== '/') void navigate(path, { replace: true });
  }, [account, takeReturnPath, navigate]);

  return null;
}
