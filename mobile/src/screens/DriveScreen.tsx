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
} from "react-native";
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
} from "lucide-react-native";
import {
  fetchFilesList,
  deleteFileFromVPS,
  generateShareLink,
  clearConfig,
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
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [isActionModalVisible, setIsActionModalVisible] = useState(false);

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

  const handleDelete = (filePath: string) => {
    Alert.alert(
      "Datei löschen",
      `Möchtest du "${filePath.split("/").pop()}" wirklich unwiderruflich löschen?`,
      [
        { text: "Abbrechen", style: "cancel" },
        {
          text: "Löschen",
          style: "destructive",
          onPress: async () => {
            setIsActionModalVisible(false);
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
          activeOpacity={0.7}
        >
          <View style={styles.iconContainerFolder}>
            <Folder size={22} color="#F38020" strokeWidth={2.2} />
          </View>
          <View style={styles.itemInfo}>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemMeta}>Ordner</Text>
          </View>
          <ChevronRight size={20} color="#64748B" />
        </TouchableOpacity>
      );
    }

    const formatSize = (bytes: number) => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    return (
      <TouchableOpacity
        style={styles.itemCard}
        onPress={() => {
          setSelectedFile(item);
          setIsActionModalVisible(true);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.iconContainerFile}>
          <FileText size={22} color="#38BDF8" strokeWidth={2} />
        </View>
        <View style={styles.itemInfo}>
          <Text style={styles.itemName} numberOfLines={1}>
            {item.filename}
          </Text>
          <Text style={styles.itemMeta}>
            {formatSize(item.size)} • {new Date(item.updatedAt).toLocaleDateString("de-DE")}
          </Text>
        </View>
        <MoreVertical size={20} color="#64748B" />
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

      {/* File Action Sheet Modal */}
      <Modal
        visible={isActionModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsActionModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsActionModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <FileText size={22} color="#38BDF8" strokeWidth={2} style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle} numberOfLines={1}>{selectedFile?.filename}</Text>
                <Text style={styles.modalSubtitle}>Freigabe & Aktionen auswählen</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.actionBtn}
              activeOpacity={0.8}
              onPress={() => selectedFile && handleShareLink(selectedFile.path, 24)}
            >
              <Clock size={18} color="#F38020" strokeWidth={2} style={{ marginRight: 12 }} />
              <Text style={styles.actionBtnText}>Freigabelink (24 Std. Ablauf)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              activeOpacity={0.8}
              onPress={() => selectedFile && handleShareLink(selectedFile.path, 168)}
            >
              <Clock size={18} color="#38BDF8" strokeWidth={2} style={{ marginRight: 12 }} />
              <Text style={styles.actionBtnText}>Freigabelink (7 Tage Ablauf)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              activeOpacity={0.8}
              onPress={() => selectedFile && handleShareLink(selectedFile.path, null)}
            >
              <InfinityIcon size={18} color="#A855F7" strokeWidth={2} style={{ marginRight: 12 }} />
              <Text style={styles.actionBtnText}>Dauerhaften Freigabelink</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.deleteBtn]}
              activeOpacity={0.8}
              onPress={() => selectedFile && handleDelete(selectedFile.path)}
            >
              <Trash2 size={18} color="#FCA5A5" strokeWidth={2} style={{ marginRight: 12 }} />
              <Text style={[styles.actionBtnText, styles.deleteBtnText]}>Datei löschen</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              activeOpacity={0.8}
              onPress={() => setIsActionModalVisible(false)}
            >
              <Text style={styles.cancelBtnText}>Abbrechen</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#1E293B",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: "#334155",
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
});
