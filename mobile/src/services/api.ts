import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

export interface FileItem {
  id: string;
  path: string;
  filename: string;
  size: number;
  mimeType: string;
  updatedAt: number;
  activeSharesCount: number;
}

export interface ApiConfig {
  serverUrl: string;
  username: string;
  password?: string;
  accountId?: string;
  bucketName?: string;
  publicDomainUrl?: string;
}

export const STORAGE_KEYS = {
  CONFIG: "r2sync_config",
  LAST_SYNC_TIME: "r2sync_last_photo_sync_time",
  SYNCED_ASSET_IDS: "r2sync_synced_asset_ids",
};

export async function getSavedConfig(): Promise<ApiConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.CONFIG);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

export async function saveConfig(config: ApiConfig): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
}

export async function clearConfig(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.CONFIG);
}

export function cleanServerUrl(url: string): string {
  let clean = url.trim();
  if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
    clean = "https://" + clean;
  }
  if (clean.endsWith("/")) {
    clean = clean.slice(0, -1);
  }
  return clean;
}

export async function loginAndFetchConfig(serverUrl: string, username: string, password: string): Promise<ApiConfig> {
  const baseUrl = cleanServerUrl(serverUrl);

  const response = await fetch(`${baseUrl}/api/account/sync-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Anmeldung fehlgeschlagen (HTTP ${response.status})`);
  }

  const data = await response.json();
  const apiConfig: ApiConfig = {
    serverUrl: baseUrl,
    username,
    password,
    accountId: data.config?.accountId || "",
    bucketName: data.config?.bucketName || "",
    publicDomainUrl: data.config?.publicDomainUrl || baseUrl,
  };

  await saveConfig(apiConfig);
  return apiConfig;
}

export async function fetchFilesList(): Promise<FileItem[]> {
  const cfg = await getSavedConfig();
  if (!cfg) throw new Error("Nicht angemeldet");

  const url = `${cfg.serverUrl}/api/files`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fehler beim Laden der Dateiliste (${response.status})`);
  }

  const data = await response.json();
  return data.files || [];
}

export async function uploadFileToVPS(fileUri: string, targetPath: string, mimeType: string): Promise<boolean> {
  const cfg = await getSavedConfig();
  if (!cfg) throw new Error("Nicht angemeldet");

  const filename = targetPath.split("/").pop() || "upload.jpg";
  const folderPath = targetPath.includes("/") ? targetPath.substring(0, targetPath.lastIndexOf("/")) : "";

  const httpsUrl = `${cfg.serverUrl}/api/files/upload`;
  const httpUrl = cfg.serverUrl.replace("https://", "http://") + "/api/files/upload";

  // 1. FileSystem.uploadAsync
  for (const endpoint of [httpsUrl, httpUrl]) {
    try {
      const uploadResult = await FileSystem.uploadAsync(
        endpoint,
        fileUri,
        {
          httpMethod: "POST",
          uploadType: (FileSystem as any).FileSystemUploadType?.MULTIPART || (FileSystem as any).UploadType?.MULTIPART || "multipart",
          fieldName: "file",
          parameters: {
            folderPath: folderPath,
          },
        }
      );
      if (uploadResult.status >= 200 && uploadResult.status < 300) {
        return true;
      }
    } catch (err) {
      // Fallback
    }
  }

  // 2. React Native FormData fetch upload
  for (const endpoint of [httpsUrl, httpUrl]) {
    try {
      const cleanUri = fileUri.startsWith("file://") || fileUri.startsWith("content://") ? fileUri : `file://${fileUri}`;
      const formData = new FormData();
      // @ts-ignore
      formData.append("file", {
        uri: cleanUri,
        name: filename,
        type: mimeType || "image/jpeg",
      });
      formData.append("folderPath", folderPath);

      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });
      if (response.ok) return true;
    } catch (err) {
      // Fallback
    }
  }

  return false;
}

export async function deleteFileFromVPS(filePath: string): Promise<boolean> {
  const cfg = await getSavedConfig();
  if (!cfg) throw new Error("Nicht angemeldet");

  const response = await fetch(`${cfg.serverUrl}/api/files?filePath=${encodeURIComponent(filePath)}`, {
    method: "DELETE",
  });

  return response.ok;
}

export async function generateShareLink(filePath: string, ttlHours: number | null, isFolder = false): Promise<string> {
  const cfg = await getSavedConfig();
  if (!cfg) throw new Error("Nicht angemeldet");

  const response = await fetch(`${cfg.serverUrl}/api/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filePath, ttlHours, isFolder }),
  });

  if (!response.ok) {
    throw new Error("Fehler beim Erstellen des Freigabelinks");
  }

  const data = await response.json();
  return data.shareUrl;
}
