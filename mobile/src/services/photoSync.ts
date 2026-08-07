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

    const rawSyncedIds = await AsyncStorage.getItem(STORAGE_KEYS.SYNCED_ASSET_IDS);
    const syncedIdsSet = new Set<string>(rawSyncedIds ? JSON.parse(rawSyncedIds) : []);

    // Fetch recent photos/videos from Camera Roll
    const assetsResult = await MediaLibrary.getAssetsAsync({
      first: 100,
    });

    const assetsList = assetsResult.assets || [];
    const newAssets = assetsList.filter((asset) => {
      return asset && asset.id && !syncedIdsSet.has(asset.id);
    });

    if (newAssets.length === 0) {
      const msg = assetsList.length === 0 ? "Keine Fotos im Telefonspeicher" : "Fotogalerie ist aktuell";
      onProgress?.({ isSyncing: false, totalNew: 0, uploadedCount: 0, statusText: msg });
      return 0;
    }

    onProgress?.({
      isSyncing: true,
      totalNew: newAssets.length,
      uploadedCount: 0,
      statusText: `${newAssets.length} neue Fotos erkannt. Sichere in Cloud...`,
    });

    let successCount = 0;

    for (let i = 0; i < newAssets.length; i++) {
      const asset = newAssets[i];
      if (!asset || !asset.id) continue;

      try {
        const assetInfo = await MediaLibrary.getAssetInfoAsync(asset);
        const uri = assetInfo.localUri || asset.uri;
        const assetTime = asset.creationTime || asset.modificationTime || Date.now();

        // Target path e.g.: Kamera-Uploads/2026-08/filename.jpg
        const date = new Date(assetTime);
        const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const filename = asset.filename || `photo_${asset.id}.jpg`;
        const targetPath = `Kamera-Uploads/${monthStr}/${filename}`;

        const uploaded = await uploadFileToVPS(uri, targetPath, "image/jpeg");
        if (uploaded) {
          successCount++;
          syncedIdsSet.add(asset.id);
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
