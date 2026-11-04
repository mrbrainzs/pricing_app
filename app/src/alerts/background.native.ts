import { isAlertCheckDue } from '@pricing/core';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { configuredSource } from '@/data/source';

import { runAlertCheck } from './check';
import { readAlerts } from './store';

/**
 * Daily alert check in the background (expo-background-task: WorkManager on Android,
 * BGTaskScheduler on iOS). The OS decides when it runs: the interval is only a minimum, iOS may
 * run it much later (often overnight or when charging), and neither runs it after the user
 * force-quits the app (iOS) or while battery saver / background restrictions apply. It never
 * runs in Expo Go or on the iOS simulator. Opening the app always checks too.
 */
const TASK = 'quinsuper-price-alerts';
const MINIMUM_INTERVAL_MINUTES = 6 * 60;

// Defined when the bundle loads: when the OS starts the app in the background, no screen is mounted.
TaskManager.defineTask(TASK, async () => {
  try {
    const { alerts, lastCheckedAt } = await readAlerts();
    // Nothing new until the next daily update: skip the catalogue download.
    if (!alerts.length || !isAlertCheckDue(lastCheckedAt, new Date())) return BackgroundTask.BackgroundTaskResult.Success;
    const catalog = await configuredSource().load();
    if (!catalog.isSample) await runAlertCheck(catalog);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Registers the background check while there are alerts, and removes it when there are none. */
export async function syncBackgroundCheck(enabled: boolean): Promise<void> {
  try {
    if (enabled) await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: MINIMUM_INTERVAL_MINUTES });
    else if (await TaskManager.isTaskRegisteredAsync(TASK)) await BackgroundTask.unregisterTaskAsync(TASK);
  } catch {
    // Unavailable here (Expo Go, restricted by the user): alerts are still checked when the app opens.
  }
}
