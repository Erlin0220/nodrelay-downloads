<p align="center">
  <img src="./assets/nodrelay-logo.jpg" alt="诺联 Logo" width="112">
</p>
<h1 align="center">Nodrelay（诺联）</h1>
<p align="center">
  <a href="./README.md">English</a> · 简体中文
</p>

诺联将多台 Personal DevSpace 设备接入同一个 Cloudflare MCP Portal。你可以在自己的 Cloudflare 账户部署管理台，接入各台设备，再通过 MCP 客户端操作指定设备。工作区和 Personal Runtime 保留在各台设备上。

[v0.1.1 管理台安装版](https://github.com/Erlin0220/nodrelay-downloads/releases/tag/v0.1.1) · [所有版本](https://github.com/Erlin0220/nodrelay-downloads/releases) · [反馈问题](https://github.com/Erlin0220/nodrelay-downloads/issues)

## 特性

- **一个 Portal 接入多台设备。** 管理台可以生成一次性接入票据、查看设备连接状态，也可以撤销单台设备的接入权限。每台设备使用独立的 Cloudflare Tunnel 和凭据。
- **操作指定设备上的文件和命令。** 通过设备上的 Personal Runtime 打开工作区、读写文件、运行命令并查看运行中的进程。
- **三端设备安装包。** 在 Mac 上部署管理台后，可以生成 Apple Silicon Mac、Windows x64 或 Linux x64 的设备接入命令。
- **设备修复和授权恢复。** 支持设备同版本修复。管理台的 Cloudflare 授权过期或被撤销时，可以重新授权。

## 快速开始

### 1. 在 macOS 上一键部署管理台

准备一个 Cloudflare 账户。该账户需要有已启用的域名、已建立的 Zero Trust 组织，以及可用的身份提供方。在 Mac 上打开「终端」(zsh)，复制执行这一行。

```zsh
zsh <(curl -fsSL https://github.com/Erlin0220/nodrelay-downloads/releases/download/v0.1.1/install-macos.sh)
```

这条命令信任 GitHub 通过 HTTPS 提供的启动脚本。脚本会校验管理安装包的 SHA-256，安装器会验证 Ed25519 发布签名。如需在执行前校验启动脚本，可使用[固定脚本 SHA-256 的安装命令](https://github.com/Erlin0220/nodrelay-downloads/releases/download/v0.1.1/install-macos-command.txt)。

登录 Cloudflare 后，安装器自动读取已授权账户和已激活域名。只有一个就自动选用，有多个就输入编号。所选账户没有可用域名时，先在 Cloudflare 添加或激活域名，再重新运行安装器。安装时填写的管理员邮箱用于登录诺联管理台，可以和 Cloudflare 登录邮箱不同。

### 2. 接入设备

在管理台添加设备，再用准备运行诺联的本机账户登录目标设备，在终端执行管理台生成的命令。命令会下载并校验对应的安装包，并使用一次性票据接入设备。请妥善保管生成的命令。

手动安装时，将归档和对应的安装脚本下载到同一目录，用签名校验清单核对两个文件，再按[发布页的手动安装说明](https://github.com/Erlin0220/nodrelay-downloads/releases/tag/v0.1.0#install-a-device)操作。

v0.1.1 管理台沿用下列 v0.1.0 签名设备包。

| 设备平台 | 安装包 | 安装脚本 |
| --- | --- | --- |
| macOS Apple Silicon (ARM64) | [TGZ](https://github.com/Erlin0220/nodrelay-downloads/releases/download/v0.1.0/devspace-fleet-0.1.0-macos-arm64.tgz) | [Shell 脚本](https://github.com/Erlin0220/nodrelay-downloads/releases/download/v0.1.0/install-devspace-fleet-0.1.0-macos-arm64.sh) |
| Windows x64 | [ZIP](https://github.com/Erlin0220/nodrelay-downloads/releases/download/v0.1.0/devspace-fleet-0.1.0-windows-x64.zip) | [PowerShell 脚本](https://github.com/Erlin0220/nodrelay-downloads/releases/download/v0.1.0/install-devspace-fleet-0.1.0-windows-x64.ps1) |
| Linux x64 | [TGZ](https://github.com/Erlin0220/nodrelay-downloads/releases/download/v0.1.0/devspace-fleet-0.1.0-linux-x64.tgz) | [Shell 脚本](https://github.com/Erlin0220/nodrelay-downloads/releases/download/v0.1.0/install-devspace-fleet-0.1.0-linux-x64.sh) |

[SHA-256 校验清单](https://github.com/Erlin0220/nodrelay-downloads/releases/download/v0.1.0/SHA256SUMS) · [分离签名](https://github.com/Erlin0220/nodrelay-downloads/releases/download/v0.1.0/SHA256SUMS.sig) · [发布者公钥](https://github.com/Erlin0220/nodrelay-downloads/releases/download/v0.1.0/publisher.pub.pem)

### 3. 连接 MCP 客户端

将安装器显示的 MCP Portal 地址添加到 MCP 客户端，通过 Cloudflare Access 登录，再选择已接入设备的工具。

## 工作原理

```text
管理员 → Cloudflare Access → 诺联管理台（Worker + D1）
MCP 客户端 → Cloudflare MCP Portal → 设备专属 Tunnel → 本地 MCP 适配器 → Personal Runtime
```

管理台负责设备注册和接入管理。[Cloudflare MCP Portal](https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/mcp-portals/) 通过所选设备的 Tunnel 转发工具调用。文件工具只能访问 Runtime 允许的目录，命令以运行诺联的本机账户权限执行。

## 恢复与版本限制

- 管理台的 Cloudflare 授权过期或被撤销时，在原 Mac 上保留部署收据，并在 macOS 安装命令末尾加上 `--reconnect` 后重新执行。
- 同版本修复时，macOS 或 Linux 的本地安装命令加 `--repair`，Windows 加 `-Repair`。更换版本时，停用旧设备注册，再用目标版本接入新设备。
- v0.1.0 的设备包提供文件和命令工具，本次发行未包含浏览器配套组件。
- 实机与跨 Cloudflare 账户的端到端流程待验收。发行验证未覆盖 Apple 公证和 Windows Authenticode。
