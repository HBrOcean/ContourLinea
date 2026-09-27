# 代码签名指南（可选但推荐）

未签名的应用分发时，用户会看到系统警告：

- **Windows**：SmartScreen 提示「Windows 已保护你的电脑 / 未知发布者」，需点「仍要运行」
- **macOS**：Gatekeeper 提示「无法验证开发者」，需右键 → 打开，或在设置中允许

签名可以消除这些警告，但需要付费证书。以下为完整步骤，**未配置签名不影响 CI 构建**（会自动跳过）。

---

## Windows（Authenticode 签名）

### 1. 获取证书

| 方式 | 说明 |
| --- | --- |
| OV 代码签名证书 | ~$70-300/年（Certum / SSL.com / Sectigo），SmartScreen 需要积累信誉 |
| EV 代码签名证书 | ~$250-500/年，**立即获得 SmartScreen 信誉**（需要硬件 token 或 HSM） |

### 2. 配置签名（eSigner / 本地 PFX 假设）

在 GitHub 仓库 **Settings → Secrets and variables → Actions** 添加：

- `WINDOWS_CERTIFICATE` —— PFX 证书 base64（`base64 -w0 cert.pfx`）
- `WINDOWS_CERTIFICATE_PASSWORD` —— 证书密码

### 3. 修改 release.yml（Windows job 内）

```yaml
      - name: Decode certificate
        shell: bash
        run: |
          echo "${{ secrets.WINDOWS_CERTIFICATE }}" | base64 --decode > cert.pfx

      - name: Sign installers
        shell: bash
        run: |
          for f in src-tauri/target/release/bundle/nsis/*.exe \
                   src-tauri/target/release/bundle/msi/*.msi; do
            signtool sign //fd SHA256 //tr http://timestamp.digicert.com \
              //td SHA256 //f cert.pfx \
              //p "${{ secrets.WINDOWS_CERTIFICATE_PASSWORD }}" "$f"
          done
```

> signtool 来自 Windows SDK（runner 自带）。EV 证书走硬件 token 时改用 [Azure Trusted Signing](https://learn.microsoft.com/azure/trusted-signing/) 或 [SSL.com eSigner](https://www.ssl.com/esigner/) 的 GitHub Action。

---

## macOS（签名 + 公证）

### 1. 前置（需要 Apple Developer 账号 $99/年）

1. 生成 **Developer ID Application** 证书（证书类型必须是 Developer ID，不是普通 Mac App Distribution）
2. 创建 **App 专用密码**（appleid.apple.com → 登录与安全 → 专用密码），用于公证
3. 记录 Team ID（开发者页面右侧，10 位大写字母数字）

### 2. 配置 tauri.conf.json

```json
"bundle": {
  "macOS": {
    "signingIdentity": "Developer ID Application: YOUR NAME (TEAMID)",
    "entitlements": null
  }
}
```

### 3. CI Secrets

- `APPLE_CERTIFICATE` —— 导出的 .p12 base64
- `APPLE_CERTIFICATE_PASSWORD` —— p12 密码
- `APPLE_SIGNING_IDENTITY` —— `Developer ID Application: ...`
- `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` —— 公证用（专用密码）

### 4. 修改 release.yml（macOS job）

```yaml
      - name: Build and publish release
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
```

tauri-action 会在构建后自动签名 + 公证（notarytool）+ 装订（stapler）。

---

## Linux

Linux 无统一签名机制（AppImage/deb 不强制）。可选：用 GPG 给产物签名，把公钥放在 README。

---

## 当前状态

ContourLinea 目前**未签名**发布：CI 构建会正常出包，Windows 首次运行需「更多信息 → 仍要运行」，macOS 需右键打开。如果项目以后有正式分发需求，按上面步骤接入即可。
