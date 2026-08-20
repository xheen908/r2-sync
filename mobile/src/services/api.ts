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
  WIFI_ONLY_SYNC: "r2sync_wifi_only_sync",
  SYNC_INTERVAL: "r2sync_sync_interval_minutes",
};

export async function getWifiOnlySyncSetting(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(STORAGE_KEYS.WIFI_ONLY_SYNC);
    return val === "true"; // Default to false unless explicitly enabled
  } catch {
    return false;
  }
}

export async function setWifiOnlySyncSetting(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.WIFI_ONLY_SYNC, enabled ? "true" : "false");
}

export async function getSyncIntervalSetting(): Promise<number> {
  try {
    const val = await AsyncStorage.getItem(STORAGE_KEYS.SYNC_INTERVAL);
    return val ? parseInt(val, 10) : 1; // Default to 1 minute
  } catch {
    return 1;
  }
}

export async function setSyncIntervalSetting(minutes: number): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.SYNC_INTERVAL, minutes.toString());
}

let cachedConfig: ApiConfig | null = null;

export async function getSavedConfig(): Promise<ApiConfig | null> {
  if (cachedConfig) return cachedConfig;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.CONFIG);
    if (!raw) return null;
    cachedConfig = JSON.parse(raw);
    return cachedConfig;
  } catch {
    return null;
  }
}

export async function saveConfig(config: ApiConfig): Promise<void> {
  cachedConfig = config;
  await AsyncStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
}

export async function clearConfig(): Promise<void> {
  cachedConfig = null;
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

export async function fetchFilesList(forceSync = false): Promise<FileItem[]> {
  const cfg = await getSavedConfig();
  if (!cfg) throw new Error("Nicht angemeldet");

  const url = `${cfg.serverUrl}/api/files${forceSync ? "?forceSync=true" : ""}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fehler beim Laden der Dateiliste (${response.status})`);
  }

  const data = await response.json();
  return data.files || [];
}

export async function uploadFileToVPS(
  fileUri: string, 
  targetPath: string, 
  mimeType: string,
  onProgress?: (progressPercent: number) => void
): Promise<boolean> {
  const cfg = await getSavedConfig();
  if (!cfg) throw new Error("Nicht angemeldet");

  const filename = targetPath.split("/").pop() || "upload.jpg";
  const folderPath = targetPath.includes("/") ? targetPath.substring(0, targetPath.lastIndexOf("/")) : "";

  const httpsUrl = `${cfg.serverUrl}/api/files/upload`;

  // 1. Native FileSystem.createUploadTask with real-time progress callback & 45s hard timeout safety
  try {
    const uploadTask = FileSystem.createUploadTask(
      httpsUrl,
      fileUri,
      {
        httpMethod: "POST",
        uploadType: (FileSystem as any).FileSystemUploadType?.MULTIPART || (FileSystem as any).UploadType?.MULTIPART || "multipart",
        fieldName: "file",
        parameters: {
          folderPath: folderPath,
        },
      },
      (data) => {
        if (data.totalBytesExpectedToSend > 0) {
          const pct = Math.round((data.totalBytesSent / data.totalBytesExpectedToSend) * 100);
          onProgress?.(pct);
        }
      }
    );

    // Hard safety timeout: If network stalls completely, abort uploadTask after 45s so queue moves on
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => {
        uploadTask.cancelAsync().catch(() => {});
        resolve(null);
      }, 45000);
    });

    const uploadResult = await Promise.race([uploadTask.uploadAsync(), timeoutPromise]);
    if (uploadResult && uploadResult.status >= 200 && uploadResult.status < 300) {
      onProgress?.(100);
      return true;
    } else if (uploadResult && uploadResult.status === 413) {
      console.warn(`[uploadFileToVPS] File exceeds Cloudflare Tunnel 100MB limit (HTTP 413). Skipping asset.`);
      return false;
    }
  } catch (err: any) {
    console.warn(`[uploadFileToVPS] FileSystem.createUploadTask error on ${httpsUrl}:`, err?.message || err);
  }

  return false;
}

export async function moveFileOnVPS(sourcePath: string, targetFolderPath: string): Promise<boolean> {
  const cfg = await getSavedConfig();
  if (!cfg) throw new Error("Nicht angemeldet");

  const response = await fetch(`${cfg.serverUrl}/api/files/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourcePath, targetFolderPath }),
  });

  return response.ok;
}

export async function renameFileOnVPS(oldPath: string, newFilename: string, isFolder: boolean): Promise<boolean> {
  const cfg = await getSavedConfig();
  if (!cfg) throw new Error("Nicht angemeldet");

  const response = await fetch(`${cfg.serverUrl}/api/files/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ oldPath, newFilename, isFolder }),
  });

  return response.ok;
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

export async function fetchServerSettings(): Promise<{ config: any; isConnected: boolean; errorDetails?: string }> {
  const cfg = await getSavedConfig();
  if (!cfg) throw new Error("Nicht angemeldet");

  const response = await fetch(`${cfg.serverUrl}/api/settings`);
  if (!response.ok) throw new Error("Fehler beim Laden der Einstellungen");
  return response.json();
}

export async function saveServerR2Settings(settings: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicDomainUrl: string;
}): Promise<boolean> {
  const cfg = await getSavedConfig();
  if (!cfg) throw new Error("Nicht angemeldet");

  const response = await fetch(`${cfg.serverUrl}/api/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });

  if (response.ok) {
    // Update local saved config with new bucket/accountId/publicDomainUrl
    const updatedCfg = {
      ...cfg,
      accountId: settings.accountId || cfg.accountId,
      bucketName: settings.bucketName || cfg.bucketName,
      publicDomainUrl: settings.publicDomainUrl || cfg.publicDomainUrl,
    };
    await saveConfig(updatedCfg);
  }

  return response.ok;
}

export async function updateAccountCredentials(currentUsername: string, newUsername?: string, newPassword?: string): Promise<{ success: boolean; updatedUsername?: string; error?: string }> {
  const cfg = await getSavedConfig();
  if (!cfg) throw new Error("Nicht angemeldet");

  const response = await fetch(`${cfg.serverUrl}/api/account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentUsername, newUsername, newPassword }),
  });

  const data = await response.json();
  if (response.ok && data.success) {
    if (data.updatedUsername) {
      cfg.username = data.updatedUsername;
    }
    if (newPassword) {
      cfg.password = newPassword;
    }
    await saveConfig(cfg);
  }
  return data;
}

