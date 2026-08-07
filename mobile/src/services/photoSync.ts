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
import { uploadFileToVPS, STORAGE_KEYS } from "./api";

export interface SyncProgressStatus {
  isSyncing: boolean;
  totalNew: number;
  uploadedCount: number;
  statusText: string;
}

const BACKGROUND_PHOTO_SYNC_TASK = "R2_BACKGROUND_PHOTO_SYNC_TASK";
const NOTIFICATION_CHANNEL_ID = "r2sync_photo_backup";
const NOTIFICATION_ID = "r2sync_photo_progress";

let isSyncInProgress = false;

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
  console.log("[PhotoSync TaskManager] Running background photo sync task...");
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
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_PHOTO_SYNC_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_PHOTO_SYNC_TASK, {
        minimumInterval: 15 * 60, // Check every 15 minutes in background
        stopOnTerminate: false,
        startOnBoot: true,
      });
      console.log("[PhotoSync] Registered background photo sync task successfully.");
    }
  } catch (err) {
    console.warn("[PhotoSync] Failed to register background task:", err);
  }
}

export async function runAutoPhotoSync(onProgress?: (status: SyncProgressStatus) => void): Promise<number> {
  if (isSyncInProgress) {
    console.log("[PhotoSync] Sync already in progress, skipping concurrent run.");
    return 0;
  }

  isSyncInProgress = true;
  try {
    const hasPerms = await requestMediaPermissions();
    if (!hasPerms) {
      onProgress?.({ isSyncing: false, totalNew: 0, uploadedCount: 0, statusText: "Kein Zugriff auf Fotogalerie" });
      return 0;
    }

    const rawSyncedIds = await AsyncStorage.getItem(STORAGE_KEYS.SYNCED_ASSET_IDS);
    const syncedIdsSet = new Set<string>(rawSyncedIds ? JSON.parse(rawSyncedIds) : []);

    // Fetch all photo assets from Camera Roll (sorted newest first with pagination)
    let allFetchedAssets: any[] = [];
    let hasNextPage = true;
    let afterCursor: string | undefined = undefined;

    while (hasNextPage && allFetchedAssets.length < 5000) {
      const pageResult = await getAssetsAsync({
        first: 100,
        after: afterCursor,
        sortBy: [SortBy.creationTime],
        mediaType: [MediaType.photo],
      });

      if (pageResult.assets && pageResult.assets.length > 0) {
        allFetchedAssets.push(...pageResult.assets);
      }

      hasNextPage = pageResult.hasNextPage;
      afterCursor = pageResult.endCursor;
    }

    const newAssets = allFetchedAssets.filter((asset) => asset && asset.id && !syncedIdsSet.has(asset.id));

    if (newAssets.length === 0) {
      const msg = allFetchedAssets.length === 0 ? "Keine Fotos im Telefonspeicher" : "Fotogalerie ist aktuell";
      onProgress?.({ isSyncing: false, totalNew: 0, uploadedCount: 0, statusText: msg });
      return 0;
    }

    const startMsg = `${newAssets.length} neue(s) Foto(s) erkannt. Sichere in Cloud...`;
    onProgress?.({
      isSyncing: true,
      totalNew: newAssets.length,
      uploadedCount: 0,
      statusText: startMsg,
    });
    await showProgressNotification("☁️ R2Sync Foto-Backup", startMsg);

    let successCount = 0;

    for (let i = 0; i < newAssets.length; i++) {
      const asset = newAssets[i];
      if (!asset || !asset.id || syncedIdsSet.has(asset.id)) continue;

      try {
        const assetInfo = await getAssetInfoAsync(asset).catch(() => null);
        const uri = assetInfo?.localUri || asset.uri;
        if (!uri) continue;

        const assetTime = asset.creationTime || asset.modificationTime || Date.now();

        // Target path e.g.: Kamera-Uploads/2026-08/filename.jpg
        const date = new Date(assetTime);
        const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const filename = asset.filename || `photo_${asset.id}.jpg`;
        const targetPath = `Kamera-Uploads/${monthStr}/${filename}`;

        console.log(`[PhotoSync] Uploading asset ${asset.id} (${filename}) to ${targetPath}...`);
        const uploaded = await uploadFileToVPS(uri, targetPath, "image/jpeg");

        // Mark item as processed in AsyncStorage to prevent endless retries
        syncedIdsSet.add(asset.id);
        await AsyncStorage.setItem(STORAGE_KEYS.SYNCED_ASSET_IDS, JSON.stringify(Array.from(syncedIdsSet)));

        if (uploaded) {
          successCount++;
        }
      } catch (err) {
        console.warn("Error uploading photo asset:", asset.id, err);
      }

      const progressText = `Fotoseicherung: ${i + 1} / ${newAssets.length} hochgeladen`;
      onProgress?.({
        isSyncing: true,
        totalNew: newAssets.length,
        uploadedCount: i + 1,
        statusText: progressText,
      });

      // Update native Android status notification for EVERY uploaded photo
      await showProgressNotification("☁️ R2Sync Foto-Backup", progressText);
    }

    const finishText = `Sync abgeschlossen: ${successCount} Foto(s) gesichert`;
    onProgress?.({
      isSyncing: false,
      totalNew: newAssets.length,
      uploadedCount: successCount,
      statusText: finishText,
    });
    await showProgressNotification("✅ R2Sync Foto-Backup", finishText, true);

    return successCount;
  } catch (err: any) {
    console.warn("Auto photo sync error:", err);
    onProgress?.({ isSyncing: false, totalNew: 0, uploadedCount: 0, statusText: "Fotoseicherung bereit" });
    return 0;
  } finally {
    isSyncInProgress = false;
  }
}
