import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { NavDrawer } from '@/components/NavDrawer';

interface NavDrawerContextValue {
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

// Safe no-op default so useNavDrawer() never throws if a component using it is
// ever rendered outside the provider (e.g. a header in an isolated preview).
const NavDrawerContext = createContext<NavDrawerContextValue>({
  open: false,
  openDrawer: () => {},
  closeDrawer: () => {},
});

/**
 * Owns the slide-out navigation drawer's open state and renders the single
 * NavDrawer instance. Mounted once near the app root so any screen's header can
 * open the drawer via useNavDrawer(), without threading props through the tree.
 */
export function NavDrawerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);
  const value = useMemo(
    () => ({ open, openDrawer, closeDrawer }),
    [open, openDrawer, closeDrawer],
  );

  return (
    <NavDrawerContext.Provider value={value}>
      {children}
      <NavDrawer visible={open} onClose={closeDrawer} />
    </NavDrawerContext.Provider>
  );
}

export function useNavDrawer() {
  return useContext(NavDrawerContext);
}
