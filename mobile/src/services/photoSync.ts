import * as MediaLibrary from "expo-media-library";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { uploadFileToVPS, STORAGE_KEYS } from "./api";

export interface SyncProgressStatus {
  isSyncing: boolean;
  totalNew: number;
  uploadedCount: number;
  statusText: string;
}

export async function requestMediaPermissions(): Promise<boolean> {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    return status === "granted";
  } catch (err) {
    console.warn("Media permissions request error:", err);
    return false;
  }
}

export async function runAutoPhotoSync(onProgress?: (status: SyncProgressStatus) => void): Promise<number> {
  try {
    const hasPerms = await requestMediaPermissions();
    if (!hasPerms) {
      onProgress?.({ isSyncing: false, totalNew: 0, uploadedCount: 0, statusText: "Kein Zugriff auf Fotogalerie" });
      return 0;
    }

    // Load last synced timestamp & asset IDs
    const rawLastTime = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC_TIME);
    const lastSyncTime = rawLastTime ? parseInt(rawLastTime, 10) : 0;

    const rawSyncedIds = await AsyncStorage.getItem(STORAGE_KEYS.SYNCED_ASSET_IDS);
    const syncedIdsSet = new Set<string>(rawSyncedIds ? JSON.parse(rawSyncedIds) : []);

    // Fetch recent photos sorted by creationTime descending
    const assetsResult = await MediaLibrary.getAssetsAsync({
      mediaType: MediaLibrary.MediaType.photo,
      sortBy: [MediaLibrary.SortBy.creationTime],
      first: 50,
    });

    const newAssets = (assetsResult.assets || []).filter((asset) => {
      if (!asset || !asset.id) return false;
      const cTime = asset.creationTime || asset.modificationTime || 0;
      return cTime > lastSyncTime && !syncedIdsSet.has(asset.id);
    });

    if (newAssets.length === 0) {
      onProgress?.({ isSyncing: false, totalNew: 0, uploadedCount: 0, statusText: "Fotogalerie ist aktuell" });
      return 0;
    }

    onProgress?.({
      isSyncing: true,
      totalNew: newAssets.length,
      uploadedCount: 0,
      statusText: `${newAssets.length} neue Fotos erkannt. Sichere in Cloud...`,
    });

    let successCount = 0;
    let latestTimestamp = lastSyncTime;

    for (let i = 0; i < newAssets.length; i++) {
      const asset = newAssets[i];
      if (!asset || !asset.id) continue;

      try {
        const assetInfo = await MediaLibrary.getAssetInfoAsync(asset);
        const uri = assetInfo.localUri || asset.uri;
        const assetTime = asset.creationTime || asset.modificationTime || Date.now();

        // Construct target path e.g. Kamera-Uploads/2026-08/IMG_1234.jpg
        const date = new Date(assetTime);
        const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const filename = asset.filename || `photo_${asset.id}.jpg`;
        const targetPath = `Kamera-Uploads/${monthStr}/${filename}`;

        const uploaded = await uploadFileToVPS(uri, targetPath, "image/jpeg");
        if (uploaded) {
          successCount++;
          syncedIdsSet.add(asset.id);
          if (assetTime > latestTimestamp) {
            latestTimestamp = assetTime;
          }
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

    // Update saved progress
    if (latestTimestamp > lastSyncTime) {
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC_TIME, latestTimestamp.toString());
    }
    await AsyncStorage.setItem(STORAGE_KEYS.SYNCED_ASSET_IDS, JSON.stringify(Array.from(syncedIdsSet)));

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
  }
}
