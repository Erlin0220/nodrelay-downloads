<p align="center">
  <img src="./assets/nodrelay-logo.jpg" alt="Nodrelay logo" width="112">
</p>
<h1 align="center">Nodrelay</h1>
<p align="center">
  English · <a href="./README_zh-cn.md">简体中文</a>
</p>

Nodrelay connects your Personal DevSpace devices to one Cloudflare MCP Portal. Deploy the management console in your Cloudflare account, enroll each device, and use an MCP client to work with the device you select. Workspaces and the Personal Runtime stay on each device.

[Management installer v0.1.1](https://github.com/Erlin0220/nodrelay-downloads/releases/tag/v0.1.1) · [All releases](https://github.com/Erlin0220/nodrelay-downloads/releases) · [Report an issue](https://github.com/Erlin0220/nodrelay-downloads/issues)

## Features

- **One portal for multiple devices.** The management console issues one-time enrollment tickets, shows device connection status, and lets you revoke access for an individual device. Each device has its own Cloudflare Tunnel and credentials.
- **File and command access.** Use the Personal Runtime on the selected device to open workspaces, read or edit files, run commands, and check running processes.
- **Installers for three platforms.** A Mac deploys the management console. The console generates a device enrollment command for macOS on Apple Silicon, Windows x64, or Linux x64.
- **Repair and authorization recovery.** Repair an existing device with its current release or reconnect the management console after its Cloudflare authorization expires or is revoked.

## Quick start

### 1. Deploy the management console from macOS

You need a Cloudflare account with an active domain, an existing Zero Trust organization, and a working identity provider. Paste this one-line command into Terminal on your Mac (zsh).

```zsh
zsh <(curl -fsSL https://github.com/Erlin0220/nodrelay-downloads/releases/download/v0.1.1/install-macos.sh)
```

The command trusts the launcher downloaded from GitHub over HTTPS. The launcher checks the management archive’s SHA-256, and the installer verifies the Ed25519 release signature. To verify the launcher before running it, use the [command with the pinned launcher SHA-256](https://github.com/Erlin0220/nodrelay-downloads/releases/download/v0.1.1/install-macos-command.txt).

Sign in to Cloudflare. The installer automatically uses a sole authorized account or active domain. When there are several, choose by number. If the selected account has no active domain, add or activate one in Cloudflare and run the installer again. The administrator email you enter controls access to the management console and can differ from your Cloudflare sign-in email.

### 2. Enroll a device

Add the device in the management console and run its generated enrollment command in a terminal on that device as the local user who will run Nodrelay. The command downloads and verifies the matching package and enrolls the device with a one-time ticket. Keep the command private.

For manual installation, download the archive and matching installer into the same directory, verify both against the signed checksums, and follow the [manual installation instructions](https://github.com/Erlin0220/nodrelay-downloads/releases/tag/v0.1.0#install-a-device).

The v0.1.1 management installer uses the signed v0.1.0 device packages below.

| Device platform | Archive | Installer |
| --- | --- | --- |
| macOS Apple Silicon (ARM64) | [TGZ](https://github.com/Erlin0220/nodrelay-downloads/releases/download/v0.1.0/devspace-fleet-0.1.0-macos-arm64.tgz) | [Shell script](https://github.com/Erlin0220/nodrelay-downloads/releases/download/v0.1.0/install-devspace-fleet-0.1.0-macos-arm64.sh) |
| Windows x64 | [ZIP](https://github.com/Erlin0220/nodrelay-downloads/releases/download/v0.1.0/devspace-fleet-0.1.0-windows-x64.zip) | [PowerShell script](https://github.com/Erlin0220/nodrelay-downloads/releases/download/v0.1.0/install-devspace-fleet-0.1.0-windows-x64.ps1) |
| Linux x64 | [TGZ](https://github.com/Erlin0220/nodrelay-downloads/releases/download/v0.1.0/devspace-fleet-0.1.0-linux-x64.tgz) | [Shell script](https://github.com/Erlin0220/nodrelay-downloads/releases/download/v0.1.0/install-devspace-fleet-0.1.0-linux-x64.sh) |

[SHA-256 checksums](https://github.com/Erlin0220/nodrelay-downloads/releases/download/v0.1.0/SHA256SUMS) · [Detached signature](https://github.com/Erlin0220/nodrelay-downloads/releases/download/v0.1.0/SHA256SUMS.sig) · [Publisher public key](https://github.com/Erlin0220/nodrelay-downloads/releases/download/v0.1.0/publisher.pub.pem)

### 3. Connect an MCP client

Add the MCP Portal URL printed by the installer to your MCP client. Sign in through Cloudflare Access and choose the tools for the enrolled device.

## How it works

```text
Admin → Cloudflare Access → Nodrelay console (Worker + D1)
MCP client → Cloudflare MCP Portal → per-device Tunnel → local MCP adapter → Personal Runtime
```

The console manages enrollment and device access. The [Cloudflare MCP Portal](https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/mcp-portals/) routes tool calls through the selected device’s tunnel. The Runtime limits file tools to allowed directories. Commands run with the permissions of the local account running Nodrelay.

## Recovery and release limits

- If the console’s Cloudflare authorization expires or is revoked, append `--reconnect` to the macOS install command and run it on the original Mac with its deployment receipt.
- For same-version device repair, append `--repair` to the local macOS or Linux installer command, or `-Repair` on Windows. To change versions, retire the old enrollment and enroll a new device with the intended release.
- The v0.1.0 device packages provide file and command tools. The browser companion is outside this release.
- End-to-end verification on physical devices and across Cloudflare accounts remains pending. Apple notarization and Windows Authenticode were outside release verification.
