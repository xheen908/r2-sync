"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  Cloud,
  Download,
  Clock,
  Lock,
  FileText,
  Folder,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  FolderOpen,
} from "lucide-react";

interface FolderFileItem {
  path: string;
  filename: string;
  size: number;
  updatedAt: number;
}

interface ShareInfo {
  shareId: string;
  filePath: string;
  filename: string;
  isFolder?: boolean;
  folderFiles?: FolderFileItem[];
  expiresAt: number | null;
  requiresPassword?: boolean;
  expired?: boolean;
}

export default function PublicSharePage() {
  const params = useParams();
  const shareId = params.shareId as string;

  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);

  useEffect(() => {
    if (!shareId) return;
    const loadShare = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/s/${shareId}`);
        const data = await res.json();
        if (res.ok) {
          setShareInfo(data);
        } else {
          setError(data.error || "Freigabelink nicht gefunden");
        }
      } catch (err) {
        setError("Verbindungsfehler beim Laden des Links");
      } finally {
        setLoading(false);
      }
    };
    loadShare();
  }, [shareId]);

  const handleDownloadFile = async (filePath?: string, customFilename?: string) => {
    const targetPath = filePath || shareInfo?.filePath;
    if (!targetPath) return;

    setDownloadingFile(targetPath);
    setError("");

    try {
      const url = `/api/s/${shareId}/download${
        password ? `?password=${encodeURIComponent(password)}` : ""
      }`;

      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Download fehlgeschlagen");
        setDownloadingFile(null);
        return;
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = customFilename || shareInfo?.filename || "download";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setError("Fehler beim Herunterladen der Datei");
    } finally {
      setDownloadingFile(null);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const isExpired =
    shareInfo?.expired ||
    (shareInfo?.expiresAt && Date.now() > shareInfo.expiresAt);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-slate-950 text-slate-100">
      {/* Background Glow */}
      <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-xl bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl z-10 text-center">
        {/* Header Logo */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-orange-500 to-amber-400 shadow-lg shadow-orange-500/20 mb-6">
          <Cloud className="w-8 h-8 text-white" />
        </div>

        {loading ? (
          <div className="py-8 text-slate-400 animate-pulse">
            Freigabelink wird überprüft...
          </div>
        ) : error && !shareInfo ? (
          <div className="py-6 space-y-3">
            <XCircle className="w-12 h-12 text-red-500 mx-auto" />
            <h2 className="text-xl font-bold text-white">Link nicht verfügbar</h2>
            <p className="text-sm text-slate-400">{error}</p>
          </div>
        ) : isExpired ? (
          <div className="py-6 space-y-4">
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
            <h2 className="text-xl font-bold text-white">Link ist abgelaufen</h2>
            <p className="text-sm text-slate-400">
              Dieser Freigabelink hat seine maximale Gültigkeit erreicht und ist nicht mehr zugänglich.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-mono mb-3 border border-slate-700">
                {shareInfo?.isFolder ? (
                  <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-orange-400" />
                )}
                <span>{shareInfo?.isFolder ? "Freigegebener Ordner" : "Freigegebene Datei"}</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight break-all">
                {shareInfo?.filename}
              </h2>
            </div>

            {/* Expiration Badge */}
            {shareInfo?.expiresAt && (
              <div className="inline-flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  Gültig bis:{" "}
                  {new Date(shareInfo.expiresAt).toLocaleDateString("de-DE", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            )}

            {/* Password input if required */}
            {shareInfo?.requiresPassword && (
              <div className="text-left">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Passwort erforderlich</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Passwort eingeben"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-orange-500 rounded-xl py-2.5 px-4 text-sm text-white outline-none"
                />
              </div>
            )}

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">
                {error}
              </p>
            )}

            {/* IF FOLDER SHARE: Render List of Files in Folder */}
            {shareInfo?.isFolder && shareInfo.folderFiles && shareInfo.folderFiles.length > 0 ? (
              <div className="space-y-3 text-left">
                <h3 className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
                  Enthaltene Dateien ({shareInfo.folderFiles.length})
                </h3>
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-800 bg-slate-950/80 border border-slate-800 rounded-2xl">
                  {shareInfo.folderFiles.map((file) => (
                    <div key={file.path} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-900/60 transition-colors">
                      <div className="flex items-center gap-2.5 truncate">
                        <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                        <span className="text-xs font-medium text-slate-200 truncate">{file.filename}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[11px] font-mono text-slate-500">{formatBytes(file.size)}</span>
                        <button
                          onClick={() => handleDownloadFile(file.path, file.filename)}
                          className="p-1.5 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 text-xs flex items-center gap-1 transition-all"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* IF SINGLE FILE SHARE: Render Single Download Button */
              <button
                onClick={() => handleDownloadFile()}
                disabled={!!downloadingFile}
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold py-3 rounded-xl shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50"
              >
                <Download className="w-5 h-5" />
                <span>{downloadingFile ? "Download läuft..." : "Datei Herunterladen"}</span>
              </button>
            )}
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-slate-800/80 flex items-center justify-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Geschützt durch Cloudflare R2 & D1 SQLite</span>
        </div>
      </div>
    </div>
  );
}
