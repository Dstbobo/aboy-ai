import { create } from 'zustand';

interface UIState {
  drawerOpen: boolean;
  plusSheetOpen: boolean;
  webSearchEnabled: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  openPlusSheet: () => void;
  closePlusSheet: () => void;
  toggleWebSearch: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  drawerOpen: false,
  plusSheetOpen: false,
  webSearchEnabled: true,
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
  openPlusSheet: () => set({ plusSheetOpen: true }),
  closePlusSheet: () => set({ plusSheetOpen: false }),
  toggleWebSearch: () => set((s) => ({ webSearchEnabled: !s.webSearchEnabled })),
}));
