#!/usr/bin/env bash
# 用专用钥匙串里的自签名证书给 .app 签名并验证,然后基于已签名的 .app 出 dmg。
# 前置:desktop/scripts/create-signing-cert.sh 已跑过;.app 已由 `electron-builder --mac dir` 产出。
set -euo pipefail
cd "$(dirname "$0")/../.."

APP="desktop/dist/mac-arm64/EduAgent.app"
VERSION="$(node -p 'require("./package.json").version')"
KC="$HOME/Library/Keychains/eduagent-signing.keychain-db"
[ -f "$KC" ] && [ -f "$HOME/Library/Keychains/eduagent-signing.pass" ] || {
  echo "Signing keychain missing; run desktop/scripts/create-signing-cert.sh first." >&2; exit 1;
}
PASS="$(cat "$HOME/Library/Keychains/eduagent-signing.pass")"
ENT="desktop/build-resources/entitlements.mac.plist"
CN="EduAgent Self-Signed"

HASH="$(security find-certificate -c "$CN" -Z "$KC" | awk '/SHA-1 hash:/{print $3}')"
security unlock-keychain -p "$PASS" "$KC"

xattr -cr "$APP"
codesign --force --deep --options runtime --timestamp=none \
  --entitlements "$ENT" --sign "$HASH" --keychain "$KC" "$APP"
codesign --verify --deep --strict -vv "$APP"
codesign -dvv --entitlements - "$APP" 2>&1 | grep -E "Identifier|Authority|flags|audio-input|TeamIdentifier" || true

pnpm exec electron-builder --config desktop/electron-builder.yml \
  --prepackaged "$APP" --mac dmg --arm64 -c.mac.identity=null "-c.extraMetadata.version=$VERSION"
ls -lh desktop/dist/*.dmg
