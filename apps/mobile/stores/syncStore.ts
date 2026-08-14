/**
 * Sync store — 12_Mobile_App_Spec §4.
 *
 * A thin reactive view over `syncEngine`, so the OfflineBanner and SyncBadge can
 * subscribe without touching the engine directly. The engine owns the state; this
 * store only mirrors it.
 */

import { create } from 'zustand';
import { syncEngine, type SyncOutcome } from '@/lib/sync/syncEngine';

interface SyncState {
  pendingCount: number;
  isSyncing: boolean;
  isConnected: boolean;
  lastSyncAt: Date | null;
  lastOutcome: SyncOutcome | null;

  /** Starts the NetInfo listener. Called once from the root layout. */
  start: () => void;
  stop: () => void;
  /** Manual trigger, for pull-to-refresh and the "Sync now" action. */
  triggerSync: () => Promise<void>;
  refreshPendingCount: () => Promise<void>;
}

/** Curried form — see the note in authStore.ts for why this matters in Zustand v5. */
export const useSyncStore = create<SyncState>()((set) => ({
  pendingCount: 0,
  isSyncing: false,
  isConnected: true,
  lastSyncAt: null,
  lastOutcome: null,

  start() {
    syncEngine.start();

    syncEngine.subscribe((state) => {
      set({
        pendingCount: state.pendingCount,
        isSyncing: state.isSyncing,
        lastSyncAt: state.lastSyncAt,
        lastOutcome: state.lastOutcome,
        isConnected: syncEngine.getIsConnected(),
      });
    });
  },

  stop() {
    syncEngine.stop();
  },

  async triggerSync() {
    await syncEngine.run();
  },

  async refreshPendingCount() {
    await syncEngine.refreshPendingCount();
  },
}));
