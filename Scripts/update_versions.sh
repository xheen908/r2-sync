#!/bin/bash
set -e

# Calculate current commit count
COMMIT_COUNT=$(git rev-list --count HEAD 2>/dev/null || echo "1")
NEXT_COUNT=$((COMMIT_COUNT + 1))

# Calculate version: Major.Minor.Patch where Minor increases every 100 commits (e.g. 138 commits -> v0.2.38)
MAJOR=0
MINOR=$(( (NEXT_COUNT - 1) / 100 + 1 ))
PATCH=$(( NEXT_COUNT % 100 ))
VERSION_STRING="${MAJOR}.${MINOR}.${PATCH}"

echo "🚀 Auto-versioning to v${VERSION_STRING} (Build ${NEXT_COUNT})..."

# Update Info.plist for macOS App
plutil -replace CFBundleShortVersionString -string "$VERSION_STRING" Info.plist
plutil -replace CFBundleVersion -string "$NEXT_COUNT" Info.plist

# Update mobile/package.json
if [ -f "mobile/package.json" ]; then
  sed -i '' -E 's/"version": "[0-9]+\.[0-9]+\.[0-9]+"/"version": "'"$VERSION_STRING"'"/' mobile/package.json
fi

# Update mobile/app.json
if [ -f "mobile/app.json" ]; then
  sed -i '' -E 's/"version": "[0-9]+\.[0-9]+\.[0-9]+"/"version": "'"$VERSION_STRING"'"/' mobile/app.json
  sed -i '' -E 's/"versionCode": [0-9]+/"versionCode": '"$NEXT_COUNT"'/' mobile/app.json
fi

# Update mobile/android/app/build.gradle
if [ -f "mobile/android/app/build.gradle" ]; then
  sed -i '' -E 's/versionCode [0-9]+/versionCode '"$NEXT_COUNT"'/' mobile/android/app/build.gradle
  sed -i '' -E 's/versionName "[0-9]+\.[0-9]+\.[0-9]+"/versionName "'"$VERSION_STRING"'"/' mobile/android/app/build.gradle
fi

echo "✅ Updated Info.plist, mobile/package.json, mobile/app.json, and android/app/build.gradle"
