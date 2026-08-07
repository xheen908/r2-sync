import React, { useState, useEffect } from "react";
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
} from "react-native";
import { WebView } from "react-native-webview";
import {
  Cloud,
  Folder,
  FileText,
  Camera,
  LogOut,
  ChevronRight,
  MoreVertical,
  ArrowLeft,
  Share2,
  Trash2,
  Clock,
  Infinity as InfinityIcon,
  RefreshCw,
  FolderInput,
  Home,
  Eye,
  X,
} from "lucide-react-native";
import {
  fetchFilesList,
  deleteFileFromVPS,
  moveFileOnVPS,
  generateShareLink,
  clearConfig,
  getSavedConfig,
  FileItem,
} from "../services/api";
import {
  subscribeToMediaChanges,
  runAutoPhotoSync,
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
  
  // Viewer Modals State
  const [isImagePreviewVisible, setIsImagePreviewVisible] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);

  const [isPdfPreviewVisible, setIsPdfPreviewVisible] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const items = await fetchFilesList();
      setFiles(items);
    } catch (err: any) {
      console.warn("Failed to load files", err);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    await runAutoPhotoSync((status) => setSyncStatus(status));
    setIsRefreshing(false);
  };

  useEffect(() => {
    loadData();
    
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

    // 3. Periodic background file list refresh every 4 seconds
    const interval = setInterval(() => {
      loadData();
    }, 4000);

    return () => {
      mediaSub.remove();
      appStateSub.remove();
      clearInterval(interval);
    };
  }, []);

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

  // Compute current folder contents & subfolders
  const getDisplayItems = () => {
    const foldersSet = new Set<string>();
    const fileItems: FileItem[] = [];

    const prefix = currentFolder ? currentFolder + "/" : "";

    files.forEach((file) => {
      if (file.path.startsWith(prefix)) {
        const subPath = file.path.slice(prefix.length);
        if (subPath.includes("/")) {
          const folderName = subPath.split("/")[0];
          foldersSet.add(folderName);
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

  const handleOpenFile = async (item: FileItem) => {
    const cfg = await getSavedConfig();
    if (!cfg) return;

    const fileExt = item.filename.split(".").pop()?.toLowerCase() || "";
    const isImage = ["jpg", "jpeg", "png", "webp", "gif", "heic", "bmp"].includes(fileExt);
    const isPdf = fileExt === "pdf";

    const viewUrl = `${cfg.serverUrl}/api/files/download?filePath=${encodeURIComponent(item.path)}&inline=1`;

    if (isImage) {
      setSelectedFile(item);
      setPreviewImageUrl(viewUrl);
      setIsImageLoading(true);
      setIsImagePreviewVisible(true);
    } else if (isPdf) {
      setSelectedFile(item);
      try {
        const shareUrl = await generateShareLink(item.path, 1, false);
        setPreviewPdfUrl(shareUrl);
      } catch (err) {
        setPreviewPdfUrl(viewUrl);
      }
      setIsPdfPreviewVisible(true);
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

  const renderItem = ({ item }: { item: any }) => {
    if (item.isFolder) {
      return (
        <TouchableOpacity
          style={styles.itemCard}
          onPress={() => setCurrentFolder(item.path)}
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

    const formatSize = (bytes: number) => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const fileExt = item.filename.split(".").pop()?.toLowerCase() || "";
    const isImage = ["jpg", "jpeg", "png", "webp", "gif", "heic", "bmp"].includes(fileExt);
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
    <View style={styles.container}>
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
            setCurrentFolder(parts.join("/"));
          }}
        >
          <ArrowLeft size={16} color="#38BDF8" strokeWidth={2.2} style={{ marginRight: 8 }} />
          <Text style={styles.backBtnText}>Zurück in übergeordneten Ordner</Text>
        </TouchableOpacity>
      )}

      {/* File List */}
      <FlatList
        data={getDisplayItems()}
        keyExtractor={(item) => item.path || item.name}
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

      {/* Fullscreen Image Preview Modal */}
      {selectedFile && previewImageUrl && (
        <Modal
          visible={isImagePreviewVisible}
          transparent
          statusBarTranslucent
          animationType="fade"
          onRequestClose={() => setIsImagePreviewVisible(false)}
        >
          <View style={styles.viewerContainer}>
            {/* Header */}
            <View style={[styles.viewerHeader, { paddingTop: statusBarHeight + 12 }]}>
              <Text style={styles.viewerTitle} numberOfLines={1}>
                {selectedFile.filename}
              </Text>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setIsImagePreviewVisible(false)}
              >
                <X size={24} color="#F8FAFC" />
              </TouchableOpacity>
            </View>

            {/* Image Body */}
            <View style={styles.viewerBody}>
              {isImageLoading && (
                <ActivityIndicator size="large" color="#F38020" style={StyleSheet.absoluteFill} />
              )}
              <Image
                source={{ uri: previewImageUrl }}
                style={styles.fullImage}
                resizeMode="contain"
                onLoadEnd={() => setIsImageLoading(false)}
                onError={() => {
                  setIsImageLoading(false);
                  Alert.alert("Fehler", "Bild konnte nicht geladen werden.");
                }}
              />
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
          </View>
        </Modal>
      )}

      {/* Fullscreen In-App PDF Viewer Modal */}
      {selectedFile && previewPdfUrl && (
        <Modal
          visible={isPdfPreviewVisible}
          transparent
          statusBarTranslucent
          animationType="fade"
          onRequestClose={() => setIsPdfPreviewVisible(false)}
        >
          <View style={styles.viewerContainer}>
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

            {/* In-App PDF WebView */}
            <View style={styles.viewerBody}>
              <WebView
                source={{ uri: previewPdfUrl }}
                style={styles.fullPdf}
                startInLoadingState
                renderLoading={() => (
                  <ActivityIndicator size="large" color="#F38020" style={StyleSheet.absoluteFill} />
                )}
                onError={() => Alert.alert("PDF Laden", "PDF konnte nicht im Viewer geladen werden.")}
              />
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
          </View>
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
    </View>
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
    backgroundColor: "#000000",
  },
  viewerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  viewerTitle: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
    marginRight: 16,
  },
  closeBtn: {
    padding: 6,
  },
  viewerBody: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0F172A",
  },
  fullImage: {
    width: "100%",
    height: "100%",
  },
  fullPdf: {
    width: "100%",
    height: "100%",
    backgroundColor: "#0F172A",
  },
  viewerFooter: {
    flexDirection: "row",
    justifyContent: "space-around",
    padding: 16,
    backgroundColor: "rgba(15, 23, 42, 0.95)",
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
});
