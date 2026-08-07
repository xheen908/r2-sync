import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  Platform,
  Alert,
  Share,
  Modal,
  Image,
  ActivityIndicator,
  TextInput,
  Dimensions,
  BackHandler,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import * as NavigationBar from "expo-navigation-bar";
import { WebView } from "react-native-webview";
import * as FileSystem from "expo-file-system/legacy";
import {
  Cloud,
  Folder,
  FileText,
  Camera,
  LogOut,
  MoreVertical,
  ArrowLeft,
  Share2,
  Trash2,
  Clock,
  Infinity as InfinityIcon,
  RefreshCw,
  FolderInput,
  Eye,
  X,
  Edit2,
  LayoutGrid,
  List,
} from "lucide-react-native";

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "heic", "bmp"];
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GALLERY_COLS = 3;
const GALLERY_TILE = (SCREEN_WIDTH - 4) / GALLERY_COLS;
import {
  fetchFilesList,
  deleteFileFromVPS,
  moveFileOnVPS,
  renameFileOnVPS,
  generateShareLink,
  clearConfig,
  getSavedConfig,
  FileItem,
} from "../services/api";
import {
  subscribeToMediaChanges,
  runAutoPhotoSync,
  registerBackgroundPhotoSyncTask,
  SyncProgressStatus,
} from "../services/photoSync";
import { AppState } from "react-native";

interface DriveScreenProps {
  onLogout: () => void;
}

