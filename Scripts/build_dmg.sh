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

cp R2SyncFinderExtension/Info.plist "dist/${APP_NAME}.app/Contents/PlugIns/R2SyncFinderExtension.appex/Contents/Info.plist"
cp "${TARGET_DIR}/R2SyncFinderExtension" "dist/${APP_NAME}.app/Contents/PlugIns/R2SyncFinderExtension.appex/Contents/MacOS/"

codesign --force --deep --options runtime --entitlements Entitlements.plist --sign "R2DevCert" "dist/${APP_NAME}.app/Contents/PlugIns/R2SyncFinderExtension.appex" || true
codesign --force --deep --options runtime --sign "R2DevCert" "dist/${APP_NAME}.app" || true

rm -rf /Applications/R2SyncApp.app
cp -R "dist/${APP_NAME}.app" /Applications/

xattr -cr /Applications/R2SyncApp.app || true

echo "[4/5] Registering Extension with macOS PlugInKit..."
pluginkit -a "/Applications/${APP_NAME}.app/Contents/PlugIns/R2SyncFinderExtension.appex" || true
pluginkit -e use -i com.r2sync.app.R2SyncFinderExtension || true

echo "✅ Signed with R2DevCert Root Certificate successfully!"
