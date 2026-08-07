"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Cloud,
  Folder,
  FolderOpen,
  File,
  Search,
  Share2,
  Clock,
  Lock,
  Copy,
  Check,
  LogOut,
  RefreshCw,
  X,
  FileText,
  Image as ImageIcon,
  Film,
  Code,
  Archive,
  ChevronRight,
  Home,
  ArrowLeft,
  Trash2,
  ExternalLink,
  Plus,
  List,
  Download,
  Upload,
  Move,
} from "lucide-react";

interface FileItem {
  id: string;
  path: string;
  filename: string;
  size: number;
  mimeType?: string;
  updatedAt: number;
  activeSharesCount?: number;
}

interface ShareModalData {
  filePath: string;
  filename: string;
}

interface ActiveShareItem {
  id: string;
  shareUrl: string;
  expiresAt: number | null;
  requiresPassword: boolean;
  createdAt: number;
}

interface DirectoryRow {
  isFolder: true;
  name: string;
  fullPath: string;
  itemCount: number;
}

interface FileRow {
  isFolder: false;
  item: FileItem;
}

type ExplorerRow = DirectoryRow | FileRow;

export default function DashboardPage() {
  const router = useRouter();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentPath, setCurrentPath] = useState<string>(""); // "" = Root directory
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Drag & Drop Upload states
  const [isDraggingExternal, setIsDraggingExternal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [draggedFileItem, setDraggedFileItem] = useState<FileItem | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  // Share Modal state
  const [shareModal, setShareModal] = useState<ShareModalData | null>(null);
  const [modalTab, setModalTab] = useState<"create" | "list">("create");
  const [activeShares, setActiveShares] = useState<ActiveShareItem[]>([]);
  const [loadingActiveShares, setLoadingActiveShares] = useState(false);

  // Share link creation options
  const [ttlHours, setTtlHours] = useState<number>(24);
  const [password, setPassword] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/files");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      if (data.files) {
        setFiles(data.files);
      }
    } catch (err) {
      console.error("Failed to fetch files", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  // Upload dropped files to current path
  const uploadFiles = async (fileList: FileList | File[], targetFolder = currentPath) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folderPath", targetFolder);

      try {
        await fetch("/api/files/upload", {
          method: "POST",
          body: formData,
        });
      } catch (err) {
        console.error("Error uploading file:", err);
      }
    }

    setUploading(false);
    fetchFiles();
  };

  // Move file into target folder
  const moveFileToFolder = async (fileItem: FileItem, targetFolderPath: string) => {
    try {
      const res = await fetch("/api/files/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePath: fileItem.path,
          targetFolderPath,
        }),
      });
      if (res.ok) {
        fetchFiles();
      }
    } catch (err) {
      console.error("Error moving file:", err);
    }
  };

  // External Drag Over Window
  const handleWindowDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) {
      setIsDraggingExternal(true);
    }
  };

  const handleWindowDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.relatedTarget === null) {
      setIsDraggingExternal(false);
    }
  };

  const handleWindowDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingExternal(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  };

  // Fetch active share links when opening Share Modal
  const fetchActiveShares = async (filePath: string) => {
    setLoadingActiveShares(true);
    try {
      const res = await fetch(`/api/share?filePath=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      if (data.shares) {
        setActiveShares(data.shares);
        if (data.shares.length > 0 && !generatedLink) {
          setModalTab("list");
        }
      }
    } catch (err) {
      console.error("Error loading active shares", err);
    } finally {
      setLoadingActiveShares(false);
    }
  };

  const openShareModal = (file: FileItem) => {
    setShareModal({ filePath: file.path, filename: file.filename });
    setGeneratedLink("");
    setPassword("");
    setModalTab("create");
    fetchActiveShares(file.path);
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const handleCreateShareLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareModal) return;

    setGenerating(true);
    setGeneratedLink("");

    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: shareModal.filePath,
          ttlHours: ttlHours === 0 ? null : ttlHours,
          password: password || undefined,
        }),
      });

      const data = await res.json();
      if (data.shareUrl) {
        setGeneratedLink(data.shareUrl);
        fetchActiveShares(shareModal.filePath);
        fetchFiles();
      }
    } catch (err) {
      console.error("Error creating share link", err);
    } finally {
      setGenerating(false);
    }
  };

  const handleRevokeShareLink = async (shareId: string) => {
    try {
      const res = await fetch(`/api/share?shareId=${encodeURIComponent(shareId)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setActiveShares((prev) => prev.filter((s) => s.id !== shareId));
        if (shareModal) {
          fetchActiveShares(shareModal.filePath);
        }
        fetchFiles();
      }
    } catch (err) {
      console.error("Error revoking share link", err);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getFileIcon = (filename: string) => {
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) {
      return <ImageIcon className="w-5 h-5 text-purple-400" />;
    }
    if (["mp4", "mov", "mkv", "avi"].includes(ext)) {
      return <Film className="w-5 h-5 text-pink-400" />;
    }
    if (["js", "ts", "json", "py", "swift", "html", "css"].includes(ext)) {
      return <Code className="w-5 h-5 text-emerald-400" />;
    }
    if (["zip", "tar", "gz", "rar", "7z"].includes(ext)) {
      return <Archive className="w-5 h-5 text-amber-400" />;
    }
    return <FileText className="w-5 h-5 text-blue-400" />;
  };

  const displayRows = useMemo<ExplorerRow[]>(() => {
    if (searchQuery.trim().length > 0) {
      const query = searchQuery.toLowerCase();
      return files
        .filter((f) => f.filename.toLowerCase().includes(query) || f.path.toLowerCase().includes(query))
        .map((f) => ({ isFolder: false, item: f }));
    }

    const folderMap = new Map<string, number>();
    const fileList: FileItem[] = [];

    const prefix = currentPath ? (currentPath.endsWith("/") ? currentPath : `${currentPath}/`) : "";

    for (const f of files) {
      if (prefix && !f.path.startsWith(prefix)) continue;

      const relativePath = prefix ? f.path.slice(prefix.length) : f.path;
      if (!relativePath) continue;

      const parts = relativePath.split("/");

      if (parts.length > 1) {
        const folderName = parts[0];
        folderMap.set(folderName, (folderMap.get(folderName) || 0) + 1);
      } else {
        fileList.push(f);
      }
    }

    const folderRows: DirectoryRow[] = Array.from(folderMap.entries()).map(([folderName, count]) => ({
      isFolder: true,
      name: folderName,
      fullPath: prefix ? `${prefix}${folderName}` : folderName,
      itemCount: count,
    }));

    const fileRows: FileRow[] = fileList.map((f) => ({ isFolder: false, item: f }));

    return [...folderRows, ...fileRows];
  }, [files, currentPath, searchQuery]);

  const breadcrumbs = useMemo(() => {
    if (!currentPath) return [];
    const parts = currentPath.split("/").filter(Boolean);
    let accum = "";
    return parts.map((part) => {
      accum = accum ? `${accum}/${part}` : part;
      return { name: part, path: accum };
    });
  }, [currentPath]);

  const navigateUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    setCurrentPath(parts.join("/"));
  };

  const handleDirectDownload = (file: FileItem) => {
    const downloadUrl = `/api/files/download?filePath=${encodeURIComponent(file.path)}`;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = file.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleDeleteFile = async (file: FileItem) => {
    if (!confirm(`Möchtest du "${file.filename}" wirklich unwiderruflich aus R2 löschen?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/files?filePath=${encodeURIComponent(file.path)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchFiles();
      }
    } catch (err) {
      console.error("Error deleting file", err);
    }
  };

  return (
    <div
      onDragOver={handleWindowDragOver}
      onDragLeave={handleWindowDragLeave}
      onDrop={handleWindowDrop}
      className="min-h-screen flex flex-col bg-slate-950 text-slate-100 relative"
    >
      {/* External Dropzone Overlay */}
      {isDraggingExternal && (
        <div className="fixed inset-0 bg-orange-500/20 backdrop-blur-md border-4 border-dashed border-orange-500 z-50 flex flex-col items-center justify-center p-6 text-center animate-fade-in pointer-events-none">
          <div className="w-20 h-20 rounded-3xl bg-orange-500 text-white flex items-center justify-center shadow-2xl shadow-orange-500/50 mb-4 animate-bounce">
            <Upload className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-1">Dateien hier ablegen</h2>
          <p className="text-sm text-orange-200">
            Wird hochgeladen in: <span className="font-mono bg-slate-900/80 px-2 py-1 rounded text-orange-400">{currentPath || "Root"}</span>
          </p>
        </div>
      )}

      {/* Uploading Notification */}
      {uploading && (
        <div className="fixed bottom-6 right-6 bg-slate-900 border border-slate-700 text-white px-5 py-3 rounded-2xl shadow-2xl z-50 flex items-center gap-3 animate-slide-up">
          <RefreshCw className="w-5 h-5 text-orange-500 animate-spin" />
          <span className="text-sm font-medium">Dateien werden nach R2 hochgeladen...</span>
        </div>
      )}

      {/* Top Navbar */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/60 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-orange-500 to-amber-400 flex items-center justify-center shadow-md shadow-orange-500/20">
            <Cloud className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-white tracking-tight flex items-center gap-2">
              R2Sync Drive
              <span className="text-[10px] font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded-full uppercase">
                VPS SQLite
              </span>
            </h1>
            <p className="text-xs text-slate-400">easyfisk-docs • ocpp-labs.com</p>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          {/* File Upload Button */}
          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium cursor-pointer shadow-md shadow-orange-500/20 transition-all active:scale-95">
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Hochladen</span>
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && uploadFiles(e.target.files)}
            />
          </label>

          <button
            onClick={fetchFiles}
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Aktualisieren"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-red-500/20 hover:text-red-400 text-slate-300 text-sm transition-colors border border-slate-700/50"
          >
            <LogOut className="w-4 h-4" />
            <span>Abmelden</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-6">
        {/* Toolbar & Search */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/40 p-4 rounded-2xl border border-slate-800/80">
          {/* Breadcrumb Navigation */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (draggedFileItem) {
                moveFileToFolder(draggedFileItem, "");
                setDraggedFileItem(null);
              }
            }}
            className="flex items-center gap-1.5 overflow-x-auto text-sm text-slate-300 w-full sm:w-auto py-1"
          >
            <button
              onClick={() => setCurrentPath("")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors ${
                !currentPath ? "bg-orange-500/20 text-orange-400 font-semibold" : "hover:bg-slate-800 text-slate-400"
              }`}
            >
              <Home className="w-4 h-4" />
              <span>Root</span>
            </button>

            {breadcrumbs.map((b) => (
              <div
                key={b.path}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedFileItem) {
                    moveFileToFolder(draggedFileItem, b.path);
                    setDraggedFileItem(null);
                  }
                }}
                className="flex items-center gap-1.5"
              >
                <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                <button
                  onClick={() => setCurrentPath(b.path)}
                  className={`px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap ${
                    currentPath === b.path
                      ? "bg-orange-500/20 text-orange-400 font-semibold"
                      : "hover:bg-slate-800 text-slate-400"
                  }`}
                >
                  {b.name}
                </button>
              </div>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Alle Dateien durchsuchen..."
              className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 rounded-xl py-2 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none transition-all"
            />
          </div>
        </div>

        {/* Back button if inside subfolder */}
        {currentPath && !searchQuery && (
          <div className="flex items-center">
            <button
              onClick={navigateUp}
              className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Übergeordneter Ordner</span>
            </button>
          </div>
        )}

        {/* File Table / Explorer */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          {loading ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-orange-500" />
              <p>Dateien und Ordner werden geladen...</p>
            </div>
          ) : displayRows.length === 0 ? (
            <div className="p-16 text-center text-slate-500 flex flex-col items-center gap-3">
              <Folder className="w-12 h-12 text-slate-700" />
              <p className="text-base font-medium">Dieser Ordner ist leer</p>
              <p className="text-xs text-slate-600">
                Ziehe Dateien von deinem PC hierher zum Hochladen oder Verschieben.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-900/90 text-xs uppercase font-semibold text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4">Name</th>
                    <th className="py-3.5 px-4">Größe / Inhalt</th>
                    <th className="py-3.5 px-4">Aktualisiert</th>
                    <th className="py-3.5 px-4 text-right">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {displayRows.map((row, idx) => {
                    if (row.isFolder) {
                      const isHoveredTarget = dragOverFolder === row.fullPath;
                      return (
                        <tr
                          key={`folder_${row.fullPath}_${idx}`}
                          onClick={() => setCurrentPath(row.fullPath)}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragOverFolder(row.fullPath);
                          }}
                          onDragLeave={() => setDragOverFolder(null)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setDragOverFolder(null);

                            // External files dropped directly onto folder
                            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                              uploadFiles(e.dataTransfer.files, row.fullPath);
                            }
                            // Internal file dragged onto folder
                            else if (draggedFileItem) {
                              moveFileToFolder(draggedFileItem, row.fullPath);
                              setDraggedFileItem(null);
                            }
                          }}
                          className={`cursor-pointer transition-all group ${
                            isHoveredTarget
                              ? "bg-orange-500/20 border-2 border-orange-500"
                              : "hover:bg-slate-800/50"
                          }`}
                        >
                          <td className="py-3.5 px-4 flex items-center gap-3">
                            <Folder className="w-5 h-5 text-amber-400 fill-amber-400/20 group-hover:scale-110 transition-transform" />
                            <span className="font-semibold text-slate-200 group-hover:text-amber-400 transition-colors">
                              {row.name}
                            </span>
                            {isHoveredTarget && (
                              <span className="text-[10px] bg-orange-500 text-white font-bold px-2 py-0.5 rounded-full animate-pulse">
                                Hier ablegen
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-slate-400 text-xs">
                            {row.itemCount} {row.itemCount === 1 ? "Datei" : "Dateien"}
                          </td>
                          <td className="py-3.5 px-4 text-slate-500 text-xs">—</td>
                          <td className="py-3.5 px-4 text-right">
                            <ChevronRight className="w-4 h-4 text-slate-500 inline-block group-hover:text-slate-300 group-hover:translate-x-1 transition-all" />
                          </td>
                        </tr>
                      );
                    } else {
                      const file = row.item;
                      return (
                        <tr
                          key={file.id}
                          draggable
                          onDragStart={() => setDraggedFileItem(file)}
                          onDragEnd={() => setDraggedFileItem(null)}
                          className="hover:bg-slate-800/40 transition-colors group cursor-grab active:cursor-grabbing"
                        >
                          <td className="py-3.5 px-4 flex items-center gap-3">
                            <Move className="w-3.5 h-3.5 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                            {getFileIcon(file.filename)}
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-200 group-hover:text-white transition-colors">
                                  {file.filename}
                                </span>
                                {file.activeSharesCount && file.activeSharesCount > 0 ? (
                                  <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                                    <Share2 className="w-2.5 h-2.5" />
                                    <span>
                                      {file.activeSharesCount}{" "}
                                      {file.activeSharesCount === 1 ? "aktiver Link" : "aktive Links"}
                                    </span>
                                  </span>
                                ) : null}
                              </div>
                              {searchQuery && (
                                <span className="text-[11px] text-slate-500 truncate max-w-xs">
                                  {file.path}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-400 font-mono text-xs">
                            {formatBytes(file.size)}
                          </td>
                          <td className="py-3.5 px-4 text-slate-400 text-xs">
                            {new Date(file.updatedAt).toLocaleDateString("de-DE", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5 ml-auto">
                              <button
                                onClick={() => handleDirectDownload(file)}
                                className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1 text-xs font-medium transition-all"
                                title="Datei direkt herunterladen"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Download</span>
                              </button>

                              <button
                                onClick={() => openShareModal(file)}
                                className="p-1.5 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center gap-1 text-xs font-medium transition-all"
                                title="Freigabelinks verwalten & erstellen"
                              >
                                <Share2 className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Freigeben</span>
                              </button>

                              <button
                                onClick={() => handleDeleteFile(file)}
                                className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 hover:border-red-500/50 flex items-center gap-1 text-xs font-medium transition-all"
                                title="Datei aus R2 & DB löschen"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Löschen</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* SHARE MODAL WITH REVOKE / DELETE FEATURE */}
      {shareModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => {
                setShareModal(null);
                setGeneratedLink("");
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-orange-500/20 border border-orange-500/30 text-orange-400 flex items-center justify-center">
                <Share2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-white text-lg">Freigabelinks verwalten</h3>
                <p className="text-xs text-slate-400 truncate max-w-xs">
                  {shareModal.filename}
                </p>
              </div>
            </div>

            {/* Tabs Header */}
            <div className="flex items-center gap-2 border-b border-slate-800 mb-5 pb-2">
              <button
                onClick={() => setModalTab("create")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  modalTab === "create"
                    ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                    : "text-slate-400 hover:bg-slate-800"
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Neuen Link erstellen</span>
              </button>

              <button
                onClick={() => setModalTab("list")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  modalTab === "list"
                    ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                    : "text-slate-400 hover:bg-slate-800"
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>Aktive Links ({activeShares.length})</span>
              </button>
            </div>

            {/* TAB 1: CREATE NEW SHARE LINK */}
            {modalTab === "create" && (
              <>
                {!generatedLink ? (
                  <form onSubmit={handleCreateShareLink} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-orange-400" />
                        <span>Ablaufzeit</span>
                      </label>
                      <select
                        value={ttlHours}
                        onChange={(e) => setTtlHours(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-sm text-white outline-none focus:border-orange-500"
                      >
                        <option value={1}>1 Stunde</option>
                        <option value={24}>24 Stunden (1 Tag)</option>
                        <option value={168}>7 Tage</option>
                        <option value={720}>30 Tage</option>
                        <option value={0}>Dauerhaft (Kein Ablaufdatum)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-amber-400" />
                        <span>Passwortschutz (Optional)</span>
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Leer lassen für keinen Passwortschutz"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-sm text-white outline-none focus:border-orange-500 placeholder-slate-600"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={generating}
                      className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-medium py-2.5 rounded-xl shadow-lg shadow-orange-500/20 transition-all flex items-center justify-center gap-2 mt-6"
                    >
                      {generating ? "Generiere..." : "Freigabelink erzeugen"}
                    </button>
                  </form>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Freigabelink erfolgreich erstellt!</span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                        Dein Freigabelink:
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={generatedLink}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-sm text-orange-400 font-mono outline-none"
                        />
                        <button
                          onClick={() => copyToClipboard(generatedLink, "new_link")}
                          className="px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-medium text-sm flex items-center gap-1.5 transition-all shadow-md shadow-orange-500/20 shrink-0"
                        >
                          {copiedId === "new_link" ? (
                            <>
                              <Check className="w-4 h-4" />
                              <span>Kopiert</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" />
                              <span>Kopieren</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* TAB 2: ACTIVE SHARES LIST WITH REVOKE / DELETE BUTTON */}
            {modalTab === "list" && (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {loadingActiveShares ? (
                  <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-orange-500" />
                    <span>Aktive Links werden geladen...</span>
                  </div>
                ) : activeShares.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
                    <Share2 className="w-8 h-8 text-slate-700" />
                    <span>Keine aktiven Freigabelinks für diese Datei vorhanden</span>
                  </div>
                ) : (
                  activeShares.map((share) => (
                    <div
                      key={share.id}
                      className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between gap-3 group hover:border-slate-700 transition-colors"
                    >
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-xs font-mono text-orange-400 truncate">
                          {share.shareUrl}
                        </span>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-500" />
                            {share.expiresAt
                              ? `Ablauf: ${new Date(share.expiresAt).toLocaleDateString("de-DE", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}`
                              : "Dauerhaft"}
                          </span>

                          {share.requiresPassword && (
                            <span className="text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 text-[10px] font-semibold flex items-center gap-1">
                              <Lock className="w-2.5 h-2.5" />
                              <span>Passwort</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => copyToClipboard(share.shareUrl, share.id)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors text-xs flex items-center gap-1"
                          title="Link kopieren"
                        >
                          {copiedId === share.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <button
                          onClick={() => handleRevokeShareLink(share.id)}
                          className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition-colors text-xs flex items-center gap-1"
                          title="Freigabelink löschen (unbrauchbar machen)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Löschen</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
