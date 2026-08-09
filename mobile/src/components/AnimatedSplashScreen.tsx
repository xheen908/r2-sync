import React, { useEffect, useRef } from "react";
import { StyleSheet, View, Animated, Image, Text, Easing } from "react-native";

interface AnimatedSplashScreenProps {
  onFinish: () => void;
}

export const AnimatedSplashScreen: React.FC<AnimatedSplashScreenProps> = ({ onFinish }) => {
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeOutAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // 1. Entrance animation: Scale up logo & fade in
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
    ]).start();

    // 2. Continuous subtle pulse loop for R2 aura
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // 3. Smooth exit fade-out after ~2.2 seconds
    const timer = setTimeout(() => {
      Animated.timing(fadeOutAnim, {
        toValue: 0,
        duration: 500,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        onFinish();
      });
    }, 2200);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: fadeOutAnim }]}>
      <View style={styles.centerWrapper}>
        {/* Glow Ring Behind Logo */}
        <Animated.View
          style={[
            styles.glowAura,
            {
              transform: [{ scale: Animated.multiply(scaleAnim, pulseAnim) }],
              opacity: opacityAnim,
            },
          ]}
        />

        {/* Animated App Icon */}
        <Animated.View
          style={[
            styles.logoContainer,
            {
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          <Image
            source={require("../../assets/android-icon-foreground.png")}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Animated App Title & Subtitle */}
        <Animated.View style={{ opacity: opacityAnim, alignItems: "center", marginTop: 24 }}>
          <Text style={styles.titleText}>R2Sync</Text>
          <Text style={styles.subtitleText}>Cloudflare R2 Storage</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#0B1120",
    justifyContent: "center",
    alignItems: "center",
  },
  centerWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  glowAura: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(243, 128, 32, 0.25)",
    shadowColor: "#F38020",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 15,
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 30,
    backgroundColor: "#0F172A",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(243, 128, 32, 0.3)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  logoImage: {
    width: 90,
    height: 90,
  },
  titleText: {
    fontSize: 32,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 1,
  },
  subtitleText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#F38020",
    marginTop: 4,
    letterSpacing: 0.5,
  },
});
