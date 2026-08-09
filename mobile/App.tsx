import React, { useState, useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import * as NavigationBar from "expo-navigation-bar";
import { StyleSheet, View, ActivityIndicator, Platform, BackHandler } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { getSavedConfig, ApiConfig } from "./src/services/api";
import { LoginScreen } from "./src/screens/LoginScreen";
import { DriveScreen } from "./src/screens/DriveScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";

export default function App() {
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currentScreen, setCurrentScreen] = useState<"drive" | "settings">("drive");

  const checkAuthStatus = async () => {
    try {
      const saved = await getSavedConfig();
      setConfig(saved);
    } catch (err) {
      setConfig(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (Platform.OS === "android" && NavigationBar.setBackgroundColorAsync) {
      NavigationBar.setBackgroundColorAsync("#0B1120").catch(() => {});
      NavigationBar.setButtonStyleAsync("light").catch(() => {});
    }
    checkAuthStatus();
  }, []);

  // Handle hardware back button for SettingsScreen
  useEffect(() => {
    const onBackPress = () => {
      if (currentScreen === "settings") {
        setCurrentScreen("drive");
        return true;
      }
      return false;
    };
    const handler = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => handler.remove();
  }, [currentScreen]);

  if (isLoading) {
    return (
      <SafeAreaProvider>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#F38020" />
          <StatusBar style="light" backgroundColor="#0B1120" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
        <StatusBar style="light" backgroundColor="#0F172A" />
        {config ? (
          currentScreen === "settings" ? (
            <SettingsScreen
              onBack={() => setCurrentScreen("drive")}
              onLogout={() => {
                setConfig(null);
                setCurrentScreen("drive");
              }}
            />
          ) : (
            <DriveScreen
              onLogout={() => setConfig(null)}
              onOpenSettings={() => setCurrentScreen("settings")}
            />
          )
        ) : (
          <LoginScreen onLoginSuccess={() => checkAuthStatus()} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#0B1120",
    justifyContent: "center",
    alignItems: "center",
  },
});
