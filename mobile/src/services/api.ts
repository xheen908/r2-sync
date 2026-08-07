import AsyncStorage from "@react-native-async-storage/async-storage";

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
  let response: Response;

  try {
    response = await fetch(`${baseUrl}/api/account/sync-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
  } catch (netErr: any) {
    const errMsg = netErr?.message || String(netErr);
    if (errMsg.includes("SSLHandshakeException") || errMsg.includes("Chain validation")) {
      const httpUrl = baseUrl.replace("https://", "http://");
      try {
        response = await fetch(`${httpUrl}/api/account/sync-config`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
      } catch (fallbackErr) {
        throw new Error("Zertifikatsfehler auf dem Emulator. Verwende auf echten Geräten https oder gib http:// an.");
      }
    } else {
      throw new Error(errMsg);
    }
  }

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

  const response = await fetch(`${cfg.serverUrl}/api/files`);
  if (!response.ok) {
    throw new Error(`Fehler beim Laden der Dateiliste (${response.status})`);
  }

  const data = await response.json();
  return data.files || [];
}

export async function uploadFileToVPS(fileUri: string, targetPath: string, mimeType: string): Promise<boolean> {
  const cfg = await getSavedConfig();
  if (!cfg) throw new Error("Nicht angemeldet");

  const formData = new FormData();
  const filename = targetPath.split("/").pop() || "upload.jpg";

  // @ts-ignore
  formData.append("file", {
    uri: fileUri,
    name: filename,
    type: mimeType || "image/jpeg",
  });
  formData.append("folderPath", targetPath.includes("/") ? targetPath.substring(0, targetPath.lastIndexOf("/")) : "");

  const response = await fetch(`${cfg.serverUrl}/api/files/upload`, {
    method: "POST",
    body: formData,
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
