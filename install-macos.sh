#!/bin/sh
set -eu
[ "$(uname -s)" = Darwin ] || { echo "Run this command on macOS." >&2; exit 2; }
umask 077
d=$(mktemp -d "${TMPDIR:-/tmp}/nodrelay-download.XXXXXXXX")
trap 'rm -rf -- "$d"' EXIT
echo "诺联 Nodrelay · 正在下载安装包…" >&2
curl --disable -fsSL --max-redirs 5 --connect-timeout 15 --max-time 300 --proto '=https' --proto-redir '=https' 'https://raw.githubusercontent.com/Erlin0220/nodrelay-downloads/refs/heads/macos-preview/archives/nodrelay-management-0.1.5-preview.14-macos.tgz' -o "$d/setup.tgz"
actual=$(shasum -a 256 "$d/setup.tgz")
[ "${actual%% *}" = '75c34ee42bec7ed77a03dd165b2f25b8dd72678742b447750fa1df684b23a43f' ] || { echo "Nodrelay download checksum mismatch." >&2; exit 1; }
tar -xzf "$d/setup.tgz" -C "$d"
sh "$d/packaging/setup-macos.sh" "$d/management-release.json" "$d/publisher.pub.pem" "$@"
