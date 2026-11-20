#!/bin/sh
set -eu
[ "$(uname -s)" = Darwin ] || { echo "Run this command on macOS." >&2; exit 2; }
umask 077
d=$(mktemp -d "${TMPDIR:-/tmp}/nodrelay-download.XXXXXXXX")
trap 'rm -rf -- "$d"' EXIT
echo "诺联 Nodrelay · 正在下载安装包…" >&2
curl --disable -fsSL --max-redirs 5 --connect-timeout 15 --max-time 300 --proto '=https' --proto-redir '=https' 'https://raw.githubusercontent.com/Erlin0220/nodrelay-downloads/refs/heads/macos-preview/archives/nodrelay-management-0.1.5-preview.8-macos.tgz' -o "$d/setup.tgz"
actual=$(shasum -a 256 "$d/setup.tgz")
[ "${actual%% *}" = 'f2248ac7763313ad3efd7592ff42901e8bc91ddec2db47850204a3e67524e4e5' ] || { echo "Nodrelay download checksum mismatch." >&2; exit 1; }
tar -xzf "$d/setup.tgz" -C "$d"
sh "$d/packaging/setup-macos.sh" "$d/management-release.json" "$d/publisher.pub.pem" "$@"
