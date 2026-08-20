import {
  getAssetsAsync,
  requestPermissionsAsync,
  getAssetInfoAsync,
  addListener,
  SortBy,
  MediaType,
} from "expo-media-library/legacy";
import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";
import { uploadFileToVPS, fetchFilesList, STORAGE_KEYS, getWifiOnlySyncSetting, getSyncIntervalSetting } from "./api";

export interface SyncProgressStatus {
  isSyncing: boolean;
  totalNew: number;
  uploadedCount: number;
  statusText: string;
  currentFileName?: string;
  currentFileSizeMb?: string;
  currentFileProgress?: number; // 0 to 100%
}

const BACKGROUND_PHOTO_SYNC_TASK = "R2_BACKGROUND_PHOTO_SYNC_TASK";
const NOTIFICATION_CHANNEL_ID = "r2sync_photo_backup";
const NOTIFICATION_ID = "r2sync_photo_progress";

// Configure Notification Handler for Foreground & Background
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function setupNotificationChannel() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
      name: "Foto- & Video-Backup",
      importance: Notifications.AndroidImportance.DEFAULT,
      showBadge: false,
      lightColor: "#F38020",
    });

    await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
      android: {},
    });
  }
}

async function showProgressNotification(title: string, body: string, isFinished = false) {
  try {
    await setupNotificationChannel();
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: {
        title,
        body,
        sound: false,
        priority: Notifications.AndroidNotificationPriority.DEFAULT,
        sticky: !isFinished,
        autoDismiss: isFinished,
        ...(Platform.OS === "android" ? { channelId: NOTIFICATION_CHANNEL_ID } : {}),
      },
      trigger: null,
    });

    if (isFinished) {
      setTimeout(async () => {
        await Notifications.dismissNotificationAsync(NOTIFICATION_ID).catch(() => {});
      }, 5000);
    }
  } catch (err) {
    console.warn("[PhotoSync Notification Error]", err);
  }
}

export async function requestMediaPermissions(): Promise<boolean> {
  try {
    const res = await requestPermissionsAsync();
    return res.status === "granted";
  } catch (err) {
    console.warn("Media permissions request error:", err);
    return false;
  }
}

export function subscribeToMediaChanges(onChange: () => void): { remove: () => void } {
  try {
    if (typeof addListener === "function") {
      return addListener(() => {
        onChange();
      });
    }
  } catch (err) {
    console.warn("addListener error:", err);
  }
  return { remove: () => {} };
}

