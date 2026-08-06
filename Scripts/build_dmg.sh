#!/bin/bash
set -e

echo "=== R2Sync Native FinderSync Appex Packaging ==="

APP_NAME="R2SyncApp"
BUILD_DIR="./.build/release"
BUILD_ARM_DIR="./.build/arm64-apple-macosx/release"
DMG_NAME="R2Sync-Installer.dmg"
ICON_PNG="AppIconOriginal.png"

echo "[1/5] Compiling Swift Executables..."
swift build -c release

if [ -d "$BUILD_ARM_DIR" ]; then
    TARGET_DIR="$BUILD_ARM_DIR"
else
    TARGET_DIR="$BUILD_DIR"
fi

echo "[2/5] Generating macOS App Icon Set..."
mkdir -p "AppIcon.iconset"
sips -z 16 16     -s format png "$ICON_PNG" --out "AppIcon.iconset/icon_16x16.png"
sips -z 32 32     -s format png "$ICON_PNG" --out "AppIcon.iconset/icon_16x16@2x.png"
sips -z 32 32     -s format png "$ICON_PNG" --out "AppIcon.iconset/icon_32x32.png"
sips -z 64 64     -s format png "$ICON_PNG" --out "AppIcon.iconset/icon_32x32@2x.png"
sips -z 128 128   -s format png "$ICON_PNG" --out "AppIcon.iconset/icon_128x128.png"
sips -z 256 256   -s format png "$ICON_PNG" --out "AppIcon.iconset/icon_128x128@2x.png"
sips -z 256 256   -s format png "$ICON_PNG" --out "AppIcon.iconset/icon_256x256.png"
sips -z 512 512   -s format png "$ICON_PNG" --out "AppIcon.iconset/icon_512x512.png"
sips -z 1024 1024 -s format png "$ICON_PNG" --out "AppIcon.iconset/icon_512x512@2x.png"

iconutil -c icns AppIcon.iconset -o AppIcon.icns
rm -rf AppIcon.iconset

echo "[3/5] Constructing Native App Structure with PlugIns..."
rm -rf "dist/${APP_NAME}.app"
mkdir -p "dist/${APP_NAME}.app/Contents/MacOS"
mkdir -p "dist/${APP_NAME}.app/Contents/Resources"
mkdir -p "dist/${APP_NAME}.app/Contents/PlugIns/R2SyncFinderExtension.appex/Contents/MacOS"
mkdir -p "dist/${APP_NAME}.app/Contents/PlugIns/R2SyncFinderExtension.appex/Contents/Resources"

cp "${TARGET_DIR}/${APP_NAME}" "dist/${APP_NAME}.app/Contents/MacOS/"
cp AppIcon.icns "dist/${APP_NAME}.app/Contents/Resources/"
cp Info.plist "dist/${APP_NAME}.app/Contents/"

# Generate valid Info.plist for extension
cat << 'EOF' > "dist/${APP_NAME}.app/Contents/PlugIns/R2SyncFinderExtension.appex/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleExecutable</key>
    <string>R2SyncFinderExtension</string>
    <key>CFBundleIdentifier</key>
    <string>com.r2sync.app.R2SyncFinderExtension</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>R2SyncFinderExtension</string>
    <key>CFBundlePackageType</key>
    <string>XPC!</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
    <key>NSExtension</key>
    <dict>
        <key>NSExtensionAttributes</key>
        <dict/>
        <key>NSExtensionPointIdentifier</key>
        <string>com.apple.FinderSync</string>
        <key>NSExtensionPrincipalClass</key>
        <string>_TtC21R2SyncFinderExtension10FinderSync</string>
    </dict>
</dict>
</plist>
EOF

cp "${TARGET_DIR}/R2SyncFinderExtension" "dist/${APP_NAME}.app/Contents/PlugIns/R2SyncFinderExtension.appex/Contents/MacOS/"

# Ad-hoc Code Sign App & Extension for macOS Sandbox validation
codesign --force --deep --sign - "dist/${APP_NAME}.app/Contents/PlugIns/R2SyncFinderExtension.appex" || true
codesign --force --deep --sign - "dist/${APP_NAME}.app" || true

# Install to /Applications
rm -rf /Applications/R2SyncApp.app
cp -R "dist/${APP_NAME}.app" /Applications/

echo "[4/5] Registering Extension with macOS PlugInKit..."
pluginkit -a "/Applications/${APP_NAME}.app/Contents/PlugIns/R2SyncFinderExtension.appex" || true
pluginkit -e use -i com.r2sync.app.R2SyncFinderExtension || true

echo "[5/5] Creating Styled DMG Disk Image..."
rm -f "dist/${DMG_NAME}"

create-dmg \
  --volname "R2Sync Installer" \
  --volicon "AppIcon.icns" \
  --window-pos 200 120 \
  --window-size 600 400 \
  --icon-size 110 \
  --icon "${APP_NAME}.app" 160 180 \
  --hide-extension "${APP_NAME}.app" \
  --app-drop-link 440 180 \
  "dist/${DMG_NAME}" \
  "dist/${APP_NAME}.app"

echo "✅ Build & CodeSign complete!"
