import { createContext, use, type ReactNode } from 'react';
import type { Services } from './Services';

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <ServicesContext value={services}>{children}</ServicesContext>;
}

export function useServices(): Services {
  const services = use(ServicesContext);
  if (!services) throw new Error('useServices fuera de ServicesProvider');
  return services;
}

export const useUseCases = () => useServices().useCases;
export const useLinks = () => useServices().links;
