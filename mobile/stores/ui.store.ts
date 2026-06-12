import { create } from 'zustand';

interface UIState {
  drawerOpen: boolean;
  plusSheetOpen: boolean;
  voiceModeOpen: boolean;
  videoModeOpen: boolean;
  webSearchEnabled: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  openPlusSheet: () => void;
  closePlusSheet: () => void;
  openVoiceMode: () => void;
  closeVoiceMode: () => void;
  openVideoMode: () => void;
  closeVideoMode: () => void;
  optionsSheetOpen: boolean;
  openOptionsSheet: () => void;
  closeOptionsSheet: () => void;
  pendingPrompt: string | null;
  setPendingPrompt: (p: string | null) => void;
  toggleWebSearch: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  drawerOpen: false,
  plusSheetOpen: false,
  voiceModeOpen: false,
  videoModeOpen: false,
  webSearchEnabled: true,
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
  openPlusSheet: () => set({ plusSheetOpen: true }),
  closePlusSheet: () => set({ plusSheetOpen: false }),
  openVoiceMode: () => set({ plusSheetOpen: false, voiceModeOpen: true }),
  closeVoiceMode: () => set({ voiceModeOpen: false }),
  openVideoMode: () => set({ plusSheetOpen: false, videoModeOpen: true }),
  closeVideoMode: () => set({ videoModeOpen: false }),
  optionsSheetOpen: false,
  openOptionsSheet: () => set({ optionsSheetOpen: true }),
  closeOptionsSheet: () => set({ optionsSheetOpen: false }),
  pendingPrompt: null,
  setPendingPrompt: (pendingPrompt) => set({ pendingPrompt }),
  toggleWebSearch: () => set((s) => ({ webSearchEnabled: !s.webSearchEnabled })),
}));
