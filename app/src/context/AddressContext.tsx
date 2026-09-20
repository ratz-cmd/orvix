import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  resolveAddressConfig,
  type AddressConfig,
} from '../services/addressResolver';

type AddressContextValue = {
  config: AddressConfig | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
};

const AddressContext = createContext<AddressContextValue | null>(null);

export function AddressProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AddressConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const next = await resolveAddressConfig();
      setConfig(next);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AddressContext.Provider value={{ config, isLoading, refresh: load }}>
      {children}
    </AddressContext.Provider>
  );
}

export function useAddress(): AddressContextValue {
  const ctx = useContext(AddressContext);
  if (!ctx) {
    throw new Error('useAddress must be used inside <AddressProvider>');
  }
  return ctx;
}
