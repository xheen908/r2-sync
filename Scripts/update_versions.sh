#!/bin/bash
set -e

# Calculate current commit count
COMMIT_COUNT=$(git rev-list --count HEAD 2>/dev/null || echo "1")
NEXT_COUNT=$((COMMIT_COUNT + 1))

MAJOR=0
MINOR=$((NEXT_COUNT / 100))
PATCH=$((NEXT_COUNT % 100))
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

echo "✅ Updated Info.plist, mobile/package.json, and mobile/app.json"