// ----------------------------------------------------
// EXPO TASK MANAGER: Background Sync Registration
// ----------------------------------------------------
TaskManager.defineTask(BACKGROUND_PHOTO_SYNC_TASK, async () => {
  console.log("[PhotoSync TaskManager] Executing lightweight background photo check...");
  try {
    const count = await runAutoPhotoSync();
    return count > 0 ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (err) {
    console.warn("[PhotoSync TaskManager] Background task failed:", err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundPhotoSyncTask() {
  try {
    const minutes = await getSyncIntervalSetting();
    const intervalSeconds = minutes * 60;

    if (Platform.OS === "android") {
      await BackgroundFetch.setMinimumIntervalAsync(intervalSeconds);
    }
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_PHOTO_SYNC_TASK);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_PHOTO_SYNC_TASK).catch(() => {});
    }
    await BackgroundFetch.registerTaskAsync(BACKGROUND_PHOTO_SYNC_TASK, {
      minimumInterval: intervalSeconds,
      stopOnTerminate: false,
      startOnBoot: true,
    });
    console.log(`[PhotoSync] Registered background photo sync task with ${minutes}m interval.`);
  } catch (err) {
    console.warn("[PhotoSync] Failed to register background task:", err);
  }
}

let isSyncInProgress = false;
let isSyncQueued = false;
let lastSyncStartTime = 0;
let cachedSyncedIdsSet: Set<string> | null = null;
let syncListeners: ((status: SyncProgressStatus) => void)[] = [];
let lastReportedSyncStatus: SyncProgressStatus | null = null;

export function addSyncProgressListener(listener: (status: SyncProgressStatus) => void) {
  syncListeners.push(listener);
  if (lastReportedSyncStatus) {
    listener(lastReportedSyncStatus);
  }
  return () => {
    syncListeners = syncListeners.filter((l) => l !== listener);
  };
}

function broadcastSyncProgress(status: SyncProgressStatus) {
  lastReportedSyncStatus = status;
  syncListeners.forEach((l) => l(status));
}

export async function runAutoPhotoSync(onProgress?: (status: SyncProgressStatus) => void): Promise<number> {
  if (onProgress) {
    addSyncProgressListener(onProgress);
  }

  // Lock Safety Timeout: Reset lock if it was stuck/held for > 3 minutes (e.g. app restart/crash during active upload)
  if (isSyncInProgress && Date.now() - lastSyncStartTime > 180000) {
    console.warn("[PhotoSync] Sync lock held for > 3m. Forcing lock reset.");
    isSyncInProgress = false;
  }

  if (isSyncInProgress) {
    console.log("[PhotoSync] Sync already in progress, registered listener to ongoing sync.");
    if (lastReportedSyncStatus) {
      onProgress?.(lastReportedSyncStatus);
    }
    return 0;
  }

  isSyncInProgress = true;
  lastSyncStartTime = Date.now();
  try {
    // 0. Pre-Flight Network Reachability Guard
    try {
      const netState = await Network.getNetworkStateAsync();
      if (!netState.isConnected || netState.isInternetReachable === false) {
        console.log("[PhotoSync] Device is completely offline or has no internet reachability. Skipping sync gracefully.");
        onProgress?.({ isSyncing: false, totalNew: 0, uploadedCount: 0, statusText: "Keine Internetverbindung..." });
        return 0;
      }

      // Check Wi-Fi restriction setting
      const wifiOnly = await getWifiOnlySyncSetting();
      if (wifiOnly && netState.type !== Network.NetworkStateType.WIFI) {
        console.log("[PhotoSync] Wi-Fi only sync is enabled and device is not on Wi-Fi. Skipping sync.");
        onProgress?.({ isSyncing: false, totalNew: 0, uploadedCount: 0, statusText: "Warte auf WLAN-Verbindung..." });
        return 0;
      }
    } catch (netErr) {
      console.warn("[PhotoSync] Failed to check network state", netErr);
    }

    const hasPerms = await requestMediaPermissions();
    if (!hasPerms) {
      onProgress?.({ isSyncing: false, totalNew: 0, uploadedCount: 0, statusText: "Kein Zugriff auf Fotogalerie" });
      return 0;
    }

    if (!cachedSyncedIdsSet) {
      const rawSyncedIds = await AsyncStorage.getItem(STORAGE_KEYS.SYNCED_ASSET_IDS);
      cachedSyncedIdsSet = new Set<string>(rawSyncedIds ? JSON.parse(rawSyncedIds) : []);
    }
    const syncedIdsSet = cachedSyncedIdsSet;

    let lastWatermarkMs = 0;
    const rawLastSync = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC_TIME);
    if (rawLastSync) {
      lastWatermarkMs = parseInt(rawLastSync, 10);
    }

    // 1. Fetch remote files list from VPS to build an R2 existence index
    broadcastSyncProgress({ isSyncing: false, totalNew: 0, uploadedCount: 0, statusText: "Prüfe Galerie-Updates..." });

    let remotePathsSet = new Set<string>();
    let remoteFilenamesSet = new Set<string>();
    let remoteBaseNamesSet = new Set<string>();
    try {
      const remoteFiles = await fetchFilesList(false); // Quick fetch from DB
      remoteFiles.forEach((file) => {
        if (file && file.path) {
          const lowerPath = file.path.toLowerCase();
          remotePathsSet.add(lowerPath);
          const fname = lowerPath.split("/").pop();
          if (fname) {
            remoteFilenamesSet.add(fname.toLowerCase());
            // Extract base name before any extension, e.g. "img-20260131-wa0002.jpeg" -> "img-20260131-wa0002"
            const parts = fname.toLowerCase().split(".");
            if (parts.length > 1) parts.pop();
            const base = parts.join(".");
            remoteBaseNamesSet.add(base);
          }
        }
      });
    } catch (remoteErr) {
      console.warn("[PhotoSync] Could not fetch remote file list for reconciliation:", remoteErr);
    }

    // 2. High-Watermark Fetch: Fetch ONLY assets created after the last sync timestamp
    const fetchOptions: any = {
      first: 500,
      sortBy: [SortBy.creationTime],
      mediaType: [MediaType.photo, MediaType.video],
    };

    if (lastWatermarkMs > 0) {
      // expo-media-library expects UNIX timestamp in SECONDS for createdAfter / createdBefore
      fetchOptions.createdAfter = Math.floor(lastWatermarkMs / 1000);
    }

    const pageResult = await getAssetsAsync(fetchOptions);
    let allFetchedAssets: any[] = pageResult.assets || [];

    // Cold-start fallback: If no watermark exists yet (first run), paginate up to 3000 assets
    if (lastWatermarkMs === 0 && pageResult.hasNextPage) {
      let afterCursor = pageResult.endCursor;
      let hasNextPage = pageResult.hasNextPage;
      while (hasNextPage && allFetchedAssets.length < 3000) {
        const pRes = await getAssetsAsync({
          first: 500,
          after: afterCursor,
          sortBy: [SortBy.creationTime],
          mediaType: [MediaType.photo, MediaType.video],
        });
        if (pRes.assets && pRes.assets.length > 0) {
          allFetchedAssets.push(...pRes.assets);
        }
        hasNextPage = pRes.hasNextPage;
        afterCursor = pRes.endCursor;
      }
    }

    // Filter out items already present in syncedIdsSet
    const unSyncedFetched = allFetchedAssets.filter((asset) => asset && asset.id && !syncedIdsSet.has(asset.id));
    console.log(`[PhotoSync] Watermark: ${lastWatermarkMs > 0 ? new Date(lastWatermarkMs).toISOString() : "NONE"} -> ${unSyncedFetched.length} un-synced asset(s) found.`);

    // 3. Smart Remote Reconciliation:
    let reconciledCount = 0;
    if (allFetchedAssets.length > 0) {
      for (const asset of allFetchedAssets) {
        if (!asset || !asset.id) continue;

        const rawFilename = asset.filename || `photo_${asset.id}.jpg`;
        const filename = rawFilename.toLowerCase();
        const fnameParts = filename.split(".");
        if (fnameParts.length > 1) fnameParts.pop();
        const baseName = fnameParts.join(".");

        let rawAssetTime = asset.creationTime || asset.modificationTime || Date.now();
        const assetTime = rawAssetTime < 10000000000 ? rawAssetTime * 1000 : rawAssetTime;
        const date = new Date(assetTime);
        const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const expectedPathLower = `kamera-uploads/${monthStr}/${filename}`;
        const cleanBase = baseName.replace(/[^a-z0-9]/g, "");

        const existsInR2 = 
          remotePathsSet.has(expectedPathLower) || 
          remoteFilenamesSet.has(filename) || 
          remoteBaseNamesSet.has(baseName) ||
          Array.from(remoteBaseNamesSet).some((rBase) => rBase.replace(/[^a-z0-9]/g, "") === cleanBase && cleanBase.length > 5);

        if (!existsInR2 && syncedIdsSet.has(asset.id)) {
          syncedIdsSet.delete(asset.id);
        }

        if (existsInR2) {
          syncedIdsSet.add(asset.id);
          reconciledCount++;
        }
      }

      if (reconciledCount > 0) {
        AsyncStorage.setItem(STORAGE_KEYS.SYNCED_ASSET_IDS, JSON.stringify(Array.from(syncedIdsSet))).catch(() => {});
      }
    }

    const newAssets = allFetchedAssets.filter((asset) => asset && asset.id && !syncedIdsSet.has(asset.id));

    // Only advance watermark up to the highest timestamp of confirmed synced assets
    const syncedFetchedAssets = allFetchedAssets.filter((asset) => asset && asset.id && syncedIdsSet.has(asset.id));
    if (syncedFetchedAssets.length > 0) {
      const maxSyncedTime = Math.max(...syncedFetchedAssets.map((a) => a.creationTime || a.modificationTime || Date.now()));
      const watermarkToSave = maxSyncedTime < 10000000000 ? maxSyncedTime * 1000 : maxSyncedTime;
      AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC_TIME, watermarkToSave.toString()).catch(() => {});
    }

    if (newAssets.length === 0) {
      const msg = allFetchedAssets.length === 0 ? "Keine Fotos im Telefonspeicher" : "Fotogalerie ist aktuell";
      broadcastSyncProgress({ isSyncing: false, totalNew: 0, uploadedCount: 0, statusText: msg });
      return 0;
    }

    const startMsg = `${newAssets.length} neue(s) Medien-Datei(en) (Fotos & Videos) erkannt. Sichere in Cloud...`;
    broadcastSyncProgress({
      isSyncing: true,
      totalNew: newAssets.length,
      uploadedCount: 0,
      statusText: startMsg,
    });
    await showProgressNotification("☁️ R2Sync Medien-Backup", startMsg);

    let successCount = 0;
    let completedCount = 0;

    // ----------------------------------------------------
    // HIGH-PERFORMANCE: 12 Parallel Connection Worker Pool
    // ----------------------------------------------------
    const CONCURRENCY_LIMIT = 12; // Tuned for Wi-Fi 6 gigabit upload pipelines
    let queueIndex = 0;
    let lastUiUpdate = 0;

    const notifyProgressThrottled = (status: SyncProgressStatus, force = false) => {
      const now = Date.now();
      if (force || now - lastUiUpdate > 100) { // Throttle React state re-renders to max 10Hz
        lastUiUpdate = now;
        broadcastSyncProgress(status);
      }
    };

    const worker = async () => {
      while (queueIndex < newAssets.length) {
        const currentIndex = queueIndex++;
        const asset = newAssets[currentIndex];
        if (!asset || !asset.id || syncedIdsSet.has(asset.id)) continue;

        try {
          const uri = asset.uri;
          if (!uri) continue;

          const assetTime = asset.creationTime || asset.modificationTime || Date.now();
          const date = new Date(assetTime);
          const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          const filename = asset.filename || `photo_${asset.id}.jpg`;
          const targetPath = `Kamera-Uploads/${monthStr}/${filename}`;

          if (remotePathsSet.has(targetPath.toLowerCase())) {
            syncedIdsSet.add(asset.id);
            completedCount++;
            continue;
          }

          const ext = filename.split(".").pop()?.toLowerCase() || "";
          let mimeType = "image/jpeg";
          if (ext === "mp4") mimeType = "video/mp4";
          else if (ext === "mov") mimeType = "video/quicktime";
          else if (ext === "png") mimeType = "image/png";
          else if (ext === "webp") mimeType = "image/webp";

          const tStart = Date.now();
          const uploaded = await uploadFileToVPS(uri, targetPath, mimeType, (filePct) => {
            const progressText = `Medien-Sicherung: ${completedCount + 1} / ${newAssets.length} • ${filename}`;
            notifyProgressThrottled({
              isSyncing: true,
              totalNew: newAssets.length,
              uploadedCount: completedCount,
              statusText: progressText,
              currentFileName: filename,
              currentFileProgress: filePct,
            });
          });
          const elapsed = Date.now() - tStart;
          completedCount++;

          if (uploaded) {
            successCount++;
            syncedIdsSet.add(asset.id);
            console.log(`[PhotoSync Speed] Asset ${filename} uploaded in ${elapsed}ms`);
          }

          const progressText = `Medien-Sicherung: ${completedCount} / ${newAssets.length} • ${filename}`;
          notifyProgressThrottled({
            isSyncing: true,
            totalNew: newAssets.length,
            uploadedCount: completedCount,
            statusText: progressText,
            currentFileName: filename,
            currentFileProgress: Math.round((completedCount / newAssets.length) * 100),
          });
        } catch (err) {
          console.warn("[PhotoSync Worker Error]:", err);
        }
      }
    };

    // Spawn 4 concurrent worker threads running the queue
    const workers = Array.from({ length: Math.min(CONCURRENCY_LIMIT, newAssets.length) }, () => worker());
    await Promise.all(workers);

    // Final UI flush & Notification
    const progressText = `Medien-Sicherung: ${completedCount} / ${newAssets.length}`;
    notifyProgressThrottled({
      isSyncing: true,
      totalNew: newAssets.length,
      uploadedCount: completedCount,
      statusText: progressText,
      currentFileProgress: 100,
    }, true);
    showProgressNotification("☁️ R2Sync Medien-Backup", progressText).catch(() => {});

    // Persist synced asset IDs and high watermark timestamp to storage
    AsyncStorage.setItem(STORAGE_KEYS.SYNCED_ASSET_IDS, JSON.stringify(Array.from(syncedIdsSet))).catch(() => {});
    AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC_TIME, Date.now().toString()).catch(() => {});

    if (successCount > 0) {
      const finishText = `Sync abgeschlossen: ${successCount} Datei(en) gesichert`;
      onProgress?.({
        isSyncing: false,
        totalNew: newAssets.length,
        uploadedCount: successCount,
        statusText: finishText,
      });
      await showProgressNotification("✅ R2Sync Medien-Backup", finishText, true);

      setTimeout(() => {
        onProgress?.({ isSyncing: false, totalNew: 0, uploadedCount: 0, statusText: "" });
      }, 8000);
    }

    return successCount;
  } catch (err: any) {
    console.warn("Auto photo sync error:", err);
    onProgress?.({ isSyncing: false, totalNew: 0, uploadedCount: 0, statusText: "Fotoseicherung bereit" });
    return 0;
  } finally {
    isSyncInProgress = false;
    if (isSyncQueued) {
      isSyncQueued = false;
      console.log("[PhotoSync] Triggering queued photo sync execution...");
      setTimeout(() => {
        runAutoPhotoSync(onProgress);
      }, 1000);
    }
  }
}
