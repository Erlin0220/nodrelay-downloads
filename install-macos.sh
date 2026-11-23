#!/bin/sh
set -eu
[ "$(uname -s)" = Darwin ] || { echo "Run this command on macOS." >&2; exit 2; }
umask 077
d=$(mktemp -d "${TMPDIR:-/tmp}/nodrelay-download.XXXXXXXX")
trap 'rm -rf -- "$d"' EXIT
echo "诺联 Nodrelay · 正在下载安装包…" >&2
curl --disable -fsSL --max-redirs 5 --connect-timeout 15 --max-time 300 --proto '=https' --proto-redir '=https' 'https://github.com/Erlin0220/nodrelay/releases/download/v0.1.5-preview.16/nodrelay-management-0.1.5-preview.16-macos.tgz' -o "$d/setup.tgz"
actual=$(shasum -a 256 "$d/setup.tgz")
[ "${actual%% *}" = 'dd8a92dc69b241c3cf9424dc4f98c48d0c165fbddf361d33ca9dfddabfa7a317' ] || { echo "Nodrelay download checksum mismatch." >&2; exit 1; }
tar -xzf "$d/setup.tgz" -C "$d"
sh "$d/packaging/setup-macos.sh" "$d/management-release.json" "$d/publisher.pub.pem" "$@"
