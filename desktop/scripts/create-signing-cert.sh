#!/usr/bin/env bash
# 生成自签名"代码签名"证书,放进专用钥匙串(不碰 login 钥匙串、不改钥匙串搜索列表)。
# 私钥只存在这个钥匙串里;临时 p12/key 在系统临时目录,用完即删。可重复运行(已存在则跳过)。
#
#   专用钥匙串:  ~/Library/Keychains/eduagent-signing.keychain-db
#   钥匙串口令:  ~/Library/Keychains/eduagent-signing.pass  (权限 600,仅本机)
#   证书 CN:     EduAgent Self-Signed
set -euo pipefail

KC="$HOME/Library/Keychains/eduagent-signing.keychain-db"
PASS_FILE="$HOME/Library/Keychains/eduagent-signing.pass"
CN="EduAgent Self-Signed"

if [ -f "$KC" ] && security find-certificate -c "$CN" "$KC" >/dev/null 2>&1; then
  echo "[cert] already exists in $KC"
else
  [ -f "$PASS_FILE" ] || ( umask 177; openssl rand -hex 16 > "$PASS_FILE" )
  PASS="$(cat "$PASS_FILE")"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT

  cat > "$TMP/openssl.cnf" <<EOF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = $CN
[ext]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
EOF
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -config "$TMP/openssl.cnf" \
    -keyout "$TMP/key.pem" -out "$TMP/cert.pem" 2>/dev/null
  # -legacy:macOS security 不认 OpenSSL 3 默认的 PBES2/AES p12
  openssl pkcs12 -export -legacy -inkey "$TMP/key.pem" -in "$TMP/cert.pem" \
    -name "$CN" -passout "pass:$PASS" -out "$TMP/cert.p12"

  [ -f "$KC" ] || security create-keychain -p "$PASS" "$KC"
  security set-keychain-settings "$KC"            # 不自动锁
  security unlock-keychain -p "$PASS" "$KC"
  security import "$TMP/cert.p12" -k "$KC" -P "$PASS" -T /usr/bin/codesign -T /usr/bin/security
  # 允许 codesign 免弹窗使用私钥
  security set-key-partition-list -S apple-tool:,apple: -s -k "$PASS" "$KC" >/dev/null
  echo "[cert] created in $KC"
fi

security find-certificate -c "$CN" -Z "$KC" | grep -E "SHA-1|labl"
