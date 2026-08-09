import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
  Switch,
  BackHandler,
} from "react-native";
import * as NavigationBar from "expo-navigation-bar";
import Constants from "expo-constants";
import {
  ArrowLeft,
  User,
  Database,
  CheckCircle2,
  AlertCircle,
  LogOut,
  ChevronRight,
  Wifi,
  Shield,
} from "lucide-react-native";
import {
  getSavedConfig,
  fetchServerSettings,
  saveServerR2Settings,
  updateAccountCredentials,
  clearConfig,
  getWifiOnlySyncSetting,
  setWifiOnlySyncSetting,
} from "../services/api";

interface SettingsScreenProps {
  onBack: () => void;
  onLogout: () => void;
}

type SubPage = "menu" | "account" | "sync" | "r2";

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onBack, onLogout }) => {
  const [currentSubPage, setCurrentSubPage] = useState<SubPage>("menu");
  const [loading, setLoading] = useState(true);
  const [isR2Connected, setIsR2Connected] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  // Form states for Cloudflare R2
  const [formAccountId, setFormAccountId] = useState("");
  const [formAccessKeyId, setFormAccessKeyId] = useState("");
  const [formSecretAccessKey, setFormSecretAccessKey] = useState("");
  const [formBucketName, setFormBucketName] = useState("");
  const [formPublicDomainUrl, setFormPublicDomainUrl] = useState("");
  const [savingR2Settings, setSavingR2Settings] = useState(false);
  const [r2SettingsStatus, setR2SettingsStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Form states for Account
  const [currentUsername, setCurrentUsername] = useState("admin");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountStatus, setAccountStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Sync Preferences state
  const [wifiOnlySync, setWifiOnlySync] = useState(false);

  const fetchSettings = async () => {
    setLoading(true);
    setR2SettingsStatus(null);
    setAccountStatus(null);
    try {
      const cfg = await getSavedConfig();
      if (cfg?.username) setCurrentUsername(cfg.username);

      const wifiPref = await getWifiOnlySyncSetting();
      setWifiOnlySync(wifiPref);

      const data = await fetchServerSettings();
      if (data.config) {
        setIsR2Connected(data.isConnected);
        setErrorDetails(data.errorDetails || null);
        setFormAccountId(data.config.accountId || "");
        setFormAccessKeyId(data.config.accessKeyId || "");
        setFormBucketName(data.config.bucketName || "");
        setFormPublicDomainUrl(data.config.publicDomainUrl || "");
      }
    } catch (err: any) {
      console.warn("Failed to fetch settings", err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleWifiOnly = async (val: boolean) => {
    setWifiOnlySync(val);
    await setWifiOnlySyncSetting(val);
  };

  useEffect(() => {
    if (Platform.OS === "android" && NavigationBar.setBackgroundColorAsync) {
      NavigationBar.setPositionAsync("relative").catch(() => {});
      NavigationBar.setBackgroundColorAsync("#0B1120").catch(() => {});
      NavigationBar.setButtonStyleAsync("light").catch(() => {});
    }
    fetchSettings();
  }, []);

  // Handle subpage Android back button
  useEffect(() => {
    const onSubPageBack = () => {
      if (currentSubPage !== "menu") {
        setCurrentSubPage("menu");
        return true;
      }
      return false;
    };
    const handler = BackHandler.addEventListener("hardwareBackPress", onSubPageBack);
    return () => handler.remove();
  }, [currentSubPage]);

  const handleSaveR2 = async () => {
    setR2SettingsStatus(null);
    setSavingR2Settings(true);
    try {
      const res = await saveServerR2Settings({
        accountId: formAccountId.trim(),
        accessKeyId: formAccessKeyId.trim(),
        secretAccessKey: formSecretAccessKey.trim() || undefined,
        bucketName: formBucketName.trim(),
        publicDomainUrl: formPublicDomainUrl.trim(),
      });
      if (res.success) {
        setIsR2Connected(true);
        setErrorDetails(null);
        setR2SettingsStatus({ type: "success", message: "Cloudflare R2 Einstellungen gespeichert!" });
      } else {
        setIsR2Connected(false);
        setErrorDetails(res.errorDetails || res.error || null);
        setR2SettingsStatus({ type: "error", message: res.error || "Speichern fehlgeschlagen" });
      }
    } catch (err: any) {
      setR2SettingsStatus({ type: "error", message: err.message || "Verbindungsfehler" });
    } finally {
      setSavingR2Settings(false);
    }
  };

  const handleSaveAccount = async () => {
    setAccountStatus(null);
    if (newPassword && newPassword !== confirmPassword) {
      setAccountStatus({ type: "error", message: "Passwörter stimmen nicht überein!" });
      return;
    }
    setSavingAccount(true);
    try {
      const res = await updateAccountCredentials(currentUsername, newUsername.trim() || undefined, newPassword.trim() || undefined);
      if (res.success) {
        setAccountStatus({ type: "success", message: "Konto-Zugangsdaten erfolgreich aktualisiert!" });
        if (res.updatedUsername) setCurrentUsername(res.updatedUsername);
        setNewUsername("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setAccountStatus({ type: "error", message: res.error || "Aktualisierung fehlgeschlagen" });
      }
    } catch (err: any) {
      setAccountStatus({ type: "error", message: err.message || "Fehler beim Speichern" });
    } finally {
      setSavingAccount(false);
    }
  };

  const getHeaderTitle = () => {
    switch (currentSubPage) {
      case "account": return "Konto & Sicherheit";
      case "sync": return "Foto-Synchronisation";
      case "r2": return "Cloudflare R2";
      default: return "Einstellungen";
    }
  };

  const handleHeaderBack = () => {
    if (currentSubPage !== "menu") {
      setCurrentSubPage("menu");
    } else {
      onBack();
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Navigation Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleHeaderBack} activeOpacity={0.7}>
          <ArrowLeft size={22} color="#F38020" />
          <Text style={styles.backBtnText}>
            {currentSubPage === "menu" ? "Zurück" : "Übersicht"}
          </Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{getHeaderTitle()}</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#F38020" />
            <Text style={styles.loadingText}>Einstellungen werden geladen...</Text>
          </View>
        ) : (
          <>
            {/* SUBPAGE 1: MAIN MENU (SETTINGS CATEGORIES) */}
            {currentSubPage === "menu" && (
              <View style={styles.menuContainer}>
                {/* Link to Account & Security */}
                <TouchableOpacity
                  style={styles.navTile}
                  onPress={() => setCurrentSubPage("account")}
                  activeOpacity={0.7}
                >
                  <View style={[styles.navTileIcon, { backgroundColor: "#F380201A" }]}>
                    <User size={22} color="#F38020" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.navTileTitle}>Konto & Sicherheit</Text>
                    <Text style={styles.navTileSubtitle}>Benutzername, Passwort & Sicherheit</Text>
                  </View>
                  <ChevronRight size={20} color="#64748B" />
                </TouchableOpacity>

                {/* Link to Photo Sync */}
                <TouchableOpacity
                  style={styles.navTile}
                  onPress={() => setCurrentSubPage("sync")}
                  activeOpacity={0.7}
                >
                  <View style={[styles.navTileIcon, { backgroundColor: "#38BDF81A" }]}>
                    <Wifi size={22} color="#38BDF8" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.navTileTitle}>Foto-Synchronisation</Text>
                    <Text style={styles.navTileSubtitle}>WLAN-Regeln & Backup-Optionen</Text>
                  </View>
                  <ChevronRight size={20} color="#64748B" />
                </TouchableOpacity>

                {/* Link to Cloudflare R2 Credentials */}
                <TouchableOpacity
                  style={styles.navTile}
                  onPress={() => setCurrentSubPage("r2")}
                  activeOpacity={0.7}
                >
                  <View style={[styles.navTileIcon, { backgroundColor: "#F59E0B1A" }]}>
                    <Database size={22} color="#F59E0B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Text style={styles.navTileTitle}>Cloudflare R2</Text>
                      <View style={[styles.inlineBadge, isR2Connected ? styles.badgeSuccess : styles.badgeError]}>
                        <Text style={[styles.badgeText, { color: isR2Connected ? "#10B981" : "#EF4444" }]}>
                          {isR2Connected ? "Verbunden" : "Getrennt"}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.navTileSubtitle}>S3 Bucket Credentials & Endpunkte</Text>
                  </View>
                  <ChevronRight size={20} color="#64748B" />
                </TouchableOpacity>

                {/* Logout Action Button */}
                <TouchableOpacity
                  style={styles.logoutCardBtn}
                  onPress={async () => {
                    await clearConfig();
                    onLogout();
                  }}
                  activeOpacity={0.8}
                >
                  <LogOut size={20} color="#EF4444" style={{ marginRight: 10 }} />
                  <Text style={styles.logoutCardBtnText}>Konto Abmelden</Text>
                </TouchableOpacity>

                {/* App Version Footer */}
                <View style={{ alignItems: "center", marginTop: 12, marginBottom: 8 }}>
                  <Text style={{ color: "#475569", fontSize: 13, fontWeight: "600" }}>
                    R2Sync Mobile v{Constants.expoConfig?.version || "0.1.54"} (Build {Constants.expoConfig?.android?.versionCode || 54})
                  </Text>
                </View>
              </View>
            )}

            {/* SUBPAGE 2: ACCOUNT & SECURITY */}
            {currentSubPage === "account" && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardIconUser}>
                    <User size={22} color="#F38020" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>Konto & Sicherheit</Text>
                    <Text style={styles.cardSubtitle}>Verwalte deinen Admin-Benutzernamen und dein Passwort</Text>
                  </View>
                </View>

                {accountStatus && (
                  <View style={[styles.statusBox, accountStatus.type === "success" ? styles.statusSuccess : styles.statusError]}>
                    {accountStatus.type === "success" ? <CheckCircle2 size={16} color="#10B981" /> : <AlertCircle size={16} color="#EF4444" />}
                    <Text style={[styles.statusText, { color: accountStatus.type === "success" ? "#10B981" : "#EF4444" }]}>
                      {accountStatus.message}
                    </Text>
                  </View>
                )}

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Benutzername</Text>
                  <TextInput
                    style={styles.input}
                    value={newUsername}
                    onChangeText={setNewUsername}
                    placeholder={`Aktuell: ${currentUsername}`}
                    placeholderTextColor="#64748B"
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Neues Passwort</Text>
                  <TextInput
                    style={styles.input}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry
                    placeholder="Neues Passwort"
                    placeholderTextColor="#64748B"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Passwort bestätigen</Text>
                  <TextInput
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    placeholder="Wiederholen"
                    placeholderTextColor="#64748B"
                  />
                </View>

                <TouchableOpacity style={styles.saveBtnPrimary} onPress={handleSaveAccount} disabled={savingAccount} activeOpacity={0.8}>
                  {savingAccount ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveBtnText}>Konto-Daten aktualisieren</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* SUBPAGE 3: PHOTO SYNC PREFERENCES */}
            {currentSubPage === "sync" && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={[styles.cardIconUser, { backgroundColor: "#38BDF81A" }]}>
                    <Wifi size={22} color="#38BDF8" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>Foto-Synchronisation</Text>
                    <Text style={styles.cardSubtitle}>Optionen für den automatischen Hintergrund-Sync</Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 12, paddingBottom: 8 }}>
                  <View style={{ flex: 1, paddingRight: 16 }}>
                    <Text style={{ color: "#F8FAFC", fontSize: 15, fontWeight: "600" }}>Nur über WLAN sichern</Text>
                    <Text style={{ color: "#64748B", fontSize: 13, marginTop: 4, lineHeight: 18 }}>
                      Verhindert automatische Foto-Uploads über mobile Daten (5G/LTE), um Datenvolumen zu sparen.
                    </Text>
                  </View>
                  <Switch
                    value={wifiOnlySync}
                    onValueChange={handleToggleWifiOnly}
                    trackColor={{ false: "#334155", true: "#F38020" }}
                    thumbColor={wifiOnlySync ? "#FFFFFF" : "#94A3B8"}
                  />
                </View>
              </View>
            )}

            {/* SUBPAGE 4: CLOUDFLARE R2 CREDENTIALS */}
            {currentSubPage === "r2" && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardIconR2}>
                    <Database size={22} color="#F59E0B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>Cloudflare R2 Zugangsdaten</Text>
                    <Text style={styles.cardSubtitle}>S3 Bucket Credentials direkt konfigurieren</Text>
                  </View>
                  <View style={[styles.connectionBadge, isR2Connected ? styles.badgeSuccess : styles.badgeError]}>
                    {isR2Connected ? <CheckCircle2 size={12} color="#10B981" /> : <AlertCircle size={12} color="#EF4444" />}
                    <Text style={[styles.badgeText, { color: isR2Connected ? "#10B981" : "#EF4444" }]}>
                      {isR2Connected ? "S3 Verbunden" : "Getrennt"}
                    </Text>
                  </View>
                </View>

                {r2SettingsStatus && (
                  <View style={[styles.statusBox, r2SettingsStatus.type === "success" ? styles.statusSuccess : styles.statusError]}>
                    {r2SettingsStatus.type === "success" ? <CheckCircle2 size={16} color="#10B981" /> : <AlertCircle size={16} color="#EF4444" />}
                    <Text style={[styles.statusText, { color: r2SettingsStatus.type === "success" ? "#10B981" : "#EF4444" }]}>
                      {r2SettingsStatus.message}
                    </Text>
                  </View>
                )}

                {errorDetails && (
                  <View style={styles.errorDetailsBox}>
                    <Text style={styles.errorDetailsText}>{errorDetails}</Text>
                  </View>
                )}

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Account ID</Text>
                  <TextInput
                    style={styles.input}
                    value={formAccountId}
                    onChangeText={setFormAccountId}
                    placeholder="Cloudflare Account ID"
                    placeholderTextColor="#64748B"
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Access Key ID</Text>
                  <TextInput
                    style={styles.input}
                    value={formAccessKeyId}
                    onChangeText={setFormAccessKeyId}
                    placeholder="R2 Access Key ID"
                    placeholderTextColor="#64748B"
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Secret Access Key</Text>
                  <TextInput
                    style={styles.input}
                    value={formSecretAccessKey}
                    onChangeText={setFormSecretAccessKey}
                    secureTextEntry
                    placeholder="Sicher auf Server gespeichert"
                    placeholderTextColor="#64748B"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Bucket Name</Text>
                  <TextInput
                    style={styles.input}
                    value={formBucketName}
                    onChangeText={setFormBucketName}
                    placeholder="z.B. mein-r2-bucket"
                    placeholderTextColor="#64748B"
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Öffentliche Domain URL (optional)</Text>
                  <TextInput
                    style={styles.input}
                    value={formPublicDomainUrl}
                    onChangeText={setFormPublicDomainUrl}
                    placeholder="https://pub-xxxx.r2.dev"
                    placeholderTextColor="#64748B"
                    autoCapitalize="none"
                  />
                </View>

                <TouchableOpacity style={styles.saveBtnPrimary} onPress={handleSaveR2} disabled={savingR2Settings} activeOpacity={0.8}>
                  {savingR2Settings ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveBtnText}>R2 Einstellungen Speichern</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
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
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#0F172A",
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 10,
  },
  backBtnText: {
    color: "#F38020",
    fontSize: 15,
    fontWeight: "700",
    marginLeft: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#F8FAFC",
  },
  contentContainer: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  loadingBox: {
    paddingVertical: 60,
    alignItems: "center",
  },
  loadingText: {
    color: "#94A3B8",
    fontSize: 14,
    marginTop: 12,
  },
  menuContainer: {
    gap: 12,
  },
  navTile: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F172A",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  navTileIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  navTileTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#F8FAFC",
  },
  navTileSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  inlineBadge: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  card: {
    backgroundColor: "#0F172A",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  cardIconUser: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#F380201A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  cardIconR2: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#F59E0B1A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#F8FAFC",
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  connectionBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeSuccess: {
    backgroundColor: "#10B98115",
  },
  badgeError: {
    backgroundColor: "#EF444415",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 4,
  },
  statusBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  statusSuccess: {
    backgroundColor: "#10B98115",
  },
  statusError: {
    backgroundColor: "#EF444415",
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 8,
    flex: 1,
  },
  errorDetailsBox: {
    backgroundColor: "#EF444410",
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#EF444430",
  },
  errorDetailsText: {
    color: "#FCA5A5",
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  fieldGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#94A3B8",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#0B1120",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#F8FAFC",
  },
  saveBtnPrimary: {
    backgroundColor: "#F38020",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  saveBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  logoutCardBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EF444415",
    borderColor: "#EF444440",
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 16,
    marginTop: 8,
  },
  logoutCardBtnText: {
    color: "#EF4444",
    fontSize: 15,
    fontWeight: "700",
  },
});
