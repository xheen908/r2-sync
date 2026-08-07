"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Cloud,
  Upload,
  RefreshCw,
  Settings,
  ChevronDown,
  User,
  LogOut,
  Folder,
} from "lucide-react";

interface NavbarProps {
  isConnected?: boolean;
  bucketName?: string;
  username?: string;
  onUploadClick?: () => void;
  onRefreshClick?: () => void;
  loading?: boolean;
}

export default function Navbar({
  isConnected = true,
  bucketName = "easyfisk-docs",
  username = "admin",
  onUploadClick,
  onRefreshClick,
  loading = false,
}: NavbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [popoverOpen, setPopoverOpen] = useState(false);

  useEffect(() => {
    const handleGlobalClick = () => setPopoverOpen(false);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopoverOpen(false);
    };
    window.addEventListener("click", handleGlobalClick);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", handleGlobalClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const isSettingsPage = pathname === "/settings";

  return (
    <header className="h-16 border-b border-slate-800/90 bg-slate-900/80 backdrop-blur-xl px-6 flex items-center justify-between sticky top-0 z-30 select-none">
      {/* Brand & R2 Connection Status Pill */}
      <div className="flex items-center gap-4">
        <div
          className="flex items-center gap-3 cursor-pointer group"
          onClick={() => router.push("/dashboard")}
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-orange-500 to-amber-400 flex items-center justify-center shadow-lg shadow-orange-500/25 group-hover:scale-105 transition-transform">
            <Cloud className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-white tracking-tight flex items-center gap-2 text-base">
              R2Sync Drive
            </h1>
            <p className="text-[11px] text-slate-400">easyfisk-docs • ocpp-labs.com</p>
          </div>
        </div>

        {/* R2 Connection Live Pill Badge */}
        <div
          onClick={() => router.push("/settings")}
          className={`cursor-pointer hidden md:flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border transition-all ${
            isConnected
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
              : "bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20"
          }`}
          title={isConnected ? "Cloudflare R2 Verbunden" : "Einstellungen öffnen"}
        >
          <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
          <span>{isConnected ? `R2 Verbunden (${bucketName})` : "R2 Getrennt"}</span>
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-3">
        {/* If on drive page, show Upload & Refresh */}
        {!isSettingsPage && (
          <>
            {onUploadClick && (
              <button
                onClick={onUploadClick}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold shadow-md shadow-orange-500/20 transition-all active:scale-95"
              >
                <Upload className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Hochladen</span>
              </button>
            )}

            {onRefreshClick && (
              <button
                onClick={onRefreshClick}
                className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
                title="Aktualisieren"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            )}
          </>
        )}

        {/* Navigation shortcut button to Drive when on Settings page */}
        {isSettingsPage && (
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors border border-slate-700/50"
          >
            <Folder className="w-3.5 h-3.5 text-amber-400" />
            <span>Zum Drive</span>
          </button>
        )}

        {/* SETTINGS GEAR ICON WITH POPOVER MENU */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPopoverOpen(!popoverOpen);
            }}
            className={`flex items-center gap-2 p-2 rounded-xl border transition-all ${
              popoverOpen || isSettingsPage
                ? "bg-orange-500/20 text-orange-400 border-orange-500/40"
                : "bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700/60"
            }`}
            title="Einstellungen & Konto"
          >
            <Settings className={`w-4 h-4 transition-transform ${popoverOpen ? "rotate-90 text-orange-400" : ""}`} />
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {/* POPOVER DROPDOWN MENU */}
          {popoverOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 mt-2 w-56 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl z-50 p-2 text-xs text-slate-200 animate-fade-in"
            >
              {/* Admin User Header */}
              <div className="px-3 py-2.5 mb-1.5 border-b border-slate-800 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold uppercase">
                  {username.substring(0, 2)}
                </div>
                <div className="flex flex-col truncate">
                  <span className="font-semibold text-white truncate">{username}</span>
                  <span className="text-[10px] text-slate-400">Administrator</span>
                </div>
              </div>

              {/* Single Clean Settings Link */}
              <button
                onClick={() => {
                  setPopoverOpen(false);
                  router.push("/settings");
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-colors text-left font-medium ${
                  isSettingsPage ? "bg-orange-500/20 text-orange-400 font-semibold" : "hover:bg-slate-800 text-slate-200 hover:text-white"
                }`}
              >
                <Settings className="w-4 h-4 text-orange-400" />
                <span>Konto & Einstellungen</span>
              </button>

              <div className="h-px bg-slate-800 my-1" />

              <button
                onClick={() => {
                  setPopoverOpen(false);
                  handleLogout();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-red-500/20 text-red-400 transition-colors text-left font-medium"
              >
                <LogOut className="w-4 h-4" />
                <span>Abmelden</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
