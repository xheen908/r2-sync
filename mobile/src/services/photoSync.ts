import {
  getAssetsAsync,
  requestPermissionsAsync,
  getAssetInfoAsync,
  addListener,
  SortBy,
  MediaType,
} from "expo-media-library/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { uploadFileToVPS, STORAGE_KEYS } from "./api";

export interface SyncProgressStatus {
  isSyncing: boolean;
  totalNew: number;
  uploadedCount: number;
  statusText: string;
}

let isSyncInProgress = false;

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

    // Fetch recent photo assets from Camera Roll
    const assetsResult = await getAssetsAsync({
      first: 100,
      mediaType: [MediaType.photo],
    });

    const assetsList = assetsResult.assets || [];
    const newAssets = assetsList.filter((asset) => asset && asset.id && !syncedIdsSet.has(asset.id));

    if (newAssets.length === 0) {
      const msg = assetsList.length === 0 ? "Keine Fotos im Telefonspeicher" : "Fotogalerie ist aktuell";
      onProgress?.({ isSyncing: false, totalNew: 0, uploadedCount: 0, statusText: msg });
      return 0;
    }

    onProgress?.({
      isSyncing: true,
      totalNew: newAssets.length,
      uploadedCount: 0,
      statusText: `${newAssets.length} neue(s) Foto(s) erkannt. Sichere in Cloud...`,
    });

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

      onProgress?.({
        isSyncing: true,
        totalNew: newAssets.length,
        uploadedCount: i + 1,
        statusText: `Fotoseicherung: ${i + 1} / ${newAssets.length} hochgeladen`,
      });
    }

    onProgress?.({
      isSyncing: false,
      totalNew: newAssets.length,
      uploadedCount: successCount,
      statusText: `Sync abgeschlossen: ${successCount} Foto(s) gesichert`,
    });

    return successCount;
  } catch (err: any) {
    console.warn("Auto photo sync error:", err);
    onProgress?.({ isSyncing: false, totalNew: 0, uploadedCount: 0, statusText: "Fotoseicherung bereit" });
    return 0;
  } finally {
    isSyncInProgress = false;
  }
}
