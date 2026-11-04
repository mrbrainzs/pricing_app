import type { Notifier } from './notify.types';

/** Web: no browser push. Price drops show in the app (alerts screen and list banner) instead. */
export const notifier: Notifier = {
  supported: false,
  getPermission: async () => 'unsupported',
  requestPermission: async () => 'unsupported',
  show: async () => {},
  openSettings: () => {},
  useTaps: () => {},
};
