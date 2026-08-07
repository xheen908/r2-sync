import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  Alert,
  Share,
  Modal,
} from "react-native";
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
    
    const triggerSync = () => {
      runAutoPhotoSync((status) => setSyncStatus(status)).then(() => loadData());
    };

    triggerSync();

    // 1. Listen for new photos added to Camera Roll in real-time
    const mediaSub = subscribeToMediaChanges(() => {
      console.log("[DriveScreen] Real-time photo addition detected in Camera Roll");
      triggerSync();
    });

    // 2. Listen for AppState changes (e.g. returning to R2Sync from Camera app)
    const appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        console.log("[DriveScreen] App became active, triggering photo sync");
        triggerSync();
      }
    });

    // 3. Periodic background sync check every 4 seconds
    const interval = setInterval(() => {
      loadData();
      triggerSync();
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
        >
          <Text style={styles.itemIcon}>📁</Text>
          <View style={styles.itemInfo}>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemMeta}>Ordner</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
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
      >
        <Text style={styles.itemIcon}>📄</Text>
        <View style={styles.itemInfo}>
          <Text style={styles.itemName}>{item.filename}</Text>
          <Text style={styles.itemMeta}>
            {formatSize(item.size)} • {new Date(item.updatedAt).toLocaleDateString("de-DE")}
          </Text>
        </View>
        <Text style={styles.moreOptions}>•••</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Bar */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>☁️ R2Sync Drive</Text>
          <Text style={styles.headerSubtitle}>
            {currentFolder ? `/${currentFolder}` : "Hauptverzeichnis"}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity
            style={styles.syncBtn}
            onPress={async () => {
              await runAutoPhotoSync((status) => setSyncStatus(status));
              loadData();
            }}
          >
            <Text style={styles.syncBtnText}>📸 Fotos sichern</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={async () => {
              await clearConfig();
              onLogout();
            }}
          >
            <Text style={styles.logoutBtnText}>Abmelden</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Auto Photo Sync Progress Bar */}
      {syncStatus && (
        <View style={styles.syncBar}>
          <Text style={styles.syncBarText}>
            📸 {syncStatus.statusText}
          </Text>
        </View>
      )}

      {/* Navigation Breadcrumb Back Button */}
      {currentFolder !== "" && (
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            const parts = currentFolder.split("/");
            parts.pop();
            setCurrentFolder(parts.join("/"));
          }}
        >
          <Text style={styles.backBtnText}>‹ Zurück in übergeordneten Ordner</Text>
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
            <Text style={styles.emptyIcon}>📂</Text>
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
            <Text style={styles.modalTitle}>{selectedFile?.filename}</Text>
            <Text style={styles.modalSubtitle}>Freigabe & Aktionen auswählen</Text>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => selectedFile && handleShareLink(selectedFile.path, 24)}
            >
              <Text style={styles.actionBtnText}>🔗 Freigabelink (24 Std. Ablauf)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => selectedFile && handleShareLink(selectedFile.path, 168)}
            >
              <Text style={styles.actionBtnText}>🔗 Freigabelink (7 Tage Ablauf)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => selectedFile && handleShareLink(selectedFile.path, null)}
            >
              <Text style={styles.actionBtnText}>♾️ Dauerhaften Freigabelink</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.deleteBtn]}
              onPress={() => selectedFile && handleDelete(selectedFile.path)}
            >
              <Text style={[styles.actionBtnText, styles.deleteBtnText]}>🗑️ Datei löschen</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
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
    backgroundColor: "#0F172A",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#F8FAFC",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#F38020",
    fontWeight: "600",
  },
  syncBtn: {
    backgroundColor: "#F38020",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
  },
  syncBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  logoutBtn: {
    backgroundColor: "#334155",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  logoutBtnText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
  },
  syncBar: {
    backgroundColor: "#F3802020",
    borderColor: "#F3802050",
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  syncBarText: {
    color: "#F38020",
    fontSize: 13,
    fontWeight: "600",
  },
  backBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#1E293B",
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
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
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#334155",
  },
  itemIcon: {
    fontSize: 24,
    marginRight: 12,
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
    marginTop: 2,
  },
  chevron: {
    fontSize: 20,
    color: "#64748B",
    fontWeight: "600",
  },
  moreOptions: {
    fontSize: 16,
    color: "#64748B",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    color: "#64748B",
    fontSize: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#1E293B",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#334155",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#F8FAFC",
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginBottom: 16,
  },
  actionBtn: {
    backgroundColor: "#0F172A",
    borderColor: "#334155",
    borderWidth: 1,
    borderRadius: 12,
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
