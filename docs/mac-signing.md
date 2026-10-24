# Mac 自签名与打包

EduAgent 当前使用维护者的自签名代码签名证书，不做 Apple Developer ID 签名或公证。
macOS 首次下载拦截需要家长在「系统设置 → 隐私与安全性 → 仍要打开」放行，具体界面待另一台 Mac 真机截图验证。

## 首次准备

需要 macOS、Node 26、pnpm、Xcode Command Line Tools、PATH 中的 `cwebp`，以及支持 `pkcs12 -legacy` 的 OpenSSL 3。
缺少 WebP 工具时可由维护者安装 `brew install webp`；脚本不会自动安装工具。

```bash
pnpm install
bash desktop/scripts/create-signing-cert.sh
```

证书脚本生成 CN 为 `EduAgent Self-Signed`、用途为 codeSigning、有效期十年的自签名证书。
它只使用以下专用文件，不改 login 钥匙串，也不把专用钥匙串加入系统搜索列表：

- `~/Library/Keychains/eduagent-signing.keychain-db`：证书与私钥。
- `~/Library/Keychains/eduagent-signing.pass`：专用钥匙串口令，权限 0600。

生成过程中的 key、证书和 p12 仅留在系统临时目录，退出脚本时清理；不要把这些文件复制进仓库或分发包。
脚本重复执行时复用已有证书。更新版本继续使用同一证书；证书更换对系统授权的影响需真机验证。
对钥匙串和口令进行受保护的离线备份，不能将私钥、口令、p12 或真实服务 Key 提交到 Git。

## 一条命令生成安装包

```bash
pnpm app:release
pnpm app:e2e
pnpm app:verify-images
```

发布命令使用 arm64 Node 构建 standalone、转换 staging WebP、生成 `.app`、签名并校验，最后制作 dmg。
arm64 输出为 `desktop/dist/mac-arm64/EduAgent.app` 和 `desktop/dist/EduAgent-<version>-arm64.dmg`，
版本号取根 `package.json`。`app:pack` 复用同一发布流程，`app:stage` 可单独检查 staging。
这条命令只生成本地产物，不上传或发布。

`sign-and-dmg.sh` 解锁专用钥匙串，以显式 `--keychain` 签名，执行
`codesign --verify --deep --strict` 后才生成 dmg。证书缺失时明确报错，先运行首次准备命令。
hardened runtime 配合无 Team ID 的自签名证书需要
`com.apple.security.cs.disable-library-validation`，否则 Electron Framework 可能因 Team ID 不同而无法加载。
麦克风用途声明及 audio-input entitlement 随包保留。
Gatekeeper 对自签名包的 `spctl --assess` 拒绝属于预期，不能把 codesign 校验通过描述为 Apple 公证成功。

## Intel 版后续

2026-10-24 用户决定暂不提供 Intel 版，只交付 Apple 芯片 arm64；当前发布命令只接受 arm64 Node，不生成 universal 包。
将来需要 Intel 版时，在 x64 环境重新 `next build`，确认 x64 Node、Next SWC 与 esbuild 构建工具可用，再扩展发布脚本并验证对应的 `.app`。
Next 构建工具使用当前架构的 SWC；本轮 standalone 实际未携带 SWC 原生二进制，但跨架构构建和运行尚未验证。
Intel 版发布前需要完成 x64 mock 上课冒烟、全部图片校验和 Intel Mac 真机安装验收。
