# 自动更新配置指南（tauri-plugin-updater）

应用内「帮助 → 检查更新」与启动时的更新流程已内置（`src/exporting.ts` 的 `checkForUpdates`，Rust 侧已注册 updater 插件）。要让它在正式发布中生效，还需要以下三步一次性配置。

> 当前 `tauri.conf.json` 中 `plugins.updater.active = false`（未启用），菜单里的「检查更新」会提示参见本文档。

## ① 生成签名密钥对（一次性）

在任一台机器上：

```bash
npx @tauri-apps/cli signer generate -w ~/.tauri/contourlinea.key
```

输出：

- **私钥**：写入 `~/.tauri/contourlinea.key`（保管好，绝不入库）
- **公钥**：打印在终端（一段 base64）

## ② 配置仓库 Secrets 与 tauri.conf.json

GitHub 仓库 **Settings → Secrets → Actions**：

| Secret | 值 |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | 私钥文件内容（整段） |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 生成时设置的密码（没设则留空创建 secret 值为空字符串） |

修改 `src-tauri/tauri.conf.json`：

```json
"plugins": {
  "updater": {
    "active": true,
    "dialog": true,
    "pubkey": "把生成的公钥粘贴到这里",
    "endpoints": [
      "https://github.com/HBrOcean/ContourLinea/releases/latest/download/latest.json"
    ]
  }
}
```

## ③ release.yml 传参给 tauri-action

在 macOS/Linux/Windows 各 job 的 tauri-action 步骤 `with:` 中加：

```yaml
          includeUpdater: true
```

并把 secrets 注入 env：

```yaml
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
```

这样每次打 tag 发布时，tauri-action 会：

1. 构建带**更新器签名**的安装包与 `.tar.gz`(macOS/Linux) / `.zip`(Windows) 更新包
2. 自动生成并上传 `latest.json`（含版本号、下载地址、签名）
3. 应用内的「检查更新」读取该文件，校验签名后自动安装并重启

## 发布流程

之后每次发版只需：

```bash
node scripts/sync-version.mjs 1.2.0   # 统一三处版本号
git commit -am "chore: bump 1.2.0"
git tag v1.2.0
git push origin main --tags
```

用户端：已安装旧版的用户在应用内「帮助 → 检查更新」即可升级。

## 注意事项

- **私钥丢失 = 更新通道作废**：只能换新的公私钥并要求用户重新下载安装
- Windows 更新包要求 `.zip`（nsis 目标时 tauri-action 自动产出）；若只发 msi 则更新在 Windows 不可用
- `latest.json` 的 endpoint 指向 `releases/latest/download/`，Draft Release 不算 latest——**必须 Publish**
