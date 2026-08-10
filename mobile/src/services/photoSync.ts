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
      name: "Foto-Backup Status",
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

export async function runAutoPhotoSync(onProgress?: (status: SyncProgressStatus) => void): Promise<number> {
  const now = Date.now();
  // Watchdog: If sync has been stuck for > 3 minutes (180,000ms), force-reset the lock
  if (isSyncInProgress && now - lastSyncStartTime > 180000) {
    console.warn("[PhotoSync] Sync was stuck for over 3 minutes. Resetting lock...");
    isSyncInProgress = false;
  }

  if (isSyncInProgress) {
    console.log("[PhotoSync] Sync already in progress, queuing next run...");
    isSyncQueued = true;
    return 0;
  }

  isSyncInProgress = true;
  lastSyncStartTime = Date.now();
  try {
    // Check Wi-Fi restriction setting
    const wifiOnly = await getWifiOnlySyncSetting();
    if (wifiOnly) {
      try {
        const netState = await Network.getNetworkStateAsync();
        if (netState.type !== Network.NetworkStateType.WIFI) {
          console.log("[PhotoSync] Wi-Fi only sync is enabled and device is not on Wi-Fi. Skipping sync.");
          onProgress?.({ isSyncing: false, totalNew: 0, uploadedCount: 0, statusText: "Warte auf WLAN-Verbindung..." });
          return 0;
        }
      } catch (netErr) {
        console.warn("[PhotoSync] Failed to check network state", netErr);
      }
    }

    const hasPerms = await requestMediaPermissions();
    if (!hasPerms) {
      onProgress?.({ isSyncing: false, totalNew: 0, uploadedCount: 0, statusText: "Kein Zugriff auf Fotogalerie" });
      return 0;
    }

    const rawSyncedIds = await AsyncStorage.getItem(STORAGE_KEYS.SYNCED_ASSET_IDS);
    const syncedIdsSet = new Set<string>(rawSyncedIds ? JSON.parse(rawSyncedIds) : []);

    // Watermark cutoff: Baseline timestamp set to 2 hours before first setup to ensure newly taken photos are included
    let rawWatermark = await AsyncStorage.getItem("r2sync_photo_watermark_timestamp");
    if (!rawWatermark) {
      // Set watermark to 2 hours ago so any photos taken right before or during setup are uploaded
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      rawWatermark = twoHoursAgo.toString();
      await AsyncStorage.setItem("r2sync_photo_watermark_timestamp", rawWatermark);
      console.log(`[PhotoSync] Initialized watermark timestamp to ${new Date(Number(rawWatermark)).toISOString()}`);
    }
    const watermarkTime = Number(rawWatermark);

    // 1. Fetch remote files list from VPS to build an R2 existence index
    let remotePathsSet = new Set<string>();
    let remoteFilenamesSet = new Set<string>();
    try {
      const remoteFiles = await fetchFilesList(true);
      remoteFiles.forEach((file) => {
        if (file && file.path) {
          const lowerPath = file.path.toLowerCase();
          remotePathsSet.add(lowerPath);
          const fname = lowerPath.split("/").pop();
          if (fname) {
            remoteFilenamesSet.add(fname);
          }
        }
      });
      console.log(`[PhotoSync] Loaded ${remotePathsSet.size} remote file(s) from R2 bucket.`);
    } catch (remoteErr) {
      console.warn("[PhotoSync] Could not fetch remote file list for reconciliation:", remoteErr);
    }

    // 2. Fetch photo & video assets from Camera Roll (newest items first)
    let allFetchedAssets: any[] = [];
    let hasNextPage = true;
    let afterCursor: string | undefined = undefined;

    while (hasNextPage && allFetchedAssets.length < 5000) {
      const pageResult = await getAssetsAsync({
        first: 100,
        after: afterCursor,
        sortBy: [SortBy.creationTime],
        mediaType: [MediaType.photo, MediaType.video],
      });

      if (pageResult.assets && pageResult.assets.length > 0) {
        allFetchedAssets.push(...pageResult.assets);
      }

      hasNextPage = pageResult.hasNextPage;
      afterCursor = pageResult.endCursor;
    }

    // 3. Smart Remote Reconciliation & Watermark Filter:
    // Mark assets older than watermark or already present in R2 as synced so they're NEVER uploaded
    let reconciledCount = 0;
    if (allFetchedAssets.length > 0) {
      for (const asset of allFetchedAssets) {
        if (!asset || !asset.id || syncedIdsSet.has(asset.id)) continue;

        let rawAssetTime = asset.creationTime || asset.modificationTime || Date.now();
        // expo-media-library on Android/iOS can return creationTime in seconds or milliseconds
        const assetTime = rawAssetTime < 10000000000 ? rawAssetTime * 1000 : rawAssetTime;
        const date = new Date(assetTime);
        const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

        const rawFilename = asset.filename || `photo_${asset.id}.jpg`;
        const filename = rawFilename.toLowerCase();

        const expectedPath = `kamera-uploads/${monthStr}/${filename}`;

        const isVideo = asset.mediaType === MediaType.video || asset.mediaType === "video" || filename.endsWith(".mp4") || filename.endsWith(".mov");

        // Rule A: If file exists in R2 cloud -> Mark synced
        // Rule B: If item is a PHOTO and was created BEFORE the watermark timestamp (old photo before app setup) -> Mark synced & ignore
        // NOTE: VIDEOS BYPASS Rule B so ALL existing videos on the phone get backed up!
        if (remotePathsSet.has(expectedPath) || remoteFilenamesSet.has(filename) || (!isVideo && assetTime < watermarkTime)) {
          syncedIdsSet.add(asset.id);
          reconciledCount++;
        }
      }

      if (reconciledCount > 0) {
        console.log(`[PhotoSync] Filtered/Matched ${reconciledCount} asset(s) (existing in R2 or older than setup watermark).`);
        await AsyncStorage.setItem(STORAGE_KEYS.SYNCED_ASSET_IDS, JSON.stringify(Array.from(syncedIdsSet)));
      }
    }

    const newAssets = allFetchedAssets.filter((asset) => asset && asset.id && !syncedIdsSet.has(asset.id));

    if (newAssets.length === 0) {
      const msg = allFetchedAssets.length === 0 ? "Keine Fotos im Telefonspeicher" : "Fotogalerie ist aktuell";
      onProgress?.({ isSyncing: false, totalNew: 0, uploadedCount: 0, statusText: msg });
      return 0;
    }

    const startMsg = `${newAssets.length} neue(s) Medien-Datei(en) (Fotos & Videos) erkannt. Sichere in Cloud...`;
    onProgress?.({
      isSyncing: true,
      totalNew: newAssets.length,
      uploadedCount: 0,
      statusText: startMsg,
    });
    await showProgressNotification("☁️ R2Sync Medien-Backup", startMsg);

    let successCount = 0;

    for (let i = 0; i < newAssets.length; i++) {
      const asset = newAssets[i];
      if (!asset || !asset.id || syncedIdsSet.has(asset.id)) continue;

      try {
        const assetInfo = await getAssetInfoAsync(asset).catch(() => null);
        const uri = assetInfo?.localUri || assetInfo?.uri || asset.uri;
        if (!uri) {
          console.warn("[PhotoSync] Could not resolve URI for asset:", asset.id);
          continue;
        }

        const assetTime = asset.creationTime || asset.modificationTime || Date.now();

        // Target path e.g.: Kamera-Uploads/2026-08/filename.jpg
        const date = new Date(assetTime);
        const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const filename = asset.filename || `photo_${asset.id}.jpg`;
        const targetPath = `Kamera-Uploads/${monthStr}/${filename}`;

        // Double check against remote R2 before performing upload
        if (remotePathsSet.has(targetPath.toLowerCase())) {
          console.log(`[PhotoSync] Target ${targetPath} already exists in R2 cloud. Marking as synced.`);
          syncedIdsSet.add(asset.id);
          await AsyncStorage.setItem(STORAGE_KEYS.SYNCED_ASSET_IDS, JSON.stringify(Array.from(syncedIdsSet)));
          continue;
        }

        const ext = filename.split(".").pop()?.toLowerCase() || "";
        let mimeType = "image/jpeg";
        if (ext === "mp4") mimeType = "video/mp4";
        else if (ext === "mov") mimeType = "video/quicktime";
        else if (ext === "m4v") mimeType = "video/x-m4v";
        else if (ext === "mkv") mimeType = "video/x-matroska";
        else if (ext === "webm") mimeType = "video/webm";
        else if (ext === "png") mimeType = "image/png";
        else if (ext === "webp") mimeType = "image/webp";
        else if (ext === "heic") mimeType = "image/heic";

        // Check asset file size before upload (Cloudflare Tunnel limits uploads to 100MB)
        let assetSizeBytes = 0;
        try {
          const fileInfo = await FileSystem.getInfoAsync(uri);
          if (fileInfo && fileInfo.exists && (fileInfo as any).size) {
            assetSizeBytes = (fileInfo as any).size;
          }
        } catch (sizeErr) {}

        const maxUploadBytes = 90 * 1024 * 1024; // 90 MB limit for Cloudflare Tunnels
        if (assetSizeBytes > maxUploadBytes) {
          const sizeMbStr = (assetSizeBytes / (1024 * 1024)).toFixed(1);
          console.warn(`[PhotoSync] Asset ${asset.id} (${filename}) is ${sizeMbStr} MB, exceeding Cloudflare 90MB limit. Skipping.`);
          syncedIdsSet.add(asset.id);
          await AsyncStorage.setItem(STORAGE_KEYS.SYNCED_ASSET_IDS, JSON.stringify(Array.from(syncedIdsSet)));
          continue;
        }

        console.log(`[PhotoSync] Uploading asset ${asset.id} (${filename}) [${mimeType}] to ${targetPath}...`);
        const uploaded = await uploadFileToVPS(uri, targetPath, mimeType);

        if (uploaded) {
          successCount++;
          syncedIdsSet.add(asset.id);
          // Save synced IDs in background without blocking loop I/O
          AsyncStorage.setItem(STORAGE_KEYS.SYNCED_ASSET_IDS, JSON.stringify(Array.from(syncedIdsSet))).catch(() => {});
        } else {
          console.warn("[PhotoSync] Failed to upload asset, skipping to next file:", asset.id);
          syncedIdsSet.add(asset.id);
          AsyncStorage.setItem(STORAGE_KEYS.SYNCED_ASSET_IDS, JSON.stringify(Array.from(syncedIdsSet))).catch(() => {});
        }
      } catch (err) {
        console.warn("[PhotoSync] Error uploading photo asset:", asset.id, err);
      }

      const isVid = (asset.filename || "").toLowerCase().endsWith(".mp4") || (asset.filename || "").toLowerCase().endsWith(".mov");
      const mediaLabel = isVid ? "Video" : "Foto";
      const progressText = `Medien-Sicherung: ${i + 1} / ${newAssets.length} (${mediaLabel} ${i + 1})`;
      onProgress?.({
        isSyncing: true,
        totalNew: newAssets.length,
        uploadedCount: i + 1,
        statusText: progressText,
      });

      // Update native Android status notification for EVERY uploaded file
      await showProgressNotification("☁️ R2Sync Medien-Backup", progressText);
    }

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
