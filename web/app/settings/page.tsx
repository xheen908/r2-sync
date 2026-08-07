"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Cloud,
  ArrowLeft,
  User,
  Shield,
  Key,
  CheckCircle2,
  AlertCircle,
  Database,
  Globe,
  RefreshCw,
  LogOut,
  Server,
  Lock,
  Check,
} from "lucide-react";
import Navbar from "@/components/Navbar";

interface R2SettingsData {
  accountId: string;
  accessKeyId: string;
  secretAccessKeyConfigured: boolean;
  bucketName: string;
  publicDomainUrl: string;
}

export default function SettingsPage() {
  const router = useRouter();

  // Settings & R2 Connection state
  const [r2Config, setR2Config] = useState<R2SettingsData | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [r2Error, setR2Error] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Form states for Cloudflare Settings
  const [formAccountId, setFormAccountId] = useState("");
  const [formAccessKeyId, setFormAccessKeyId] = useState("");
  const [formSecretAccessKey, setFormSecretAccessKey] = useState("");
  const [formBucketName, setFormBucketName] = useState("");
  const [formPublicDomainUrl, setFormPublicDomainUrl] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Form states for Account Manager
  const [currentUsername, setCurrentUsername] = useState("admin");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountStatus, setAccountStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      if (data.config) {
        setR2Config(data.config);
        setIsConnected(data.isConnected);
        setR2Error(data.errorDetails);

        setFormAccountId(data.config.accountId || "");
        setFormAccessKeyId(data.config.accessKeyId || "");
        setFormBucketName(data.config.bucketName || "");
        setFormPublicDomainUrl(data.config.publicDomainUrl || "");
      }
    } catch (err) {
      console.error("Failed to fetch settings", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSaveR2Settings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsStatus(null);

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: formAccountId,
          accessKeyId: formAccessKeyId,
          secretAccessKey: formSecretAccessKey,
          bucketName: formBucketName,
          publicDomainUrl: formPublicDomainUrl,
        }),
      });

      if (res.ok) {
        setSettingsStatus({ type: "success", message: "Cloudflare Einstellungen erfolgreich gespeichert & R2 neu geladen!" });
        setFormSecretAccessKey("");
        fetchSettings();
      } else {
        setSettingsStatus({ type: "error", message: "Fehler beim Speichern der Einstellungen" });
      }
    } catch (err) {
      setSettingsStatus({ type: "error", message: "Verbindungsfehler beim Speichern" });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountStatus(null);

    if (newPassword && newPassword !== confirmPassword) {
      setAccountStatus({ type: "error", message: "Passwörter stimmen nicht überein!" });
      return;
    }

    setSavingAccount(true);
    try {
      const res = await fetch("/api/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentUsername,
          newUsername: newUsername.trim() || undefined,
          newPassword: newPassword.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setAccountStatus({ type: "success", message: "Konto-Zugangsdaten erfolgreich aktualisiert!" });
        if (data.updatedUsername) setCurrentUsername(data.updatedUsername);
        setNewUsername("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setAccountStatus({ type: "error", message: data.error || "Aktualisierung fehlgeschlagen" });
      }
    } catch (err) {
      setAccountStatus({ type: "error", message: "Verbindungsfehler beim Konto-Update" });
    } finally {
      setSavingAccount(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-orange-500 selection:text-white">
      {/* GLOBAL TOP NAVBAR HEADER */}
      <Navbar
        isConnected={isConnected}
        bucketName={r2Config?.bucketName || "easyfisk-docs"}
        username={currentUsername}
      />

      {/* Main Settings Page Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-6 md:p-8 space-y-8">
        {loading ? (
          <div className="py-20 text-center text-slate-400 flex flex-col items-center gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-orange-500" />
            <p>Einstellungen werden geladen...</p>
          </div>
        ) : (
          <>
            {/* Card 1: Admin Konto & Sicherheit */}
            <div className="bg-slate-900/60 border border-slate-800/90 rounded-3xl p-6 md:p-8 shadow-2xl backdrop-blur-md">
              <div className="flex items-center gap-3.5 mb-6 pb-4 border-b border-slate-800">
                <div className="w-12 h-12 rounded-2xl bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center justify-center shadow-lg shadow-orange-500/10">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Konto & Sicherheit</h2>
                  <p className="text-xs text-slate-400">Verwalte deinen Admin-Benutzernamen und dein Passwort</p>
                </div>
              </div>

              {accountStatus && (
                <div
                  className={`mb-6 p-4 rounded-2xl text-xs flex items-center gap-2.5 border ${
                    accountStatus.type === "success"
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-red-500/10 border-red-500/30 text-red-400"
                  }`}
                >
                  {accountStatus.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{accountStatus.message}</span>
                </div>
              )}

              <form onSubmit={handleUpdateAccount} className="space-y-5 max-w-xl">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Benutzername
                  </label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder={`Aktuell: ${currentUsername}`}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white outline-none focus:border-orange-500 placeholder-slate-600 transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                      Neues Passwort
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Neues Passwort"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white outline-none focus:border-orange-500 placeholder-slate-600 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                      Passwort bestätigen
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Wiederholen"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white outline-none focus:border-orange-500 placeholder-slate-600 transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingAccount}
                  className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold px-6 py-3 rounded-xl shadow-lg shadow-orange-500/20 text-xs transition-all active:scale-95 disabled:opacity-50"
                >
                  {savingAccount ? "Speichere..." : "Konto-Daten aktualisieren"}
                </button>
              </form>
            </div>

            {/* Card 2: Cloudflare R2 Credentials & Storage */}
            <div className="bg-slate-900/60 border border-slate-800/90 rounded-3xl p-6 md:p-8 shadow-2xl backdrop-blur-md">
              <div className="flex items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shadow-lg shadow-amber-500/10">
                    <Database className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Cloudflare R2 Zugangsdaten</h2>
                    <p className="text-xs text-slate-400">
                      Binde deine R2 Keys direkt aus der Web-Oberfläche ein (wird live in SQLite gespeichert)
                    </p>
                  </div>
                </div>

                {/* Connection Pill */}
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                    isConnected
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      : "bg-red-500/10 text-red-400 border-red-500/30"
                  }`}
                >
                  {isConnected ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  <span>{isConnected ? "S3 R2 Verbunden" : "Verbindung getrennt"}</span>
                </div>
              </div>

              {settingsStatus && (
                <div
                  className={`mb-6 p-4 rounded-2xl text-xs flex items-center gap-2.5 border ${
                    settingsStatus.type === "success"
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-red-500/10 border-red-500/30 text-red-400"
                  }`}
                >
                  {settingsStatus.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{settingsStatus.message}</span>
                </div>
              )}

              <form onSubmit={handleSaveR2Settings} className="space-y-5 max-w-3xl">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Cloudflare Account ID
                  </label>
                  <input
                    type="text"
                    required
                    value={formAccountId}
                    onChange={(e) => setFormAccountId(e.target.value)}
                    placeholder="z.B. 10c9109e9e342e2b4fc55e71ddf91c17"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white font-mono outline-none focus:border-orange-500 transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                      Access Key ID
                    </label>
                    <input
                      type="text"
                      required
                      value={formAccessKeyId}
                      onChange={(e) => setFormAccessKeyId(e.target.value)}
                      placeholder="S3 Access Key ID"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white font-mono outline-none focus:border-orange-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                      Secret Access Key
                    </label>
                    <input
                      type="password"
                      value={formSecretAccessKey}
                      onChange={(e) => setFormSecretAccessKey(e.target.value)}
                      placeholder={r2Config?.secretAccessKeyConfigured ? "•••••••••••••••• (Konfiguriert)" : "Secret Key eingeben"}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white font-mono outline-none focus:border-orange-500 placeholder-slate-600 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                      Bucket Name
                    </label>
                    <input
                      type="text"
                      required
                      value={formBucketName}
                      onChange={(e) => setFormBucketName(e.target.value)}
                      placeholder="z.B. easyfisk-docs"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white outline-none focus:border-orange-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                      Öffentliche Domain / URL
                    </label>
                    <input
                      type="text"
                      required
                      value={formPublicDomainUrl}
                      onChange={(e) => setFormPublicDomainUrl(e.target.value)}
                      placeholder="https://drive.ocpp-labs.com"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white outline-none focus:border-orange-500 transition-all"
                    />
                  </div>
                </div>

                <div className="pt-3">
                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold px-6 py-3 rounded-xl shadow-lg shadow-orange-500/20 text-xs transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${savingSettings ? "animate-spin" : ""}`} />
                    <span>{savingSettings ? "Prüfe & Speichere..." : "R2 Verbindung testen & Speichern"}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Card 3: Server & Environment Details */}
            <div className="bg-slate-900/60 border border-slate-800/90 rounded-3xl p-6 md:p-8 shadow-2xl backdrop-blur-md space-y-4">
              <div className="flex items-center gap-3.5 pb-4 border-b border-slate-800">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center shadow-lg shadow-blue-500/10">
                  <Server className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">System & Server Status</h2>
                  <p className="text-xs text-slate-400">Übersicht deiner VPS Docker & SQLite Umgebung</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs font-mono">
                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
                  <span className="text-slate-500 block mb-1">Datenbank</span>
                  <span className="text-white font-bold">SQLite WAL (`r2sync.db`)</span>
                </div>

                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
                  <span className="text-slate-500 block mb-1">Tunnel Forwarding</span>
                  <span className="text-orange-400 font-bold">drive.ocpp-labs.com</span>
                </div>

                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800">
                  <span className="text-slate-500 block mb-1">Container Engine</span>
                  <span className="text-emerald-400 font-bold">Docker Compose (VPS)</span>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
