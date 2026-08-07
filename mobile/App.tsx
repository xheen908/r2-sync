import React, { useState, useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View, ActivityIndicator } from "react-native";
import { getSavedConfig, ApiConfig } from "./src/services/api";
import { LoginScreen } from "./src/screens/LoginScreen";
import { DriveScreen } from "./src/screens/DriveScreen";

export default function App() {
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

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
    checkAuthStatus();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F38020" />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {config ? (
        <DriveScreen onLogout={() => setConfig(null)} />
      ) : (
        <LoginScreen onLoginSuccess={() => checkAuthStatus()} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#0F172A",
    justifyContent: "center",
    alignItems: "center",
  },
});