export const DriveScreen: React.FC<DriveScreenProps> = ({ onLogout }) => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string>("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncProgressStatus | null>(null);
  const [selectedFile, setSelectedFile] = useState<any | null>(null);
  const [isActionModalVisible, setIsActionModalVisible] = useState(false);
  const [isMoveModalVisible, setIsMoveModalVisible] = useState(false);
  const [isRenameModalVisible, setIsRenameModalVisible] = useState(false);
  const [renameInputValue, setRenameInputValue] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  // Gallery / List toggle: 'auto' respects auto-detection, 'list' forces list, 'gallery' forces gallery
  const [viewMode, setViewMode] = useState<'auto' | 'list' | 'gallery'>('auto');
  const [serverUrl, setServerUrl] = useState<string>("");

  // Viewer Modals State
  const [isImagePreviewVisible, setIsImagePreviewVisible] = useState(false);
  const [previewImages, setPreviewImages] = useState<any[]>([]); // all images in folder
  const [previewIndex, setPreviewIndex] = useState(0);           // current swipe index
  const [isImageLoading, setIsImageLoading] = useState(false);
  const previewListRef = React.useRef<FlatList>(null);

  const [isPdfPreviewVisible, setIsPdfPreviewVisible] = useState(false);
  const [previewPdfHtml, setPreviewPdfHtml] = useState<string | null>(null);
  const [isPdfLoading, setIsPdfLoading] = useState(false);

  const loadData = async () => {
    try {
      const cfg = await getSavedConfig();
      if (cfg) setServerUrl(cfg.serverUrl);
      const items = await fetchFilesList();
      setFiles(items);
    } catch (err: any) {
      console.warn("Failed to load files", err);
    }
  };

  // Returns true if the current folder is predominantly images (>50%)
  const isImageFolder = useCallback(() => {
    const displayItems = getDisplayItemsForCheck();
    const fileItems = displayItems.filter((i: any) => !i.isFolder);
    if (fileItems.length === 0) return false;
    const imageCount = fileItems.filter((i: any) => {
      const ext = (i.filename || "").split(".").pop()?.toLowerCase() || "";
      return IMAGE_EXTENSIONS.includes(ext);
    }).length;
    return imageCount / fileItems.length > 0.5;
  }, [files, currentFolder]);

  const shouldShowGallery = useCallback(() => {
    if (viewMode === 'gallery') return true;
    if (viewMode === 'list') return false;
    return isImageFolder(); // 'auto'
  }, [viewMode, isImageFolder]);

  // Reset to auto-detect when navigating folders
  const navigateToFolder = (path: string) => {
    setViewMode('auto');
    setCurrentFolder(path);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    await runAutoPhotoSync((status) => setSyncStatus(status));
    setIsRefreshing(false);
  };

  useEffect(() => {
    loadData();
    
    // Register background task for Android 15/16 compliance
    registerBackgroundPhotoSyncTask();

    // Run photo sync once on app launch
    runAutoPhotoSync((status) => setSyncStatus(status)).then(() => loadData());

    // 1. Listen for new photos added to Camera Roll in real-time
    const mediaSub = subscribeToMediaChanges(() => {
      console.log("[DriveScreen] Real-time photo addition detected in Camera Roll");
      runAutoPhotoSync((status) => setSyncStatus(status)).then(() => loadData());
    });

    // 2. Listen for AppState changes (e.g. returning to R2Sync from Camera app)
    const appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        console.log("[DriveScreen] App active, triggering photo sync");
        runAutoPhotoSync((status) => setSyncStatus(status)).then(() => loadData());
      }
    });

    return () => {
      mediaSub.remove();
      appStateSub.remove();
    };
  }, []);

  // Enforce Navigation Bar background color on Android
  useEffect(() => {
    if (Platform.OS === "android") {
      try {
        if (NavigationBar && typeof NavigationBar.setPositionAsync === "function") {
          NavigationBar.setPositionAsync("relative");
        }
        if (NavigationBar && typeof NavigationBar.setBackgroundColorAsync === "function") {
          NavigationBar.setBackgroundColorAsync("#0B1120");
        }
        if (NavigationBar && typeof NavigationBar.setButtonStyleAsync === "function") {
          NavigationBar.setButtonStyleAsync("light");
        }
      } catch (err) {
        console.warn("NavigationBar setup error:", err);
      }
    }
  }, []);

  // Handle Android Hardware Back Button
  useEffect(() => {
    const onBackPress = () => {
      // 1. Close full-screen image preview if open
      if (isImagePreviewVisible) {
        setIsImagePreviewVisible(false);
        return true;
      }
      // 2. Close full-screen PDF preview if open
      if (isPdfPreviewVisible) {
        setIsPdfPreviewVisible(false);
        return true;
      }
      // 3. Close modals if open
      if (isActionModalVisible) {
        setIsActionModalVisible(false);
        return true;
      }
      if (isMoveModalVisible) {
        setIsMoveModalVisible(false);
        return true;
      }
      if (isRenameModalVisible) {
        setIsRenameModalVisible(false);
        return true;
      }
      // 4. Navigate to parent folder if inside a subfolder
      if (currentFolder !== "") {
        const parts = currentFolder.split("/");
        parts.pop();
        navigateToFolder(parts.join("/"));
        return true;
      }
      // Default: let system exit app or default action at root
      return false;
    };

    const backHandler = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => backHandler.remove();
  }, [
    currentFolder,
    isImagePreviewVisible,
    isPdfPreviewVisible,
    isActionModalVisible,
    isMoveModalVisible,
    isRenameModalVisible,
  ]);

  // Extract all available folder paths in the bucket
  const getAllAvailableFolders = () => {
    const foldersSet = new Set<string>();
    foldersSet.add(""); // Root / Hauptverzeichnis

    files.forEach((f) => {
      const parts = f.path.split("/");
      if (parts.length > 1) {
        let acc = "";
        for (let i = 0; i < parts.length - 1; i++) {
          acc = acc ? `${acc}/${parts[i]}` : parts[i];
          foldersSet.add(acc);
        }
      }
    });

    return Array.from(foldersSet);
  };

  // Shared logic for computing display items (used both for rendering and detection)
  const getDisplayItemsForCheck = () => {
    const foldersSet = new Set<string>();
    const fileItems: FileItem[] = [];
    const prefix = currentFolder ? currentFolder + "/" : "";
    files.forEach((file) => {
      if (file.path.startsWith(prefix)) {
        const subPath = file.path.slice(prefix.length);
        if (subPath.includes("/")) {
          foldersSet.add(subPath.split("/")[0]);
        } else if (subPath.length > 0) {
          fileItems.push(file);
        }
      }
    });
    const folderItems = Array.from(foldersSet).map((name) => ({
      isFolder: true,
      name,
      path: prefix + name,
    }));
    return [...folderItems, ...fileItems.map((f) => ({ isFolder: false, ...f }))];
  };

  // Compute current folder contents & subfolders
  const getDisplayItems = () => getDisplayItemsForCheck();

  const handleOpenFile = async (item: FileItem) => {
    console.log("[DriveScreen] handleOpenFile triggered for:", item.filename);
    const cfg = await getSavedConfig();
    if (!cfg) return;

    const fileExt = item.filename.split(".").pop()?.toLowerCase() || "";
    const isImage = ["jpg", "jpeg", "png", "webp", "gif", "heic", "bmp"].includes(fileExt);
    const isPdf = fileExt === "pdf";

    const downloadUrl = `${cfg.serverUrl}/api/files/download?filePath=${encodeURIComponent(item.path)}`;

    if (isImage) {
      // Build the list of all images in the current folder for swipe navigation
      const allItems = getDisplayItemsForCheck();
      const folderImages = allItems.filter((i: any) => {
        if (i.isFolder) return false;
        const ext = (i.filename || "").split(".").pop()?.toLowerCase() || "";
        return IMAGE_EXTENSIONS.includes(ext);
      });
      const idx = folderImages.findIndex((i: any) => i.path === item.path);
      setPreviewImages(folderImages);
      setPreviewIndex(idx >= 0 ? idx : 0);
      setSelectedFile(folderImages[idx >= 0 ? idx : 0]);
      setIsImageLoading(true);
      setIsImagePreviewVisible(true);
      // Scroll to the correct index after the modal renders
      setTimeout(() => {
        previewListRef.current?.scrollToIndex({ index: idx >= 0 ? idx : 0, animated: false });
      }, 50);
    } else if (isPdf) {
      setSelectedFile(item);
      setIsPdfLoading(true);
      setPreviewPdfHtml(null);
      setIsPdfPreviewVisible(true);

      try {
        const sanitizedFilename = item.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        const localUri = `${FileSystem.cacheDirectory}${sanitizedFilename}`;
        
        let downloadRes;
        try {
          downloadRes = await FileSystem.downloadAsync(downloadUrl, localUri);
        } catch (httpsErr) {
          console.warn("[DriveScreen] HTTPS PDF download failed, trying HTTP fallback...", httpsErr);
          const httpUrl = downloadUrl.replace("https://", "http://");
          downloadRes = await FileSystem.downloadAsync(httpUrl, localUri);
        }
        
        const base64Data = await FileSystem.readAsStringAsync(downloadRes.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes">
            <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js"></script>
            <style>
              * { box-sizing: border-box; }
              html, body { width: 100%; height: 100%; margin: 0; padding: 0; background-color: #0F172A; }
              body { padding: 12px; display: flex; flex-direction: column; align-items: center; overflow-y: auto; }
              #loading { color: #F38020; font-family: -apple-system, Roboto, sans-serif; font-size: 16px; margin-top: 40px; font-weight: 700; text-align: center; }
              #pdf-container { width: 100%; display: flex; flex-direction: column; align-items: center; }
              canvas { width: 100% !important; height: auto !important; margin-bottom: 16px; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.6); }
            </style>
          </head>
          <body>
            <div id="loading">📄 PDF wird geladen...</div>
            <div id="pdf-container"></div>
            <script>
              window.onerror = function(msg, url, line) {
                if (window.ReactNativeWebView) {
                  window.ReactNativeWebView.postMessage("ERR: " + msg + " (" + line + ")");
                }
              };

              pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

              try {
                const rawData = atob("${base64Data}");
                const bytes = new Uint8Array(rawData.length);
                for (let i = 0; i < rawData.length; i++) {
                  bytes[i] = rawData.charCodeAt(i);
                }

                const loadingTask = pdfjsLib.getDocument({ data: bytes });
                loadingTask.promise.then(function(pdf) {
                  document.getElementById('loading').style.display = 'none';
                  const container = document.getElementById('pdf-container');
                  
                  function renderNextPage(pageNum) {
                    if (pageNum > pdf.numPages) return;
                    pdf.getPage(pageNum).then(function(page) {
                      const viewport = page.getViewport({ scale: 1.5 });
                      const canvas = document.createElement('canvas');
                      const context = canvas.getContext('2d');
                      canvas.height = viewport.height;
                      canvas.width = viewport.width;
                      container.appendChild(canvas);

                      page.render({ canvasContext: context, viewport: viewport }).promise.then(function() {
                        renderNextPage(pageNum + 1);
                      });
                    });
                  }

                  renderNextPage(1);
                }).catch(function(err) {
                  const errorMsg = '❌ Fehler beim Lesen: ' + (err.message || String(err));
                  document.getElementById('loading').innerHTML = errorMsg;
                  document.getElementById('loading').style.color = '#EF4444';
                  if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(errorMsg);
                  }
                });
              } catch (e) {
                const eMsg = '❌ Base64 Decodierung fehlgeschlagen: ' + e.message;
                document.getElementById('loading').innerHTML = eMsg;
                if (window.ReactNativeWebView) {
                  window.ReactNativeWebView.postMessage(eMsg);
                }
              }
            </script>
          </body>
          </html>
        `;

        setPreviewPdfHtml(htmlContent);
      } catch (err: any) {
        console.error("PDF load error:", err);
        Alert.alert("PDF Fehler", err?.message || String(err));
      } finally {
        setIsPdfLoading(false);
      }
    } else {
      setSelectedFile(item);
      setIsActionModalVisible(true);
    }
  };

  const handleShareLink = async (filePath: string, ttlHours: number | null, isFolder = false) => {
    try {
      const url = await generateShareLink(filePath, ttlHours, isFolder);
      setIsActionModalVisible(false);
      await Share.share({
        message: `Hier ist der R2Sync Freigabelink:\n${url}`,
        url,
      });
    } catch (err: any) {
      Alert.alert("Fehler", err?.message || "Link konnte nicht generiert werden");
    }
  };

  const handleMoveItem = async (targetFolderPath: string) => {
    if (!selectedFile) return;

    try {
      setIsMoveModalVisible(false);
      setIsActionModalVisible(false);
      const sourcePath = selectedFile.path;
      
      const success = await moveFileOnVPS(sourcePath, targetFolderPath);
      if (success) {
        await loadData();
        Alert.alert("Erfolg", `Erfolgreich nach "${targetFolderPath || 'Hauptverzeichnis'}" verschoben.`);
      } else {
        Alert.alert("Fehler", "Verschieben fehlgeschlagen.");
      }
    } catch (err: any) {
      Alert.alert("Fehler beim Verschieben", err?.message || "Verschieben fehlgeschlagen");
    }
  };

  const handleRename = (file: any) => {
    setIsActionModalVisible(false);
    setSelectedFile(file);
    const currentName = file.filename || file.name || "";
    setRenameInputValue(currentName);
    setIsRenameModalVisible(true);
  };

  const handleExecuteRename = async () => {
    if (!selectedFile || !renameInputValue.trim()) return;
    const currentName = selectedFile.filename || selectedFile.name || "";
    if (renameInputValue.trim() === currentName) {
      setIsRenameModalVisible(false);
      return;
    }

    try {
      setIsRenaming(true);
      const success = await renameFileOnVPS(selectedFile.path, renameInputValue.trim(), !!selectedFile.isFolder);
      setIsRenaming(false);
      setIsRenameModalVisible(false);
      if (success) {
        await loadData();
      } else {
        Alert.alert("Fehler", "Umbenennen fehlgeschlagen.");
      }
    } catch (err: any) {
      setIsRenaming(false);
      setIsRenameModalVisible(false);
      Alert.alert("Fehler", err?.message || "Umbenennen fehlgeschlagen.");
    }
  };

  const handleDelete = (filePath: string) => {
    Alert.alert(
      "Löschen bestätigen",
      `Möchtest du "${filePath.split("/").pop()}" wirklich unwiderruflich löschen?`,
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Löschen",
          style: "destructive",
          onPress: async () => {
            setIsActionModalVisible(false);
            setIsImagePreviewVisible(false);
            setIsPdfPreviewVisible(false);
            await deleteFileFromVPS(filePath);
            loadData();
          },
        },
      ]
    );
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Gallery tile renderer (3-column grid)
  const renderGalleryItem = ({ item }: { item: any }) => {
    if (item.isFolder) {
      return (
        <TouchableOpacity
          style={styles.galleryFolderTile}
          onPress={() => navigateToFolder(item.path)}
          activeOpacity={0.7}
        >
          <Folder size={32} color="#F38020" strokeWidth={2} />
          <Text style={styles.galleryFolderName} numberOfLines={2}>{item.name}</Text>
        </TouchableOpacity>
      );
    }

    const fileExt = (item.filename || "").split(".").pop()?.toLowerCase() || "";
    const isImage = IMAGE_EXTENSIONS.includes(fileExt);
    const thumbUrl = serverUrl && isImage
      ? `${serverUrl}/api/files/thumbnail?filePath=${encodeURIComponent(item.path)}&size=300`
      : null;

    return (
      <TouchableOpacity
        style={styles.galleryTile}
        onPress={() => handleOpenFile(item)}
        onLongPress={() => { setSelectedFile(item); setIsActionModalVisible(true); }}
        activeOpacity={0.85}
      >
        {isImage && thumbUrl ? (
          <ExpoImage
            source={{ uri: thumbUrl }}
            style={styles.galleryThumb}
            contentFit="cover"
            cachePolicy="disk"
            recyclingKey={item.path}
            transition={150}
          />
        ) : (
          <View style={styles.galleryThumbPlaceholder}>
            <FileText size={28} color="#38BDF8" strokeWidth={1.5} />
            <Text style={styles.galleryThumbExt}>.{fileExt}</Text>
          </View>
        )}
        <View style={styles.galleryTileOverlay}>
          <Text style={styles.galleryTileName} numberOfLines={1}>{item.filename}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  // List row renderer
  const renderItem = ({ item }: { item: any }) => {
    if (item.isFolder) {
      return (
        <TouchableOpacity
          style={styles.itemCard}
          onPress={() => navigateToFolder(item.path)}
          onLongPress={() => {
            setSelectedFile(item);
            setIsMoveModalVisible(true);
          }}
          activeOpacity={0.7}
        >
          <View style={styles.iconContainerFolder}>
            <Folder size={22} color="#F38020" strokeWidth={2.2} />
          </View>
          <View style={styles.itemInfo}>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemMeta}>Ordner • Tippen/Halten zum Verschieben</Text>
          </View>
          <TouchableOpacity
            style={{ padding: 10 }}
            onPress={() => {
              setSelectedFile(item);
              setIsActionModalVisible(true);
            }}
          >
            <MoreVertical size={20} color="#94A3B8" />
          </TouchableOpacity>
        </TouchableOpacity>
      );
    }

    const fileExt = item.filename.split(".").pop()?.toLowerCase() || "";
    const isImage = IMAGE_EXTENSIONS.includes(fileExt);
    const isPdf = fileExt === "pdf";

    return (
      <TouchableOpacity
        style={styles.itemCard}
        onPress={() => handleOpenFile(item)}
        onLongPress={() => {
          setSelectedFile(item);
          setIsMoveModalVisible(true);
        }}
        activeOpacity={0.7}
      >
        <View style={isImage ? styles.iconContainerImage : isPdf ? styles.iconContainerPdf : styles.iconContainerFile}>
          {isImage ? (
            <Eye size={22} color="#A855F7" strokeWidth={2} />
          ) : isPdf ? (
            <FileText size={22} color="#EF4444" strokeWidth={2} />
          ) : (
            <FileText size={22} color="#38BDF8" strokeWidth={2} />
          )}
        </View>
        <View style={styles.itemInfo}>
          <Text style={styles.itemName} numberOfLines={1}>
            {item.filename}
          </Text>
          <Text style={styles.itemMeta}>
            {formatSize(item.size)} • {new Date(item.updatedAt).toLocaleDateString("de-DE")}
          </Text>
        </View>
        <TouchableOpacity
          style={{ padding: 10 }}
          onPress={() => {
            setSelectedFile(item);
            setIsActionModalVisible(true);
          }}
        >
          <MoreVertical size={20} color="#94A3B8" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const statusBarHeight = Platform.OS === "android" ? StatusBar.currentHeight || 24 : 0;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B1120" translucent />

      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: statusBarHeight + 12 }]}>
        <View style={styles.headerLeft}>
          <View style={styles.logoRow}>
            <Cloud size={24} color="#F38020" strokeWidth={2.5} />
            <Text style={styles.headerTitle}>R2Sync</Text>
          </View>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {currentFolder ? `/${currentFolder}` : "Hauptverzeichnis"}
          </Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.syncBtn}
            activeOpacity={0.8}
            onPress={async () => {
              await runAutoPhotoSync((status) => setSyncStatus(status));
              loadData();
            }}
          >
            <Camera size={15} color="#FFFFFF" strokeWidth={2.2} style={{ marginRight: 6 }} />
            <Text style={styles.syncBtnText}>Fotos sichern</Text>
          </TouchableOpacity>

          {/* Gallery / List toggle */}
          <TouchableOpacity
            style={styles.viewToggleBtn}
            activeOpacity={0.8}
            onPress={() => {
              setViewMode(prev => {
                if (prev === 'auto') return shouldShowGallery() ? 'list' : 'gallery';
                if (prev === 'gallery') return 'list';
                return 'gallery';
              });
            }}
          >
            {shouldShowGallery() ? (
              <List size={18} color="#94A3B8" strokeWidth={2} />
            ) : (
              <LayoutGrid size={18} color="#94A3B8" strokeWidth={2} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.logoutBtn}
            activeOpacity={0.8}
            onPress={async () => {
              await clearConfig();
              onLogout();
            }}
          >
            <LogOut size={16} color="#94A3B8" strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Auto Photo Sync Progress Bar */}
      {syncStatus && (
        <View style={styles.syncBar}>
          <RefreshCw size={14} color="#F38020" strokeWidth={2.2} style={{ marginRight: 8 }} />
          <Text style={styles.syncBarText} numberOfLines={1}>
            {syncStatus.statusText}
          </Text>
        </View>
      )}

      {/* Navigation Breadcrumb Back Button */}
      {currentFolder !== "" && (
        <TouchableOpacity
          style={styles.backBtn}
          activeOpacity={0.7}
          onPress={() => {
            const parts = currentFolder.split("/");
            parts.pop();
            navigateToFolder(parts.join("/"));
          }}
        >
          <ArrowLeft size={16} color="#38BDF8" strokeWidth={2.2} style={{ marginRight: 8 }} />
          <Text style={styles.backBtnText}>Zurück in übergeordneten Ordner</Text>
        </TouchableOpacity>
      )}

      {/* Auto-detected gallery badge */}
      {shouldShowGallery() && viewMode === 'auto' && (
        <View style={styles.galleryBadge}>
          <LayoutGrid size={12} color="#A855F7" strokeWidth={2} style={{ marginRight: 4 }} />
          <Text style={styles.galleryBadgeText}>Galerie-Ansicht (automatisch erkannt)</Text>
        </View>
      )}

      {/* File List or Gallery Grid */}
      {shouldShowGallery() ? (
        <FlatList
          key="gallery"
          style={{ flex: 1 }}
          data={getDisplayItems()}
          keyExtractor={(item: any) => item.path || item.name || item.filename}
          renderItem={renderGalleryItem}
          numColumns={GALLERY_COLS}
          contentContainerStyle={styles.galleryContainer}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#F38020" />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Folder size={48} color="#334155" strokeWidth={1.5} style={{ marginBottom: 12 }} />
              <Text style={styles.emptyText}>Dieser Ordner ist leer.</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          key="list"
          style={{ flex: 1 }}
          data={getDisplayItems()}
          keyExtractor={(item: any) => item.path || item.name || item.filename}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor="#F38020"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Folder size={48} color="#334155" strokeWidth={1.5} style={{ marginBottom: 12 }} />
              <Text style={styles.emptyText}>Dieser Ordner ist leer.</Text>
            </View>
          }
        />
      )}

      {/* Fullscreen Swipeable Image Preview Modal */}
      {isImagePreviewVisible && previewImages.length > 0 && (
        <Modal
          visible={isImagePreviewVisible}
          transparent={false}
          animationType="fade"
          onRequestClose={() => setIsImagePreviewVisible(false)}
        >
          <SafeAreaView style={styles.viewerContainer}>
            {/* Header */}
            <View style={[styles.viewerHeader, { paddingTop: statusBarHeight + 12 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.viewerTitle} numberOfLines={1}>
                  {selectedFile?.filename}
                </Text>
                <Text style={styles.viewerSubtitle}>
                  {previewIndex + 1} / {previewImages.length}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setIsImagePreviewVisible(false)}
              >
                <X size={24} color="#F8FAFC" />
              </TouchableOpacity>
            </View>

            {/* Swipeable Image Pages */}
            <FlatList
              ref={previewListRef}
              data={previewImages}
              keyExtractor={(item: any) => item.path}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={previewIndex}
              getItemLayout={(_, index) => ({
                length: SCREEN_WIDTH,
                offset: SCREEN_WIDTH * index,
                index,
              })}
              onMomentumScrollEnd={(e) => {
                const newIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                if (newIndex !== previewIndex) {
                  setPreviewIndex(newIndex);
                  setSelectedFile(previewImages[newIndex]);
                  setIsImageLoading(true);
                }
              }}
              renderItem={({ item: imgItem }) => {
                const imgUrl = serverUrl
                  ? `${serverUrl}/api/files/download?filePath=${encodeURIComponent(imgItem.path)}&inline=1`
                  : null;
                return (
                  <View style={{ width: SCREEN_WIDTH, flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
                    {isImageLoading && (
                      <ActivityIndicator size="large" color="#F38020" style={StyleSheet.absoluteFill} />
                    )}
                    {imgUrl ? (
                      <Image
                        source={{ uri: imgUrl }}
                        style={{ width: SCREEN_WIDTH, flex: 1 }}
                        resizeMode="contain"
                        onLoadEnd={() => setIsImageLoading(false)}
                        onError={() => setIsImageLoading(false)}
                      />
                    ) : null}
                  </View>
                );
              }}
              style={{ flex: 1 }}
            />

            {/* Action Footer */}
            <View style={styles.viewerFooter}>
              <TouchableOpacity
                style={styles.viewerActionBtn}
                onPress={() => selectedFile && handleShareLink(selectedFile.path, 24)}
              >
                <Share2 size={18} color="#38BDF8" style={{ marginRight: 8 }} />
                <Text style={styles.viewerActionText}>Teilen</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.viewerActionBtn, styles.deleteBtn]}
                onPress={() => selectedFile && handleDelete(selectedFile.path)}
              >
                <Trash2 size={18} color="#FCA5A5" style={{ marginRight: 8 }} />
                <Text style={[styles.viewerActionText, styles.deleteBtnText]}>Löschen</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Modal>
      )}

      {/* Fullscreen In-App PDF Base64 Canvas Viewer Modal */}
      {selectedFile && isPdfPreviewVisible && (
        <Modal
          visible={isPdfPreviewVisible}
          transparent={false}
          animationType="fade"
          onRequestClose={() => setIsPdfPreviewVisible(false)}
        >
          <SafeAreaView style={styles.viewerContainer}>
            {/* Header */}
            <View style={[styles.viewerHeader, { paddingTop: statusBarHeight + 12 }]}>
              <Text style={styles.viewerTitle} numberOfLines={1}>
                📄 {selectedFile.filename}
              </Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setIsPdfPreviewVisible(false)}
              >
                <X size={24} color="#F8FAFC" />
              </TouchableOpacity>
            </View>

            {/* HTML5 Base64 Canvas WebView */}
            <View style={styles.viewerBody}>
              {isPdfLoading && (
                <ActivityIndicator size="large" color="#F38020" style={StyleSheet.absoluteFill} />
              )}
              {previewPdfHtml ? (
                <WebView
                  source={{ html: previewPdfHtml }}
                  style={styles.fullPdf}
                  originWhitelist={["*"]}
                  javaScriptEnabled
                  domStorageEnabled
                  allowFileAccess
                  allowFileAccessFromFileURLs
                  allowUniversalAccessFromFileURLs
                  mixedContentMode="always"
                  onMessage={(e) => {
                    const msg = e.nativeEvent.data;
                    console.log("[WebView Message]", msg);
                    if (msg.startsWith("ERR:")) {
                      Alert.alert("PDF Rendering Fehler", msg);
                    }
                  }}
                  startInLoadingState
                  renderLoading={() => (
                    <ActivityIndicator size="large" color="#F38020" style={StyleSheet.absoluteFill} />
                  )}
                />
              ) : null}
            </View>

            {/* Action Footer */}
            <View style={styles.viewerFooter}>
              <TouchableOpacity
                style={styles.viewerActionBtn}
                onPress={() => handleShareLink(selectedFile.path, 24)}
              >
                <Share2 size={18} color="#38BDF8" style={{ marginRight: 8 }} />
                <Text style={styles.viewerActionText}>Teilen</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.viewerActionBtn, styles.deleteBtn]}
                onPress={() => handleDelete(selectedFile.path)}
              >
                <Trash2 size={18} color="#FCA5A5" style={{ marginRight: 8 }} />
                <Text style={[styles.viewerActionText, styles.deleteBtnText]}>Löschen</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </Modal>
      )}

      {/* File Action Sheet Modal */}
      {selectedFile && (
        <Modal
          visible={isActionModalVisible}
          transparent
          statusBarTranslucent
          animationType="fade"
          onRequestClose={() => setIsActionModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setIsActionModalVisible(false)}
          >
            <TouchableOpacity activeOpacity={1} style={styles.modalContent}>
              <View style={styles.modalHeader}>
                {selectedFile.isFolder ? (
                  <Folder size={22} color="#F38020" strokeWidth={2} style={{ marginRight: 10 }} />
                ) : (
                  <FileText size={22} color="#38BDF8" strokeWidth={2} style={{ marginRight: 10 }} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle} numberOfLines={1}>
                    {selectedFile.filename || selectedFile.name}
                  </Text>
                  <Text style={styles.modalSubtitle}>Freigabe & Aktionen auswählen</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.actionBtn}
                activeOpacity={0.8}
                onPress={() => handleRename(selectedFile)}
              >
                <Edit2 size={18} color="#38BDF8" strokeWidth={2} style={{ marginRight: 12 }} />
                <Text style={styles.actionBtnText}>Umbenennen</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionBtn}
                activeOpacity={0.8}
                onPress={() => {
                  setIsActionModalVisible(false);
                  setIsMoveModalVisible(true);
                }}
              >
                <FolderInput size={18} color="#F38020" strokeWidth={2} style={{ marginRight: 12 }} />
                <Text style={styles.actionBtnText}>In Ordner verschieben...</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionBtn}
                activeOpacity={0.8}
                onPress={() => handleShareLink(selectedFile.path, 24, selectedFile.isFolder)}
              >
                <Clock size={18} color="#38BDF8" strokeWidth={2} style={{ marginRight: 12 }} />
                <Text style={styles.actionBtnText}>Freigabelink (24 Std. Ablauf)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionBtn}
                activeOpacity={0.8}
                onPress={() => handleShareLink(selectedFile.path, 168, selectedFile.isFolder)}
              >
                <Clock size={18} color="#38BDF8" strokeWidth={2} style={{ marginRight: 12 }} />
                <Text style={styles.actionBtnText}>Freigabelink (7 Tage Ablauf)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionBtn}
                activeOpacity={0.8}
                onPress={() => handleShareLink(selectedFile.path, null, selectedFile.isFolder)}
              >
                <InfinityIcon size={18} color="#A855F7" strokeWidth={2} style={{ marginRight: 12 }} />
                <Text style={styles.actionBtnText}>Dauerhaften Freigabelink</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.deleteBtn]}
                activeOpacity={0.8}
                onPress={() => handleDelete(selectedFile.path)}
              >
                <Trash2 size={18} color="#FCA5A5" strokeWidth={2} style={{ marginRight: 12 }} />
                <Text style={[styles.actionBtnText, styles.deleteBtnText]}>Löschen</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelBtn}
                activeOpacity={0.8}
                onPress={() => setIsActionModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Abbrechen</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Move Target Folder Selector Modal */}
      {selectedFile && (
        <Modal
          visible={isMoveModalVisible}
          transparent
          statusBarTranslucent
          animationType="fade"
          onRequestClose={() => setIsMoveModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setIsMoveModalVisible(false)}
          >
            <TouchableOpacity activeOpacity={1} style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <FolderInput size={22} color="#F38020" strokeWidth={2} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>In Ordner verschieben</Text>
                  <Text style={styles.modalSubtitle} numberOfLines={1}>
                    "{selectedFile.filename || selectedFile.name}" wird verschoben nach:
                  </Text>
                </View>
              </View>

              <FlatList
                data={getAllAvailableFolders()}
                keyExtractor={(f) => f || "root"}
                style={{ maxHeight: 280, marginBottom: 12 }}
                renderItem={({ item: folderPath }) => {
                  const isRoot = folderPath === "";
                  const displayName = isRoot ? "Hauptverzeichnis (Root)" : folderPath;

                  return (
                    <TouchableOpacity
                      style={styles.folderSelectItem}
                      activeOpacity={0.7}
                      onPress={() => handleMoveItem(folderPath)}
                    >
                      {isRoot ? (
                        <Home size={18} color="#F38020" strokeWidth={2} style={{ marginRight: 12 }} />
                      ) : (
                        <Folder size={18} color="#38BDF8" strokeWidth={2} style={{ marginRight: 12 }} />
                      )}
                      <Text style={styles.folderSelectText} numberOfLines={1}>
                        {displayName}
                      </Text>
                      <ChevronRight size={16} color="#64748B" />
                    </TouchableOpacity>
                  );
                }}
              />

              <TouchableOpacity
                style={styles.cancelBtn}
                activeOpacity={0.8}
                onPress={() => setIsMoveModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Abbrechen</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Rename Modal (Cross-Platform Android & iOS) */}
      {selectedFile && (
        <Modal
          visible={isRenameModalVisible}
          transparent
          statusBarTranslucent
          animationType="fade"
          onRequestClose={() => setIsRenameModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setIsRenameModalVisible(false)}
          >
            <TouchableOpacity activeOpacity={1} style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Edit2 size={22} color="#38BDF8" strokeWidth={2} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Umbenennen</Text>
                  <Text style={styles.modalSubtitle} numberOfLines={1}>
                    Neuen Namen eingeben:
                  </Text>
                </View>
              </View>

              <TextInput
                style={{
                  backgroundColor: "#1E293B",
                  color: "#F8FAFC",
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 16,
                  borderWidth: 1,
                  borderColor: "#334155",
                  marginBottom: 16,
                }}
                value={renameInputValue}
                onChangeText={setRenameInputValue}
                autoFocus
                selectTextOnFocus
                placeholder="Neuer Name"
                placeholderTextColor="#64748B"
              />

              <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { marginTop: 0, paddingHorizontal: 16, marginRight: 8 }]}
                  activeOpacity={0.8}
                  onPress={() => setIsRenameModalVisible(false)}
                >
                  <Text style={styles.cancelBtnText}>Abbrechen</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    backgroundColor: "#F38020",
                    borderRadius: 10,
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  activeOpacity={0.8}
                  onPress={handleExecuteRename}
                  disabled={isRenaming}
                >
                  {isRenaming ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 15 }}>Speichern</Text>
                  )}
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B1120",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingBottom: 14,
    backgroundColor: "#0F172A",
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  headerLeft: {
    flex: 1,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#F8FAFC",
    marginLeft: 8,
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#F38020",
    fontWeight: "700",
    marginTop: 3,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  syncBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F38020",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 8,
    shadowColor: "#F38020",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  syncBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  logoutBtn: {
    backgroundColor: "#1E293B",
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
  },
  syncBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E293B",
    borderColor: "#F3802060",
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  syncBarText: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: "#0F172A",
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  backBtnText: {
    color: "#38BDF8",
    fontWeight: "600",
    fontSize: 14,
  },
  listContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E293B",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#334155",
  },
  iconContainerFolder: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#F3802015",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  iconContainerFile: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#38BDF815",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  iconContainerImage: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#A855F715",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  iconContainerPdf: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#EF444415",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#F8FAFC",
  },
  itemMeta: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 3,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: {
    color: "#64748B",
    fontSize: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: "#1E293B",
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: "#334155",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#F8FAFC",
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F172A",
    borderColor: "#334155",
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  actionBtnText: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "600",
  },
  folderSelectItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F172A",
    borderColor: "#334155",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  folderSelectText: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  deleteBtn: {
    borderColor: "#EF444450",
    backgroundColor: "#EF444415",
  },
  deleteBtnText: {
    color: "#FCA5A5",
  },
  cancelBtn: {
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 6,
  },
  cancelBtnText: {
    color: "#94A3B8",
    fontSize: 15,
    fontWeight: "600",
  },
  viewerContainer: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  viewerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: "#0F172A",
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  viewerTitle: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "700",
    marginRight: 8,
  },
  viewerSubtitle: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  viewerBody: {
    flex: 1,
    width: "100%",
    backgroundColor: "#0F172A",
  },
  fullImage: {
    width: "100%",
    height: "100%",
  },
  fullPdf: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#0F172A",
  },
  viewerFooter: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === "android" ? 54 : 32,
    backgroundColor: "#0F172A",
    borderTopWidth: 1,
    borderTopColor: "#1E293B",
  },
  viewerActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E293B",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  viewerActionText: {
    color: "#F8FAFC",
    fontWeight: "600",
    fontSize: 14,
  },
  // Gallery grid styles
  galleryContainer: {
    padding: 1,
  },
  galleryTile: {
    width: GALLERY_TILE,
    height: GALLERY_TILE,
    margin: 1,
    backgroundColor: "#1E293B",
    overflow: "hidden",
  },
  galleryThumb: {
    width: "100%",
    height: "100%",
  },
  galleryThumbPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1E293B",
  },
  galleryThumbExt: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 4,
  },
  galleryTileOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 4,
    paddingVertical: 3,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  galleryTileName: {
    color: "#F8FAFC",
    fontSize: 9,
  },
  galleryFolderTile: {
    width: GALLERY_TILE,
    height: GALLERY_TILE,
    margin: 1,
    backgroundColor: "#1E293B",
    justifyContent: "center",
    alignItems: "center",
    padding: 8,
  },
  galleryFolderName: {
    color: "#F8FAFC",
    fontSize: 10,
    textAlign: "center",
    marginTop: 6,
  },
  galleryBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: "#1E1B4B",
  },
  galleryBadgeText: {
    color: "#A855F7",
    fontSize: 11,
  },
  viewToggleBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#1E293B",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
});
