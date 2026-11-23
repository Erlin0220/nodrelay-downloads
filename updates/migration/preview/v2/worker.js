var __freeze = Object.freeze;
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(raw || cooked.slice()) }));

// ../cloud/device-paths.mjs
var enrollPath = "/device/enroll";
var activatePath = "/device/activate";
var activationErrorCodes = Object.freeze([
  "route_unavailable",
  "unexpected_mcp",
  "tool_catalog_pending",
  "tunnel_pending"
]);
var supportedEnrollmentTargets = Object.freeze(["macos-arm64", "windows-x64", "linux-x64"]);
var installPath = /* @__PURE__ */ __name((platform) => "/device/install/" + platform, "installPath");
var publicInstallerBase = "https://raw.githubusercontent.com/Erlin0220/nodrelay/refs/heads/main/";
var operatingSystems = {
  macos: { label: "macOS", architectures: ["arm64", "x64"] },
  windows: { label: "Windows", architectures: ["x64"] },
  linux: { label: "Linux", architectures: ["x64", "arm64"] }
};
function hostedInstallers(releases) {
  const groups = {};
  for (const [platform, { architectures }] of Object.entries(operatingSystems)) {
    const assets2 = Object.fromEntries(architectures.flatMap((architecture) => {
      const asset = releases[`${platform}-${architecture}`];
      return asset?.url ? [[architecture, asset]] : [];
    }));
    const available = Object.values(assets2);
    if (!available.length) continue;
    const { version: version2, browser } = available[0];
    if (available.some((asset) => asset.version !== version2 || asset.browser !== browser)) {
      throw new Error(`Hosted ${operatingSystems[platform].label} installers must share the same version and capabilities`);
    }
    groups[platform] = { version: version2, browser, assets: assets2 };
  }
  return groups;
}
__name(hostedInstallers, "hostedInstallers");

// ../cloud/install-command.mjs
var tokenPattern = /^[A-Za-z0-9_-]{43}$/;
var devicePattern = /^[a-z][a-z0-9-]{0,23}$/;
var sh = /* @__PURE__ */ __name((value) => "'" + value.replaceAll("'", "'\\''") + "'", "sh");
var curlOptions = "--disable --fail --silent --show-error --location --max-redirs 5 --connect-timeout 15 --max-time 300 --retry 3 --retry-delay 2 --proto '=https' --proto-redir '=https'";
var ps = /* @__PURE__ */ __name((value) => "'" + value.replaceAll("'", "''") + "'", "ps");
var shellHash = 'if command -v sha256sum >/dev/null; then digest=$(sha256sum "$d/fleet.tgz"); else digest=$(shasum -a 256 "$d/fleet.tgz"); fi';
var requireShellHash = /* @__PURE__ */ __name((expected) => `[ "\${digest%% *}" = ${expected} ] || { printf '%s\\n' 'Installer hash mismatch' >&2; exit 1; }`, "requireShellHash");
var unpackShell = 'mkdir "$d/bundle"; tar -xzf "$d/fleet.tgz" -C "$d/bundle"';
var temporaryDirectory = `umask 077; d=$(mktemp -d); trap 'rm -rf "$d"' EXIT`;
var runWindows = "& (Join-Path $bundle 'bin/node.exe') (Join-Path $bundle 'fleet/src/install-device.mjs') $bundle";
var requireWindowsSuccess = "if ($LASTEXITCODE -ne 0) { throw 'Device installation failed' }";
var windowsCleanup = "for ($attempt = 0; $attempt -lt 5; $attempt++) { try { if (-not (Test-Path -LiteralPath $d -ErrorAction Stop)) { break }; Remove-Item -LiteralPath $d -Recurse -Force -ErrorAction Stop; break } catch { if ($attempt -eq 4) { Write-Warning 'Nodrelay could not remove its temporary installer files.' -WarningAction Continue } else { Start-Sleep -Milliseconds (200 * ($attempt + 1)) } } }";
function shortInstallCommand(origin, platform, version2, ticket, deviceId, { pinnedUrl } = {}) {
  const url = new URL(installPath(platform), origin);
  if (url.protocol !== "https:") throw new Error("Device bootstrap requires HTTPS");
  if (pinnedUrl) {
    const pinned = new URL(pinnedUrl);
    if (pinned.origin !== url.origin || pinned.pathname !== url.pathname || pinned.searchParams.get("version") !== version2 || !/^[a-f0-9]{64}$/.test(pinned.searchParams.get("manifest") ?? "") || [...pinned.searchParams].length !== 2 || pinned.hash || pinned.username || pinned.password) throw new Error("Unsafe pinned installer destination");
    url.search = pinned.search;
  } else url.searchParams.set("version", version2);
  if (platform === "windows") {
    return `& { $r=iwr ${ps(url.href)} -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 30 -ErrorAction Stop; if($r.StatusCode -ne 200 -or $r.Content -cnotlike 'param(*'){ throw 'Installer unavailable' }; & ([scriptblock]::Create([string]$r.Content)) ${ps(deviceId)} ${ps(ticket)} }`;
  }
  return `(s=$(curl -qfsSL --max-redirs 0 -m30 -w '%{http_code}' ${sh(url.href)}) && case "$s" in '#!/bin/sh'*200) sh -c "\${s%???}" -- ${sh(deviceId)} ${sh(ticket)};; *) echo 'Installer unavailable' >&2; exit 1;; esac)`;
}
__name(shortInstallCommand, "shortInstallCommand");
function publicInstallCommand(origin, platform, code) {
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.origin !== origin || !/^https:\/\/[a-z0-9.-]+(?::\d{1,5})?$/.test(origin) || typeof code !== "string" || !tokenPattern.test(code)) throw new Error("Device install command requires a canonical HTTPS origin and code");
  if (platform === "windows") {
    return `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { iwr '${publicInstallerBase}install.ps1' -UseBasicParsing -OutFile 'nodrelay-install.ps1' -ErrorAction Stop; & '.\\nodrelay-install.ps1' '-e' '${origin}' '-t' '${code}' } catch { throw }"`;
  }
  const shell = platform === "linux" ? "bash" : "zsh";
  return `${shell} <(curl -fsSL ${publicInstallerBase}install.sh) -e ${origin} -t ${code}`;
}
__name(publicInstallCommand, "publicInstallCommand");
function bootstrapInstaller(origin, platform, { assets: assets2 }, { enrollmentIntent = false, deviceId } = {}) {
  if (deviceId !== void 0 && (!enrollmentIntent || typeof deviceId !== "string" || !devicePattern.test(deviceId))) {
    throw new Error("A bound installer needs an enrollment intent and a valid device ID");
  }
  if (platform === "windows") {
    const asset = assets2.x64;
    const device = deviceId === void 0 ? "[Parameter(Mandatory)][ValidatePattern('^[a-z][a-z0-9-]{0,23}$')][string]$Device" : `[ValidatePattern('^[a-z][a-z0-9-]{0,23}$')][string]$Device = ${ps(deviceId)}`;
    return `param(${device}, [Parameter(Mandatory)][ValidatePattern('^[A-Za-z0-9_-]{43}$')][string]$Ticket)
$ErrorActionPreference = 'Stop'
if ($env:PROCESSOR_ARCHITEW6432 -eq 'ARM64' -or ($env:PROCESSOR_ARCHITEW6432 -ne 'AMD64' -and $env:PROCESSOR_ARCHITECTURE -ne 'AMD64')) { throw 'This release supports x64 Windows' }
$d = Join-Path ([IO.Path]::GetTempPath()) ('nodrelay-' + [Guid]::NewGuid())
New-Item -ItemType Directory $d | Out-Null
try {
  $f = Join-Path $d 'fleet.zip'
  $curlPath = if ($env:PROCESSOR_ARCHITEW6432 -eq 'AMD64') { 'Sysnative/curl.exe' } else { 'System32/curl.exe' }
  $curl = Join-Path $env:SystemRoot $curlPath
  if (-not (Test-Path -LiteralPath $curl -PathType Leaf)) { throw 'Windows system curl.exe is required' }
  & $curl ${curlOptions} --output $f --url ${ps(asset.url)}
  if ($LASTEXITCODE -ne 0) { throw 'Installer download failed' }
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash.ToLowerInvariant() -ne ${ps(asset.sha256)}) { throw 'Installer hash mismatch' }
  $bundle = Join-Path $d 'bundle'
  Expand-Archive -LiteralPath $f -DestinationPath $bundle
  $env:DEVSPACE_FLEET_MANAGER = ${ps(origin)}
  $env:DEVSPACE_FLEET_TICKET = $Ticket
  $env:DEVSPACE_FLEET_DEVICE = $Device
${enrollmentIntent ? `  $env:DEVSPACE_FLEET_ENROLLMENT_PROTOCOL = 'intent-v1'
  $env:DEVSPACE_FLEET_ASSET_SHA256 = ${ps(asset.sha256)}
  $env:DEVSPACE_FLEET_PORT_PROTOCOL = 'v1'
` : ""}  ${runWindows}
  ${requireWindowsSuccess}
} finally {
  Remove-Item Env:DEVSPACE_FLEET_TICKET, Env:DEVSPACE_FLEET_MANAGER, Env:DEVSPACE_FLEET_DEVICE -ErrorAction SilentlyContinue${enrollmentIntent ? "\n  Remove-Item Env:DEVSPACE_FLEET_ENROLLMENT_PROTOCOL, Env:DEVSPACE_FLEET_ASSET_SHA256 -ErrorAction SilentlyContinue" : ""}
  ${enrollmentIntent ? "Remove-Item Env:DEVSPACE_FLEET_PORT_PROTOCOL -ErrorAction SilentlyContinue" : ""}
  ${windowsCleanup}
}
`;
  }
  const architectures = { x64: "x86_64|amd64", arm64: "arm64|aarch64" };
  const cases = Object.entries(assets2).map(([arch, asset]) => `  ${architectures[arch]}) url=${sh(asset.url)}; expected=${sh(asset.sha256)} ;;`).join("\n");
  const body = `#!/bin/sh
set -eu
[ "$(uname -s)" = ${sh(platform === "macos" ? "Darwin" : "Linux")} ] || { echo ${sh(`Use the ${operatingSystems[platform].label} command on its target OS`)} >&2; exit 1; }
case "$(uname -m)" in
${cases}
  *) echo 'No verified installer is available for this CPU' >&2; exit 1 ;;
esac
export DEVSPACE_FLEET_DEVICE="\${1:-\${DEVSPACE_FLEET_DEVICE:-}}"
export DEVSPACE_FLEET_TICKET="\${2:-\${DEVSPACE_FLEET_TICKET:-}}"
: "\${DEVSPACE_FLEET_DEVICE:?Missing device id}" "\${DEVSPACE_FLEET_TICKET:?Missing device ticket}"
${temporaryDirectory}
curl ${curlOptions} --url "$url" --output "$d/fleet.tgz"
${shellHash}
${requireShellHash('"$expected"')}
${unpackShell}
${enrollmentIntent ? 'export DEVSPACE_FLEET_ENROLLMENT_PROTOCOL=intent-v1 DEVSPACE_FLEET_ASSET_SHA256="$expected" DEVSPACE_FLEET_PORT_PROTOCOL=v1\n' : ""}DEVSPACE_FLEET_MANAGER=${sh(origin)} sh "$d/bundle/install.sh"
`;
  if (!enrollmentIntent) return body;
  const [shebang, ...rest] = body.trimEnd().split("\n");
  const call = deviceId === void 0 ? 'nodrelay_install "$@"' : `nodrelay_install ${sh(deviceId)} "$1"`;
  return `${shebang}
nodrelay_install() {
${rest.join("\n")}
}
${call}
`;
}
__name(bootstrapInstaller, "bootstrapInstaller");
function installCommand(origin, platform, asset, ticket, deviceId) {
  if (platform.startsWith("windows-")) {
    const acquire = asset.localFile ? [`Copy-Item -LiteralPath (Join-Path (Get-Location) ${ps(asset.localFile)}) -Destination $f`] : [
      "$curl=Join-Path $env:SystemRoot 'System32/curl.exe'",
      "if (-not (Test-Path -LiteralPath $curl -PathType Leaf)) { throw 'Windows system curl.exe is required' }",
      `& $curl ${curlOptions} --output $f --url ${ps(asset.url)}`,
      "if ($LASTEXITCODE -ne 0) { throw 'Installer download failed' }"
    ];
    const install = [
      "$f=Join-Path $d 'fleet.zip'",
      ...acquire,
      `if ((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash.ToLowerInvariant() -ne ${ps(asset.sha256)}) { throw 'Installer hash mismatch' }`,
      "$bundle=Join-Path $d 'bundle'",
      "Expand-Archive -LiteralPath $f -DestinationPath $bundle",
      `$env:DEVSPACE_FLEET_MANAGER=${ps(origin)}; $env:DEVSPACE_FLEET_TICKET=${ps(ticket)}; $env:DEVSPACE_FLEET_DEVICE=${ps(deviceId)}`,
      runWindows,
      requireWindowsSuccess
    ];
    return [
      "$ErrorActionPreference='Stop'",
      "$d=Join-Path ([IO.Path]::GetTempPath()) ('devspace-fleet-'+[Guid]::NewGuid())",
      "New-Item -ItemType Directory $d | Out-Null",
      `try { ${install.join("; ")} } finally { Remove-Item Env:DEVSPACE_FLEET_TICKET -ErrorAction SilentlyContinue; Remove-Item Env:DEVSPACE_FLEET_MANAGER -ErrorAction SilentlyContinue; Remove-Item Env:DEVSPACE_FLEET_DEVICE -ErrorAction SilentlyContinue; ${windowsCleanup} }`
    ].join("; ");
  }
  return [
    "(set -eu; " + temporaryDirectory,
    asset.localFile ? `cp ${sh("./" + asset.localFile)} "$d/fleet.tgz"` : `curl ${curlOptions} --url ${sh(asset.url)} --output "$d/fleet.tgz"`,
    shellHash,
    requireShellHash(sh(asset.sha256)),
    unpackShell,
    `DEVSPACE_FLEET_MANAGER=${sh(origin)} DEVSPACE_FLEET_TICKET=${sh(ticket)} DEVSPACE_FLEET_DEVICE=${sh(deviceId)} sh "$d/bundle/install.sh")`
  ].join("; ");
}
__name(installCommand, "installCommand");
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
__name(escapeHtml, "escapeHtml");

// ../cloud/enrollment-bootstrap.mjs
var versionPattern = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,95}$/;
var hashPattern = /^[a-f0-9]{64}$/;
var matches = /* @__PURE__ */ __name((pattern, value) => typeof value === "string" && pattern.test(value), "matches");
var validOS = /* @__PURE__ */ __name((os) => typeof os === "string" && Object.hasOwn(operatingSystems, os), "validOS");
var record = /* @__PURE__ */ __name((value) => value !== null && typeof value === "object" && !Array.isArray(value), "record");
var encoder = new TextEncoder();
function canonicalOrigin(input) {
  const url = typeof input === "string" && URL.parse(input);
  if (!url || url.origin !== input || url.protocol !== "https:") throw new Error("Expected canonical HTTPS management origin");
  return url.origin;
}
__name(canonicalOrigin, "canonicalOrigin");
function trustedGroup(os, group) {
  if (!validOS(os) || !record(group) || !matches(versionPattern, group.version) || group.browser !== void 0 && typeof group.browser !== "boolean" || !record(group.assets) || Object.keys(group.assets).length === 0) throw new Error("Invalid approved installer group");
  const { version: version2 } = group;
  const browser = group.browser === true;
  const assets2 = /* @__PURE__ */ Object.create(null);
  for (const arch of Object.keys(group.assets).sort()) {
    const entry = group.assets[arch];
    const url = typeof entry?.url === "string" && URL.parse(entry.url);
    if (!operatingSystems[os].architectures.includes(arch) || !matches(hashPattern, entry?.sha256) || !url || url.protocol !== "https:" || url.username || url.password || url.search || url.hash || entry.version !== void 0 && entry.version !== version2 || entry.browser !== void 0 && entry.browser !== browser) {
      throw new Error("Invalid approved installer asset");
    }
    assets2[arch] = Object.freeze({ sha256: entry.sha256, url: url.href });
  }
  return Object.freeze({ version: version2, browser, assets: Object.freeze(assets2) });
}
__name(trustedGroup, "trustedGroup");
var canonical = /* @__PURE__ */ __name((os, group) => JSON.stringify(["enrollment-bootstrap-v1", os, trustedGroup(os, group)]), "canonical");
async function enrollmentBootstrapManifestId(os, group) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(canonical(os, group))));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(enrollmentBootstrapManifestId, "enrollmentBootstrapManifestId");
function mergeEnrollmentBootstrapHistory(previousHistory, releases) {
  if (!record(previousHistory) || !record(releases)) throw new Error("Invalid approved release history");
  const history = /* @__PURE__ */ Object.create(null);
  for (const [os, versions] of Object.entries(previousHistory)) {
    if (!validOS(os) || !record(versions)) throw new Error("Invalid approved release history");
    history[os] = /* @__PURE__ */ Object.create(null);
    for (const [version2, group] of Object.entries(versions)) {
      const accepted = trustedGroup(os, group);
      if (accepted.version !== version2) throw new Error("Invalid approved installer version key");
      history[os][version2] = accepted;
    }
  }
  for (const [os, group] of Object.entries(hostedInstallers(releases))) {
    const next = trustedGroup(os, group);
    history[os] ??= /* @__PURE__ */ Object.create(null);
    const existing = history[os][next.version];
    if (existing && canonical(os, existing) !== canonical(os, next)) throw new Error("Approved installer identity cannot be reassigned");
    history[os][next.version] ??= next;
  }
  for (const versions of Object.values(history)) Object.freeze(versions);
  return Object.freeze(history);
}
__name(mergeEnrollmentBootstrapHistory, "mergeEnrollmentBootstrapHistory");
function response(status, body) {
  return new Response(body, { status, headers: {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  } });
}
__name(response, "response");
async function resolveEnrollmentBootstrap(request, { origin, lookupApproved, render }) {
  const url = new URL(request.url);
  const match = /^\/device\/install\/([^/]+)$/.exec(url.pathname);
  const short = url.searchParams.has("v");
  if (!match || !(short || url.searchParams.has("manifest"))) return;
  const os = match[1];
  const version2 = url.searchParams.get(short ? "v" : "version");
  const manifest = short ? void 0 : url.searchParams.get("manifest");
  const unavailable = /* @__PURE__ */ __name(() => response(404, "Installer version unavailable."), "unavailable");
  if (request.method !== "GET" || url.origin !== canonicalOrigin(origin) || !validOS(os) || typeof render !== "function" || [...url.searchParams].length !== (short ? 1 : 2) || !matches(versionPattern, version2) || !short && !matches(hashPattern, manifest)) return unavailable();
  try {
    const selected = await lookupApproved(os, version2);
    if (!selected) return unavailable();
    const group = trustedGroup(os, selected);
    if (group.version !== version2 || !short && await enrollmentBootstrapManifestId(os, group) !== manifest) return unavailable();
    const body = await render(origin, os, group);
    return typeof body === "string" && body.length ? response(200, body) : unavailable();
  } catch {
    return unavailable();
  }
}
__name(resolveEnrollmentBootstrap, "resolveEnrollmentBootstrap");

// ../node_modules/jose/dist/webapi/lib/buffer_utils.js
var encoder2 = new TextEncoder();
var decoder = new TextDecoder();
var strictDecoder = new TextDecoder("utf-8", { fatal: true });
var UINT32_RANGE = 2 ** 32;
function concat(...buffers) {
  const size = buffers.reduce((acc, { length }) => acc + length, 0), buf = new Uint8Array(size);
  let i = 0;
  for (const buffer of buffers)
    buf.set(buffer, i), i += buffer.length;
  return buf;
}
__name(concat, "concat");
var NON_ASCII = /[^\x00-\x7f]/;
function encode(string) {
  if (typeof string == "string" && string.length >= 128) {
    if (NON_ASCII.test(string))
      throw new TypeError("non-ASCII string encountered in encode()");
    return encoder2.encode(string);
  }
  const bytes = new Uint8Array(string.length);
  for (let i = 0; i < string.length; i++) {
    const code = string.charCodeAt(i);
    if (code > 127)
      throw new TypeError("non-ASCII string encountered in encode()");
    bytes[i] = code;
  }
  return bytes;
}
__name(encode, "encode");
function encodeBase64(input, url = false) {
  if (Uint8Array.prototype.toBase64)
    return input.toBase64({ alphabet: url ? "base64url" : "base64", omitPadding: url });
  const CHUNK_SIZE = 32768, arr = [];
  for (let i = 0; i < input.length; i += CHUNK_SIZE)
    arr.push(String.fromCharCode.apply(null, input.subarray(i, i + CHUNK_SIZE)));
  const encoded = btoa(arr.join(""));
  return url ? encoded.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_") : encoded;
}
__name(encodeBase64, "encodeBase64");
function decodeBase64(encoded, url = false) {
  if (Uint8Array.fromBase64)
    return Uint8Array.fromBase64(encoded, { alphabet: url ? "base64url" : "base64" });
  if (url) {
    if (encoded.includes("+") || encoded.includes("/"))
      throw new TypeError("Invalid base64url");
    encoded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  }
  const binary = atob(encoded), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++)
    bytes[i] = binary.charCodeAt(i);
  return bytes;
}
__name(decodeBase64, "decodeBase64");

// ../node_modules/jose/dist/webapi/util/errors.js
var JOSEError = class extends Error {
  static {
    __name(this, "JOSEError");
  }
  static code = "ERR_JOSE_GENERIC";
  code = "ERR_JOSE_GENERIC";
  constructor(message2, options) {
    super(message2, options), this.name = this.constructor.name, Error.captureStackTrace?.(this, this.constructor);
  }
};
var JWTClaimValidationFailed = class extends JOSEError {
  static {
    __name(this, "JWTClaimValidationFailed");
  }
  static code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
  code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
  claim;
  reason;
  payload;
  constructor(message2, payload, claim = "unspecified", reason = "unspecified") {
    super(message2, { cause: { claim, reason, payload } }), this.claim = claim, this.reason = reason, this.payload = payload;
  }
};
var JWTExpired = class extends JOSEError {
  static {
    __name(this, "JWTExpired");
  }
  static code = "ERR_JWT_EXPIRED";
  code = "ERR_JWT_EXPIRED";
  claim;
  reason;
  payload;
  constructor(message2, payload, claim = "unspecified", reason = "unspecified") {
    super(message2, { cause: { claim, reason, payload } }), this.claim = claim, this.reason = reason, this.payload = payload;
  }
};
var JOSEAlgNotAllowed = class extends JOSEError {
  static {
    __name(this, "JOSEAlgNotAllowed");
  }
  static code = "ERR_JOSE_ALG_NOT_ALLOWED";
  code = "ERR_JOSE_ALG_NOT_ALLOWED";
};
var JOSENotSupported = class extends JOSEError {
  static {
    __name(this, "JOSENotSupported");
  }
  static code = "ERR_JOSE_NOT_SUPPORTED";
  code = "ERR_JOSE_NOT_SUPPORTED";
};
var JWSInvalid = class extends JOSEError {
  static {
    __name(this, "JWSInvalid");
  }
  static code = "ERR_JWS_INVALID";
  code = "ERR_JWS_INVALID";
};
var JWTInvalid = class extends JOSEError {
  static {
    __name(this, "JWTInvalid");
  }
  static code = "ERR_JWT_INVALID";
  code = "ERR_JWT_INVALID";
};
var JWKSInvalid = class extends JOSEError {
  static {
    __name(this, "JWKSInvalid");
  }
  static code = "ERR_JWKS_INVALID";
  code = "ERR_JWKS_INVALID";
};
var JWKSNoMatchingKey = class extends JOSEError {
  static {
    __name(this, "JWKSNoMatchingKey");
  }
  static code = "ERR_JWKS_NO_MATCHING_KEY";
  code = "ERR_JWKS_NO_MATCHING_KEY";
  constructor(message2 = "no applicable key found in the JSON Web Key Set", options) {
    super(message2, options);
  }
};
var JWKSMultipleMatchingKeys = class extends JOSEError {
  static {
    __name(this, "JWKSMultipleMatchingKeys");
  }
  [Symbol.asyncIterator] = async function* () {
  };
  static code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
  code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
  constructor(message2 = "multiple matching keys found in the JSON Web Key Set", options) {
    super(message2, options);
  }
};
var JWKSTimeout = class extends JOSEError {
  static {
    __name(this, "JWKSTimeout");
  }
  static code = "ERR_JWKS_TIMEOUT";
  code = "ERR_JWKS_TIMEOUT";
  constructor(message2 = "request timed out", options) {
    super(message2, options);
  }
};
var JWSSignatureVerificationFailed = class extends JOSEError {
  static {
    __name(this, "JWSSignatureVerificationFailed");
  }
  static code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
  code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
  constructor(message2 = "signature verification failed", options) {
    super(message2, options);
  }
};

// ../node_modules/jose/dist/webapi/util/base64url.js
var base64url_exports = {};
__export(base64url_exports, {
  decode: () => decode,
  encode: () => encode2
});
var invalid = "The input to be decoded is not correctly encoded.";
function decode(input) {
  try {
    return decodeBase64(typeof input == "string" ? input : decoder.decode(input), true);
  } catch (cause) {
    throw new TypeError(invalid, { cause });
  }
}
__name(decode, "decode");
function encode2(input) {
  return encodeBase64(typeof input == "string" ? encoder2.encode(input) : input, true);
}
__name(encode2, "encode");

// ../node_modules/jose/dist/webapi/lib/validate.js
function isObject(input) {
  if (typeof input != "object" || input === null || Object.prototype.toString.call(input) !== "[object Object]")
    return false;
  const prototype = Object.getPrototypeOf(input);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}
__name(isObject, "isObject");
function isJwkSet(input) {
  return isObject(input) && Array.isArray(input.keys) && Array.from(input.keys).every(isObject);
}
__name(isJwkSet, "isJwkSet");
function isDisjoint(...headers) {
  const parameters = /* @__PURE__ */ new Set();
  for (const header of headers)
    if (header)
      for (const parameter of Object.keys(header)) {
        if (parameters.has(parameter))
          return false;
        parameters.add(parameter);
      }
  return true;
}
__name(isDisjoint, "isDisjoint");
function decodeBase64url(value, label3, ErrorClass) {
  try {
    return decode(value);
  } catch (cause) {
    throw new ErrorClass(`Failed to base64url decode the ${label3}`, { cause });
  }
}
__name(decodeBase64url, "decodeBase64url");
function encodeAsciiMember(value, label3, ErrorClass) {
  try {
    return encode(value);
  } catch (cause) {
    throw new ErrorClass(`The ${label3} is not a valid base64url string`, { cause });
  }
}
__name(encodeAsciiMember, "encodeAsciiMember");
function parseJoseHeader(encodedProtectedHeader, ErrorClass, message2) {
  let parsed;
  try {
    parsed = JSON.parse(strictDecoder.decode(decode(encodedProtectedHeader)));
  } catch (cause) {
    throw new ErrorClass(message2, { cause });
  }
  if (!isObject(parsed))
    throw new ErrorClass(message2);
  return parsed;
}
__name(parseJoseHeader, "parseJoseHeader");
var JWS_RECOGNIZED = { __proto__: null, b64: true };
function validateAlgorithms(option, algorithms) {
  if (algorithms !== void 0 && (!Array.isArray(algorithms) || algorithms.some((s) => typeof s != "string")))
    throw new TypeError(`"${option}" option must be an array of strings`);
  return algorithms === void 0 ? void 0 : new Set(algorithms);
}
__name(validateAlgorithms, "validateAlgorithms");
function validateCrit(Err, recognizedDefault, recognizedOption, protectedHeader, joseHeader) {
  if (joseHeader.crit !== void 0 && protectedHeader?.crit === void 0)
    throw new Err('"crit" (Critical) Header Parameter MUST be integrity protected');
  if (!protectedHeader || protectedHeader.crit === void 0)
    return [];
  if (!Array.isArray(protectedHeader.crit) || protectedHeader.crit.length === 0 || protectedHeader.crit.some((input) => typeof input != "string" || input.length === 0))
    throw new Err('"crit" (Critical) Header Parameter MUST be an array of non-empty strings when present');
  const recognized = recognizedOption === void 0 ? recognizedDefault : { __proto__: null, ...recognizedOption, ...recognizedDefault };
  for (const parameter of protectedHeader.crit) {
    if (!(parameter in recognized))
      throw new JOSENotSupported(`Extension Header Parameter "${parameter}" is not recognized`);
    if (!Object.hasOwn(joseHeader, parameter) || joseHeader[parameter] === void 0)
      throw new Err(`Extension Header Parameter "${parameter}" is missing`);
    if (recognized[parameter] && (!Object.hasOwn(protectedHeader, parameter) || protectedHeader[parameter] === void 0))
      throw new Err(`Extension Header Parameter "${parameter}" MUST be integrity protected`);
  }
  return protectedHeader.crit;
}
__name(validateCrit, "validateCrit");
function validateB64(protectedHeader, extensions) {
  if (extensions.includes("b64")) {
    const b64 = protectedHeader.b64;
    if (typeof b64 != "boolean")
      throw new JWSInvalid('The "b64" (base64url-encode payload) Header Parameter must be a boolean');
    return b64;
  }
  return true;
}
__name(validateB64, "validateB64");

// ../node_modules/jose/dist/webapi/lib/key.js
var tag = /* @__PURE__ */ __name((key4) => key4[Symbol.toStringTag], "tag");
var jwkMatchesOp = /* @__PURE__ */ __name((entry, key4, usage2) => {
  const { alg } = entry;
  if (key4.use !== void 0) {
    const expected = usage2 === "sign" || usage2 === "verify" ? "sig" : "enc";
    if (key4.use !== expected)
      throw new TypeError(`Invalid key for this operation, its "use" must be "${expected}" when present`);
  }
  if (key4.alg !== void 0 && key4.alg !== alg)
    throw new TypeError(`Invalid key for this operation, its "alg" must be "${alg}" when present`);
  if (Array.isArray(key4.key_ops)) {
    const expectedKeyOp = usage2 === "encrypt" || usage2 === "decrypt" ? entry.ops?.[usage2 === "encrypt" ? 0 : 1] : usage2;
    if (expectedKeyOp && !key4.key_ops.includes(expectedKeyOp))
      throw new TypeError(`Invalid key for this operation, its "key_ops" must include "${expectedKeyOp}" when present`);
  }
}, "jwkMatchesOp");
async function prepareKey(entry, key4, usage2) {
  const { alg, secret } = entry, requiresPrivateKey = usage2 === "decrypt" || usage2 === "sign";
  if (secret && key4 instanceof Uint8Array)
    return key4;
  let normalized, keyObject;
  if (isObject(key4)) {
    if (normalized = normalizeJwk(key4), typeof normalized.kty != "string")
      throw invalidKeyType(alg, key4, secret);
    if (!(secret ? normalized.kty === "oct" && typeof normalized.k == "string" : normalized.kty !== "oct" && (requiresPrivateKey ? normalized.kty === "AKP" && typeof normalized.priv == "string" || typeof normalized.d == "string" : normalized.d === void 0 && normalized.priv === void 0)))
      throw new TypeError(secret ? 'JSON Web Key for symmetric algorithms must have JWK "kty" (Key Type) equal to "oct" and the JWK "k" (Key Value) present' : `JSON Web Key for this operation must be a ${requiresPrivateKey ? "private" : "public"} JWK`);
    if (jwkMatchesOp(entry, normalized, usage2), normalized.kty === "oct")
      return decode(normalized.k);
    if (!Object.isFrozen(key4)) {
      const { key_ops } = key4;
      Array.isArray(key_ops) && Object.freeze(key_ops), Object.freeze(key4);
    }
  } else {
    if (!isKeyLike(key4))
      throw invalidKeyType(alg, key4, secret);
    const expectedType = secret ? "secret" : requiresPrivateKey ? "private" : "public";
    if (key4.type !== expectedType && (secret || ["secret", "public", "private"].includes(key4.type)))
      throw new TypeError(`${tag(key4)} instances must be of type "${expectedType}" for the ${alg} algorithm`);
    if (isCryptoKey(key4))
      return key4;
    if (keyObject = key4, keyObject.type === "secret")
      return keyObject.export();
  }
  cache ||= /* @__PURE__ */ new WeakMap();
  const cacheKey = key4;
  let cached = cache.get(cacheKey);
  if (cached?.[alg])
    return cached[alg];
  if (cached || cache.set(cacheKey, cached = {}), keyObject && typeof keyObject.toCryptoKey == "function") {
    const isPublic = keyObject.type === "public", crv = nist[keyObject.asymmetricKeyDetails?.namedCurve], params = entry.resolve?.({ crv, asymmetricKeyType: keyObject.asymmetricKeyType }) ?? entry.subtle;
    return cached[alg] = keyObject.toCryptoKey(params, isPublic, entry.usages[isPublic ? 0 : 1]);
  }
  return normalized ??= keyObject.export({ format: "jwk" }), normalized.alg = alg, cached[alg] = await jwkToKey(entry, normalized);
}
__name(prepareKey, "prepareKey");
var cache;
var nist = {
  __proto__: null,
  prime256v1: "P-256",
  secp384r1: "P-384",
  secp521r1: "P-521"
};
var isCryptoKey = /* @__PURE__ */ __name((key4) => {
  if (key4?.[Symbol.toStringTag] === "CryptoKey")
    return true;
  try {
    return key4 instanceof CryptoKey;
  } catch {
    return false;
  }
}, "isCryptoKey");
var isKeyObject = /* @__PURE__ */ __name((key4) => key4?.[Symbol.toStringTag] === "KeyObject", "isKeyObject");
var isKeyLike = /* @__PURE__ */ __name((key4) => isCryptoKey(key4) || isKeyObject(key4), "isKeyLike");
function message(msg, actual, ...types) {
  if (types.length > 2) {
    const last = types.pop();
    msg += `one of type ${types.join(", ")}, or ${last}.`;
  } else types.length === 2 ? msg += `one of type ${types[0]} or ${types[1]}.` : msg += `of type ${types[0]}.`;
  return actual == null ? msg += ` Received ${actual}` : typeof actual == "function" && actual.name ? msg += ` Received function ${actual.name}` : typeof actual == "object" && actual != null && actual.constructor?.name && (msg += ` Received an instance of ${actual.constructor.name}`), msg;
}
__name(message, "message");
function invalidKeyType(alg, actual, secret) {
  const types = ["CryptoKey", "KeyObject", "JSON Web Key"];
  return secret && types.push("Uint8Array"), new TypeError(message(`Key for the ${alg} algorithm must be `, actual, ...types));
}
__name(invalidKeyType, "invalidKeyType");
var unusable = /* @__PURE__ */ __name((name, prop = "algorithm.name") => new TypeError(`CryptoKey does not support this operation, its ${prop} must be ${name}`), "unusable");
function checkUsage(key4, usage2) {
  if (usage2 && !key4.usages.includes(usage2))
    throw new TypeError(`CryptoKey does not support this operation, its usages must include ${usage2}.`);
}
__name(checkUsage, "checkUsage");
function checkModulusLength(alg, key4) {
  const { modulusLength } = key4.algorithm;
  if (typeof modulusLength != "number" || modulusLength < 2048)
    throw new TypeError(`${alg} requires key modulusLength to be 2048 bits or larger`);
}
__name(checkModulusLength, "checkModulusLength");
function checkCryptoKey(key4, expected, usage2) {
  const algorithm = key4.algorithm;
  if (algorithm.name !== expected.name)
    throw unusable(expected.name);
  if (expected.hash && algorithm.hash?.name !== expected.hash)
    throw unusable(expected.hash, "algorithm.hash");
  if (expected.namedCurve && algorithm.namedCurve !== expected.namedCurve)
    throw unusable(expected.namedCurve, "algorithm.namedCurve");
  if (expected.length !== void 0 && algorithm.length !== expected.length)
    throw unusable(expected.length, "algorithm.length");
  checkUsage(key4, usage2);
}
__name(checkCryptoKey, "checkCryptoKey");
function snapshotJwk(jwk) {
  return { __proto__: null, ...jwk };
}
__name(snapshotJwk, "snapshotJwk");
function normalizeJwk(jwk) {
  const normalized = snapshotJwk(jwk);
  if (normalized.ext !== void 0 && typeof normalized.ext != "boolean")
    throw new TypeError('"ext" (Extractable) Parameter must be a boolean');
  if (normalized.key_ops !== void 0) {
    const value = normalized.key_ops, keyOps = Array.isArray(value) ? [...value] : void 0;
    if (!keyOps || keyOps.some((operation) => typeof operation != "string") || new Set(keyOps).size !== keyOps.length)
      throw new TypeError('"key_ops" (Key Operations) Parameter must be an array of unique strings');
    normalized.key_ops = keyOps;
  }
  return normalized;
}
__name(normalizeJwk, "normalizeJwk");
async function jwkToKey(entry, jwk, extractable) {
  if (!entry.kty.includes(jwk.kty))
    throw new JOSENotSupported('Invalid or unsupported JWK "alg" (Algorithm) Parameter value');
  const algorithm = entry.resolve?.({ kty: jwk.kty, crv: jwk.crv }) ?? entry.subtle, isPrivate = !!(jwk.d || jwk.priv), keyData = { ...jwk, ext: extractable ?? jwk.ext };
  return keyData.kty !== "AKP" && delete keyData.alg, delete keyData.use, crypto.subtle.importKey("jwk", keyData, algorithm, keyData.ext ?? !isPrivate, jwk.key_ops ?? entry.usages[isPrivate ? 1 : 0]);
}
__name(jwkToKey, "jwkToKey");
async function rawKey(key4, expected, usage2, extractable = false) {
  return key4 instanceof Uint8Array && (key4 = await crypto.subtle.importKey("raw", key4, expected, extractable, [usage2])), checkCryptoKey(key4, expected, usage2), key4;
}
__name(rawKey, "rawKey");

// ../node_modules/jose/dist/webapi/lib/key_descriptor.js
function table(entries) {
  const out = { __proto__: null };
  for (const alg in entries)
    out[alg] = { ...entries[alg], alg };
  return out;
}
__name(table, "table");

// ../node_modules/jose/dist/webapi/lib/jws_algorithms.js
var sig = [["verify"], ["sign"]];
function hmac(bits) {
  const subtle = { name: "HMAC", hash: `SHA-${bits}` };
  return { kty: ["oct"], secret: true, subtle, signing: subtle, usages: sig };
}
__name(hmac, "hmac");
function rsa(bits, saltLength) {
  const subtle = { name: saltLength ? "RSA-PSS" : "RSASSA-PKCS1-v1_5", hash: `SHA-${bits}` };
  return {
    kty: ["RSA"],
    subtle,
    signing: saltLength ? { ...subtle, saltLength } : subtle,
    usages: sig,
    minRsaBits: 2048
  };
}
__name(rsa, "rsa");
function ecdsa(crv, bits) {
  return {
    kty: ["EC"],
    crv,
    subtle: { name: "ECDSA", namedCurve: crv },
    signing: { name: "ECDSA", hash: `SHA-${bits}` },
    usages: sig
  };
}
__name(ecdsa, "ecdsa");
function eddsa() {
  const subtle = { name: "Ed25519" };
  return {
    kty: ["OKP"],
    crv: "Ed25519",
    subtle,
    signing: subtle,
    usages: sig
  };
}
__name(eddsa, "eddsa");
function mldsa(parameterSet) {
  const subtle = { name: `ML-DSA-${parameterSet}` };
  return {
    kty: ["AKP"],
    subtle,
    signing: subtle,
    usages: sig
  };
}
__name(mldsa, "mldsa");
var JWS = table({
  HS256: hmac(256),
  HS384: hmac(384),
  HS512: hmac(512),
  RS256: rsa(256),
  RS384: rsa(384),
  RS512: rsa(512),
  PS256: rsa(256, 32),
  PS384: rsa(384, 48),
  PS512: rsa(512, 64),
  ES256: ecdsa("P-256", 256),
  ES384: ecdsa("P-384", 384),
  ES512: ecdsa("P-521", 512),
  EdDSA: eddsa(),
  Ed25519: eddsa(),
  "ML-DSA-44": mldsa(44),
  "ML-DSA-65": mldsa(65),
  "ML-DSA-87": mldsa(87)
});
function jwsAlgorithm(alg) {
  const entry = typeof alg == "string" ? JWS[alg] : void 0;
  if (!entry)
    throw new JOSENotSupported(`alg ${alg} is not supported either by JOSE or your javascript runtime`);
  return entry;
}
__name(jwsAlgorithm, "jwsAlgorithm");

// ../node_modules/jose/dist/webapi/lib/jws_verify.js
function prepareVerify(options) {
  return [options && validateAlgorithms("algorithms", options.algorithms), options?.crit];
}
__name(prepareVerify, "prepareVerify");
function parseProtectedHeader(encodedProtectedHeader) {
  return encodedProtectedHeader === void 0 ? {} : parseJoseHeader(encodedProtectedHeader, JWSInvalid, "JWS Protected Header is invalid");
}
__name(parseProtectedHeader, "parseProtectedHeader");
function encodeCompactUnencodedPayload(payload) {
  try {
    return encode(payload);
  } catch (cause) {
    throw new JWSInvalid("JWS Compact Serialization payload must use only ASCII characters", {
      cause
    });
  }
}
__name(encodeCompactUnencodedPayload, "encodeCompactUnencodedPayload");
async function verifySignature(jws, shared, key4, encodeUnencodedPayload, parsedProtected) {
  const { protected: encodedProtectedHeader, header, payload: inputPayload } = jws, protectedHeader = parsedProtected ?? parseProtectedHeader(encodedProtectedHeader);
  if (!isDisjoint(protectedHeader, header))
    throw new JWSInvalid("JWS Protected and JWS Unprotected Header Parameter names must be disjoint");
  const joseHeader = { ...protectedHeader, ...header }, b64 = validateB64(protectedHeader, validateCrit(JWSInvalid, JWS_RECOGNIZED, shared[1], protectedHeader, joseHeader)), { alg } = joseHeader;
  if (typeof alg != "string" || !alg)
    throw new JWSInvalid('JWS "alg" (Algorithm) Header Parameter missing or invalid');
  if (shared[0] && !shared[0].has(alg))
    throw new JOSEAlgNotAllowed('"alg" (Algorithm) Header Parameter value not allowed');
  if (b64) {
    if (typeof inputPayload != "string")
      throw new JWSInvalid("JWS Payload must be a string");
  } else if (typeof inputPayload != "string" && !(inputPayload instanceof Uint8Array))
    throw new JWSInvalid("JWS Payload must be a string or an Uint8Array instance");
  const signingPayload = b64 || typeof inputPayload != "string" ? inputPayload : encodeUnencodedPayload(inputPayload);
  let resolvedKey = false;
  typeof key4 == "function" && (key4 = await key4(protectedHeader, jws), resolvedKey = true);
  const entry = jwsAlgorithm(alg), signingInput = concat(encodedProtectedHeader !== void 0 ? encode(encodedProtectedHeader) : new Uint8Array(), encode("."), typeof signingPayload == "string" ? shared[2] ??= encodeAsciiMember(signingPayload, "payload", JWSInvalid) : signingPayload), signature = decodeBase64url(jws.signature, "signature", JWSInvalid), verificationKey2 = await prepareKey(entry, key4, "verify"), cryptoKey = await rawKey(verificationKey2, entry.subtle, "verify");
  entry.minRsaBits && checkModulusLength(entry.alg, cryptoKey);
  let verified = false;
  try {
    verified = await crypto.subtle.verify(entry.signing, cryptoKey, signature, signingInput);
  } catch (cause) {
    throw new JWSSignatureVerificationFailed(void 0, { cause });
  }
  if (!verified)
    throw new JWSSignatureVerificationFailed();
  const result = { payload: typeof signingPayload == "string" ? decodeBase64url(signingPayload, "payload", JWSInvalid) : signingPayload };
  return encodedProtectedHeader !== void 0 && (result.protectedHeader = protectedHeader), header !== void 0 && (result.unprotectedHeader = header), resolvedKey ? [{ ...result, key: verificationKey2 }, b64] : [result, b64];
}
__name(verifySignature, "verifySignature");
async function verifyCompact(jws, shared, key4) {
  if (jws instanceof Uint8Array && (jws = decoder.decode(jws)), typeof jws != "string")
    throw new JWSInvalid("Compact JWS must be a string or Uint8Array");
  const { 0: protectedHeader, 1: payload, 2: signature, length } = jws.split(".");
  if (length !== 3)
    throw new JWSInvalid("Invalid Compact JWS");
  return verifySignature({ payload, protected: protectedHeader, signature }, shared, key4, encodeCompactUnencodedPayload);
}
__name(verifyCompact, "verifyCompact");

// ../node_modules/jose/dist/webapi/lib/jwt_claims_set.js
var epoch = /* @__PURE__ */ __name((date) => Math.floor(date.getTime() / 1e3), "epoch");
var multipliers = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
  y: 31557600
};
var REGEX = /^(\+|\-)? ?(\d+|\d+\.\d+) ?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)(?: (ago|from now))?$/i;
var checkFailed = "check_failed";
function invalidDuration() {
  throw new TypeError("Invalid time period format");
}
__name(invalidDuration, "invalidDuration");
function secs(str) {
  typeof str != "string" && invalidDuration();
  const matched = REGEX.exec(str);
  (!matched || matched[4] && matched[1]) && invalidDuration();
  const value = parseFloat(matched[2]), durationSeconds = Math.round(value * multipliers[matched[3][0].toLowerCase()]);
  return Number.isFinite(durationSeconds) || invalidDuration(), matched[1] === "-" || matched[4] === "ago" ? -durationSeconds : durationSeconds;
}
__name(secs, "secs");
function validateInput(label3, input) {
  if (!Number.isFinite(input))
    throw new TypeError(`Invalid ${label3} input`);
  return input;
}
__name(validateInput, "validateInput");
var normalizeTyp = /* @__PURE__ */ __name((value) => {
  const normalized = value.toLowerCase();
  return value.includes("/") ? normalized : `application/${normalized}`;
}, "normalizeTyp");
var checkAudiencePresence = /* @__PURE__ */ __name((audPayload, audOption) => typeof audPayload == "string" ? audOption.includes(audPayload) : Array.isArray(audPayload) ? audOption.some((aud) => audPayload.includes(aud)) : false, "checkAudiencePresence");
function validateNumericDate(claimsSet, claim, required = false) {
  const value = claimsSet[claim];
  if (!(value === void 0 && !required)) {
    if (typeof value != "number")
      throw new JWTClaimValidationFailed(`"${claim}" claim must be a number`, claimsSet, claim, "invalid");
    return value;
  }
}
__name(validateNumericDate, "validateNumericDate");
function unexpectedClaim(claimsSet, claim) {
  throw new JWTClaimValidationFailed(`unexpected "${claim}" claim value`, claimsSet, claim, checkFailed);
}
__name(unexpectedClaim, "unexpectedClaim");
function validateClaimsSet(protectedHeader, claimsSetBytes, options = {}) {
  let claimsSet;
  try {
    claimsSet = JSON.parse(strictDecoder.decode(claimsSetBytes));
  } catch (cause) {
    throw new JWTInvalid("JWT Claims Set must be a top-level JSON object", { cause });
  }
  if (!isObject(claimsSet))
    throw new JWTInvalid("JWT Claims Set must be a top-level JSON object");
  const { typ } = options;
  if (typ !== void 0 && (typeof protectedHeader.typ != "string" || normalizeTyp(protectedHeader.typ) !== normalizeTyp(typ)))
    throw new JWTClaimValidationFailed('unexpected "typ" JWT header value', claimsSet, "typ", checkFailed);
  const { requiredClaims = [], issuer, subject, audience, maxTokenAge } = options, presenceCheck = [...requiredClaims];
  maxTokenAge !== void 0 && presenceCheck.push("iat"), audience !== void 0 && presenceCheck.push("aud"), subject !== void 0 && presenceCheck.push("sub"), issuer !== void 0 && presenceCheck.push("iss");
  for (const claim of new Set(presenceCheck.reverse()))
    if (!Object.hasOwn(claimsSet, claim))
      throw new JWTClaimValidationFailed(`missing required "${claim}" claim`, claimsSet, claim, "missing");
  issuer !== void 0 && !(Array.isArray(issuer) ? issuer : [issuer]).includes(claimsSet.iss) && unexpectedClaim(claimsSet, "iss"), subject !== void 0 && claimsSet.sub !== subject && unexpectedClaim(claimsSet, "sub"), audience !== void 0 && !checkAudiencePresence(claimsSet.aud, typeof audience == "string" ? [audience] : audience) && unexpectedClaim(claimsSet, "aud");
  const { clockTolerance } = options;
  let tolerance = 0;
  if (typeof clockTolerance == "string")
    tolerance = secs(clockTolerance);
  else if (clockTolerance !== void 0) {
    if (typeof clockTolerance != "number")
      throw new TypeError("Invalid clockTolerance option type");
    tolerance = clockTolerance;
  }
  validateInput("clockTolerance option", tolerance);
  const { currentDate } = options, now4 = validateInput("currentDate option", epoch(currentDate === void 0 ? /* @__PURE__ */ new Date() : currentDate)), iat = validateNumericDate(claimsSet, "iat", maxTokenAge !== void 0), nbf = validateNumericDate(claimsSet, "nbf");
  if (nbf !== void 0 && nbf > now4 + tolerance)
    throw new JWTClaimValidationFailed('"nbf" claim timestamp check failed', claimsSet, "nbf", checkFailed);
  const exp = validateNumericDate(claimsSet, "exp");
  if (exp !== void 0 && exp <= now4 - tolerance)
    throw new JWTExpired('"exp" claim timestamp check failed', claimsSet, "exp", checkFailed);
  if (maxTokenAge !== void 0) {
    const age = now4 - iat, max = validateInput("maxTokenAge option", typeof maxTokenAge == "number" ? maxTokenAge : secs(maxTokenAge));
    if (age - tolerance > max)
      throw new JWTExpired('"iat" claim timestamp check failed (too far in the past)', claimsSet, "iat", checkFailed);
    if (age < -tolerance)
      throw new JWTClaimValidationFailed('"iat" claim timestamp check failed (it should be in the past)', claimsSet, "iat", checkFailed);
  }
  return claimsSet;
}
__name(validateClaimsSet, "validateClaimsSet");

// ../node_modules/jose/dist/webapi/jwt/verify.js
async function jwtVerify(jwt, key4, options) {
  const [verified, b64] = await verifyCompact(jwt, prepareVerify(options), key4);
  if (!b64)
    throw new JWTInvalid("JWTs MUST NOT use unencoded payload");
  const payload = validateClaimsSet(verified.protectedHeader, verified.payload, options);
  return { ...verified, payload };
}
__name(jwtVerify, "jwtVerify");

// ../node_modules/jose/dist/webapi/jwks/local.js
function isUsableJWK(jwk, entry, alg, kid) {
  const { kty, key_ops: keyOps, ext, kid: jwkKid, alg: jwkAlg, use, crv } = jwk;
  return (ext === void 0 || typeof ext == "boolean") && (keyOps === void 0 || Array.isArray(keyOps) && keyOps.every((operation, index) => typeof operation == "string" && keyOps.indexOf(operation) === index) && keyOps.includes("verify")) && entry.kty.includes(kty) && (kid === void 0 || typeof kid == "string" && kid === jwkKid) && (jwkAlg === void 0 ? kty !== "AKP" : alg === jwkAlg) && (use === void 0 || use === "sig") && (!entry.crv || crv === entry.crv);
}
__name(isUsableJWK, "isUsableJWK");
async function importWithAlgCache(cache2, jwk, entry) {
  const cached = cache2.get(jwk) || cache2.set(jwk, {}).get(jwk), { alg } = entry;
  if (cached[alg] === void 0) {
    const pending = jwkToKey(entry, jwk, true).then((key4) => {
      if (key4.type !== "public")
        throw new JWKSInvalid("JSON Web Key Set members must be public keys");
      return cached[alg] = key4, key4;
    }).catch((error) => {
      throw cached[alg] === pending && delete cached[alg], error;
    });
    cached[alg] = pending;
  }
  return cached[alg];
}
__name(importWithAlgCache, "importWithAlgCache");
function createLocalJWKSet(jwks) {
  let snapshot2;
  try {
    snapshot2 = structuredClone(jwks);
  } catch (cause) {
    throw new JWKSInvalid("JSON Web Key Set malformed", { cause });
  }
  if (!isJwkSet(snapshot2))
    throw new JWKSInvalid("JSON Web Key Set malformed");
  const metadata = snapshot2.keys.map((jwk) => {
    const normalized = snapshotJwk(jwk);
    return Array.isArray(normalized.key_ops) && (normalized.key_ops = [...normalized.key_ops]), normalized;
  }), cached = /* @__PURE__ */ new WeakMap();
  return Object.defineProperty(async (protectedHeader, token) => {
    const { alg, kid } = { ...protectedHeader, ...token?.header }, entry = typeof alg == "string" ? JWS[alg] : void 0;
    if (!entry || entry.secret)
      throw new JOSENotSupported('Unsupported "alg" value for a JSON Web Key Set');
    const candidates = snapshot2.keys.filter((_, index) => isUsableJWK(metadata[index], entry, alg, kid)), { 0: jwk, length } = candidates;
    if (!length)
      throw new JWKSNoMatchingKey();
    if (length !== 1) {
      const error = new JWKSMultipleMatchingKeys();
      throw error[Symbol.asyncIterator] = async function* () {
        for (const jwk2 of candidates)
          try {
            yield await importWithAlgCache(cached, jwk2, entry);
          } catch {
          }
      }, error;
    }
    return importWithAlgCache(cached, jwk, entry);
  }, "jwks", {
    value: /* @__PURE__ */ __name(() => structuredClone(snapshot2), "value")
  });
}
__name(createLocalJWKSet, "createLocalJWKSet");

// ../node_modules/jose/dist/webapi/jwks/remote.js
function isCloudflareWorkers() {
  return typeof WebSocketPair < "u" || typeof navigator < "u" && true || typeof EdgeRuntime < "u" && EdgeRuntime === "vercel";
}
__name(isCloudflareWorkers, "isCloudflareWorkers");
var USER_AGENT;
(typeof navigator > "u" || !"Cloudflare-Workers"?.startsWith?.("Mozilla/5.0 ")) && (USER_AGENT = "jose/v6.2.13");
var customFetch = /* @__PURE__ */ Symbol();
async function fetchJwks(url, headers, signal, fetchImpl = fetch) {
  const response2 = await fetchImpl(url, {
    method: "GET",
    signal,
    redirect: "manual",
    headers
  }).catch((err) => {
    throw err.name === "TimeoutError" ? new JWKSTimeout(void 0, { cause: err }) : err;
  });
  if (response2.status !== 200)
    throw new JOSEError("Expected 200 OK from the JSON Web Key Set HTTP response");
  try {
    return await response2.json();
  } catch (cause) {
    throw new JOSEError("Failed to parse the JSON Web Key Set HTTP response as JSON", { cause });
  }
}
__name(fetchJwks, "fetchJwks");
var jwksCache = /* @__PURE__ */ Symbol();
function isFreshFor(timestamp2, duration2) {
  return Number.isFinite(timestamp2) && Date.now() < timestamp2 + duration2;
}
__name(isFreshFor, "isFreshFor");
function validateDuration(value, fallback, option) {
  if (Number.isNaN(value))
    throw new TypeError(`"${option}" option must not be NaN`);
  return typeof value == "number" ? value : fallback;
}
__name(validateDuration, "validateDuration");
function createRemoteJWKSet(url, options) {
  if (!(url instanceof URL))
    throw new TypeError("url must be an instance of URL");
  const href = new URL(url.href).href, opts = options ?? {}, timeoutOption = opts.timeoutDuration;
  if (typeof timeoutOption == "number" && (!Number.isInteger(timeoutOption) || timeoutOption < 0))
    throw new TypeError('"timeoutDuration" option must be a non-negative integer');
  const timeoutDuration = typeof timeoutOption == "number" ? timeoutOption : 5e3, cooldownDuration = validateDuration(opts.cooldownDuration, 3e4, "cooldownDuration"), cacheMaxAge = validateDuration(opts.cacheMaxAge, 6e5, "cacheMaxAge"), headers = new Headers(opts.headers);
  USER_AGENT && !headers.has("User-Agent") && headers.set("User-Agent", USER_AGENT), headers.has("accept") || headers.set("accept", "application/json, application/jwk-set+json");
  const fetchImpl = opts[customFetch], cache2 = opts[jwksCache];
  let jwksTimestamp, pendingFetch, reloadSequence = 0, appliedSequence = 0, local;
  if (cache2 && typeof cache2 == "object") {
    const { uat, jwks } = cache2;
    isFreshFor(uat, cacheMaxAge) && isJwkSet(jwks) && (jwksTimestamp = uat, local = createLocalJWKSet(jwks));
  }
  const reload = /* @__PURE__ */ __name(async () => {
    if (pendingFetch && isCloudflareWorkers() && (pendingFetch = void 0), !pendingFetch) {
      const sequence = ++reloadSequence, current = pendingFetch = fetchJwks(href, headers, AbortSignal.timeout(timeoutDuration), fetchImpl).then((json2) => {
        const next = createLocalJWKSet(json2);
        if (sequence <= appliedSequence)
          return;
        local = next;
        const updatedAt = Date.now();
        cache2 && (cache2.uat = updatedAt, cache2.jwks = json2), jwksTimestamp = updatedAt, appliedSequence = sequence;
      }).finally(() => {
        pendingFetch === current && (pendingFetch = void 0);
      });
    }
    await pendingFetch;
  }, "reload");
  return Object.defineProperties(async (protectedHeader, token) => {
    (!local || !isFreshFor(jwksTimestamp, cacheMaxAge)) && await reload();
    try {
      return await local(protectedHeader, token);
    } catch (err) {
      if (err instanceof JWKSNoMatchingKey && !isFreshFor(jwksTimestamp, cooldownDuration))
        return await reload(), local(protectedHeader, token);
      throw err;
    }
  }, {
    coolingDown: {
      get: /* @__PURE__ */ __name(() => isFreshFor(jwksTimestamp, cooldownDuration), "get"),
      enumerable: true
    },
    fresh: {
      get: /* @__PURE__ */ __name(() => isFreshFor(jwksTimestamp, cacheMaxAge), "get"),
      enumerable: true
    },
    reload: {
      value: reload,
      enumerable: true
    },
    reloading: {
      get: /* @__PURE__ */ __name(() => !!pendingFetch, "get"),
      enumerable: true
    },
    jwks: {
      value: /* @__PURE__ */ __name(() => local?.jwks(), "value"),
      enumerable: true
    }
  });
}
__name(createRemoteJWKSet, "createRemoteJWKSet");

// ../cloud/tickets.mjs
var text = new TextEncoder();
var parse = new TextDecoder();
var tokenPattern2 = /^[A-Za-z0-9_-]{43}$/;
var devicePattern2 = /^[a-z][a-z0-9-]{0,23}$/;
var devicePort = /* @__PURE__ */ __name((value) => Number.isInteger(value) && value >= 1024 && value <= 65535, "devicePort");
function validateDevicePorts(ports, browser) {
  const expected = browser ? ["browser", "development"] : ["development"];
  if (ports === null || typeof ports !== "object" || Array.isArray(ports) || JSON.stringify(Object.keys(ports).sort()) !== JSON.stringify(expected) || !expected.every((key4) => devicePort(ports[key4])) || new Set(expected.map((key4) => ports[key4])).size !== expected.length) {
    throw new Error("Invalid device ports");
  }
  return browser ? { development: ports.development, browser: ports.browser } : { development: ports.development };
}
__name(validateDevicePorts, "validateDevicePorts");
function validateCredentials(credentials) {
  if (typeof credentials?.deviceId !== "string" || !devicePattern2.test(credentials.deviceId) || typeof credentials.portalToken !== "string" || !tokenPattern2.test(credentials.portalToken) || typeof credentials.tunnelToken !== "string" || !/^[A-Za-z0-9+/=_-]{32,4096}$/.test(credentials.tunnelToken)) {
    throw new Error("Invalid device identity or credentials");
  }
  const { deviceId, portalToken, tunnelToken } = credentials;
  if (credentials.activationToken === void 0) return { deviceId, portalToken, tunnelToken };
  if (typeof credentials.activationToken !== "string" || !tokenPattern2.test(credentials.activationToken) || credentials.browserToken !== void 0 && (typeof credentials.browserToken !== "string" || !tokenPattern2.test(credentials.browserToken))) {
    throw new Error("Invalid device activation credential");
  }
  return {
    deviceId,
    portalToken,
    tunnelToken,
    activationToken: credentials.activationToken,
    ...credentials.browserToken && { browserToken: credentials.browserToken },
    ...credentials.ports !== void 0 && { ports: validateDevicePorts(credentials.ports, Boolean(credentials.browserToken)) }
  };
}
__name(validateCredentials, "validateCredentials");
async function key(secret) {
  if (typeof secret !== "string" || !tokenPattern2.test(secret)) throw new Error("Enrollment key is missing");
  return crypto.subtle.importKey("raw", base64url_exports.decode(secret), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
__name(key, "key");
var digestOf = /* @__PURE__ */ __name(async (ticket) => base64url_exports.encode(new Uint8Array(await crypto.subtle.digest("SHA-256", text.encode(ticket)))), "digestOf");
var time = /* @__PURE__ */ __name(() => Math.floor(Date.now() / 1e3), "time");
async function issueTicket(db, secret, input) {
  const credentials = validateCredentials(input);
  const ticket = base64url_exports.encode(crypto.getRandomValues(new Uint8Array(32)));
  const digest2 = await digestOf(ticket);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const now4 = time();
  const expiresAt = now4 + 600;
  const payload = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: text.encode(digest2) },
    await key(secret),
    text.encode(JSON.stringify(credentials))
  );
  const [, inserted] = await db.batch([
    db.prepare("DELETE FROM enrollment_tickets WHERE expires_at <= ?").bind(now4),
    db.prepare(`INSERT INTO enrollment_tickets (digest, device_id, expires_at, iv, payload)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(device_id) DO NOTHING`).bind(digest2, credentials.deviceId, expiresAt, base64url_exports.encode(iv), base64url_exports.encode(new Uint8Array(payload)))
  ]);
  return inserted.meta.changes === 1 ? { ticket, expiresAt } : void 0;
}
__name(issueTicket, "issueTicket");
async function redeemTicket(db, secret, ticket) {
  if (typeof ticket !== "string" || !tokenPattern2.test(ticket)) return;
  const decryptKey = await key(secret);
  const digest2 = await digestOf(ticket);
  const row = await db.prepare(`DELETE FROM enrollment_tickets WHERE digest = ? AND expires_at > ?
    RETURNING iv, payload`).bind(digest2, time()).first();
  if (!row) return;
  const plaintext = await crypto.subtle.decrypt({
    name: "AES-GCM",
    iv: base64url_exports.decode(row.iv),
    additionalData: text.encode(digest2)
  }, decryptKey, base64url_exports.decode(row.payload));
  return validateCredentials(JSON.parse(parse.decode(plaintext)));
}
__name(redeemTicket, "redeemTicket");
function ticketCancellation(db, deviceId) {
  if (typeof deviceId !== "string" || !devicePattern2.test(deviceId)) throw new Error("Invalid device id");
  return db.prepare("DELETE FROM enrollment_tickets WHERE device_id = ?").bind(deviceId);
}
__name(ticketCancellation, "ticketCancellation");
async function cancelTicket(db, deviceId) {
  if (typeof deviceId !== "string" || !devicePattern2.test(deviceId)) throw new Error("Invalid device id");
  const result = await db.prepare("DELETE FROM enrollment_tickets WHERE device_id = ? AND expires_at > ?").bind(deviceId, time()).run();
  return result.meta.changes === 1;
}
__name(cancelTicket, "cancelTicket");
async function protect(secret, label3, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: text.encode(label3) },
    await key(secret),
    text.encode(JSON.stringify(value))
  );
  return base64url_exports.encode(iv) + "." + base64url_exports.encode(new Uint8Array(encrypted));
}
__name(protect, "protect");
async function unprotect(secret, label3, value) {
  const [iv, cipher] = value.split(".");
  const clear = await crypto.subtle.decrypt({
    name: "AES-GCM",
    iv: base64url_exports.decode(iv),
    additionalData: text.encode(label3)
  }, await key(secret), base64url_exports.decode(cipher));
  return JSON.parse(parse.decode(clear));
}
__name(unprotect, "unprotect");

// ../cloud/device-revocation.mjs
var encoder3 = new TextEncoder();
var revocationMessage = /* @__PURE__ */ __name((origin, deviceId) => encoder3.encode(JSON.stringify(["devspace-fleet/revoke/v1", origin, deviceId])), "revocationMessage");
var key2 = /* @__PURE__ */ __name((token, usage2) => crypto.subtle.importKey(
  "raw",
  base64url_exports.decode(token),
  { name: "HMAC", hash: "SHA-256" },
  false,
  [usage2]
), "key");
async function activationDigest(token) {
  return base64url_exports.encode(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder3.encode(token))));
}
__name(activationDigest, "activationDigest");
async function revokeResponse(origin, deviceId, token) {
  const proof = await crypto.subtle.sign("HMAC", await key2(token, "sign"), revocationMessage(origin, deviceId));
  return { status: "revoked", deviceId, proof: base64url_exports.encode(new Uint8Array(proof)) };
}
__name(revokeResponse, "revokeResponse");

// ../cloud/cloudflare.mjs
var endpoint = "https://api.cloudflare.com/client/v4";
var cloudflareRequestTimeoutMs = 15e3;
var routeWords = /* @__PURE__ */ new Set([
  "accounts",
  "zones",
  "user",
  "access",
  "organizations",
  "identity_providers",
  "apps",
  "policies",
  "dns_records",
  "workers",
  "scripts",
  "d1",
  "database",
  "query",
  "mcp",
  "portals",
  "cfd_tunnel",
  "token",
  "tokens",
  "subdomain",
  "domains",
  "permission_groups",
  "versions"
]);
function safeCloudflareRoute(path) {
  if (typeof path !== "string" || !path.startsWith("/")) return "/{resource}";
  return path.split("?")[0].split("/").map((part, index) => index === 0 ? "" : routeWords.has(part) ? part : "{id}").join("/");
}
__name(safeCloudflareRoute, "safeCloudflareRoute");
var accessNotEnabled = "access_not_enabled";
function accountAccessOrganizationError(method, url, status, payload) {
  if (method !== "GET" || status !== 403 || url.search || !/^\/client\/v4\/accounts\/[a-f0-9]{32}\/access\/organizations$/.test(url.pathname) || payload?.success !== false || payload.result !== null || !Array.isArray(payload.errors) || payload.errors.length !== 1) return;
  const error = payload.errors[0];
  if (error?.code === 9999 && typeof error.message === "string" && error.message.startsWith("access.api.error.not_enabled:")) return accessNotEnabled;
}
__name(accountAccessOrganizationError, "accountAccessOrganizationError");
var CloudflareError = class extends Error {
  static {
    __name(this, "CloudflareError");
  }
  constructor(method, status, codes, { path, rayId, reason } = {}) {
    const route = path ? ` ${safeCloudflareRoute(path)}` : "";
    const ray = typeof rayId === "string" && /^[a-zA-Z0-9-]{6,80}$/.test(rayId) ? rayId : void 0;
    super(`Cloudflare ${method}${route} failed (HTTP ${status}${codes.length ? ", codes " + codes.join(", ") : ""}${ray ? ", Ray ID " + ray : ""})`);
    this.status = status;
    this.codes = codes;
    if (reason === accessNotEnabled) this.reason = accessNotEnabled;
    if (ray) this.rayId = ray;
  }
};
var CloudflareRequestTimeoutError = class extends Error {
  static {
    __name(this, "CloudflareRequestTimeoutError");
  }
  constructor(method, timeoutMs) {
    super(`Cloudflare ${method} request did not complete within ${timeoutMs / 1e3} seconds`);
    this.method = method;
    this.timeoutMs = timeoutMs;
  }
};
function cloudflareApi(token, { request = fetch, beforeRequest, requestTimeoutMs = cloudflareRequestTimeoutMs } = {}) {
  async function send(method, path, body, query) {
    const access = typeof token === "function" ? await token() : token;
    await beforeRequest?.();
    const url = new URL(endpoint + path);
    for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, String(value));
    const headers = { Authorization: `Bearer ${access}` };
    const form = body instanceof FormData;
    if (body && !form) headers["Content-Type"] = "application/json";
    const controller = new AbortController();
    const { signal } = controller;
    const exchange = /* @__PURE__ */ __name(async () => {
      const response2 = await request(url, {
        method,
        headers,
        redirect: "manual",
        signal,
        ...body && { body: form ? body : JSON.stringify(body) }
      });
      signal.throwIfAborted();
      if (method === "DELETE" && response2.status === 204) return { result: void 0 };
      const payload = await response2.json().catch(() => {
        signal.throwIfAborted();
        return void 0;
      });
      if (!response2.ok || payload?.success !== true) {
        const codes = Array.isArray(payload?.errors) ? payload.errors.map((error) => error?.code).filter(Number.isInteger) : [];
        throw new CloudflareError(method, response2.status, codes, {
          path,
          rayId: response2.headers.get("cf-ray"),
          reason: accountAccessOrganizationError(method, url, response2.status, payload)
        });
      }
      return payload;
    }, "exchange");
    let timer;
    const deadline = new Promise((_, reject2) => {
      timer = setTimeout(() => {
        const error = new CloudflareRequestTimeoutError(method, requestTimeoutMs);
        reject2(error);
        controller.abort(error);
      }, requestTimeoutMs);
    });
    try {
      return await Promise.race([exchange(), deadline]);
    } finally {
      clearTimeout(timer);
    }
  }
  __name(send, "send");
  return {
    async get(path, query) {
      return (await send("GET", path, void 0, query)).result;
    },
    async getOptional(path) {
      try {
        return (await send("GET", path)).result;
      } catch (error) {
        if (error.status !== 404) throw error;
      }
    },
    async list(path, { per_page: pageSize = 100, ...query } = {}) {
      const items = [];
      for (let page2 = 1; page2 <= 20; page2++) {
        const response2 = await send("GET", path, void 0, { ...query, page: page2, per_page: pageSize });
        if (!Array.isArray(response2.result)) throw new Error("Unexpected Cloudflare list response");
        items.push(...response2.result);
        const totalPages = response2.result_info?.total_pages;
        if (Number.isSafeInteger(totalPages) && totalPages >= 0) {
          if (page2 >= totalPages) return items;
        } else if (response2.result.length < (response2.result_info?.per_page ?? pageSize)) return items;
      }
      throw new Error("Cloudflare list exceeded the reconciliation limit");
    },
    async post(path, body) {
      return (await send("POST", path, body)).result;
    },
    async put(path, body) {
      return (await send("PUT", path, body)).result;
    },
    async patch(path, body) {
      return (await send("PATCH", path, body)).result;
    },
    async del(path) {
      return (await send("DELETE", path)).result;
    }
  };
}
__name(cloudflareApi, "cloudflareApi");
function single(items, predicate, label3) {
  const matches6 = items.filter(predicate);
  if (matches6.length > 1) throw new Error(`Duplicate ${label3}; stop and inspect Cloudflare`);
  return matches6[0];
}
__name(single, "single");
async function ensureDns(api, zoneId, name, target, owner) {
  const path = `/zones/${zoneId}/dns_records`;
  const existing = single(await api.list(path, { name }), (item) => item.name === name, "DNS record");
  if (!existing) return api.post(path, { name, type: "CNAME", content: target, proxied: true, ttl: 1, comment: owner });
  if (existing.type !== "CNAME" || existing.content.replace(/\.$/, "") !== target || !existing.proxied || existing.comment !== owner) {
    throw new Error("DNS hostname already belongs to a different configuration");
  }
  return existing;
}
__name(ensureDns, "ensureDns");
async function ensureAccessApp(api, account, app, policyId, { attachNewManagedApp = false } = {}) {
  const path = account + "/access/apps";
  const applications = await api.list(path);
  const predicate = /* @__PURE__ */ __name((row) => app.domain ? row.domain === app.domain || row.destinations?.some((dest) => dest.uri === app.domain) : row.destinations?.some((dest) => dest.mcp_server_id === app.destinations[0].mcp_server_id), "predicate");
  const existing = single(applications, (row) => row.name === app.name || predicate(row), "Access application");
  if (!existing) return api.post(path, { ...app, policies: [{ id: policyId, precedence: 1 }] });
  const policies = existing.policies ?? [];
  const appIsExact = predicate(existing) && existing.type === app.type && existing.name === app.name && policies.length === 1 && (policies[0]?.id ?? policies[0]) === policyId && (!app.oauth_configuration?.enabled || existing.oauth_configuration?.enabled === true);
  if (appIsExact) return existing;
  if (attachNewManagedApp && !policies.length && existing.id && predicate(existing) && existing.name === app.name && existing.type === app.type) {
    return api.put(path + "/" + existing.id, { ...app, policies: [{ id: policyId, precedence: 1 }] });
  }
  throw new Error("Access application drifted or already belongs to another service");
}
__name(ensureAccessApp, "ensureAccessApp");
function publicAccessApp(name, domain, type = "self_hosted") {
  return {
    name,
    domain,
    type,
    destinations: [{ type: "public", uri: domain }],
    ...type === "mcp_portal" && { oauth_configuration: { enabled: true } }
  };
}
__name(publicAccessApp, "publicAccessApp");

// ../cloud/zone-access.mjs
function matchesDestination(row, app) {
  return app.domain ? row.domain === app.domain || row.destinations?.some((item) => item.uri === app.domain) : row.destinations?.some((item) => item.mcp_server_id === app.destinations[0].mcp_server_id);
}
__name(matchesDestination, "matchesDestination");
async function ensureScopedAccessApp(api, spec, app, {
  bootstrap = false,
  managed = false,
  accountScoped = false,
  exactLoginProviders = false
} = {}) {
  const accountPath = `/accounts/${spec.accountId}/access/apps`;
  const path = accountScoped ? accountPath : `/zones/${spec.zoneId}/access/apps`;
  const matches6 = /* @__PURE__ */ __name((row) => row.name === app.name || matchesDestination(row, app), "matches");
  const exact2 = /* @__PURE__ */ __name((row) => row && row.name === app.name && row.type === app.type && matchesDestination(row, app), "exact");
  const scoped = single(await api.list(path), matches6, "Access application");
  if (!accountScoped) {
    const account = single(await api.list(accountPath), matches6, "account Access application");
    if (account && account.id !== scoped?.id) {
      throw new Error("Cloudflare Access application is outside the zone API; account Access write is required");
    }
  }
  if (scoped && !exact2(scoped)) throw new Error("Zone Access application ownership does not match");
  const rule = {
    name: bootstrap ? `${spec.label}-device-bootstrap` : `${spec.label}-owner`,
    decision: bootstrap ? "bypass" : "allow",
    include: bootstrap ? [{ everyone: {} }] : [{ email: { email: spec.ownerEmail } }],
    exclude: [],
    require: !bootstrap && exactLoginProviders ? [{ login_method: { id: app.allowed_idps[0] } }] : [],
    precedence: 1
  };
  const created = scoped ?? await api.post(path, managed ? app : { ...app, policies: [rule] }).catch((error) => {
    if (!accountScoped && app.type === "mcp" && error.status === 400 && error.codes?.includes(12130)) {
      throw new Error("Cloudflare rejected the zone-scoped MCP Access application (12130). Configure it at account scope.", { cause: error });
    }
    throw error;
  });
  if (!/^[a-f0-9-]{32,36}$/.test(created?.id ?? "")) throw new Error("Zone Access application ID unavailable");
  const appPath = `${path}/${created.id}`;
  const current = await api.get(appPath);
  if (!exact2(current) || app.oauth_configuration?.enabled && current.oauth_configuration?.enabled !== true) {
    throw new Error("Cloudflare zone Access application failed destination or OAuth verification");
  }
  if (app.allowed_idps) {
    const allowed = current.allowed_idps;
    const selected = Array.isArray(allowed) && allowed.length > 0;
    const hasCompatibleProvider = selected && allowed.some((id2) => app.allowed_idps.includes(id2));
    const usesAccountDefaults = allowed === void 0 || Array.isArray(allowed) && !allowed.length;
    const compatible = current.auto_redirect_to_identity === true ? hasCompatibleProvider && allowed.length === 1 : hasCompatibleProvider || scoped && usesAccountDefaults;
    const matchesAllowed = selected && new Set(allowed).size === app.allowed_idps.length && allowed.every((id2) => app.allowed_idps.includes(id2));
    if (!compatible || (!scoped || exactLoginProviders) && !matchesAllowed || exactLoginProviders && current.allow_authenticate_via_warp !== false) {
      const method = exactLoginProviders ? "\u5DF2\u9A8C\u8BC1\u7684 SSO \u767B\u5F55\u65B9\u5F0F" : "Cloudflare \u6216 One-time PIN";
      throw new Error(`\u5F53\u524D Access \u5E94\u7528\u672A\u63D0\u4F9B\u6240\u9700\u7684\u7BA1\u7406\u5458\u767B\u5F55\u65B9\u5F0F\u3002\u8BF7\u5728 Zero Trust \u2192 Access controls \u2192 Applications \u4E2D\u6838\u5BF9\u8BE5\u5E94\u7528\u7684${method}\uFF0C\u518D\u8FD0\u884C\u539F\u5B89\u88C5\u547D\u4EE4\u3002`);
    }
  }
  const policies = `${appPath}/policies`;
  let rules = await api.list(policies);
  if (!rules.length && (managed || !scoped)) {
    await api.post(policies, rule);
    rules = await api.list(policies);
  }
  const [existing] = rules;
  if (rules.length !== 1 || existing.name !== rule.name || existing.decision !== rule.decision || JSON.stringify(existing.include) !== JSON.stringify(rule.include) || existing.exclude?.length || JSON.stringify(existing.require ?? []) !== JSON.stringify(rule.require)) {
    throw new Error("Cloudflare zone Access application policy does not match the requested restriction");
  }
  return current;
}
__name(ensureScopedAccessApp, "ensureScopedAccessApp");

// ../cloud/enrollment-intents.mjs
var now = /* @__PURE__ */ __name(() => Math.floor(Date.now() / 1e3), "now");
var claimRecoveryWindowSeconds = 15 * 60;
var hashPattern2 = /^[a-f0-9]{64}$/;
var versionPattern2 = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,95}$/;
var uuidPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
var record2 = /* @__PURE__ */ __name((value) => value !== null && typeof value === "object" && !Array.isArray(value), "record");
var matches2 = /* @__PURE__ */ __name((pattern, value) => typeof value === "string" && pattern.test(value), "matches");
var encoder4 = new TextEncoder();
var digest = /* @__PURE__ */ __name(async (code) => base64url_exports.encode(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder4.encode(code)))), "digest");
var label = /* @__PURE__ */ __name((id2, deviceId, codeDigest, snapshot2) => JSON.stringify(["enrollment-intent-v1", id2, deviceId, codeDigest, snapshot2]), "label");
function platformParts(platform) {
  if (typeof platform !== "string") return [];
  const parts = platform.split("-");
  const [os, architecture] = parts;
  if (parts.length > 2 || !Object.hasOwn(operatingSystems, os) || architecture !== void 0 && !operatingSystems[os].architectures.includes(architecture)) return [];
  return parts;
}
__name(platformParts, "platformParts");
function snapshotRelease(platform, release) {
  const [os, fixed] = platformParts(platform);
  if (!os || !record2(release) || !matches2(versionPattern2, release.version) || release.browser !== void 0 && typeof release.browser !== "boolean") throw new Error("Invalid pinned release");
  const { version: version2 } = release;
  const browser = release.browser === true;
  const source = fixed ? { [fixed]: release } : release.assets;
  if (!record2(source) || !Object.keys(source).length) throw new Error("Missing pinned installer assets");
  const assets2 = {};
  for (const architecture of Object.keys(source).sort()) {
    const asset = source[architecture];
    if (!operatingSystems[os].architectures.includes(architecture) || !record2(asset) || !matches2(hashPattern2, asset.sha256) || asset.version !== void 0 && asset.version !== version2 || asset.browser !== void 0 && asset.browser !== browser) throw new Error("Invalid pinned installer asset");
    const { sha256: sha2563, url, localFile } = asset;
    if (url === void 0 === (localFile === void 0)) throw new Error("Invalid pinned installer location");
    if (url !== void 0) {
      const parsed = typeof url === "string" && URL.parse(url);
      if (!parsed || parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
        throw new Error("Invalid pinned installer URL");
      }
      assets2[architecture] = { sha256: sha2563, url: parsed.href };
    } else {
      if (!fixed || !matches2(/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/, localFile)) throw new Error("Invalid local installer");
      assets2[architecture] = { sha256: sha2563, localFile };
    }
  }
  return { platform, version: version2, browser, assets: assets2 };
}
__name(snapshotRelease, "snapshotRelease");
function publicIntent(row) {
  if (!row) return;
  const parsed = JSON.parse(row.snapshot);
  if (!matches2(devicePattern2, row.device_id)) throw new Error("Invalid stored enrollment intent");
  const base = { id: row.id, deviceId: row.device_id, state: row.state, createdAt: row.created_at, resolvedAt: row.resolved_at ?? null };
  if (record2(parsed?.platforms)) {
    const releases = snapshotChoices(parsed.platforms);
    if (JSON.stringify({ platforms: releases }) !== row.snapshot) throw new Error("Invalid stored enrollment intent");
    return { ...base, releases };
  }
  const [, fixed] = platformParts(parsed.platform);
  const release = snapshotRelease(parsed.platform, fixed ? { ...parsed.assets?.[fixed], version: parsed.version, browser: parsed.browser } : parsed);
  if (JSON.stringify(release) !== row.snapshot) throw new Error("Invalid stored enrollment intent");
  return { ...base, release, releases: { [platformParts(release.platform)[0]]: release } };
}
__name(publicIntent, "publicIntent");
function snapshotChoices(groups) {
  const systems = Object.keys(groups).sort();
  if (!systems.length || systems.some((os) => !Object.hasOwn(operatingSystems, os))) throw new Error("Invalid pinned release");
  return Object.fromEntries(systems.map((os) => {
    const release = snapshotRelease(os, groups[os]);
    if (Object.values(release.assets).some((asset) => asset.url === void 0)) throw new Error("A multi-system command requires hosted installers");
    return [os, release];
  }));
}
__name(snapshotChoices, "snapshotChoices");
async function issueEnrollmentIntent(db, secret, { deviceId, platform, release, releases, confirmBrowser = false }) {
  if (!matches2(devicePattern2, deviceId)) throw new Error("Invalid device ID");
  let snapshot2;
  if (releases !== void 0) {
    if (platform !== void 0 || release !== void 0) throw new Error("Choose one pinned release form");
    const choices = snapshotChoices(releases);
    if (confirmBrowser !== Object.values(choices).some((choice) => choice.browser)) throw new Error("Browser confirmation does not match pinned release");
    snapshot2 = JSON.stringify({ platforms: choices });
  } else {
    const pinned = snapshotRelease(platform, release);
    if (confirmBrowser !== pinned.browser) throw new Error("Browser confirmation does not match pinned release");
    snapshot2 = JSON.stringify(pinned);
  }
  const id2 = crypto.randomUUID();
  const code = base64url_exports.encode(crypto.getRandomValues(new Uint8Array(32)));
  const codeDigest = await digest(code);
  const encrypted = await protect(secret, label(id2, deviceId, codeDigest, snapshot2), code);
  const row = await db.prepare(`INSERT INTO enrollment_intents
    (id, device_id, code_digest, code_ciphertext, snapshot, state, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?) ON CONFLICT DO NOTHING
    RETURNING id, device_id, snapshot, state, created_at, resolved_at`).bind(id2, deviceId, codeDigest, encrypted, snapshot2, now()).first();
  return publicIntent(row);
}
__name(issueEnrollmentIntent, "issueEnrollmentIntent");
async function getEnrollmentIntent(db, id2) {
  if (!matches2(uuidPattern, id2)) return;
  return publicIntent(await db.prepare(`SELECT id, device_id, snapshot, state, created_at, resolved_at
    FROM enrollment_intents WHERE id = ?`).bind(id2).first());
}
__name(getEnrollmentIntent, "getEnrollmentIntent");
async function findEnrollmentIntentByCode(db, code) {
  if (!matches2(tokenPattern2, code)) return;
  const at = now();
  return publicIntent(await db.prepare(`SELECT id, device_id, snapshot, state, created_at, resolved_at
    FROM enrollment_intents WHERE code_digest = ? AND (state = 'pending' OR (state = 'claimed' AND resolved_at > ?))`).bind(await digest(code), at - claimRecoveryWindowSeconds).first());
}
__name(findEnrollmentIntentByCode, "findEnrollmentIntentByCode");
async function readBoundEnrollmentState(db, deviceId, id2) {
  if (!matches2(uuidPattern, id2) || !matches2(devicePattern2, deviceId)) return;
  const row = await db.prepare("SELECT state FROM enrollment_intents WHERE id = ? AND device_id = ?").bind(id2, deviceId).first();
  return row?.state;
}
__name(readBoundEnrollmentState, "readBoundEnrollmentState");
async function revealEnrollmentIntent(db, secret, id2) {
  if (!matches2(uuidPattern, id2)) return;
  const row = await db.prepare(`SELECT * FROM enrollment_intents
    WHERE id = ? AND state = 'pending'`).bind(id2).first();
  if (!row) return;
  const intent = publicIntent(row);
  const code = await unprotect(secret, label(row.id, row.device_id, row.code_digest, row.snapshot), row.code_ciphertext);
  if (!matches2(tokenPattern2, code) || await digest(code) !== row.code_digest) throw new Error("Invalid stored enrollment code");
  return { ...intent, code };
}
__name(revealEnrollmentIntent, "revealEnrollmentIntent");
async function claimEnrollmentIntent(db, { code, recoveryProof, deviceId, platform, architecture, version: version2, sha256: sha2563, browser } = {}) {
  const [, fixed] = platformParts(platform);
  if (!matches2(tokenPattern2, code) || !matches2(tokenPattern2, recoveryProof) || recoveryProof === code || !matches2(devicePattern2, deviceId) || typeof architecture !== "string" || fixed && fixed !== architecture || !matches2(versionPattern2, version2) || !matches2(hashPattern2, sha2563) || typeof browser !== "boolean") return;
  const [codeDigest, recoveryDigest] = await Promise.all([digest(code), digest("enrollment-claim-recovery-v1:" + recoveryProof)]);
  const row = await db.prepare(`SELECT id, device_id, snapshot, state, created_at, resolved_at FROM enrollment_intents
    WHERE code_digest = ? AND device_id = ? AND state IN ('pending', 'claimed')`).bind(codeDigest, deviceId).first();
  if (!row) return;
  const [os] = platformParts(platform);
  const release = publicIntent(row).releases[os];
  if (!release || release.platform !== platform || release.version !== version2 || release.browser !== browser || !Object.hasOwn(release.assets, architecture) || release.assets[architecture].sha256 !== sha2563) return;
  const claimedSnapshot = JSON.stringify(release);
  if (row.state === "pending") {
    const claimed = await db.prepare(`UPDATE enrollment_intents
      SET state = 'claimed', code_ciphertext = NULL, resolved_at = ?, recovery_digest = ?, claimed_architecture = ?, snapshot = ?
      WHERE id = ? AND device_id = ? AND code_digest = ? AND snapshot = ? AND state = 'pending'
      RETURNING id, device_id, snapshot, state, created_at, resolved_at`).bind(now(), recoveryDigest, architecture, claimedSnapshot, row.id, deviceId, codeDigest, row.snapshot).first();
    if (claimed) return { ...publicIntent(claimed), architecture, resumed: false };
  }
  const at = now();
  const receipt = await db.prepare(`SELECT id, device_id, snapshot, state, created_at, resolved_at
    FROM enrollment_intents WHERE id = ? AND device_id = ? AND code_digest = ? AND snapshot = ?
    AND state = 'claimed' AND recovery_digest = ? AND claimed_architecture = ?
    AND resolved_at > ? AND resolved_at <= ?`).bind(row.id, deviceId, codeDigest, claimedSnapshot, recoveryDigest, architecture, at - claimRecoveryWindowSeconds, at).first();
  if (receipt) return { ...publicIntent(receipt), architecture, resumed: true };
}
__name(claimEnrollmentIntent, "claimEnrollmentIntent");
async function revokeEnrollmentIntent(db, id2) {
  if (!matches2(uuidPattern, id2)) return;
  const row = await db.prepare(`UPDATE enrollment_intents
    SET state = 'revoked', code_ciphertext = NULL, resolved_at = ? WHERE id = ? AND state = 'pending'
    RETURNING id, device_id, snapshot, state, created_at, resolved_at`).bind(now(), id2).first();
  return publicIntent(row);
}
__name(revokeEnrollmentIntent, "revokeEnrollmentIntent");

// ../cloud/oauth-grant.mjs
var runtimeOAuthScopes = ["mcp-portals.write", "zone-access.write", "teams-connector-cloudflared.write", "dns.write"];
var managementOAuthScopes = [
  "mcp-portals.write",
  "access.write",
  "teams-connector-cloudflared.write",
  "dns.write",
  "workers-scripts.write",
  "d1.write",
  "zone.read",
  "access-acct.read",
  "offline_access"
];
var managementIdentityScope = "user-details.read";
var managementIdentityOAuthScopes = [...managementOAuthScopes, managementIdentityScope];
var managementBootstrapScope = "access-acct.write";
var managementBootstrapOAuthScopes = [...managementIdentityOAuthScopes, managementBootstrapScope];
var oauthTokenValue = /^[!-~]{20,8192}$/;
function runtimeGrant(token, previous, expected = runtimeOAuthScopes, optional = []) {
  const { access_token: access, refresh_token: refresh, expires_in: duration2, scope, token_type: type } = token ?? {};
  const scopes = typeof scope === "string" ? scope.trim().split(/\s+/) : void 0;
  if (scope !== void 0 || !previous) {
    if (!scopes || !expected.every((value) => scopes.includes(value)) || scopes.some((value) => value !== "offline_access" && !expected.includes(value) && !optional.includes(value))) {
      throw new Error("Cloudflare issued a different grant than the Fleet runtime permissions.");
    }
  }
  if (typeof type !== "string" || type.toLowerCase() !== "bearer" || !Number.isSafeInteger(duration2) || duration2 < 60 || duration2 > 86400 || typeof access !== "string" || !oauthTokenValue.test(access) || typeof refresh !== "string" || !oauthTokenValue.test(refresh) || refresh === previous?.refresh) {
    throw new Error("Cloudflare did not issue a usable bearer and rotating refresh credential.");
  }
  return { access, refresh, expiresAt: Math.floor(Date.now() / 1e3) + duration2 };
}
__name(runtimeGrant, "runtimeGrant");
function usableStoredGrant(grant) {
  return Number.isSafeInteger(grant?.expiresAt) && typeof grant.access === "string" && oauthTokenValue.test(grant.access) && typeof grant.refresh === "string" && oauthTokenValue.test(grant.refresh);
}
__name(usableStoredGrant, "usableStoredGrant");

// ../cloud/oauth-provisioning.mjs
var tokenEndpoint = "https://dash.cloudflare.com/oauth2/token";
var credentialRoute = "https://fleet-oauth.internal/access-token";
var recordKey = "credential";
var credentialLabel = "fleet-runtime-oauth";
var reconnectBinding = "FLEET_OAUTH_RECONNECT";
var now2 = /* @__PURE__ */ __name(() => Math.floor(Date.now() / 1e3), "now");
var OAuthProvisioner = class {
  static {
    __name(this, "OAuthProvisioner");
  }
  constructor(state2, env, request = fetch) {
    this.storage = state2.storage;
    this.env = env;
    this.request = request;
  }
  async fetch(request) {
    if (request.url !== credentialRoute || request.method !== "POST") return new Response(null, { status: 404 });
    try {
      this.inFlight ??= this.access().finally(() => {
        this.inFlight = void 0;
      });
      const access = await this.inFlight;
      return Response.json({ access }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return Response.json({ error: "runtime_authorization_unavailable" }, { status: 503 });
    }
  }
  async access() {
    const { FLEET_OAUTH_KEY: key4, FLEET_OAUTH_SEED: seed, FLEET_OAUTH_CLIENT_ID: clientId } = this.env;
    if (!tokenPattern2.test(key4 ?? "") || !/^[A-Za-z0-9_-]{8,128}$/.test(clientId ?? "")) {
      throw new Error("The Nodrelay OAuth binding is incomplete.");
    }
    let record4 = await this.storage.get(recordKey);
    const combined = this.env.FLEET_OAUTH_MODE === "managed";
    let generation = record4?.generation;
    let applied = record4?.applied ?? (generation ? [generation] : []);
    let consumedReconnect = false;
    const reconnect = combined && this.env[reconnectBinding];
    if (reconnect) {
      const next2 = JSON.parse(reconnect);
      if (!/^[a-f0-9]{32}$/.test(next2?.generation ?? "") || next2.clientId !== clientId || !usableStoredGrant(next2.grant)) throw new Error("The Nodrelay OAuth reconnect grant is invalid.");
      if (!applied.includes(next2.generation)) {
        if (next2.grant.expiresAt <= now2() + 45) throw new Error("The Nodrelay OAuth reconnect grant expired.");
        generation = next2.generation;
        applied = [...applied, generation];
        record4 = { generation, applied, sealed: await protect(key4, credentialLabel, next2.grant) };
        await this.storage.put(recordKey, record4);
      }
      consumedReconnect = next2.generation === generation;
    }
    if (!record4 && seed) {
      const initial = JSON.parse(seed);
      if (!usableStoredGrant(initial)) throw new Error("The Nodrelay OAuth seed is invalid.");
      record4 = await protect(key4, credentialLabel, initial);
      await this.storage.put(recordKey, record4);
    }
    const sealed = typeof record4 === "string" ? record4 : record4?.sealed;
    if (typeof sealed !== "string") throw new Error("The Nodrelay OAuth grant must be reconnected.");
    const credential = await unprotect(key4, credentialLabel, sealed);
    if (credential.expiresAt > now2() + 45) {
      await this.clearSeed(credential.access, "FLEET_OAUTH_SEED");
      if (consumedReconnect) await this.clearSeed(credential.access, reconnectBinding);
      return credential.access;
    }
    await this.storage.put(recordKey, generation ? { state: "refresh_started", generation, applied } : { state: "refresh_started" });
    const { request } = this;
    const response2 = await request(tokenEndpoint, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(1e4),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, refresh_token: credential.refresh })
    });
    if (!response2.ok) throw new Error("Cloudflare did not renew the Fleet grant.");
    const managementScopes = this.env.FLEET_OAUTH_ZERO_TRUST_BOOTSTRAP === "1" ? managementBootstrapOAuthScopes : this.env.FLEET_OAUTH_USER_DETAILS === "1" ? managementIdentityOAuthScopes : managementOAuthScopes;
    const renewed = runtimeGrant(await response2.json(), credential, combined ? managementScopes : void 0);
    const next = await protect(key4, credentialLabel, renewed);
    await this.storage.put(recordKey, generation ? { generation, applied, sealed: next } : next);
    await this.clearSeed(renewed.access, "FLEET_OAUTH_SEED");
    if (consumedReconnect) await this.clearSeed(renewed.access, reconnectBinding);
    return renewed.access;
  }
  async clearSeed(access, binding) {
    this.clearedSeeds ??= /* @__PURE__ */ new Set();
    if (!this.env[binding] || this.env.FLEET_OAUTH_MODE !== "managed" || this.clearedSeeds.has(binding)) return;
    const { accountId: accountId2, worker: worker2, label: label3 } = JSON.parse(this.env.FLEET_SPEC);
    if (!/^[a-f0-9]{32}$/.test(accountId2 ?? "") || worker2 !== label3 || !/^fleet-[a-z0-9]+-[a-f0-9]{12}$/.test(worker2 ?? "")) {
      throw new Error("The OAuth seed does not belong to this management Worker.");
    }
    const path = `/accounts/${accountId2}/workers/scripts/${worker2}/secrets/${binding}`;
    try {
      await cloudflareApi(access, { request: this.request }).del(path);
    } catch (error) {
      if (error.status !== 404) throw error;
    }
    this.clearedSeeds.add(binding);
  }
};
async function workerOAuthAccess(namespace) {
  const broker = namespace.get(namespace.idFromName("fleet-provisioner"));
  const response2 = await broker.fetch(credentialRoute, { method: "POST" });
  if (!response2.ok) return;
  const { access } = await response2.json();
  return typeof access === "string" && oauthTokenValue.test(access) ? access : void 0;
}
__name(workerOAuthAccess, "workerOAuthAccess");

// ../cloud/portal-client-callbacks.mjs
var portalCallbackPresets = [
  { client: "ChatGPT", uris: [
    "https://chatgpt.com/connector_platform_oauth_redirect",
    "https://chatgpt.com/connector/oauth/*"
  ] },
  { client: "Claude", uris: ["https://claude.ai/api/mcp/auth_callback"] },
  { client: "Cursor", uris: [
    "https://www.cursor.com/agents/mcp/oauth/callback",
    "http://localhost:8787/callback",
    "cursor://anysphere.cursor-mcp/oauth/callback"
  ] },
  { client: "VS Code", uris: ["https://vscode.dev/redirect", "http://127.0.0.1:33418/"] }
];
var defaultUris = portalCallbackPresets.flatMap((preset) => preset.uris);
var PortalCallbackError = class extends Error {
  static {
    __name(this, "PortalCallbackError");
  }
  constructor(message2, status) {
    super(message2);
    this.status = status;
  }
};
function applicationPath(spec) {
  return (spec.zoneScopedAccess ? "/zones/" + spec.zoneId : "/accounts/" + spec.accountId) + "/access/apps";
}
__name(applicationPath, "applicationPath");
function ownsPortal(app, spec) {
  return app?.name === spec.label && app.type === "mcp_portal" && (app.domain === spec.portalHostname || !app.domain && app.destinations?.length === 1 && app.destinations[0].uri === spec.portalHostname) && (!app.destinations?.length || app.destinations.length === 1 && app.destinations[0].uri === spec.portalHostname);
}
__name(ownsPortal, "ownsPortal");
async function loadPortal(api, spec, id2) {
  const path = applicationPath(spec);
  const appId = id2 ?? single(
    await api.list(path, { domain: spec.portalHostname }),
    (app2) => ownsPortal(app2, spec),
    "managed Portal Access application"
  )?.id;
  if (!appId) throw new PortalCallbackError("\u627E\u4E0D\u5230\u8BE5\u90E8\u7F72\u7684 Portal Access \u5E94\u7528\u3002", 409);
  const resource = path + "/" + appId;
  const app = await api.get(resource);
  if (!ownsPortal(app, spec)) throw new PortalCallbackError("Portal Access \u5E94\u7528\u5F52\u5C5E\u5DF2\u53D8\u5316\u3002", 409);
  return { resource, app };
}
__name(loadPortal, "loadPortal");
function registrationOf(app) {
  return app.oauth_configuration?.dynamic_client_registration ?? {};
}
__name(registrationOf, "registrationOf");
function callbackState(app) {
  const registration = registrationOf(app);
  return {
    enabled: app.oauth_configuration?.enabled === true && registration.enabled === true,
    allowedUris: registration.allowed_uris ?? [],
    allowLocalhost: registration.allow_any_on_localhost === true,
    allowLoopback: registration.allow_any_on_loopback === true,
    presets: portalCallbackPresets
  };
}
__name(callbackState, "callbackState");
function exactRedirect(value) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9+.-]*:\/[^#*{}\s\\]+$/i.test(value) || value.length > 2048) {
    throw new PortalCallbackError("\u8BF7\u8F93\u5165\u5BA2\u6237\u7AEF\u7684\u5B8C\u6574\u56DE\u8C03\u5730\u5740\u3002\u5B83\u4E0D\u80FD\u5305\u542B\u901A\u914D\u7B26\u6216\u7247\u6BB5\u3002", 400);
  }
  const url = URL.parse(value);
  const allowedScheme = url?.protocol === "https:" || url?.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url?.protocol === "cursor:" || /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+:$/i.test(url?.protocol ?? "");
  if (!url || !allowedScheme || url.username || url.password || /^https?:$/.test(url.protocol) && !/^https?:\/\/[^/]/i.test(value)) {
    throw new PortalCallbackError("\u56DE\u8C03\u5730\u5740\u5FC5\u987B\u4F7F\u7528 HTTPS\u3001\u73AF\u56DE HTTP \u6216\u5BA2\u6237\u7AEF\u7684\u539F\u751F\u56DE\u8C03\u534F\u8BAE\u3002", 400);
  }
  if ([...url.searchParams.keys()].some((key4) => /^(?:code|state|client_secret|access_token|refresh_token|id_token|token)$/i.test(key4))) {
    throw new PortalCallbackError("\u8BF7\u4F7F\u7528\u5BA2\u6237\u7AEF\u7684\u56DE\u8C03\u5730\u5740\uFF0C\u53BB\u6389\u6388\u6743\u7801\u6216\u51ED\u636E\u3002", 400);
  }
  return value;
}
__name(exactRedirect, "exactRedirect");
function canonical2(value) {
  if (Array.isArray(value)) return value.map(canonical2);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key4) => [key4, canonical2(value[key4])]));
}
__name(canonical2, "canonical");
function policySnapshot(policies) {
  return policies.map(({ updated_at, ...policy }) => JSON.stringify(canonical2(policy))).sort().join("\n");
}
__name(policySnapshot, "policySnapshot");
function applicationSnapshot(app) {
  const { updated_at, policies, oauth_configuration, ...settings } = app;
  const { dynamic_client_registration, ...oauth } = oauth_configuration ?? {};
  const { enabled, allowed_uris, ...registration } = dynamic_client_registration ?? {};
  return JSON.stringify(canonical2({ settings, oauth, registration, policies: policySnapshot(policies ?? []) }));
}
__name(applicationSnapshot, "applicationSnapshot");
async function updateCallbacks(api, spec, resource, original, uris, initialize = false) {
  const policies = policySnapshot(await api.list(resource + "/policies"));
  const current = await api.get(resource);
  if (!ownsPortal(current, spec) || JSON.stringify(canonical2(current)) !== JSON.stringify(canonical2(original))) {
    throw new PortalCallbackError("Portal \u914D\u7F6E\u521A\u521A\u66F4\u65B0\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5\u3002", 409);
  }
  const existing = registrationOf(current);
  await api.put(resource, {
    ...current,
    oauth_configuration: {
      ...current.oauth_configuration,
      dynamic_client_registration: {
        ...existing,
        ...initialize && { enabled: true },
        allowed_uris: uris
      }
    }
  });
  const app = await api.get(resource);
  const state2 = callbackState(app);
  if (!ownsPortal(app, spec) || !state2.enabled || applicationSnapshot(app) !== applicationSnapshot(current) || state2.allowedUris.length !== uris.length || !uris.every((uri) => state2.allowedUris.includes(uri)) || policySnapshot(await api.list(resource + "/policies")) !== policies) {
    throw new PortalCallbackError("Cloudflare \u56DE\u8BFB\u4E0E\u9884\u671F\u4E0D\u7B26\uFF0C\u8BF7\u68C0\u67E5 Portal \u914D\u7F6E\u540E\u518D\u8BD5\u3002", 409);
  }
  return state2;
}
__name(updateCallbacks, "updateCallbacks");
async function readPortalCallbacks(api, spec) {
  return callbackState((await loadPortal(api, spec)).app);
}
__name(readPortalCallbacks, "readPortalCallbacks");
async function addPortalCallback(api, spec, input) {
  const uri = exactRedirect(input);
  const { resource, app } = await loadPortal(api, spec);
  const state2 = callbackState(app);
  if (!state2.enabled) throw new PortalCallbackError("\u8BE5 Portal \u5C1A\u672A\u542F\u7528\u52A8\u6001\u5BA2\u6237\u7AEF\u6CE8\u518C\u3002", 409);
  if (state2.allowedUris.includes(uri)) return state2;
  return updateCallbacks(api, spec, resource, app, [...state2.allowedUris, uri]);
}
__name(addPortalCallback, "addPortalCallback");

// ../cloud/profiles.mjs
var profiles = {
  probe: { path: "/probe/mcp", tools: ["open_workspace", "read"] },
  development: {
    path: "/devspace/mcp",
    port: 7829,
    tools: ["open_workspace", "read", "apply_patch", "exec_command", "write_stdin"]
  },
  browser: {
    path: "/browser/mcp",
    port: 7831,
    tools: ["browser_profiles", "browser_navigate", "browser_snapshot", "browser_tabs", "browser_click"],
    optional: [
      "browser_navigate_back",
      "browser_hover",
      "browser_press_key",
      "browser_type",
      "browser_fill_form",
      "browser_select_option",
      "browser_wait_for",
      "browser_take_screenshot"
    ]
  }
};

// ../cloud/devices.mjs
var now3 = /* @__PURE__ */ __name(() => Math.floor(Date.now() / 1e3), "now");
var randomToken = /* @__PURE__ */ __name(() => base64url_exports.encode(crypto.getRandomValues(new Uint8Array(32))), "randomToken");
var tunnelIdPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
var DeviceError = class extends Error {
  static {
    __name(this, "DeviceError");
  }
  constructor(message2, status = 400) {
    super(message2);
    this.status = status;
  }
};
function validId(id2) {
  if (typeof id2 !== "string" || !devicePattern2.test(id2)) throw new DeviceError("Invalid device ID");
}
__name(validId, "validId");
var displayCharacters = new Intl.Segmenter(void 0, { granularity: "grapheme" });
function deviceDisplayName(input) {
  const invalid2 = /* @__PURE__ */ __name(() => new DeviceError("\u8BBE\u5907\u540D\u79F0\u8BF7\u8F93\u5165 1 \u81F3 20 \u4E2A\u53EF\u89C1\u5B57\u7B26\u3002"), "invalid");
  if (typeof input !== "string" || input.length > 512 || /[\p{Cc}\p{Cs}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(input)) throw invalid2();
  const name = input.trim().normalize("NFC");
  if (!name || !/[^\s\p{Cf}]/u.test(name) || [...displayCharacters.segment(name)].length > 20) throw invalid2();
  return name;
}
__name(deviceDisplayName, "deviceDisplayName");
var deviceLabelsTable = "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'fleet_device_labels'";
var createDeviceLabels = `CREATE TABLE IF NOT EXISTS fleet_device_labels (
  device_id TEXT PRIMARY KEY NOT NULL REFERENCES fleet_devices(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL
)`;
var randomDeviceId = /* @__PURE__ */ __name(() => "dev-" + Array.from(
  crypto.getRandomValues(new Uint8Array(8)),
  (byte) => byte.toString(16).padStart(2, "0")
).join(""), "randomDeviceId");
async function deviceLease(db, action, request = fetch) {
  const owner = randomToken();
  const row = await db.prepare(`INSERT INTO fleet_leases (id, owner, expires_at) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at
    WHERE fleet_leases.expires_at <= ? RETURNING owner`).bind(owner, now3() + 90, now3()).first();
  if (!row) throw new DeviceError("Another device operation is still running. Retry shortly.", 409);
  const guard = /* @__PURE__ */ __name(async () => {
    const result = await db.prepare("UPDATE fleet_leases SET expires_at = ? WHERE owner = ? AND expires_at > ? RETURNING owner").bind(now3() + 90, owner, now3()).first();
    if (!result) throw new DeviceError("Device operation lease expired. Retry from the management page.", 409);
  }, "guard");
  try {
    return await action({ request, beforeRequest: guard }, guard);
  } finally {
    await db.prepare("DELETE FROM fleet_leases WHERE owner = ?").bind(owner).run().catch(() => {
    });
  }
}
__name(deviceLease, "deviceLease");
var draftDevicePredicate = "platform = '' AND status = 'pending' AND credentials IS NULL AND tunnel_id IS NULL";
var registrationStatus = `CASE WHEN ${draftDevicePredicate} THEN 'draft' ELSE status END`;
async function readDevice(db, id2) {
  validId(id2);
  return db.prepare(`SELECT *, (${draftDevicePredicate}) AS draft FROM fleet_devices WHERE id = ?`).bind(id2).first();
}
__name(readDevice, "readDevice");
var liveTicket = /* @__PURE__ */ __name((db, id2) => db.prepare("SELECT 1 FROM enrollment_tickets WHERE device_id = ? AND expires_at > ?").bind(id2, now3()).first(), "liveTicket");
var uniqueName = /* @__PURE__ */ __name((id2) => id2 + "-" + crypto.randomUUID().slice(0, 5), "uniqueName");
var bindDraft = /* @__PURE__ */ __name((db, row, platform, encrypted) => db.prepare(`UPDATE fleet_devices
  SET platform = ?, credentials = ?, updated_at = ? WHERE id = ? AND unique_name = ?
  AND ${draftDevicePredicate} RETURNING *`).bind(platform, encrypted, now3(), row.id, row.unique_name).first(), "bindDraft");
async function reservedIntent(db, id2) {
  if (!await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'enrollment_intents'").first()) return;
  return db.prepare(`SELECT id, state FROM enrollment_intents WHERE device_id = ?
    AND state IN ('pending', 'claimed') ORDER BY state LIMIT 1`).bind(id2).first();
}
__name(reservedIntent, "reservedIntent");
function identity(spec, row) {
  const hostname = row.id + spec.deviceSuffix;
  const profile = /* @__PURE__ */ __name((kind, token, port) => ({
    ...profiles[kind],
    ...port !== void 0 && { port },
    kind,
    token,
    id: row.unique_name + (kind === "development" ? "-d" : "-b"),
    url: "https://" + hostname + profiles[kind].path
  }), "profile");
  return { hostname, profile };
}
__name(identity, "identity");
function tunnelRules(hostname, profiles2) {
  return [...profiles2.map((r) => ({
    hostname,
    path: "^" + r.path + "$",
    service: `http://127.0.0.1:${r.port}`,
    originRequest: { httpHostHeader: `127.0.0.1:${r.port}` }
  })), { service: "http_status:404" }];
}
__name(tunnelRules, "tunnelRules");
async function ensureTunnel(api, account, spec, db, row, profiles2) {
  const path = account + "/cfd_tunnel";
  const name = `${spec.label}-${row.unique_name}`;
  const { hostname } = identity(spec, row);
  const found = row.tunnel_id ? await api.get(path + "/" + row.tunnel_id) : single(await api.list(path, { name, is_deleted: false }), (tunnel2) => tunnel2.name === name, "device Tunnel");
  if (found && (found.name !== name || found.config_src !== "cloudflare")) throw new DeviceError("Tunnel ownership could not be verified", 409);
  const tunnel = found ?? await api.post(path, { name, config_src: "cloudflare" });
  if (!tunnelIdPattern.test(tunnel?.id ?? "")) throw new Error("Tunnel ID unavailable");
  if (!row.tunnel_id) await db.prepare("UPDATE fleet_devices SET tunnel_id = ? WHERE id = ?").bind(tunnel.id, row.id).run();
  await ensureDns(api, spec.zoneId, hostname, tunnel.id + ".cfargotunnel.com", spec.label);
  const config = { ingress: tunnelRules(hostname, profiles2) };
  await api.put(`${path}/${tunnel.id}/configurations`, { config });
  return tunnel.id;
}
__name(ensureTunnel, "ensureTunnel");
async function ensureMcpServer(api, account, spec, route) {
  const path = account + "/access/ai-controls/mcp/servers";
  const existing = await api.getOptional(path + "/" + route.id);
  if (existing && (existing.name !== route.id || existing.hostname !== route.url || existing.auth_type !== "bearer")) {
    throw new DeviceError("MCP server ownership changed", 409);
  }
  if (!existing) {
    await api.post(path, { id: route.id, name: route.id, hostname: route.url, auth_type: "bearer", auth_credentials: route.token });
  }
  const app = {
    name: route.id,
    type: "mcp",
    destinations: [{ type: "via_mcp_server_portal", mcp_server_id: route.id }]
  };
  if (spec.zoneScopedAccess || spec.accountScopedAccess) {
    await ensureScopedAccessApp(api, spec, app, { managed: true, accountScoped: spec.accountScopedAccess });
  } else await ensureAccessApp(api, account, app, spec.policyId, { attachNewManagedApp: true });
  const synced = await api.post(path + "/" + route.id + "/sync");
  if (synced?.status !== "ready") throw Object.assign(
    new DeviceError("Cloudflare has not synced the MCP tool catalog yet. Retry device activation.", 409),
    { activationCode: "tool_catalog_pending" }
  );
}
__name(ensureMcpServer, "ensureMcpServer");
function overrides(items) {
  return items?.flatMap((item) => item.portal_alias !== void 0 || item.portal_description !== void 0 || item.portal_enabled !== void 0 ? [{ name: item.name, alias: item.portal_alias, description: item.portal_description, enabled: item.portal_enabled }] : []);
}
__name(overrides, "overrides");
async function updatePortal(api, account, spec, { add = [], remove = [] }) {
  const path = account + "/access/ai-controls/mcp/portals/" + spec.portalId;
  const portal = await api.get(path);
  if (portal.hostname !== spec.portalHostname || portal.name !== spec.label) throw new DeviceError("Portal ownership changed", 409);
  const previous = (portal.servers ?? []).map((row) => ({
    server_id: row.server_id ?? row.id,
    on_behalf: row.on_behalf,
    default_disabled: row.default_disabled,
    updated_tools: overrides(row.updated_tools),
    updated_prompts: overrides(row.updated_prompts)
  }));
  const ids = new Set(previous.map((row) => row.server_id));
  const next = previous.filter((row) => !remove.includes(row.server_id));
  for (const server_id of add) if (!ids.has(server_id)) next.push({ server_id, on_behalf: false });
  if (JSON.stringify(next) !== JSON.stringify(previous)) await api.put(path, { servers: next });
}
__name(updatePortal, "updatePortal");
function constantTimeEqual(actual, expected) {
  if (actual.length !== expected.length) return false;
  let different = 0;
  for (let index = 0; index < actual.length; index++) different |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  return different === 0;
}
__name(constantTimeEqual, "constantTimeEqual");
async function sameToken(actual, expected) {
  if (typeof actual !== "string" || !tokenPattern2.test(actual)) return false;
  return constantTimeEqual(await activationDigest(actual), await activationDigest(expected));
}
__name(sameToken, "sameToken");
function probeError(message2, reason, httpStatus) {
  const activationCode = ["connection_failed", "http_error"].includes(reason) ? "route_unavailable" : "unexpected_mcp";
  return Object.assign(new DeviceError(message2, 409), { reason, httpStatus, activationCode });
}
__name(probeError, "probeError");
async function probeJson(response2) {
  try {
    return await response2.json();
  } catch {
    throw probeError("The device returned an invalid MCP response", "invalid_response");
  }
}
__name(probeJson, "probeJson");
async function verifyRoute(route, request) {
  const headers = {
    Authorization: `Bearer ${route.token}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream"
  };
  const dispatch = /* @__PURE__ */ __name(async (method, params, id2) => {
    let response2;
    try {
      response2 = await request(route.url, {
        method: "POST",
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(7e3),
        body: JSON.stringify({ jsonrpc: "2.0", method, params, id: id2 })
      });
    } catch {
      throw probeError("The device authenticated MCP route is still unavailable. Retry activation.", "connection_failed");
    }
    if (!response2.ok) throw probeError("The device authenticated MCP route is still unavailable. Retry activation.", "http_error", response2.status);
    return response2;
  }, "dispatch");
  const initialized = await dispatch("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "devspace-fleet-manager", version: "1.0.0" }
  }, 1);
  const result = (await probeJson(initialized))?.result;
  if (result?.protocolVersion !== "2025-11-25") throw probeError("The device did not negotiate the expected MCP protocol", "protocol_mismatch");
  headers["MCP-Protocol-Version"] = result.protocolVersion;
  await dispatch("notifications/initialized");
  const listing = await dispatch("tools/list", {}, 2);
  const catalog = (await probeJson(listing))?.result;
  const names = Array.isArray(catalog?.tools) ? catalog.tools.map((tool) => tool?.name) : [];
  if (!route.tools.every((name) => names.includes(name))) {
    throw probeError("The device did not expose its expected tool catalog", "catalog_mismatch");
  }
  if (route.kind === "browser") {
    const allowed = [...route.tools, ...route.optional];
    if (catalog.nextCursor !== void 0 || new Set(names).size !== names.length || names.some((name) => !allowed.includes(name))) {
      throw probeError("The browser endpoint did not expose a single browser-only tool catalog", "catalog_mismatch");
    }
  }
}
__name(verifyRoute, "verifyRoute");
function createDevices(env, request = fetch) {
  const spec = JSON.parse(env.FLEET_SPEC);
  const releases = JSON.parse(env.RELEASE_CATALOG);
  const installers = { ...releases, ...hostedInstallers(releases) };
  const account = "/accounts/" + spec.accountId;
  const db = env.TICKETS;
  const token = env.PROVISIONER_OAUTH ? async () => {
    const access = await workerOAuthAccess(env.PROVISIONER_OAUTH);
    if (!access) throw new DeviceError("Nodrelay Cloudflare authorization is unavailable. Reconnect it before retrying.", 503);
    return access;
  } : env.PROVISIONER_TOKEN;
  const wrap = /* @__PURE__ */ __name((row, action) => protect(env.TICKET_KEY, row.unique_name, action), "wrap");
  const unwrap = /* @__PURE__ */ __name((row) => unprotect(env.TICKET_KEY, row.unique_name, row.credentials), "unwrap");
  const authorized = /* @__PURE__ */ __name(async (row, token2) => {
    if (!row || !row.credentials || typeof token2 !== "string" || !tokenPattern2.test(token2)) return;
    const stored = await unwrap(row);
    if (row.status === "disabled") {
      if (stored.revocation) {
        return constantTimeEqual(await activationDigest(token2), stored.activationHash) ? stored : void 0;
      }
      if (await sameToken(token2, stored.activationToken)) {
        return { revocation: await revokeResponse(spec.origin, row.id, token2) };
      }
      return;
    }
    if (await sameToken(token2, stored.activationToken)) return stored;
  }, "authorized");
  const deviceRoutes = /* @__PURE__ */ __name((row, tokens) => {
    const { profile } = identity(spec, row);
    return [
      profile("development", tokens.portalToken, tokens.ports?.development),
      ...tokens.browserToken ? [profile("browser", tokens.browserToken, tokens.ports?.browser)] : []
    ];
  }, "deviceRoutes");
  const run = /* @__PURE__ */ __name((action) => deviceLease(db, (options, guard) => action(cloudflareApi(token, options), guard), request), "run");
  const callbackLabels = /* @__PURE__ */ __name(async (state2) => {
    const { results } = await db.prepare("SELECT redirect_uri, client_name FROM portal_callback_labels ORDER BY client_name, redirect_uri").all();
    return {
      ...state2,
      clients: results.filter((row) => state2.allowedUris.includes(row.redirect_uri)).map((row) => ({ redirectUri: row.redirect_uri, clientName: row.client_name }))
    };
  }, "callbackLabels");
  return {
    releases,
    async clientCallbacks() {
      return callbackLabels(await readPortalCallbacks(cloudflareApi(token, { request }), spec));
    },
    async registerClientCallback(name, uri) {
      const clientName = typeof name === "string" ? name.trim() : "";
      if (!clientName || clientName.length > 64 || /[\x00-\x1f\x7f]/.test(clientName)) {
        throw new PortalCallbackError("\u5BA2\u6237\u7AEF\u540D\u79F0\u5E94\u4E3A 1 \u81F3 64 \u4E2A\u53EF\u89C1\u5B57\u7B26\u3002", 400);
      }
      return run(async (api) => {
        const state2 = await addPortalCallback(api, spec, uri);
        await db.prepare(`INSERT INTO portal_callback_labels (redirect_uri, client_name)
          VALUES (?, ?) ON CONFLICT (redirect_uri) DO NOTHING`).bind(uri, clientName).run();
        return callbackLabels(state2);
      });
    },
    async list() {
      const labeled = await db.prepare(deviceLabelsTable).first();
      return (await db.prepare(`SELECT id, platform, ${registrationStatus} AS status, updated_at
        ${labeled ? ", display_name AS displayName" : ""} FROM fleet_devices
        ${labeled ? "LEFT JOIN fleet_device_labels ON device_id = id" : ""} ORDER BY id`).all()).results;
    },
    async reserveNamed(input) {
      const name = deviceDisplayName(input);
      return deviceLease(db, async (_options, guard) => {
        let id2;
        for (let attempt = 0; attempt < 4; attempt++) {
          const candidate = randomDeviceId();
          if (await readDevice(db, candidate) || await reservedIntent(db, candidate) || await liveTicket(db, candidate)) continue;
          id2 = candidate;
          break;
        }
        if (!id2) throw new DeviceError("\u6682\u65F6\u65E0\u6CD5\u5206\u914D\u8BBE\u5907 ID\uFF0C\u8BF7\u91CD\u8BD5\u3002", 503);
        await guard();
        if (!await db.prepare(deviceLabelsTable).first()) await db.prepare(createDeviceLabels).run();
        await guard();
        await db.batch([
          db.prepare(`INSERT INTO fleet_devices (id, platform, status, unique_name, updated_at)
            VALUES (?, '', 'pending', ?, ?)`).bind(id2, uniqueName(id2), now3()),
          db.prepare("INSERT INTO fleet_device_labels (device_id, display_name) VALUES (?, ?)").bind(id2, name)
        ]);
        return { deviceId: id2, draftSaved: true };
      });
    },
    async reserve(id2) {
      validId(id2);
      return deviceLease(db, async (_options, guard) => {
        const conflict = /* @__PURE__ */ __name(() => new DeviceError("\u8FD9\u4E2A\u8BBE\u5907 ID \u5DF2\u5B58\u5728\u6216\u5DF2\u6709\u63A5\u5165\u547D\u4EE4\u3002", 409), "conflict");
        if (await db.prepare("SELECT 1 FROM fleet_devices WHERE id = ?").bind(id2).first() || await reservedIntent(db, id2) || await liveTicket(db, id2)) throw conflict();
        await guard();
        const row = await db.prepare(`INSERT INTO fleet_devices (id, platform, status, unique_name, updated_at)
          VALUES (?, '', 'pending', ?, ?) ON CONFLICT DO NOTHING RETURNING id`).bind(id2, uniqueName(id2), now3()).first();
        if (!row) throw conflict();
        return { deviceId: row.id, draftSaved: true };
      });
    },
    async launch(id2, platform, { confirmBrowser = false } = {}) {
      validId(id2);
      if (!Object.hasOwn(installers, platform)) throw new DeviceError("No verified installer is configured for this platform");
      return run(async (api, guard) => {
        if (await reservedIntent(db, id2)) throw new DeviceError("This device ID is reserved by a durable enrollment intent.", 409);
        let row = await readDevice(db, id2);
        if (row && !row.draft && (row.platform !== platform || row.status !== "pending")) {
          throw new DeviceError("This device already exists or is disabled. Choose a new device ID.", 409);
        }
        if (await liveTicket(db, id2)) throw new DeviceError("This device already has an unclaimed ticket. Cancel it or wait for expiration.", 409);
        let credentials = row && !row.draft && await unwrap(row);
        const asset = credentials?.asset ?? installers[platform];
        if (asset.assets && JSON.stringify(asset) !== JSON.stringify(installers[platform])) {
          throw new DeviceError("The device is pinned to a previous hosted release. Choose a new device ID.", 409);
        }
        if (Boolean(asset.browser) !== confirmBrowser) {
          throw new DeviceError(asset.browser ? "\u8BF7\u786E\u8BA4\u5728\u6B64\u8BBE\u5907\u4E0A\u542F\u7528\u6D4F\u89C8\u5668\u5DE5\u5177\u3002" : "\u6B64\u5B89\u88C5\u5305\u672A\u63D0\u4F9B\u6D4F\u89C8\u5668\u5DE5\u5177\u3002", 400);
        }
        if (!row || row.draft) {
          credentials = {
            asset,
            portalToken: randomToken(),
            activationToken: randomToken(),
            ...asset.browser && { browserToken: randomToken() }
          };
          const unique = row?.unique_name ?? uniqueName(id2);
          const encrypted = await wrap({ unique_name: unique }, credentials);
          await guard();
          row = row ? await bindDraft(db, row, platform, encrypted) : await db.prepare(`INSERT INTO fleet_devices
            (id, platform, status, unique_name, credentials, updated_at) VALUES (?, ?, 'pending', ?, ?, ?)
            ON CONFLICT DO NOTHING RETURNING *`).bind(id2, platform, unique, encrypted, now3()).first();
          if (!row) throw new DeviceError("Device state changed. Refresh the management page before retrying.", 409);
        }
        if (Boolean(asset.browser) !== Boolean(credentials.browserToken)) {
          throw new DeviceError("The pending device browser capability differs from its original release. Cancel it or use a new device ID.", 409);
        }
        const tunnel = await ensureTunnel(api, account, spec, db, row, deviceRoutes(row, credentials));
        const tunnelToken = await api.get(`${account}/cfd_tunnel/${tunnel}/token`);
        const issued = await issueTicket(db, env.TICKET_KEY, { deviceId: id2, tunnelToken, ...credentials });
        if (!issued) throw new DeviceError("This device already has an unclaimed ticket. Cancel it or wait for expiration.", 409);
        return { ...issued, asset };
      });
    },
    async claimHostedEnrollment(input) {
      const id2 = input?.deviceId;
      validId(id2);
      if (typeof input.platform !== "string" || !Object.hasOwn(operatingSystems, input.platform)) {
        throw new DeviceError("Hosted enrollment requires a supported operating system");
      }
      const reject2 = /* @__PURE__ */ __name(() => new DeviceError("Hosted enrollment rejected", 404), "reject");
      let ports;
      if (input.ports !== void 0) {
        try {
          ports = validateDevicePorts(input.ports, input.browser === true);
        } catch {
          throw new DeviceError("Hosted enrollment requires valid local device ports");
        }
      }
      return run(async (api, guard) => {
        const reservation = await reservedIntent(db, id2);
        if (!reservation) throw reject2();
        let row = await readDevice(db, id2);
        let stored = row?.credentials && await unwrap(row);
        if (row && !row.draft && (row.status !== "pending" || row.platform !== input.platform || stored?.claimIntentId !== reservation.id)) throw reject2();
        if (await liveTicket(db, id2)) throw reject2();
        const intent = await getEnrollmentIntent(db, reservation.id);
        const choice = intent?.releases[input.platform];
        if (choice?.platform !== input.platform || !Object.values(choice.assets).every((asset) => asset.url)) throw reject2();
        await guard();
        const claim = await claimEnrollmentIntent(db, input);
        if (!claim || claim.id !== reservation.id) throw reject2();
        if (!row || row.draft) {
          const unique = row?.unique_name ?? uniqueName(id2);
          stored = {
            claimIntentId: claim.id,
            claimedArchitecture: claim.architecture,
            asset: claim.release,
            portalToken: randomToken(),
            activationToken: randomToken(),
            ...claim.release.browser && { browserToken: randomToken() },
            ...ports && { ports }
          };
          const encrypted = await wrap({ unique_name: unique }, stored);
          await guard();
          row = row ? await bindDraft(db, row, input.platform, encrypted) : await db.prepare(`INSERT INTO fleet_devices (id, platform, status, unique_name, credentials, updated_at)
            VALUES (?, ?, 'pending', ?, ?, ?) ON CONFLICT DO NOTHING RETURNING *`).bind(id2, input.platform, unique, encrypted, now3()).first();
          if (!row) throw reject2();
        }
        if (stored.claimedArchitecture !== claim.architecture || JSON.stringify(stored.asset) !== JSON.stringify(claim.release) || JSON.stringify(stored.ports) !== JSON.stringify(ports)) throw reject2();
        const tunnel = await ensureTunnel(api, account, spec, db, row, deviceRoutes(row, stored));
        const tunnelToken = await api.get(`${account}/cfd_tunnel/${tunnel}/token`);
        await guard();
        return validateCredentials({ deviceId: id2, tunnelToken, ...stored });
      });
    },
    async activate(id2, token2) {
      validId(id2);
      const existing = await readDevice(db, id2);
      const authorization = await authorized(existing, token2);
      if (!authorization) throw new DeviceError("Device activation rejected", 401);
      if (authorization.revocation) return authorization.revocation;
      if (existing.status === "active") return { status: "active" };
      return run(async (api, guard) => {
        const row = await readDevice(db, id2);
        const tokens = await authorized(row, token2);
        if (!tokens) throw new DeviceError("Device activation rejected", 401);
        if (tokens.revocation) return tokens.revocation;
        if (row.status === "active") return { status: "active" };
        if (!row.tunnel_id) throw Object.assign(
          new DeviceError("Device has no registered Tunnel", 409),
          { activationCode: "tunnel_pending" }
        );
        const profiles2 = deviceRoutes(row, tokens);
        await guard();
        const proofs = await Promise.allSettled(profiles2.map((route) => verifyRoute(route, request)));
        const failed = proofs.find((result) => result.status === "rejected");
        if (failed) throw failed.reason;
        for (const route of profiles2) await ensureMcpServer(api, account, spec, route);
        await updatePortal(api, account, spec, { add: profiles2.map((route) => route.id) });
        await db.prepare("UPDATE fleet_devices SET status = 'active', updated_at = ? WHERE id = ?").bind(now3(), id2).run();
        return { status: "active" };
      });
    },
    async enrollmentStatus(id2) {
      validId(id2);
      const row = await db.prepare(`SELECT ${registrationStatus} AS status FROM fleet_devices WHERE id = ?`).bind(id2).first();
      if (!row) throw new DeviceError("Unknown device", 404);
      return { registration: row.status };
    },
    async status(id2) {
      const row = await readDevice(db, id2);
      if (!row) throw new DeviceError("Unknown device", 404);
      if (row.draft) return { deviceId: id2, registration: "draft", tunnel: "unregistered", mcp: "not_enabled", checkedAt: now3() };
      const api = cloudflareApi(token, { request });
      const tunnelCheck = (async () => {
        if (!row.tunnel_id) return { tunnel: "unregistered" };
        try {
          const result = await api.get(`${account}/cfd_tunnel/${row.tunnel_id}`);
          return { tunnel: result?.status ?? "unverified" };
        } catch (error) {
          return { tunnel: "check_failed", tunnelDiagnostic: error instanceof CloudflareError ? { reason: "http_error", httpStatus: error.status, codes: error.codes } : { reason: error instanceof CloudflareRequestTimeoutError ? "timeout" : error instanceof DeviceError ? "authorization" : "check_failed" } };
        }
      })();
      const stored = row.credentials ? await unwrap(row) : null;
      const { profile } = identity(spec, row);
      const serverIds = [profile("development").id, ...stored?.browserToken ? [profile("browser").id] : []];
      const mcpProfiles = { development: "unverified", browser: stored?.browserToken ? "unverified" : "not_enabled" };
      const mcpDiagnostics = {};
      if (row.status === "disabled") mcpProfiles.development = mcpProfiles.browser = "disabled";
      if (row.status === "active" && stored) {
        const profiles2 = deviceRoutes(row, stored);
        const proofs = await Promise.allSettled(profiles2.map((route) => verifyRoute(route, request)));
        for (const [index, route] of profiles2.entries()) {
          const proof = proofs[index];
          mcpProfiles[route.kind] = proof.status === "fulfilled" ? "catalog_verified" : "unavailable";
          if (proof.status === "rejected") {
            const error = proof.reason;
            mcpDiagnostics[route.kind] = {
              reason: error?.reason ?? "check_failed",
              ...Number.isInteger(error?.httpStatus) && { httpStatus: error.httpStatus }
            };
          }
        }
      }
      const mcp = mcpProfiles.browser === "unavailable" ? "unavailable" : mcpProfiles.development;
      return {
        deviceId: id2,
        registration: row.status,
        ...await tunnelCheck,
        mcp,
        mcpProfiles,
        mcpDiagnostics,
        checkedAt: now3(),
        ...row.status === "disabled" ? { revocation: !stored || stored.revocation ? "complete" : "pending" } : { serverIds, release: stored?.asset?.version }
      };
    },
    async disable(id2) {
      validId(id2);
      return run(async (api, guard) => {
        const row = await readDevice(db, id2);
        if (!row) {
          const reservation = await reservedIntent(db, id2);
          if (!reservation) throw new DeviceError("Unknown device", 404);
          const intent = await getEnrollmentIntent(db, reservation.id);
          if (!intent) throw new DeviceError("Unknown device", 404);
          await guard();
          await db.prepare(`INSERT INTO fleet_devices (id, platform, status, unique_name, updated_at)
            VALUES (?, ?, 'disabled', ?, ?)`).bind(id2, intent.release?.platform ?? "", uniqueName(id2), now3()).run();
          if (reservation.state === "pending") await revokeEnrollmentIntent(db, reservation.id);
          return { status: "disabled" };
        }
        if (row.draft) {
          const reservation = await reservedIntent(db, id2);
          await guard();
          if (reservation?.state === "pending") await revokeEnrollmentIntent(db, reservation.id);
          await guard();
          const disabled = await db.prepare(`UPDATE fleet_devices SET status = 'disabled', updated_at = ?
            WHERE id = ? AND unique_name = ? AND ${draftDevicePredicate} RETURNING id`).bind(now3(), id2, row.unique_name).first();
          if (!disabled) throw new DeviceError("Device state changed. Refresh the management page before retrying.", 409);
          return { status: "disabled" };
        }
        const stored = row.credentials ? await unwrap(row) : null;
        if (row.status === "disabled" && (!stored || stored.revocation)) return { status: "disabled" };
        await db.batch([
          db.prepare("UPDATE fleet_devices SET status = 'disabled', updated_at = ? WHERE id = ?").bind(now3(), id2),
          ticketCancellation(db, id2)
        ]);
        if (row.tunnel_id) {
          const path = `${account}/cfd_tunnel/${row.tunnel_id}`;
          const tunnel = await api.get(path);
          if (tunnel.name !== `${spec.label}-${row.unique_name}`) throw new DeviceError("Tunnel ownership changed", 409);
          await api.put(path + "/configurations", { config: { ingress: tunnelRules("", []) } });
          if (row.credentials) {
            const secret = base64url_exports.encode(crypto.getRandomValues(new Uint8Array(32))).replaceAll("-", "+").replaceAll("_", "/") + "=";
            await api.patch(path, { tunnel_secret: secret });
            await api.del(path + "/connections");
          }
        }
        await updatePortal(api, account, spec, { remove: [row.unique_name + "-d", row.unique_name + "-b"] });
        const revoked = stored && await wrap(row, {
          activationHash: await activationDigest(stored.activationToken),
          revocation: await revokeResponse(spec.origin, id2, stored.activationToken)
        });
        await db.prepare("UPDATE fleet_devices SET credentials = ? WHERE id = ?").bind(revoked, id2).run();
        return { status: "disabled" };
      });
    }
  };
}
__name(createDevices, "createDevices");

// ../cloud/enrollment-admin.mjs
var uuidPattern2 = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
var valid = /* @__PURE__ */ __name((pattern, value) => typeof value === "string" && pattern.test(value), "valid");
var fieldsAre = /* @__PURE__ */ __name((value, fields) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field)), "fieldsAre");
var enrollmentErrors = {
  invalid_target: [400, "\u8BBE\u5907\u6216\u5B89\u88C5\u547D\u4EE4\u6807\u8BC6\u65E0\u6548\uFF0C\u8BF7\u5237\u65B0\u8BBE\u5907\u5217\u8868\u3002"],
  invalid_device: [400, "\u8BBE\u5907\u540D\u79F0\u6216\u7CFB\u7EDF\u9009\u9879\u65E0\u6548\uFF0C\u8BF7\u68C0\u67E5\u540E\u91CD\u8BD5\u3002"],
  installer_unavailable: [400, "\u5F53\u524D\u7248\u672C\u6CA1\u6709\u6B64\u7CFB\u7EDF\u7684\u5B89\u88C5\u5305\uFF0C\u8BF7\u9009\u62E9\u8BBE\u5907\u5B9E\u9645\u4F7F\u7528\u7684\u53D7\u652F\u6301\u7CFB\u7EDF\u3002"],
  browser_confirmation: [400, "\u6D4F\u89C8\u5668\u6743\u9650\u4E0E\u6240\u9009\u5B89\u88C5\u5305\u4E0D\u5339\u914D\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u7CFB\u7EDF\u5E76\u6838\u5BF9\u6743\u9650\u3002"],
  device_in_use: [409, "\u8FD9\u4E2A\u8BBE\u5907\u540D\u79F0\u5DF2\u6709\u63A5\u5165\u8BB0\u5F55\uFF0C\u8BF7\u67E5\u770B\u8BBE\u5907\u5217\u8868\u6216\u6362\u4E00\u4E2A\u540D\u79F0\u3002"],
  command_missing: [404, "\u5B89\u88C5\u547D\u4EE4\u5DF2\u9886\u53D6\u3001\u5DF2\u64A4\u9500\u6216\u4E0D\u5B58\u5728\uFF0C\u8BF7\u5237\u65B0\u8BBE\u5907\u5217\u8868\u3002"],
  command_changed: [409, "\u5B89\u88C5\u547D\u4EE4\u72B6\u6001\u5DF2\u53D8\u5316\uFF0C\u8BF7\u5237\u65B0\u8BBE\u5907\u5217\u8868\u540E\u518D\u64CD\u4F5C\u3002"]
};
var EnrollmentAdminError = class extends Error {
  static {
    __name(this, "EnrollmentAdminError");
  }
  constructor(code) {
    const [status, message2] = enrollmentErrors[code];
    super(message2);
    this.code = code;
    this.status = status;
  }
};
function validTarget(input) {
  if (!fieldsAre(input, ["deviceId", "intentId"]) || !valid(devicePattern2, input.deviceId) || !valid(uuidPattern2, input.intentId)) {
    throw new EnrollmentAdminError("invalid_target");
  }
}
__name(validTarget, "validTarget");
function createEnrollmentAdmin({ db, secret, releases, withDeviceFence }) {
  if (!db?.prepare || typeof withDeviceFence !== "function" || !releases || typeof releases !== "object" || Array.isArray(releases)) {
    throw new Error("Enrollment database, trusted release catalog and shared device fence are required");
  }
  const installers = hostedInstallers(structuredClone(releases));
  const browserRequired = Object.values(installers).some((release) => release.browser === true);
  const existingLegacy = /* @__PURE__ */ __name(async (deviceId) => db.prepare(`SELECT
    (SELECT (${draftDevicePredicate}) FROM fleet_devices WHERE id = ?) AS draft,
    EXISTS(SELECT 1 FROM enrollment_tickets WHERE device_id = ? AND expires_at > ?) AS live_ticket`).bind(deviceId, deviceId, Math.floor(Date.now() / 1e3)).first(), "existingLegacy");
  const requireNoLegacy = /* @__PURE__ */ __name(async (deviceId) => {
    const result = await existingLegacy(deviceId);
    if (result?.live_ticket !== 0 || result.draft !== null && result.draft !== 1) {
      throw new EnrollmentAdminError("device_in_use");
    }
    return result.draft === 1;
  }, "requireNoLegacy");
  const checkedIntent = /* @__PURE__ */ __name(async ({ deviceId, intentId }) => {
    const intent = await getEnrollmentIntent(db, intentId);
    if (!intent || intent.deviceId !== deviceId || intent.state !== "pending") {
      throw new EnrollmentAdminError("command_missing");
    }
    return intent;
  }, "checkedIntent");
  return Object.freeze({
    // Whether a multi-system command must first be confirmed for browser tools.
    browserRequired,
    async create(input) {
      const anySystem = fieldsAre(input, ["deviceId", "confirmBrowser"]);
      if (!(anySystem || fieldsAre(input, ["deviceId", "platform", "confirmBrowser"])) || !valid(devicePattern2, input.deviceId) || !anySystem && typeof input.platform !== "string" || typeof input.confirmBrowser !== "boolean") {
        throw new EnrollmentAdminError("invalid_device");
      }
      const { deviceId, platform, confirmBrowser } = input;
      let pinned;
      if (anySystem) {
        if (!Object.keys(installers).length) throw new EnrollmentAdminError("installer_unavailable");
        if (confirmBrowser !== browserRequired) throw new EnrollmentAdminError("browser_confirmation");
        pinned = { releases: installers };
      } else {
        if (!Object.hasOwn(installers, platform)) throw new EnrollmentAdminError("installer_unavailable");
        const release = installers[platform];
        if (confirmBrowser !== (release?.browser === true)) throw new EnrollmentAdminError("browser_confirmation");
        pinned = { platform, release };
      }
      return withDeviceFence(async (assertFence) => {
        await assertFence();
        const preparedDraft = await requireNoLegacy(deviceId);
        const reserved = await db.prepare(`SELECT id FROM enrollment_intents
          WHERE device_id = ? AND state IN ('pending', 'claimed') LIMIT 1`).bind(deviceId).first();
        if (reserved) throw new EnrollmentAdminError("device_in_use");
        await assertFence();
        const intent = await issueEnrollmentIntent(db, secret, { deviceId, ...pinned, confirmBrowser });
        if (!intent) throw new EnrollmentAdminError("device_in_use");
        return preparedDraft ? { ...intent, preparedDraft } : intent;
      });
    },
    async reveal(input) {
      validTarget(input);
      const { deviceId, intentId } = input;
      return withDeviceFence(async (assertFence) => {
        await assertFence();
        await checkedIntent({ deviceId, intentId });
        await requireNoLegacy(deviceId);
        await assertFence();
        const revealed = await revealEnrollmentIntent(db, secret, intentId);
        if (!revealed) throw new EnrollmentAdminError("command_changed");
        return revealed;
      });
    },
    async revoke(input) {
      validTarget(input);
      const { deviceId, intentId } = input;
      return withDeviceFence(async (assertFence) => {
        await assertFence();
        await checkedIntent({ deviceId, intentId });
        await assertFence();
        const revoked = await revokeEnrollmentIntent(db, intentId);
        if (!revoked) throw new EnrollmentAdminError("command_changed");
        return revoked;
      });
    }
  });
}
__name(createEnrollmentAdmin, "createEnrollmentAdmin");

// ../cloud/enrollment-v1.mjs
function enrollmentIsEnabled(env) {
  return env.FLEET_ENROLLMENT_PROTOCOL === "intent-v1" && Boolean(env.FLEET_ENROLLMENT_HISTORY);
}
__name(enrollmentIsEnabled, "enrollmentIsEnabled");
function enrollmentContext(env) {
  if (!enrollmentIsEnabled(env)) return;
  const releases = JSON.parse(env.FLEET_ENROLLMENT_CATALOG ?? env.RELEASE_CATALOG);
  const history = mergeEnrollmentBootstrapHistory(JSON.parse(env.FLEET_ENROLLMENT_HISTORY), releases);
  const hosted = Object.fromEntries(Object.entries(releases).filter(([, asset]) => typeof asset?.url === "string"));
  const db = env.TICKETS;
  const admin = createEnrollmentAdmin({
    db,
    secret: env.TICKET_KEY,
    releases: hosted,
    withDeviceFence: /* @__PURE__ */ __name((run) => deviceLease(db, (_options, guard) => run(guard)), "withDeviceFence")
  });
  return {
    admin,
    releases: hosted,
    async list() {
      const { results } = await db.prepare(`SELECT id, device_id, snapshot, state FROM enrollment_intents
        WHERE state IN ('pending','claimed') ORDER BY device_id`).all();
      return results.map((row) => ({
        id: row.device_id,
        intentId: row.id,
        platform: JSON.parse(row.snapshot).platform,
        status: row.state === "pending" ? "pending" : "installing"
      }));
    },
    async registration(deviceId) {
      const row = await db.prepare(`SELECT state FROM enrollment_intents
        WHERE device_id = ? AND state IN ('pending','claimed') LIMIT 1`).bind(deviceId).first();
      return row ? { registration: row.state === "claimed" ? "installing" : "pending" } : void 0;
    },
    lookupApproved(os, version2) {
      return history[os]?.[version2];
    },
    render(origin, os, group) {
      return bootstrapInstaller(origin, os, group, { enrollmentIntent: true });
    },
    // POST from the public entry script: the install code selects the device
    // and its pinned release, and the console renders that bound installer.
    async launch(origin, os, input) {
      if (input === null || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== 1 || typeof input.code !== "string") return;
      const intent = await findEnrollmentIntentByCode(db, input.code);
      const release = intent?.releases[os];
      if (!release || !Object.values(release.assets).every((asset) => asset.url)) return;
      return bootstrapInstaller(origin, os, release, { enrollmentIntent: true, deviceId: intent.deviceId });
    },
    async command(origin, target) {
      const { releases: releases2, deviceId, code } = await admin.reveal(target);
      const commands = Object.fromEntries(Object.entries(releases2).map(([os, release]) => [os, publicInstallCommand(origin, release.platform, code)]));
      const systems = Object.keys(commands);
      const platform = systems.includes("macos") ? "macos" : systems[0];
      return { command: commands[platform], commands, deviceId, platform, durable: true };
    }
  };
}
__name(enrollmentContext, "enrollmentContext");

// ../cloud/management-client.mjs
var consoleBeforeUpgrade = String.raw`
  const theme = document.querySelector('#theme');
  const themeMenu = document.querySelector('#theme-menu');
  const themeOptions = [...themeMenu.querySelectorAll('[data-theme-option]')];
  const themeKey = 'nodrelay-theme';
  const themeNames = { light: '浅色', dark: '深色', system: '跟随系统' };
  let themePreference = 'system';
  function applyTheme(value) {
    themePreference = Object.hasOwn(themeNames, value) ? value : 'system';
    if (themePreference === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = themePreference;
    for (const option of themeOptions) {
      option.setAttribute('aria-checked', String(option.dataset.themeOption === themePreference));
    }
    const label = '外观主题：' + themeNames[themePreference];
    theme.title = label;
    theme.setAttribute('aria-label', label);
    document.querySelector('#theme-icon').setAttribute('href', { dark: '#moon', light: '#sun', system: '#monitor' }[themePreference]);
  }
  try { applyTheme(localStorage.getItem(themeKey)); } catch { applyTheme('system'); }

  function closeTheme(restoreFocus) {
    themeMenu.hidden = true;
    theme.setAttribute('aria-expanded', 'false');
    if (restoreFocus) theme.focus();
  }
  function openTheme(option = themeOptions.find(item => item.dataset.themeOption === themePreference)) {
    themeMenu.hidden = false;
    theme.setAttribute('aria-expanded', 'true');
    option.focus();
  }
  theme.addEventListener('click', () => themeMenu.hidden ? openTheme() : closeTheme(true));
  theme.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    openTheme(event.key === 'ArrowDown' ? themeOptions[0] : themeOptions.at(-1));
  });
  themeMenu.addEventListener('keydown', event => {
    const index = themeOptions.indexOf(document.activeElement);
    const count = themeOptions.length;
    if (event.key === 'Escape') { event.preventDefault(); closeTheme(true); return; }
    const next = { ArrowDown: (index + 1) % count, ArrowUp: (index - 1 + count) % count, Home: 0, End: count - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    themeOptions[next].focus();
  });
  themeMenu.addEventListener('focusout', event => {
    if (!themeMenu.contains(event.relatedTarget) && event.relatedTarget !== theme) closeTheme(false);
  });
  document.addEventListener('click', event => {
    if (!themeMenu.hidden && !theme.parentElement.contains(event.target)) closeTheme(false);
  });
  for (const option of themeOptions) {
    option.addEventListener('click', () => {
      applyTheme(option.dataset.themeOption);
      try { localStorage.setItem(themeKey, themePreference); } catch {}
      closeTheme(true);
    });
  }

`;
var consoleDeviceListScript = String.raw`
  const search = document.querySelector('#device-search');
  const filters = [...document.querySelectorAll('[data-filter]')];
  const tbody = document.querySelector('tbody');
  const listFeedback = document.querySelector('#device-list-feedback');
  const retryList = document.querySelector('#retry-device-list');
  let listRequest;
  let listPollTimer;
  const empty = document.querySelector('#empty');
  let status = 'all';
  function updateRows() {
    const rows = [...tbody.rows];
    const query = search.value.trim().toLowerCase();
    for (const row of rows) {
      row.hidden = (status !== 'all' && row.dataset.state !== status && !(status === 'pending' && row.dataset.state === 'draft')) ||
        !row.querySelector('.device-name').textContent.toLowerCase().includes(query) && !row.dataset.device.toLowerCase().includes(query);
    }
    empty.hidden = rows.some(row => !row.hidden);
    const firstUse = rows.length === 0 && status === 'all' && query === '';
    empty.querySelector('strong').textContent = firstUse ? '还没有设备' : '未找到匹配的设备';
    empty.querySelector('p').textContent = firstUse
      ? document.querySelector('#add').disabled ? '当前没有可用的客户端安装包。' : '点击「添加设备」，开始接入第一台设备。'
      : '试试其他设备名称，或清除筛选。';
    document.querySelector('#clear-filters').hidden = firstUse;
    document.querySelector('table').hidden = !empty.hidden;
  }
  function scheduleDeviceListCheck(delay = 15000) {
    clearTimeout(listPollTimer);
    listPollTimer = undefined;
    if (document.hidden || ![...tbody.rows].some(row => row.dataset.state === 'pending')) return;
    listPollTimer = setTimeout(() => {
      if (!document.hidden && !listRequest) void refreshDeviceList({ background: true });
    }, delay);
  }
  function syncRows(rows) {
    const old = new Map([...tbody.rows].map(row => [row.dataset.device, row]));
    const next = [];
    for (const row of rows) {
      const current = old.get(row.dataset.device);
      if (current && current.innerHTML === row.innerHTML && JSON.stringify(current.dataset) === JSON.stringify(row.dataset)) {
        old.delete(row.dataset.device);
        next.push(current);
        continue;
      }
      if (current) {
        current.replaceWith(row);
        old.delete(row.dataset.device);
      }
      next.push(row);
    }
    for (const removed of old.values()) removed.remove();
    let before = tbody.firstElementChild;
    for (const row of next) {
      if (before === row) before = before.nextElementSibling;
      else tbody.insertBefore(row, before);
    }
  }
  async function refreshDeviceList({ background = false } = {}) {
    listRequest?.abort();
    const controller = new AbortController();
    listRequest = controller;
    retryList.setAttribute('aria-disabled', 'true');
    try {
      const response = await fetch('/', { cache: 'no-store', redirect: 'error',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
      if (!response.ok) throw new Error('List read failed');
      const page = new DOMParser().parseFromString(await response.text(), 'text/html');
      const updated = page.querySelector('tbody');
      if (!updated || !page.querySelector('#device-search')) throw new Error('List unavailable');
      if (listRequest !== controller) return;
      const focused = document.activeElement;
      const focusRow = tbody.contains(focused) ? focused.closest('tr[data-device]') : null;
      const action = focusRow ? focused.dataset.action : undefined;
      syncRows([...updated.rows]);
      for (const filter of filters) {
        const count = page.querySelector('[data-filter="' + filter.dataset.filter + '"] .count');
        if (count) filter.querySelector('.count').textContent = count.textContent;
      }
      listFeedback.textContent = '';
      if (document.activeElement === retryList) search.focus();
      retryList.hidden = true;
      updateRows();
      if (action && document.activeElement === document.body) {
        const replacement = [...tbody.rows].find(row => !row.hidden && row.dataset.device === focusRow.dataset.device);
        const next = replacement && [...replacement.querySelectorAll('button[data-action]')].find(button => button.dataset.action === action);
        (next ?? search).focus();
      }
    } catch {
      if (listRequest === controller) {
        listFeedback.textContent = background ? '暂时无法更新设备状态，稍后自动重试。' : '刷新失败，设备列表仍是上次的结果。';
        retryList.hidden = false;
      }
    } finally {
      if (listRequest === controller) {
        listRequest = undefined;
        retryList.removeAttribute('aria-disabled');
        scheduleDeviceListCheck();
      }
    }
  }
  retryList.addEventListener('click', () => { if (!listRequest) void refreshDeviceList(); });
  document.addEventListener('visibilitychange', () => scheduleDeviceListCheck(0));
  window.addEventListener('pageshow', event => { if (event.persisted) scheduleDeviceListCheck(0); });
  window.addEventListener('online', () => scheduleDeviceListCheck(0));
  search.addEventListener('input', updateRows);
  for (const filter of filters) {
    filter.addEventListener('click', () => {
      status = filter.dataset.filter;
      for (const item of filters) item.setAttribute('aria-pressed', item === filter);
      updateRows();
    });
  }
  document.querySelector('#clear-filters').addEventListener('click', () => {
    search.value = '';
    filters[0].click();
    search.focus();
  });

  updateRows();
  scheduleDeviceListCheck();
`;
var consoleAddressScript = String.raw`
  const copy = document.querySelector('#copy-address');
  const address = document.querySelector('#address');
  const copyFeedback = document.querySelector('#copy-feedback');

  async function copyNodeContents(node) {
    try {
      await navigator.clipboard.writeText(node.textContent);
      return true;
    } catch {
      const range = document.createRange();
      range.selectNodeContents(node);
      node.focus();
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return false;
    }
  }

  copy.addEventListener('click', async () => {
    const copied = await copyNodeContents(address);
    const result = copied ? '已复制' : '按快捷键复制';
    copy.querySelector('span').textContent = result;
    copyFeedback.textContent = copied ? 'Portal 地址已复制' : '已选中 Portal 地址，可用系统复制快捷键。';
  });


  copy.disabled = !address.textContent.startsWith('https://');
`;
var consoleUpgradeScript = String.raw`
  async function requestJson(path, options = {}) {
    const signal = options.signal ?? AbortSignal.timeout(options.method === 'POST' ? 45000 : 12000);
    let response, data;
    try {
      response = await fetch(path, {
        ...options, signal,
        headers: { Accept: 'application/json' },
        redirect: 'error',
        cache: 'no-store',
      });
      data = await response.json().catch(() => null);
      signal.throwIfAborted();
    } catch (error) {
      if (options.signal?.aborted) throw error;
      if (options.method === 'POST') throw new Error('未能确认操作结果。请先刷新并核对状态，不要直接重复提交。');
      throw new Error('暂时无法读取，请检查连接后再试。');
    }
    if (!response.ok || !data) throw new Error(data?.error || '请求失败，请检查管理台连接后重试。');
    return data;
  }

  function post(path, fields) {
    return requestJson(path, { method: 'POST', body: new URLSearchParams(fields) });
  }

  const upgrade = document.querySelector('#open-upgrade');
  const versionBadge = document.querySelector('#brand-version');
  const upgradeDialog = document.querySelector('#upgrade-dialog');
  const upgradeDescription = document.querySelector('#upgrade-description');
  const upgradeStatus = document.querySelector('#upgrade-status');
  const confirmUpgrade = document.querySelector('#confirm-upgrade');
  const reconcileUpgrade = document.querySelector('#reconcile-upgrade');
  const closeUpgrade = document.querySelector('#close-upgrade-button');
  function hideUpgradeAction(action) {
    if (upgradeDialog.open && document.activeElement === action) closeUpgrade.focus();
    action.hidden = true;
  }
  let pendingUpgrade;
  let releaseCheck;
  let upgradeStatusRequest;
  let upgrading;
  let upgradeView;
  const activePhases = new Set(['uploading', 'staged', 'deploying']);
  const phaseText = { uploading: '上传结果尚未确认。', staged: '已记录候选版本，切换结果尚未确认。',
    deploying: '版本切换结果尚未确认。' };
  const runningPhaseText = {
    uploading: '2/3 · 签名已校验，正在上传新版本。',
    staged: '2/3 · 新版本已上传，准备切换流量。',
    deploying: '3/3 · 正在确认 Cloudflare 是否已切换流量。',
  };
  function historicalUpgradeText(version, currentVersion) {
    const respondingVersion = currentVersion ? '当前页面版本 v' + currentVersion + '。' : '';
    return respondingVersion + '历史记录：Cloudflare 曾确认切换至 v' + version + '。这不是对当前流量或应用状态的核对。';
  }
  function cutoverText(result) {
    return result.status === 'previously_confirmed' ? historicalUpgradeText(result.version)
      : 'Cloudflare 已确认切换流量。请刷新页面，检查登录和设备列表。';
  }
  function markUpgradeRecovery(recorded = false) {
    upgrade.hidden = false;
    upgrade.setAttribute('data-mode', 'recovery');
    upgrade.setAttribute('aria-label', '查看升级状态');
    upgrade.setAttribute('title', recorded ? '有未完成的升级，查看状态' : '升级结果尚未确认，查看状态');
  }
  function showUpgradeDialog() {
    upgradeView = { foreground: !document.hidden };
    upgradeDialog.showModal();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && upgradeView) upgradeView.foreground = false;
  });
  function currentUpgradeView(view) {
    return upgradeView === view && view.foreground && upgradeDialog.open && !document.hidden;
  }
  function monitorUpgradeProgress(operationId, version, view) {
    const controller = new AbortController();
    let timer;
    const read = async () => {
      if (controller.signal.aborted || !currentUpgradeView(view)) return;
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(6000)]);
      const status = await requestJson('/admin/upgrade/status', { signal }).catch(() => null);
      if (controller.signal.aborted || !currentUpgradeView(view)) return;
      if (status?.operationId === operationId && status.version === version && Object.hasOwn(runningPhaseText, status.phase)) {
        markUpgradeRecovery(true);
        const message = runningPhaseText[status.phase];
        if (upgradeStatus.textContent !== message) upgradeStatus.textContent = message;
      }
      timer = setTimeout(read, 2500);
    };
    timer = setTimeout(read, 1000);
    return () => { clearTimeout(timer); controller.abort(); };
  }
  async function reloadConfirmedUpgrade(result, operationId, version, view) {
    if (result.status !== 'deployment_confirmed' || result.operationId !== operationId ||
        result.version !== version || !currentUpgradeView(view)) return;
    upgradeStatus.textContent = 'Cloudflare 已确认切换流量。正在检查新版本是否已能访问…';
    for (let i = 0; i < 4; i++) {
      if (!currentUpgradeView(view)) return;
      const state = await requestJson('/admin/upgrade/status', { signal: AbortSignal.timeout(3000) }).catch(() => null);
      if (!currentUpgradeView(view)) return;
      if (state?.phase === 'confirmed' && state.operationId === operationId &&
          state.version === version && state.currentVersion === version) {
        upgradeStatus.textContent = '新版本已上线，正在刷新管理台…';
        window.location.reload();
        return;
      }
      if (i < 3) await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (currentUpgradeView(view)) upgradeStatus.textContent = cutoverText(result);
  }
  function showUpgradeHeader(feed, status) {
    const version = status?.currentVersion ?? feed?.currentVersion;
    if (version) {
      versionBadge.hidden = false;
      versionBadge.textContent = 'v' + version;
    }
    // Recovery is not a new-version offer, even if a newer release also exists.
    const recovery = activePhases.has(status?.phase);
    const available = Boolean(feed?.nextVersion && feed.nextVersion !== version);
    upgrade.setAttribute('data-mode', recovery ? 'recovery' : 'upgrade');
    upgrade.setAttribute('aria-label', recovery ? '查看升级状态' : '升级');
    upgrade.setAttribute('title', recovery ? '有未完成的升级，查看状态' : '有新版本可升级');
    upgrade.hidden = !recovery && !available;
  }
  async function readUpgradeHeader() {
    const [feed, status] = await Promise.all([
      requestJson('/admin/upgrade/check').catch(() => null),
      requestJson('/admin/upgrade/status').catch(() => null),
    ]);
    if (!upgrading) showUpgradeHeader(feed, status);
  }
  void readUpgradeHeader();
  upgrade.addEventListener('click', async () => {
    if (upgradeDialog.open) return;
    upgradeStatusRequest?.abort();
    const controller = new AbortController();
    upgradeStatusRequest = controller;
    const isCurrent = () => upgradeDialog.open && upgradeStatusRequest === controller;
    upgradeDescription.textContent = '正在检查签名升级包。';
    upgradeStatus.textContent = '正在读取升级记录…';
    confirmUpgrade.hidden = true;
    if (upgrading) {
      // Let the in-flight POST finish and render its result. An overlapping
      // GET could overwrite that result or lose the retry button.
      const checking = upgrading === 'reconcile';
      reconcileUpgrade.hidden = !checking;
      upgradeStatus.textContent = checking ? '正在向 Cloudflare 核对实际生效的版本…'
        : '正在等待 Cloudflare 响应，请勿重复提交。';
      showUpgradeDialog();
      return;
    }
    reconcileUpgrade.hidden = true;
    pendingUpgrade = undefined;
    showUpgradeDialog();
    try {
      const options = { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) };
      const [status, fresh] = await Promise.all([
        requestJson('/admin/upgrade/status', options),
        requestJson('/admin/upgrade/check', options).catch(() => null),
      ]);
      if (!isCurrent()) return;
      const { phase, operationId, version, currentVersion } = status;
      showUpgradeHeader(fresh, status);
      releaseCheck = fresh;
      const target = fresh?.nextVersion;
      upgradeDescription.textContent = target
        ? 'v' + fresh.currentVersion + ' → v' + target + '。域名、登录、数据库和已连接设备不变。' +
          (fresh.includesEnrollment ? ' 本次会更新新设备的接入方式，旧命令仍按原版本运行。' : '')
        : fresh?.available === false ? '此管理台尚未配置在线升级。'
          : fresh?.currentVersion ? 'v' + fresh.currentVersion + ' 已是当前渠道最新版本。'
            : '暂时无法核验是否有新版本。';
      if (activePhases.has(phase)) {
        if (operationId && !upgrading) {
          pendingUpgrade = operationId;
          reconcileUpgrade.hidden = false;
          upgradeStatus.textContent = phaseText[phase] + ' 可以核对 Cloudflare 实际状态，不会重复提交。';
        } else upgradeStatus.textContent = '正在等待 Cloudflare 响应，请勿重复提交。';
      } else {
        upgradeStatus.textContent = upgrading ? '正在等待 Cloudflare 响应。'
          : phase === 'confirmed' ? historicalUpgradeText(version, currentVersion) : '';
        if (target && target === currentVersion) {
          releaseCheck = undefined;
          upgradeDescription.textContent = '此页面已由 v' + currentVersion + ' 响应，无需重复提交该版本。';
        }
        confirmUpgrade.hidden = !releaseCheck?.nextVersion || Boolean(upgrading);
      }
    } catch {
      if (isCurrent()) upgradeStatus.textContent = '暂时无法读取升级记录，请稍后重新打开。';
    }
  });
  reconcileUpgrade.addEventListener('click', async () => {
    if (!upgradeDialog.open || reconcileUpgrade.hidden || !pendingUpgrade || upgrading) return;
    const view = upgradeView;
    const operationId = pendingUpgrade;
    upgrading = 'reconcile';
    reconcileUpgrade.setAttribute('aria-disabled', 'true');
    upgradeStatus.textContent = '正在向 Cloudflare 核对实际生效的版本…';
    try {
      const result = await post('/admin/upgrade/reconcile', { operationId });
      if (result.operationId && result.operationId !== operationId) throw new Error('核对结果不属于本次升级。请先查看升级记录。');
      if (result.status === 'baseline_active_upload_unconfirmed') {
        const after = Number.isSafeInteger(result.retryAfter) ? new Date(result.retryAfter).toLocaleTimeString() : '';
        upgradeStatus.textContent = 'Cloudflare 流量仍指向旧版，上传结果无法确认。本次核对没有重新上传或切换。' +
          (after ? '如果到 ' + after + ' 仍没有出现这次上传的版本，再核对一次即可关闭记录并重新升级。' : '请保留记录，不要重新提交。');
        return;
      }
      if (result.status === 'upload_abandoned') {
        // The journal now reads as settled: reopening the dialog offers the release again.
        upgradeStatus.textContent = '已确认上次上传没有到达 Cloudflare，记录已关闭。关闭此窗口后重新打开，即可重新升级。';
        pendingUpgrade = undefined;
        hideUpgradeAction(reconcileUpgrade);
        return;
      }
      if (result.status === 'baseline_active_candidate_staged') {
        upgradeStatus.textContent = '候选版本已核对，Cloudflare 流量仍指向旧版。本次核对没有切换。请保留记录，不要重新提交。';
        return;
      }
      if (result.status === 'baseline_active_rollout_unconfirmed') {
        upgradeStatus.textContent = '核对时 Cloudflare 流量仍全部指向旧版，候选版本已上传，但上次切换的结果仍未确认。请稍后再核对，不要重复提交。';
        return;
      }
      if (!['deployment_confirmed', 'previously_confirmed'].includes(result.status)) throw new Error('尚未确认已切换。');
      upgradeStatus.textContent = cutoverText(result);
      pendingUpgrade = undefined;
      releaseCheck = undefined;
      hideUpgradeAction(reconcileUpgrade);
      await reloadConfirmedUpgrade(result, operationId, result.version, view);
    } catch (error) { upgradeStatus.textContent = error.message; }
    finally { upgrading = undefined; reconcileUpgrade.removeAttribute('aria-disabled'); }
  });
  confirmUpgrade.addEventListener('click', async () => {
    const version = releaseCheck?.nextVersion;
    const digest = releaseCheck?.manifestSha256
      ? { manifestSha256: releaseCheck.manifestSha256 } : releaseCheck?.releaseSha256 && { releaseSha256: releaseCheck.releaseSha256 };
    if (!upgradeDialog.open || confirmUpgrade.hidden || !version || !digest || upgrading) return;
    const operationId = crypto.randomUUID();
    const view = upgradeView;
    upgrading = 'start';
    hideUpgradeAction(confirmUpgrade);
    upgradeStatus.textContent = '1/3 · 正在校验签名和目标版本。可以关闭此窗口，稍后查看结果。';
    markUpgradeRecovery();
    const stopProgress = monitorUpgradeProgress(operationId, version, view);
    try {
      const result = await post('/admin/upgrade/start', { version, ...digest, operationId });
      stopProgress();
      if (result.operationId !== operationId || result.version !== version ||
          !['deployment_confirmed', 'previously_confirmed'].includes(result.status)) {
        throw new Error('发布结果未确认。请先核对升级状态。');
      }
      upgradeStatus.textContent = cutoverText(result);
      releaseCheck = undefined;
      await reloadConfirmedUpgrade(result, operationId, version, view);
    } catch (error) {
      stopProgress();
      upgradeStatus.textContent = error.message;
      const state = await requestJson('/admin/upgrade/status').catch(() => null);
      if (activePhases.has(state?.phase) && state.operationId) markUpgradeRecovery(true);
      else if (state?.phase === 'idle') showUpgradeHeader(releaseCheck, state);
      else markUpgradeRecovery();
      if (state?.phase === 'confirmed' && state.operationId === operationId && state.version === version) {
        releaseCheck = undefined;
        showUpgradeHeader(null, state);
        if (upgradeDialog.open) {
          upgradeDescription.textContent = '已找到本次升级记录，无需重复提交。';
          upgradeStatus.textContent = historicalUpgradeText(state.version, state.currentVersion);
        }
      } else if (upgradeDialog.open && activePhases.has(state?.phase) && state.operationId) {
        pendingUpgrade = state.operationId;
        reconcileUpgrade.hidden = false;
      }
    } finally { upgrading = undefined; }
  });
`;
var consoleAfterUpgrade = String.raw`
  const callbackPath = '/admin/client-callbacks';
  const callbackDialog = document.querySelector('#callback-dialog');
  const callbackTitle = document.querySelector('#callback-title');
  const callbackOverview = document.querySelector('#callback-overview');
  const callbackStatus = document.querySelector('#callback-state');
  const callbackSummary = document.querySelector('#callback-summary');
  const callbackFeedback = document.querySelector('#callback-feedback');
  const callbackList = document.querySelector('#callback-configured-list');
  const callbackForm = document.querySelector('#callback-form');
  const callbackName = document.querySelector('#callback-name');
  const callbackAddress = document.querySelector('#callback-url');
  const callbackSaveError = document.querySelector('#callback-save-error');
  const callbackClose = callbackDialog.querySelector('.dialog-close');
  const saveCallback = document.querySelector('#save-callback');
  const cancelCallback = document.querySelector('#cancel-callback');
  const addClient = document.querySelector('#add-client');
  const addWorkBuddy = document.querySelector('#add-workbuddy');
  const presetRows = callbackDialog.querySelectorAll('[data-preset-name]');
  let callbackFormTrigger;
  let allowedCallbacks = new Set();
  let callbackSubmitting = false;
  let callbackLoad;

  function callbackText(element, message) {
    element.textContent = message;
    element.hidden = !message;
  }

  function callbackError(input, message) {
    callbackText(document.getElementById(input.id + '-error'), message);
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  function resetCallbackForm() {
    callbackTitle.textContent = '客户端回调配置';
    callbackForm.reset();
    callbackError(callbackName, '');
    callbackError(callbackAddress, '');
    callbackText(callbackSaveError, '');
    callbackForm.hidden = true;
    callbackOverview.hidden = false;
  }

  function callbackRow(uri, name, enabled) {
    const row = document.createElement('li');
    row.className = 'callback-client';
    const identity = document.createElement('div');
    identity.className = 'callback-identity';
    const label = document.createElement('strong');
    label.textContent = name;
    const tag = document.createElement('span');
    tag.className = 'callback-tag';
    tag.textContent = enabled ? '已配置' : '已保存';
    identity.append(label, tag);
    const field = document.createElement('div');
    field.className = 'callback-uri';
    const address = document.createElement('code');
    address.textContent = uri;
    field.append(address);
    row.append(identity, field);
    return row;
  }

  function renderCallbacks(state) {
    const { allowedUris = [], clients = [], presets = [] } = state;
    const enabled = state.enabled === true;
    allowedCallbacks = new Set(allowedUris);
    const labels = new Map(presets.flatMap(({ client, uris }) => uris.map(uri => [uri, client])));
    for (const { redirectUri, clientName } of clients) labels.set(redirectUri, clientName);
    callbackStatus.textContent = enabled ? '已启用' : '未启用';
    callbackSummary.textContent = enabled
      ? 'Portal 已设 ' + allowedCallbacks.size + ' 条回调规则。' +
        (state.allowLocalhost ? ' 允许 localhost。' : '') + (state.allowLoopback ? ' 允许环回地址。' : '')
      : 'Portal 的动态客户端注册未启用。';
    addClient.disabled = addWorkBuddy.disabled = !enabled;
    callbackList.replaceChildren(...[...allowedCallbacks].map(uri =>
      callbackRow(uri, labels.get(uri) || URL.parse(uri)?.hostname || '现有回调', enabled)));
    document.querySelector('#callback-configured').hidden = !allowedCallbacks.size;
    for (const row of presetRows) {
      for (const address of row.querySelectorAll('[data-callback-address]')) {
        const uri = address.dataset.callbackAddress || address.textContent;
        const configured = allowedCallbacks.has(uri);
        const status = address.parentElement.querySelector('span');
        status.dataset.label ??= status.textContent;
        status.textContent = status.dataset.label + ' · ' +
          (configured ? (enabled ? '已配置' : '已保存') : '未配置');
      }
    }
    const workBuddyStatus = document.querySelector('#workbuddy-state');
    const configured = clients.some(({ clientName }) => clientName.toLowerCase() === 'workbuddy');
    workBuddyStatus.textContent = configured ? (enabled ? '已配置' : '已保存') : '待配置';
    workBuddyStatus.dataset.tone = configured ? '' : 'pending';
  }

  const retryCallbacks = document.querySelector('#retry-callback-read');
  async function loadCallbacks() {
    retryCallbacks.hidden = true;
    resetCallbackForm();
    callbackText(callbackFeedback, '');
    addClient.disabled = addWorkBuddy.disabled = true;
    document.querySelector('#callback-configured').hidden = true;
    document.querySelector('#callback-presets').hidden = true;
    callbackStatus.textContent = '读取中';
    callbackSummary.textContent = '正在读取 Portal 中的配置…';
    const loading = requestJson(callbackPath);
    callbackLoad = loading;
    try {
      const state = await loading;
      if (callbackLoad !== loading || !callbackDialog.open) return;
      renderCallbacks(state);
      document.querySelector('#callback-presets').hidden = false;
    } catch (error) {
      if (callbackLoad !== loading || !callbackDialog.open) return;
      callbackStatus.textContent = '读取失败';
      callbackSummary.textContent = '暂时无法读取 Portal 配置。';
      callbackText(callbackFeedback, error.message);
      retryCallbacks.hidden = false;
    }
  }
  document.querySelector('#open-callbacks').addEventListener('click', () => {
    callbackDialog.showModal();
    void loadCallbacks();
  });
  retryCallbacks.addEventListener('click', loadCallbacks);

  for (const trigger of [addClient, addWorkBuddy]) {
    trigger.addEventListener('click', () => {
      callbackFormTrigger = trigger;
      callbackText(callbackFeedback, '');
      callbackOverview.hidden = true;
      callbackForm.hidden = false;
      const client = trigger.dataset.client;
      callbackTitle.textContent = client ? '填写 WorkBuddy 回调' : '添加其他客户端';
      callbackName.value = client || '';
      (client ? callbackAddress : callbackName).focus();
    });
  }

  function cancelCallbackForm() {
    resetCallbackForm();
    callbackFormTrigger.focus();
  }

  cancelCallback.addEventListener('click', cancelCallbackForm);
  callbackDialog.addEventListener('cancel', event => {
    if (callbackForm.hidden) return;
    event.preventDefault();
    if (!callbackSubmitting) cancelCallbackForm();
  });
  for (const input of [callbackName, callbackAddress]) {
    input.addEventListener('input', () => {
      callbackError(input, '');
      callbackText(callbackSaveError, '');
    });
  }
  callbackForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (callbackSubmitting) return;
    const clientName = callbackName.value.trim();
    const redirectUri = callbackAddress.value.trim();
    const nameError = clientName ? '' : '请填写客户端名称。';
    const uriError = !redirectUri ? '请填写回调地址。'
      : allowedCallbacks.has(redirectUri) ? '该回调地址已配置。' : '';
    callbackError(callbackName, nameError);
    callbackError(callbackAddress, uriError);
    if (nameError || uriError) {
      (nameError ? callbackName : callbackAddress).focus();
      return;
    }
    callbackSubmitting = true;
    saveCallback.disabled = cancelCallback.disabled = callbackClose.disabled = true;
    saveCallback.textContent = '正在保存…';
    callbackText(callbackSaveError, '');
    try {
      renderCallbacks(await post(callbackPath, { clientName, redirectUri }));
      resetCallbackForm();
      callbackText(callbackFeedback, '回调地址已保存到 Portal。');
      callbackFeedback.focus();
    } catch (error) {
      callbackText(callbackSaveError, error.message);
    } finally {
      callbackSubmitting = false;
      saveCallback.disabled = cancelCallback.disabled = callbackClose.disabled = false;
      saveCallback.textContent = '保存';
    }
  });

`;
var consoleEnrollmentScript = String.raw`
  const addDialog = document.querySelector('#add-dialog');
  const addTitle = document.querySelector('#add-title');
  const addForm = document.querySelector('#add-device-form');
  const addFeedback = document.querySelector('#add-feedback');
  const saveDevice = document.querySelector('#save-device');
  const setupForm = document.querySelector('#setup-device-form');
  const setupFeedback = document.querySelector('#setup-feedback');
  const issue = document.querySelector('#issue-command');
  const browserConsent = document.querySelector('#browser-consent');
  const browserConsentOption = document.querySelector('#confirm-browser');
  const addClose = [...addDialog.querySelectorAll('[form="close-add"]')];
  const commandResult = document.querySelector('#device-command-result');
  const command = document.querySelector('#device-command');
  const copyCommand = document.querySelector('#copy-device-command');
  const commandFeedback = document.querySelector('#device-command-feedback');
  const commandSystems = document.querySelector('#device-command-systems');
  const platformChoices = setupForm.querySelector('.platform-tabs');
  // One durable command per device covers every hosted system: choosing a
  // system only swaps the displayed text, so opening shows a command at once.
  const anySystem = addDialog.dataset.anySystem === 'true';
  const anySystemConsent = addDialog.dataset.browserConsent === 'true';
  const issueLabel = issue.textContent;
  const setupHint = document.querySelector('#setup-device-hint');
  const setupHintText = setupHint.textContent;
  let issuing = false;
  let issued = false;
  let enrollment;
  let expiryTimer;
  let pollTimer;
  let pendingPoll;
  let addOriginDeviceId;
  const expiryLabel = document.querySelector('#device-command-expiration');
  const enrollmentFeedback = document.querySelector('#device-enrollment-progress');
  const reportEnrollment = text => {
    if (enrollmentFeedback.textContent !== text) enrollmentFeedback.textContent = text;
  };

  function hideCommand(hideText = true) {
    if (addDialog.open && (document.activeElement === copyCommand || (hideText && document.activeElement === command))) {
      enrollmentFeedback.focus();
    }
    copyCommand.disabled = true;
    command.hidden = hideText;
    if (hideText) commandSystems.hidden = true;
  }

  function showCommandPanel() {
    commandResult.hidden = false;
    enrollmentFeedback.focus();
    addForm.hidden = true;
    setupForm.hidden = true;
  }

  function renderExpiry() {
    if (!enrollment || !addDialog.open || document.hidden) return;
    if (enrollment.durable) {
      expiryLabel.textContent = enrollment.claimed || enrollment.done ? '' : '未领取的命令不会过期，可从设备行撤销。';
      if (!enrollment.verified || enrollment.claimed || enrollment.done || !command.textContent) hideCommand();
      else {
        copyCommand.disabled = false;
        command.hidden = false;
        commandSystems.hidden = !commandSystems.querySelector('input');
      }
      return;
    }
    const seconds = Math.max(0, Math.ceil((enrollment.expires - performance.now()) / 1000));
    expiryLabel.textContent = seconds === 0 ? '命令已过期，不能再发起安装。'
      : '命令还可使用 ' + Math.floor(seconds / 60) + ' 分 ' + String(seconds % 60).padStart(2, '0') + ' 秒';
    const unavailable = !seconds || enrollment.done === true;
    if (unavailable && document.activeElement === copyCommand) enrollmentFeedback.focus();
    copyCommand.disabled = unavailable;
    clearTimeout(expiryTimer);
    if (seconds && !enrollment.done) expiryTimer = setTimeout(renderExpiry, 1000);
  }

  function pauseEnrollment() {
    clearTimeout(expiryTimer);
    clearTimeout(pollTimer);
    pendingPoll?.abort();
    pendingPoll = undefined;
    if (enrollment?.durable) {
      enrollment.verified = false;
      hideCommand();
    }
  }

  async function checkEnrollment() {
    const current = enrollment;
    if (!current || current.done || !addDialog.open || document.hidden || pendingPoll) return;
    const controller = new AbortController();
    pendingPoll = controller;
    try {
      const query = new URLSearchParams({ deviceId: current.deviceId });
      if (current.durable) query.set('intentId', current.intentId);
      const data = await requestJson('/admin/devices/enrollment?' + query, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(6000)]),
      });
      if (pendingPoll !== controller || enrollment !== current || !addDialog.open || document.hidden) return;
      if (['active', 'disabled', 'revoked'].includes(data.registration)) {
        current.done = true;
        clearTimeout(expiryTimer);
        command.textContent = '';
        expiryLabel.textContent = '';
        commandFeedback.hidden = true;
        reportEnrollment(data.registration === 'active'
          ? '设备已接入 Portal。可在设备列表查看连接详情。'
          : data.registration === 'revoked' ? '这条安装命令已撤销。' : '这台设备的接入已停用。');
        hideCommand();
        void refreshDeviceList();
      } else if (data.registration === 'installing') {
        current.claimed = true;
        command.textContent = '';
        commandFeedback.hidden = true;
        expiryLabel.textContent = '';
        reportEnrollment('目标设备已领取命令，Portal 尚未确认接入。如果终端显示错误，请以终端提示为准。');
        hideCommand();
      } else if (data.registration === 'pending') {
        current.verified = true;
        if (current.durable) renderExpiry();
        reportEnrollment(current.started + 60000 > performance.now()
          ? '等待设备接入。Portal 确认后，状态会自动更新。'
          : 'Portal 尚未确认设备接入。如果已执行安装命令，请查看目标设备的终端结果；无需在这里重复生成命令。');
      } else {
        throw new Error('Unknown registration status');
      }
    } catch {
      if (pendingPoll !== controller || enrollment !== current || !addDialog.open || document.hidden) return;
      reportEnrollment('暂时查不到接入状态，不代表安装失败。会自动重试。');
      if (current.durable) {
        current.verified = false;
        hideCommand();
      }
    } finally {
      if (pendingPoll === controller) {
        pendingPoll = undefined;
        if (enrollment === current && !current.done && addDialog.open && !document.hidden) {
          const age = performance.now() - current.started;
          pollTimer = setTimeout(checkEnrollment, age < 60000 ? 2500 : age < 600000 ? 10000 : 30000);
        }
      }
    }
  }

  document.addEventListener('visibilitychange', () => {
    pauseEnrollment();
    if (!document.hidden && enrollment && !enrollment.done) {
      renderExpiry();
      checkEnrollment();
    }
  });
  window.addEventListener('online', () => {
    if (!document.hidden && enrollment && !enrollment.done) {
      clearTimeout(pollTimer);
      void checkEnrollment();
    }
  });
  function configureBrowserConsent() {
    const bundled = platformChoices.disabled ? anySystemConsent
      : setupForm.querySelector('input[name="platform"]:checked')?.dataset.browser === 'true';
    browserConsent.hidden = !bundled;
    browserConsentOption.disabled = !bundled;
    browserConsentOption.required = bundled;
    browserConsentOption.checked = false;
  }
  function resetAddDialog() {
    const refresh = issued;
    pauseEnrollment();
    enrollment = undefined;
    issued = false;
    addForm.reset();
    for (const option of setupForm.querySelectorAll('input[name="platform"]')) {
      if (option.dataset.lockedByDevice === 'true') {
        option.disabled = false;
        delete option.dataset.lockedByDevice;
      }
    }
    setupForm.reset();
    setupForm.hidden = true;
    setupFeedback.hidden = true;
    platformChoices.disabled = false;
    platformChoices.hidden = false;
    issue.textContent = issueLabel;
    setupHint.textContent = setupHintText;
    commandSystems.replaceChildren(commandSystems.querySelector('legend'));
    commandSystems.hidden = true;
    saveDevice.disabled = false;
    issue.disabled = false;
    configureBrowserConsent();
    addTitle.textContent = '添加设备';
    addForm.hidden = false;
    commandResult.hidden = true;
    command.textContent = '';
    copyCommand.disabled = true;
    copyCommand.querySelector('span').textContent = '复制';
    commandFeedback.hidden = true;
    commandFeedback.textContent = '';
    expiryLabel.textContent = '';
    enrollmentFeedback.textContent = '';
    addFeedback.hidden = true;
    if (refresh) void refreshDeviceList();
  }
  setupForm.addEventListener('change', event => { if (event.target.name === 'platform') configureBrowserConsent(); });
  document.querySelector('#add').addEventListener('click', () => {
    if (issuing || addDialog.open) return;
    resetAddDialog();
    addDialog.showModal();
  });
  addDialog.addEventListener('cancel', event => { if (issuing) event.preventDefault(); });
  addDialog.addEventListener('close', () => {
    if (addDialog.open) return;
    const originId = addOriginDeviceId;
    addOriginDeviceId = undefined;
    resetAddDialog();
    if (originId && document.activeElement === document.body) {
      const currentRow = [...tbody.rows].find(row => !row.hidden && row.dataset.device === originId);
      (currentRow?.querySelector('button[data-action="status"], button[data-action="setup-command"], button[data-action="intent-command"]') ?? search).focus();
    }
  });
  function showDeviceCommand(result) {
    issued = true;
    const systems = Array.isArray(result.systems) && result.systems.length ? result.systems
      : [{ id: '', label: result.platform, command: result.command, instructions: result.instructions }];
    const show = system => {
      command.textContent = system.command;
      document.querySelector('#device-command-target').textContent = result.deviceId + ' · ' + system.label;
      document.querySelector('#command-instructions').textContent = system.instructions ?? result.instructions;
      copyCommand.querySelector('span').textContent = '复制';
      commandFeedback.hidden = true;
    };
    commandSystems.replaceChildren(commandSystems.querySelector('legend'));
    if (systems.length > 1) {
      for (const system of systems) {
        const choice = document.createElement('label');
        const input = Object.assign(document.createElement('input'), {
          type: 'radio', name: 'command-system', value: system.id, className: 'sr-only', checked: system.id === result.system,
        });
        const text = document.createElement('span');
        text.textContent = system.label;
        input.addEventListener('change', () => { if (input.checked) show(system); });
        choice.append(input, text);
        commandSystems.append(choice);
      }
    }
    show(systems.find(system => system.id === result.system) ?? systems[0]);
    command.hidden = false;
    commandSystems.hidden = systems.length < 2;
    addFeedback.hidden = true;
    const expires = result.durable ? undefined
      : performance.now() + Math.max(0, result.expiresAt - result.serverTime) * 1000;
    enrollment = { deviceId: result.deviceId, intentId: result.intentId, expires, durable: result.durable === true,
      started: performance.now() };
    reportEnrollment('正在查询设备接入状态…');
    renderExpiry();
    checkEnrollment();
    addTitle.textContent = '设备连接指令';
    if (commandResult.hidden) showCommandPanel();
    if (!result.durable && !command.hidden) command.focus();
  }
  function beginEnrollmentWrite(button, feedback, message) {
    issuing = true;
    button.disabled = true;
    for (const control of addClose) control.disabled = true;
    feedback.hidden = false;
    feedback.textContent = message;
  }
  function endEnrollmentWrite(button) {
    issuing = false;
    button.disabled = false;
    for (const control of addClose) control.disabled = false;
  }
  addForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (issuing || issued) return;
    beginEnrollmentWrite(saveDevice, addFeedback, '正在添加设备…');
    try {
      const { draftSaved } = await post(addForm.action, new FormData(addForm));
      if (!draftSaved) throw new Error('无法确认设备已保存，请刷新列表核对。');
      issued = true;
      addDialog.close();
    } catch (error) {
      addFeedback.textContent = error.message;
      void refreshDeviceList();
    } finally { endEnrollmentWrite(saveDevice); }
  });
  setupForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (issuing || issued) return;
    beginEnrollmentWrite(issue, setupFeedback, '正在生成安装命令…');
    try {
      const result = await post(setupForm.action, new FormData(setupForm));
      if (!result.command) {
        issued = true;
        addDialog.close();
      } else showDeviceCommand(result);
    } catch (error) {
      setupFeedback.textContent = error.message;
      void refreshDeviceList();
    } finally { endEnrollmentWrite(issue); }
  });
  copyCommand.addEventListener('click', async () => {
    const current = enrollment;
    if (!current || copyCommand.disabled) return;
    const copied = await copyNodeContents(command);
    if (current !== enrollment || current.done || current.claimed || copyCommand.disabled || !addDialog.open) return;
    copyCommand.querySelector('span').textContent = copied ? '已复制' : '按快捷键复制';
    commandFeedback.textContent = copied ? '已复制完整指令。' : '已选中完整指令，请使用系统复制快捷键。';
    commandFeedback.hidden = false;
  });

`;
var consoleDeviceDetails = String.raw`
  const detail = document.querySelector('#device-dialog');
  const detailTitle = document.querySelector('#device-dialog-title');
  const summary = document.querySelector('#device-summary');
  const details = document.querySelector('#device-details');
  const detailFeedback = document.querySelector('#device-feedback');
  const riskMark = document.querySelector('#risk-mark');
  const detailDismiss = document.querySelector('#detail-dismiss');
  const detailConfirm = document.querySelector('#detail-confirm');
  const detailClose = [...detail.querySelectorAll('[form="close-detail"], #detail-dismiss')];
  const stateLabels = { pending: '等待设备接入', active: '已注册到 Portal', disabled: '已标记停用' };
  const tunnelLabels = { healthy: '运行正常', degraded: '连接不稳定', down: '未连接',
    inactive: '未连接', unregistered: '尚未建立', unverified: '未确认', check_failed: '无法查询' };
  const diagnosticLabels = { connection_failed: '连接失败或超时', invalid_response: '响应无法解析',
    protocol_mismatch: 'MCP 协议不匹配', catalog_mismatch: '工具目录与要求不符', http_error: '请求未通过',
    timeout: '查询超时', authorization: 'Cloudflare 授权不可用', check_failed: '检查未完成' };
  function describe(base, diagnostic) {
    if (!diagnostic) return base;
    return [base, diagnosticLabels[diagnostic.reason], diagnostic.httpStatus && 'HTTP ' + diagnostic.httpStatus,
      diagnostic.codes?.length && '错误码 ' + diagnostic.codes.join('、')].filter(Boolean).join(' · ');
  }
  const mcpLabels = { catalog_verified: '目录已验证', unavailable: '目录无法访问', unverified: '等待验证',
    not_enabled: '未启用', disabled: '已停用' };
  let selected;
  let saving = false;
  let refreshOnClose = false;

  function showField(field, value) {
    const label = document.querySelector('#' + field + '-label');
    const output = document.querySelector('#' + field + '-detail');
    if (label) label.hidden = !value;
    output.hidden = Boolean(label) && !value;
    output.textContent = value || '未查询';
  }

  tbody.addEventListener('click', async event => {
    const button = event.target.closest('button[data-action]');
    if (!button || !tbody.contains(button)) return;
    const row = button.closest('tr');
    const action = button.dataset.action;
    if (action === 'setup-command') {
      if (issuing || addDialog.open || button.disabled) return;
      resetAddDialog();
      addOriginDeviceId = row.dataset.device;
      addTitle.textContent = '安装命令';
      addForm.hidden = true;
      setupForm.hidden = false;
      setupForm.querySelector('input[name="deviceId"]').value = row.dataset.device;
      document.querySelector('#setup-device-target').textContent = row.querySelector('.device-name').textContent;
      if (anySystem) {
        // No system choice up front: the dialog shows macOS first and every
        // other hosted system's command for the same code.
        platformChoices.disabled = true;
        platformChoices.hidden = true;
        configureBrowserConsent();
        addDialog.showModal();
        if (anySystemConsent) {
          issue.textContent = '显示安装命令';
          setupHint.textContent = '确认浏览器工具权限。';
          setupFeedback.hidden = false;
          setupFeedback.textContent = '此版本安装包包含浏览器工具，确认后显示安装命令。';
          browserConsentOption.focus();
        } else setupForm.requestSubmit();
        return;
      }
      const locked = row.dataset.platform;
      if (locked) {
        for (const option of setupForm.querySelectorAll('input[name="platform"]')) {
          if (option.disabled) continue;
          option.checked = option.value === locked;
          if (!option.checked) {
            option.disabled = true;
            option.dataset.lockedByDevice = 'true';
          }
        }
        configureBrowserConsent();
      }
      const platform = setupForm.querySelector('input[name="platform"]:checked:not(:disabled)');
      issue.disabled = !platform;
      if (!platform) {
        setupFeedback.hidden = false;
        setupFeedback.textContent = '当前没有适合这台设备的已验证安装包。';
      }
      addDialog.showModal();
      (platform ?? addDialog.querySelector('.dialog-close')).focus();
      return;
    }
    if (action === 'intent-command') {
      if (issuing || addDialog.open) return;
      resetAddDialog();
      addOriginDeviceId = row.dataset.device;
      addTitle.textContent = '设备连接指令';
      issuing = true;
      issue.disabled = true;
      for (const control of addClose) control.disabled = true;
      addForm.hidden = true;
      commandResult.hidden = false;
      hideCommand();
      enrollmentFeedback.textContent = '正在读取已保存设备的安装命令…';
      addDialog.showModal();
      enrollmentFeedback.focus();
      try {
        showDeviceCommand(await post('/admin/enrollment-intents', {
          deviceId: row.dataset.device, intentId: row.dataset.intent, action: 'reveal',
        }));
      } catch (error) { enrollmentFeedback.textContent = error.message; }
      finally {
        issuing = false;
        for (const control of addClose) control.disabled = false;
      }
      return;
    }
    const current = { deviceId: row.dataset.device, action, ...(row.dataset.intent && { intentId: row.dataset.intent }) };
    selected = current;
    const isRisk = ['disable', 'cancel', 'intent-revoke'].includes(action);
    detail.dataset.risk = isRisk;
    detailTitle.textContent = action === 'status' ? '设备状态' : button.textContent;
    summary.textContent = row.querySelector('.device-name').textContent + ' · ' + row.querySelector('.system').textContent;
    details.hidden = isRisk;
    riskMark.hidden = !isRisk;
    detailDismiss.textContent = isRisk ? '取消' : '关闭';
    detailConfirm.hidden = !isRisk;
    detailConfirm.disabled = false;
    detailConfirm.textContent = action === 'disable' ? '确认停用' : action === 'intent-revoke' ? '确认撤销命令' : '确认取消票据';
    showField('registration', row.querySelector('.state').textContent);
    for (const field of ['checked', 'tunnel', 'mcp', 'browser', 'release', 'revocation', 'server']) showField(field);
    detailFeedback.textContent = {
      disable: '停用将撤销该设备的安装票据、Tunnel 凭据和 Portal 路由。',
      cancel: '取消后，这台设备未使用的安装票据将失效。',
      'intent-revoke': '撤销后，已复制但未领取的安装命令立即失效。',
    }[action] || '正在检查设备状态…';
    detail.showModal();

    if (isRisk) return;
    try {
      const data = await post('/admin/device', { deviceId: current.deviceId, action: 'status' });
      if (selected !== current) return;
      showField('registration', stateLabels[data.registration] ?? data.registration);
      if (Number.isSafeInteger(data.checkedAt)) showField('checked', new Date(data.checkedAt * 1000).toLocaleString());
      showField('tunnel', describe(tunnelLabels[data.tunnel] ?? data.tunnel, data.tunnelDiagnostic));
      const development = data.mcpProfiles?.development ?? data.mcp;
      const browser = data.mcpProfiles?.browser;
      showField('mcp', describe(mcpLabels[development] ?? development, data.mcpDiagnostics?.development));
      showField('browser', describe(mcpLabels[browser] ?? browser, data.mcpDiagnostics?.browser));
      showField('release', data.release);
      showField('revocation', data.revocation && (data.revocation === 'complete' ? '已完成' : '尚未完成'));
      showField('server', data.serverIds?.join(' · '));
      detailFeedback.textContent = '';
      if (action === 'review' && data.revocation !== 'complete') {
        current.action = 'disable';
        detailConfirm.hidden = false;
        detailConfirm.textContent = '重试停用';
        detailFeedback.textContent = '重试会继续撤销该设备尚未停用的远程接入。';
      }
    } catch (error) {
      if (selected === current) detailFeedback.textContent = error.message;
    }
  });

  detail.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  detail.addEventListener('close', () => {
    selected = undefined;
    if (refreshOnClose) {
      refreshOnClose = false;
      void refreshDeviceList();
    }
  });
  detailConfirm.addEventListener('click', async () => {
    if (saving || !selected || !['disable', 'cancel', 'intent-revoke'].includes(selected.action)) return;
    saving = true;
    detailConfirm.disabled = true;
    for (const button of detailClose) button.disabled = true;
    detailFeedback.textContent = '正在提交请求…';
    try {
      const result = selected.action === 'intent-revoke'
        ? await post('/admin/enrollment-intents', { deviceId: selected.deviceId, intentId: selected.intentId, action: 'revoke' })
        : await post('/admin/device', selected);
      refreshOnClose = true;
      detailConfirm.hidden = true;
      detailDismiss.textContent = '关闭';
      detailFeedback.textContent = selected.action === 'disable' ? '远程接入已停用。'
        : result.status === 'cancelled' ? (selected.action === 'intent-revoke' ? '安装命令已撤销。' : '安装票据已取消。')
          : '没有可取消的票据。已领取的凭据不受影响。';
    } catch (error) {
      detailFeedback.textContent = error.message;
    } finally {
      saving = false;
      detailConfirm.disabled = false;
      for (const button of detailClose) button.disabled = false;
    }
  });
`;
var consoleScript = consoleBeforeUpgrade + consoleDeviceListScript + consoleAddressScript + consoleUpgradeScript + consoleAfterUpgrade + consoleEnrollmentScript + consoleDeviceDetails;

// ../cloud/management-view.mjs
var consoleStyles = String.raw`
  :root {
    color-scheme: dark;
    --bg: #0a0a0a; --bar: #111; --surface: #121212; --inset: #171717;
    --hover: #1d1d1d; --selected: #191919; --line: #333; --rule: #272727;
    --text: #f1f1f1; --secondary: #adadad; --blue: #2165dc; --blue-hover: #286ce4;
    --active: #38d5a0; --pending: #e6ae57; --disabled: #969696; --focus: #78aaff;
    --risk: #ff9599; --risk-bg: #412426; --filter-border: #333;
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  :root[data-theme="light"] {
    color-scheme: light;
    --bg: #fcfcfc; --bar: #fff; --surface: #f7f7f7; --inset: #f1f1f1;
    --hover: #e9e9e9; --selected: #e9e9e9; --line: #d2d2d2; --rule: #dedede;
    --text: #171717; --secondary: #4d4d4d; --active: #008a5e; --pending: #926000;
    --disabled: #747474; --focus: #165dcc; --risk: #a41e27; --risk-bg: #f9dfe0;
    --filter-border: #bbb;
  }
  @media (prefers-color-scheme: light) {
    :root:not([data-theme]) {
    color-scheme: light;
    --bg: #fcfcfc; --bar: #fff; --surface: #f7f7f7; --inset: #f1f1f1;
    --hover: #e9e9e9; --selected: #e9e9e9; --line: #d2d2d2; --rule: #dedede;
    --text: #171717; --secondary: #4d4d4d; --active: #008a5e; --pending: #926000;
    --disabled: #747474; --focus: #165dcc; --risk: #a41e27; --risk-bg: #f9dfe0;
    --filter-border: #bbb;
    }
  }
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); }
  [hidden] { display: none !important; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  button, input, select { font: inherit; color: inherit; }
  button { cursor: pointer; }
  button, input, select { border: 1px solid var(--line); border-radius: 8px; background: var(--inset); }
  button:hover { background: var(--hover); }
  .icon { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 0 12px; min-height: 34px; white-space: nowrap; }
  .primary { background: var(--blue); border-color: var(--blue); color: #fff; font-weight: 590; min-height: 36px; padding-inline: 12px 14px; }
  .primary:hover { background: var(--blue-hover); border-color: var(--blue-hover); }
  button:disabled, button[aria-disabled="true"] { cursor: default; opacity: .58; }

  .topbar { min-height: 54px; padding: 7px 22px; display: flex; align-items: center; justify-content: space-between; gap: 16px; background: var(--bar); border-bottom: 1px solid var(--rule); }
  .brand { display: inline-flex; align-items: center; gap: 9px; font-size: 16px; font-weight: 650; }
  .brand img { display: block; width: 28px; height: 28px; border-radius: 5px; }
  .brand-version { color: var(--secondary); font-size: 12px; font-weight: 500; white-space: nowrap; }
  .brand .upgrade-launch { display: inline-grid; place-items: center; width: 32px; min-height: 32px; padding: 0; border-color: transparent; background: transparent; color: light-dark(#c62828, #ff686d); }
  .brand .upgrade-launch:hover { background: color-mix(in srgb, currentColor 10%, transparent); }
  .upgrade-launch .icon { width: 21px; height: 21px; }
  .upgrade-launch .upgrade-recovery-icon,
  .upgrade-launch[data-mode="recovery"] .upgrade-available-icon { display: none; }
  .upgrade-launch[data-mode="recovery"] { color: var(--secondary); }
  .upgrade-launch[data-mode="recovery"] .upgrade-recovery-icon { display: block; }
  #upgrade-description, #upgrade-status { overflow-wrap: anywhere; }
  .theme { position: relative; flex: none; }
  .theme-trigger { display: grid; place-items: center; width: 36px; height: 36px; padding: 0; }
  .theme-trigger[aria-expanded="true"] { color: var(--focus); border-color: var(--focus); }
  .theme-menu { position: absolute; z-index: 3; top: calc(100% + 6px); inset-inline-end: 0; display: grid; gap: 2px;
    min-width: 132px; max-width: calc(100vw - 32px); padding: 5px; border: 1px solid var(--line); border-radius: 10px;
    background: var(--surface); box-shadow: 0 8px 24px rgb(0 0 0 / .22); }
  .theme-menu button { display: flex; justify-content: space-between; align-items: center; gap: 10px;
    min-height: 36px; padding: 5px 10px; border: 0; border-radius: 6px; background: transparent; text-align: start; white-space: nowrap; }
  .theme-menu button:hover, .theme-menu button:focus-visible { background: var(--hover); }
  .theme-menu button[aria-checked="true"] { color: white; background: var(--blue); }
  .theme-menu button[aria-checked="false"] .icon { visibility: hidden; }

  main { width: min(1000px, calc(100% - 48px)); margin: 34px auto 0; padding-bottom: 64px; }
  .page-intro { display: grid; grid-template-columns: minmax(15rem, 1fr) minmax(0, max-content); align-items: center; gap: 28px; }
  .heading h1 { margin: 0 0 6px; font-size: 30px; font-weight: 680; line-height: 1.25; letter-spacing: .01em; }
  .heading p { margin: 0; color: var(--secondary); font-size: 14px; }
  .portal { display: flex; min-width: 0; align-items: center; gap: 10px; min-height: 48px; padding: 6px 7px 6px 12px; background: var(--inset); border: 1px solid var(--line); border-radius: 8px; }
  .portal strong { flex: none; font-size: 14px; font-weight: 550; color: var(--secondary); }
  .portal-value { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex: 1; min-width: 0; }
  .portal code { min-width: 0; color: var(--text); font: 13px/1.55 ui-monospace, SFMono-Regular, Consolas, monospace; overflow-wrap: anywhere; }
  .portal .button { flex: none; min-width: 92px; padding-inline: 8px; font-size: 13px; }
  .portal-tools { display: flex; justify-content: flex-end; margin-top: 5px; }
  .portal-tools .button { min-height: 32px; padding-inline: 8px; border-color: transparent; background: transparent; color: var(--secondary); }
  .portal-tools .button:hover { background: var(--hover); color: var(--text); }

  .devices { margin-top: 25px; }
  h2 { margin: 0; font-size: 16px; font-weight: 650; line-height: 1.4; }
  .registry-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 11px; }
  .toolbar { display: grid; grid-template-columns: minmax(0, 2.9fr) minmax(0, 1fr); align-items: stretch; gap: 10px; margin-bottom: 9px; }
  .filters { display: flex; align-items: center; gap: 1px; padding: 2px; min-height: 38px; border: 1px solid var(--rule); border-radius: 7px; background: var(--bg); }
  .filters button { display: inline-flex; align-items: center; gap: 8px; padding: 2px 10px; background: transparent; border-color: transparent; border-radius: 5px; white-space: nowrap; color: var(--secondary); min-height: 32px; }
  .filters button:hover { color: var(--text); background: var(--hover); }
  .filters button[aria-pressed="true"] { border-color: var(--filter-border); background: var(--selected); color: var(--text); }
  .count { display: inline-grid; place-items: center; min-width: 19px; height: 19px; padding-inline: 3px; border: 1px solid var(--line); border-radius: 50%; font-size: 12px; font-variant-numeric: tabular-nums; background: var(--bg); }
  .search { display: flex; align-items: center; gap: 8px; padding: 0 11px; border: 1px solid var(--line); background: var(--inset); border-radius: 7px; }
  .search .icon { color: var(--secondary); }
  .search:focus-within { outline: 2px solid var(--focus); outline-offset: 2px; }
  .search input { border: 0; outline: none; width: 100%; min-width: 0; min-height: 36px; padding: 0; background: transparent; }
  .search input::placeholder { color: var(--secondary); opacity: 1; }

  .table-wrap { border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
  table { width: 100%; border-collapse: collapse; text-align: left; }
  .identity-col { width: 35%; }
  .state-col { width: 24%; }
  th, td { padding-inline: 16px; border-bottom: 1px solid var(--rule); }
  thead th { height: 37px; color: var(--secondary); font-weight: 540; font-size: 13px; }
  tbody th, tbody td { height: 58px; }
  tbody tr:last-child > * { border-bottom: 0; }
  .identity { display: flex; align-items: center; gap: 11px; }
  .initial { display: grid; place-items: center; flex: none; width: 33px; height: 33px; background: var(--inset); border: 1px solid var(--line); border-radius: 7px; font-size: 14px; font-weight: 590; }
  .device-name { display: block; font-size: 14px; font-weight: 640; line-height: 1.25; overflow-wrap: anywhere; }
  .system { display: block; margin-top: 2px; color: var(--secondary); font-size: 12px; font-weight: 400; }
  .state { display: inline-flex; align-items: center; gap: 7px; padding: 2px 7px; border: 1px solid var(--rule); border-radius: 999px; white-space: nowrap; font-size: 12px; }
  .state::before { width: 6px; height: 6px; border-radius: 50%; content: ""; background: var(--disabled); }
  tr[data-state="active"] .state::before { background: var(--active); }
  tr[data-state="pending"] .state::before { background: var(--pending); }
  .row-actions { display: flex; align-items: center; gap: 6px; }
  .row-actions .button { min-height: 30px; padding-inline: 9px; font-size: 13px; }
  .row-actions .quiet { background: transparent; border-color: transparent; color: var(--secondary); }
  .row-actions .quiet:hover { background: var(--hover); color: var(--text); }
  .note { margin: 10px 0 0; color: var(--secondary); font-size: 12px; }
  .empty { display: grid; justify-items: center; gap: 6px; text-align: center; padding: 24px 16px; }
  .empty .icon { color: var(--secondary); width: 25px; height: 25px; }
  .empty p { margin: 0 0 3px; color: var(--secondary); font-size: 13px; }

  dialog { max-width: min(426px, calc(100% - 32px)); width: 100%; color: var(--text); background: var(--surface); border: 1px solid var(--line); border-radius: 11px; padding: 0; }
  dialog::backdrop { background: #0009; }
  .dialog-head { display: flex; align-items: center; justify-content: space-between; padding: 15px 17px 4px; gap: 12px; }
  .dialog-close { display: grid; place-items: center; min-width: 28px; min-height: 28px; padding: 0; border-color: transparent; background: transparent; }
  .dialog-body { padding: 8px 17px 16px; }
  dialog p { margin: 0; color: var(--secondary); }
  dialog label { display: grid; gap: 5px; margin-top: 12px; }
  dialog input { padding: 6px 9px; min-width: 0; }
  .platform-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); min-width: 0; margin: 0; padding: 0; border: 0; border-radius: 7px; background: var(--inset); }
  .platform-tabs label { display: block; position: relative; min-width: 0; margin: 0; cursor: pointer; }
  .platform-tabs label + label::before { position: absolute; inset: 5px auto 5px 0; width: 1px; background: var(--line); content: ""; }
  .platform-tabs span:not(.sr-only) { position: relative; display: grid; place-items: center; min-height: 38px; padding: 4px 6px; border: 1px solid transparent; border-radius: 7px; color: var(--secondary); }
  .platform-tabs label:hover span { color: var(--text); }
  .platform-tabs input:checked + span { z-index: 1; background: var(--surface); border-color: var(--line); color: var(--text); font-weight: 600; }
  .platform-tabs input:disabled + span { opacity: .55; cursor: not-allowed; }
  .platform-tabs input:focus-visible + span { z-index: 2; outline: 2px solid var(--focus); outline-offset: -2px; }
  .field-hint { margin-top: 5px; color: var(--secondary); font-size: 12px; }
  .dialog-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 7px; padding: 11px 17px; border-top: 1px solid var(--rule); background: var(--inset); }
  .dialog-actions .primary { min-height: 34px; }
  .feedback { margin-top: 12px; font-size: 13px; }
  .device-command { padding-top: 7px; }
  .device-command > p { margin-bottom: 12px; font-size: 13px; }
  .device-command h3 { margin: 0; font-size: 14px; font-weight: 650; }
  .device-command pre { margin: 7px 0 12px; padding: 10px 11px; border: 1px solid var(--line); border-radius: 7px; background: var(--inset); color: var(--text); font: 13px/1.65 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
  .device-command .primary { width: 100%; min-height: 40px; }
  #device-command-feedback { margin: 7px 0 0; font-size: 12px; }
  .detail { display: grid; grid-template-columns: max-content minmax(0,1fr); gap: 7px 18px; margin: 10px 0 0; }
  .detail dt { color: var(--secondary); }
  .detail dd { margin: 0; overflow-wrap: anywhere; }
  #device-dialog[data-risk="true"] { max-width: min(360px, calc(100% - 32px)); }
  #device-dialog[data-risk="true"] .dialog-head { justify-content: center; padding-block: 2px 5px; }
  #device-dialog[data-risk="true"] .dialog-close { display: none; }
  #device-dialog[data-risk="true"] .dialog-body { text-align: center; }
  #device-dialog[data-risk="true"] .dialog-actions .button { flex: 1; }
  .risk-mark { display: grid; place-items: center; margin: 16px auto 7px; width: 33px; height: 33px; border-radius: 7px; color: var(--risk); background: var(--risk-bg); }
  .danger { background: var(--risk-bg); color: var(--risk); border-color: transparent; }

  #callback-dialog { max-width: min(652px, calc(100% - 32px)); max-height: calc(100% - 32px); overflow: hidden; }
  #callback-dialog[open], #callback-overview, #callback-form { display: flex; flex-direction: column; min-height: 0; }
  #callback-dialog > .dialog-head, #callback-dialog .dialog-actions { flex: none; }
  .callback-body { overflow: auto; }
  .callback-current { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 11px; margin-bottom: 16px; border: 1px solid var(--rule); border-radius: 7px; background: var(--inset); }
  .callback-current p { font-size: 12px; margin-top: 2px; }
  .callback-current > div { min-width: 0; }
  .callback-tag { display: inline-block; flex: none; border: 1px solid var(--line); padding: 1px 7px; border-radius: 999px; font-size: 12px; color: var(--secondary); }
  .callback-tag[data-tone="pending"] { color: var(--pending); }
  .callback-section + .callback-section { margin-top: 16px; }
  .callback-section h3 { margin: 0; font-size: 14px; font-weight: 620; }
  .callback-section > p { font-size: 12px; }
  .callback-clients { list-style: none; margin: 7px 0 0; padding: 0; border: 1px solid var(--line); border-radius: 8px; }
  .callback-client { display: grid; grid-template-columns: minmax(118px, .32fr) minmax(0, 1fr); gap: 6px 12px; padding: 9px 11px; }
  .callback-client + .callback-client { border-top: 1px solid var(--rule); }
  .callback-identity { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; align-content: start; min-width: 0; overflow-wrap: anywhere; }
  .callback-uris { display: grid; gap: 3px; }
  .callback-uri { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; min-width: 0; }
  .callback-uri span { font-size: 12px; color: var(--secondary); }
  .callback-uri code { max-width: 100%; font: 12px/1.55 ui-monospace, SFMono-Regular, Consolas, monospace; overflow-wrap: anywhere; }
  .callback-unset { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; font-size: 12px; }
  .callback-unset .button { min-height: 28px; padding-inline: 9px; font-size: 12px; }
  #callback-feedback { padding: 7px 10px; margin-bottom: 12px; border: 1px solid var(--line); border-radius: 7px; color: var(--text); font-size: 13px; background: var(--inset); }
  #callback-form input { width: 100%; }
  #callback-form [aria-invalid="true"] { border-color: var(--risk); }
  #callback-form .field-error { margin-top: 3px; font-size: 12px; color: var(--risk); }
  @media (max-width: 540px) {
    .callback-client { grid-template-columns: 1fr; }
  }
  @media (max-width: 860px) {
    .page-intro { grid-template-columns: minmax(0, 1fr); gap: 14px; }
  }
  @media (max-width: 760px) {
    .topbar { padding-inline: 16px; }
    .brand { min-width: 0; flex-wrap: wrap; }
    main { width: calc(100% - 32px); margin-top: 24px; }
    .heading h1 { font-size: 26px; }
    .toolbar { grid-template-columns: 1fr; }
    .filters { flex-wrap: wrap; }
    .filters button { font-size: 13px; padding-inline: 6px; gap: 5px; }
    .portal { flex-direction: column; align-items: flex-start; gap: 7px; padding: 11px 12px; }
    .portal-value { width: 100%; justify-content: space-between; gap: 8px; }
    .portal .button { min-width: 88px; padding-inline: 8px; }
    table, tbody { display: block; }
    colgroup { display: none; }
    thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    tbody tr { display: grid; align-items: center; grid-template-columns: minmax(0,1fr) auto; gap: 8px; padding: 9px 11px; border-bottom: 1px solid var(--rule); }
    tbody tr:last-child { border-bottom: 0; }
    tbody th, tbody td { height: auto; padding: 0; border: 0; }
    tbody td:last-child { grid-column: 1 / -1; }
    .row-actions { justify-content: flex-end; flex-wrap: wrap; gap: 4px; }
    .row-actions .button { font-size: 12px; padding-inline: 6px; }
  }
  @media (max-width: 365px) {
    .portal-value { flex-wrap: wrap; }
    .portal code { flex-basis: 100%; }
    .portal .button { margin-left: auto; }
  }
`;
var logoBase64 = "iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAIAAABt+uBvAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAYKADAAQAAAABAAAAYAAAAACpM19OAAAeM0lEQVR4Aa1ca8xlV1k++5zzfd9c2g6dmXZK7wVK7W3kWiyImmh/kBiNYmKimBgMCS0xRG6FaPSfSmKiERWlBEFKKfw0sTFGKBfDXSiUAAqxDtgCpZ3ptHP7zm37XN537bXPOd/QC7vnrL3W+z7P877rXWvvc/nOtDnnwusHbTto1FTtYABj0wyaFt6lo9G4mDF0PzoYGLFE22FY6Dv4KVb0gSlxE1/8NiwNz2IMARCUccm7zLgZNmPMnwCVSC36qIuyYCMvFSIvqizwlCrtxaOOtRuDnapbaheOi87613SuUZRW/MRbLJGtMsHKkRsHkmTIYiod+MVmY0SdhpwxVwJCreq07ThA9BXAUp8+h9f0G6ZD27qDjs4Z5VIOxUqpJkq4JHEW4YJ0LcqwdIp+sbgju4qDi6FaJHl3IoUGUh2qywLnUffTVk96/dQ6pHoWYaurlgXGwFYlxZH3QjLpNAB2sADzMAWrkbiA5SM11p1FI5AXSXXUcpV5uesCwep0weqpJJxq9qE+Th0xPYXSMUZD8UjSJLlwuF44bdlgjigdmFcArylYSgbAS4Itng5kCpfJDyIKg8BKkz5ZtDVxM6FSHgTW47T3z7jE4qiDpI1naHSu7OnMBkFiz3t+wCIqq6F7mxLIe4k9uZQhkYrUynzTBiFm0DUcMSEcispuxI08bclKgEmDCq0akQkT10BLBi8eCiDXctPqEsu8lr0aUwsAxpEYwRXBYRVP1micNXMo1QG99KVGp1SjCXBl8w6ygRQnwWCkcJR9d9VK1QHodxRsHZMBqQ4mhEe41mLiEktBkzHyI4bMRxs/LgON5SuLjpH2jhlsQYjAsqFPmm3o9b12ENBpB51EMUNAXCFZ/+5QxoxYFqVYbCzQpYUJXRELJjqNdpCLrNwRkTHyQD/ywctOZNP52SspsvxOTaZEFX9Ihn3ZXJTkSK8uMQxAYi3E5RpJq2tlR4MMbSQcPaxBZ+nNy8mQIm7kplPf4Eus+HOPaXX7SJVC4SIHJqCSgA0e0bGPTZQtBR0BjlAQJCcT4WGjuZp/AUAYB4foFCttOEwKaQFtZ33cq43hkwyVKjXAjCwdgsurmOZIAChIsiISJmPw7aKKrCpC9BTP/kKizaa6pWj/sBea3araBBg6iFdtBwwB40PbH/6C5RzioM1qnaaU7K+QnhrnlNw8dwWCRWUBRMEiYkequPIxQdk8J6QfFM6E/VAyL30ZuH8GhrAK6m43b+mFsUinCOwVNa2YSClMhjfMeNvYx46wA/GiwzN3c1egnJ4yUYyAcqPw6MfgGBQahXPXsgpXbqHJSxGM8UBxVV/m4UA8uSfk2qbTEok6icN65ajY6IsLP2EKXmSig7Kw5xJoZwrOanUFoonKVkdbKiZGNHaXDKLgqaw7uYIy3bidFLCCssm04qx6pTOqxSGIPW6sAV3dchjXmShmXSjxArR6CmXIwDBHhvHsXHRoB6q/gxyXLY8i1CVJk/WEUEMJF98c0xASHeektuqSpiGheJoRE6Fz+TB32dqrUCiWKB3F5Ya6LqHOXuScQZdEONIcO6gQ0Sn9SoO22Cu0MmogqWx1OngwGeVDM4kmyyWqbFHoUBGIU2adzODZB0w1LM2MS7hvHhmspqgvQfYsrWwM6rUMvhyYgLgHdSqFxWmUw2S07OQ00PF1pKBlDiZxyJRChieCpYD6amZG2tZBqV94BVLVobMphiNUcYIdQRyVkjjc9gS6gS+FSkgpt9U9yD6KWCi0MR++9sLmR0hoEoLAQEwvPCogdFJIEpG7r3cA4YOvOMVZrOntqRdjiursJEPDq8Ms+lIeIQ6jZc5daK0q5A1jqwIRr6AlQacAQLFEBwFNTk+MsMRAFDT4HMJJv6uFnvxmVF0HC+Elr17qbAtY7wSVdFJQogUgT6VXHOYEAacoi6C1BPpN7iA4YwUYhyQjvQLus02rgokU82dQbgHw9ALOvuG+S2Cg4jqQ1y5iSIvNmq/RAM+g7OUBbUah1xlVndwXxMqpkBz5KAS6uwF6GnQN4I0vMWcB4YTTIKMlughU1LS8k4QRWBBsLiq4qFArHYd2fmxjF4reWenoRlFhalRW+REED1hziwaLFpYnpyF/p1ih0EUOfBSj9kepACMoTPV9EOUVQCQ2ygIcZ8PI4sjRmwwsSIyZIaQKiNTBcwLYwZkHE8LCY6tACYfsIR+yOjHR5BQdMYJFPrUWg8WsJsJtZVwczXAjR9YKTs6H6WYCJLHP/IufsVQgEwPS1Yj+iKaz+syKky/5J8pTtitWxmkRAFFXixoyU0cONiUM+0o6lzKxBkXFA7SYDbf2j8+/cTje40k5ngo6mJ/6wezY/VRuRtKHYq6TcUykmkeRiOQd0QVyglx+bwP6cBQ27NGXdOob1UE5YT5VYnbLzY8xOxH6OeyO3lgSFiGo44mS3vlkfOAl+170zsGeKzod9Uxq5/PtB+859fU/WcxONbzVlhiSCQ6MFOSzqks4FXu0ufcCMGpSBCgoeQNQ4wogK8s480W7PR3M5nSiDtPFYHvG2KN8Nch1hBIegFAyZSGQ3bLcxd05uR3He8598d8Mz3leO28HC6yFH6BHB6uzsf+axfTE7JHPNcMxF6tIMzkenWIO6ktbkAZMJgmyrz1ZSaVcUUylPBcUIbHvkeX2bHjp/l2/cO3mTVc2l+xHUdpjJyZfOTL52Den33hoMB4OXCaJIyoORFEnZDhy6IiwdBKHRZiN9l4xPlfV4TRLpqiOBzS282bz4CtOf/s9CoE0od4rU5kf50tCzqULi7+LMUdlSYHwRJTkgG2tTlHAMmyn8+HerXPe9Ko9v/vK0cX7kSOWVXrN7t94xeD2kyc+8pkT7/yX+Y+eaDbHyr2kwJXh2igLDLgwzENsoqpO3MiU5XCDIIIrDLEscrEOms3yVmaH0hd9C4kesrTwJs2h7RZnOQzhatLmhImP3NXNZjIfXrTv/Pe8duvnrmtn08X2xALYUugw2d0b577ulq2XXX309+6YfeuhZtdmMBXEmCqllI0cMCzJ1NucO0IHzlERJZebSOfU4AS0E9LQcdHTqkT1MxqBlF25NTBshi4dFEmKXAR0YsBzO1805+3e/4+v2/q569vtCe4Iqg7rkipts2jh2jh8xYG73rBxw2XtmYnEipRErWlHocYwQjJcJxtZEJK7jn3rpFrmQIS46SA0DlXSW8Fwt4GMApXlqBIwnzgwOO1iSB2WYTo/7+2/vHXzNe32NkbysHGZgqLxYHu6cfVF53/o1o3Dl7enVSMStD21epobTHjgcKtuGcu27CBSezWxKwDmo3XD2aknVGdNjVd5FRSwQEaBkpfnyG8pVuxSO7Gb2tl847pL9rzm5e102gVnLD0yjVDBNkSNnnMINRq/4PL2zJT2XgRHR2sr2uLWJsFUIkHa2cWzLJ36GVN2gdVUSh2i7rmAxCokQ/PGEpdYaPgORJ+oaj1i10YG5nbztTadbb3qBaPzzm1xERVAAlkm7jEe4QVxezq+8oIDd902fmHWCJIxSYCdCtrysABao7BIxghCecZQ6WQv9YrICaZM3Yc7EPTQVROINDrvQRiqYi5bgGsFCuY0i3002nzhFXjBgg+JFbNCsgk1B/MA89uejS47eOBDt2286Apca5ivtcv2KPQdOoBzPhkOWfGTi8bSAg1+QpiCT5JKBo1G1BFg6R8yqECcOLdEESAdwm6rCDBGGaw2HA32nDtggTzuAtR5hbPTbwaT2ejS/ftxP3rpVYtTeNVDcdB08TuhNT2sxXAwPT6cnyHP+5ncKFKEg2GIDxwPtQte/v1jOVt56+joB2YYKyF9GGlOJPuw6JE2EeHQuJk3zff3srhU6SD9bFhTr7CKSxjjTOajS/af/8HXb9703MWpaQpYZEcpKzfNaH7iuyf/96N4hzwYorZDlkyPZoixHuNhOzl15sjdMdWY71Jq9dCIEjo6o429ByHhfa7UdbV0xBB2TbjMeVCgbbcufPXGLfjQPFcZw+di1ZYkaQE4UNnni+H55+y65YbJF74zO/LoYHOEIitEFaYw+x0AF0e/uNh+rGm2FttH2+0fLU7/cHHm4fbMw2p/ND325ZPf+NPpo58f8DO9ZXnWWjqNmJNW2xGVODPwgyGbvRf8FN/KGiyPzGx0VEyMPXIQuhf7brpz1x+dN7r5gcH2qCq+r04JiJM8WgzjJmLQtt0cLx46+ujvvHv6hQea3ZtVgQCseVbTutAh8nyb32lwI0lKEF2teIO2zTcPQ7yT1hYmXGXyVENYVrKkhlPEDDc4+rCqaBJ3BMLzcJctuX0H7ipbl/568+B1w2uPDg+cGczLLZ/sxPKcfdrLIWPT4K3ms/bsvuWG7c9/Z459NB4FAcsZiZnt3MMpSZRi3M70eXg65ydkP/wWHt9y8IsOHkgbtGD2eix3yS6leY4DFzM/zfuSSCPOAalPXheUROsAD0ltu+vyXxsuLpvff2B0zfGGNTIHbSGXjgIsLwZ0G3wH0Dxr765fun7y2W/Pv3t0sMEaOXfIiG+R0rLTTma442xef8nGK67GG6uNw5fhbfr42oubvZvtoyfb01N+PFYesbRmR2IYRIRMNdzKsjQNLrFrgeTWUJmIKv0+haUpRMPbxb6Xf3C8/6bF9mB4wZnNN94/fO6xdnvIyhEZYiblQDUWXXlzdeHC5YBrbfZ/jxx9zbtn/3kE11oJRbeuEitGsmemWy+56tw//JXNm5832EMw7tIQ5GN7Mr//weN/9s9n/u3rza4NsnHoNTSvII1lXtcodxI44fg+iMNqbQ2hTMh3On0DL7HhnksGw0X7xMbivoPDq59oDp3Ma22ZXbiZAg2eP2fAe/berV+8bvLZ78y/d7TZiAskYiM90Jhkg3fkm698/v4Pv2F8/WUo7GDGj3sDfDGET4K44vAydtmB3b/64tmRR6ZfPdKMca1RQ8Eshq60QnqHk1h51/DugEkPJO1HUon1dCHM6THR/rGxWBzd2v6rw4tvHhhs8UrTmhlDBg5zTVckmwNIwclsfNnB/Xe+nu8h8zNtRNIGhwQ+Hg/3733WX/zW6MA52CyxWS1NPb4zarbxVdB435//5vjqi/B5KAJbiOH5zFbdbghXb2ZZoAJjR7Nzx1Jh7FHzgusQg41Fe3xz+teH268fzBqRicOKbHUvU8ceXVyeAX1Ng/dHl1+A90fjw/jcPyVTEbg8fkymu171gs1rL21RBa8j7DxYwu7lczofX3D+rle/FN9V0UkMhQSwEM2h7i7b0CqGKBCovm3IUeacRShwZ1SG7HhjqYfBeNE+vjl51+HF1y4cbGG3e1K+OzAIH5FDSSWNcePiZ5Hx5QcP3nXbxuFL21Px3QgjMQiPrZc9VyPnqbuDHXkXQhSkhWtv6yXP4SVWzS5FwEXXLf0WyA5cAex2ECdaYIQHIo2VD7HLJWmSnIFAjU5sTN514+IrFw438V6bQtLSGSDjYkFiyXmThoMuSmMfDa/APsJ3I933R0wKgOFw8Kw9+nwjXUpbUZWyBo2sUHPuLryW0aYMBHQPrVkVHV0exc5BFIhwS1PJZI0DjJPtwGWHdB3GqI1ExovBqfHk726cf/nQgDWKXQbFEBWYM+gfHPOJEPjcPxs/58Lz77x1fP2lvNZgN5yl5JGiKiidZiqafyhNBKV8MksqSkQiZKVDBjcwhZUFYlcaETJ9IQwXEUHwi2nYSEQ3UyCK2VMMb25Pj7f/9obFly4abOJve1wKQS0Uap0OVeAi3S2FWaNDuGePr332wvcjwbDDxM8KgyBpEv0nSW1bYalqUULiCTd6HrBVX5E1qJveh1VGhZqCC2SVTg5CxZvZUTxx0RG3HYzwHnc0efcN088farZ0p2ReTCgjkGe2s7M3SmgQvj963kW4Z4+ef4g1wsG52ee9o7mmojwxYCSMi4tDHBgXkyBqOA045CEiIPgELE5hlI4J8goRTfp1gcMGVQr7FNMnlCYYR4PFmeHsH26cfubZ7dYiitGVCWmkoIyca3fQRcP2bOOaiw/cedvoORfyj27cLnHn4mdIIvxEX8PYRZCmvgOUMJ189OQJFO8FGGN/Rib8AVWVEx2OtiJT75fOSfGyjKBWaThnzGTcLraHk/dcv7j3vMGmPhWLLyhBHYejzIxpKEmfcK1de/H+O28dXnmwPTPTX0pFdExiFA+56C9fMT2py0Hl6lCkGKOvslIvcwkOT7jEiOgU0YMhkZVorAVJ8BuQNI24mvJSUIsHIG8WqNGwHT3+x1878f57R5tbdHbZWE93qLKdKKA07NSy8Tv/Gy7FtTa8/MBU7yEhXe4HTIAsQz1gG4XrJhjh4Fs5yCeFrQ8mhD/jaZvGhOFQr2ASq2B04RlpAMMUZUKmpIjbUYi1UouveqaTx99y93Bj7+7ffkUzmehWZ3wwmQmfpECWPiQriFLUJ4yfvnLfB17HL1YW+HDBw/rqxkiWWEFJJASE7Apfj4vDxm6ob1KkXGwi16OSCYxOPPTt0CCLEwWxjbOTEK0j/E11Ojv2xg9i9nte87PtZLuqJ5UiZERgwV0mkMOF8/Z0z888H9+QLKb46EU74S5q5LHzKVUSsTS2niQjIAHxPgi9UnPxmfG6Q+sLom9mOA8j/ZxiITISI+TRLhb8/qFtj/3Bnac++OnhJr7Ksr9QDJWSQsQYFYCtoFAa7Z5KvPgyWJzD3nevBu37ozqSwE26mx+IQHoBSVmildiRmODOPV1iqHQSklk2T5AM/sxjsXjsTR86+U+uUXLjDEyWrR+/jCStpsqQey2r2PcVXoVmN2ahsO7XlswKv5N2QYDv/GFK0PK5CwmPMqtim8t0TePJ6UgfDWuE3XT8TR869YFPYR+VK0iMoIEFqEsVicXJstD03SmGClKCMmYNZ7/cvsmws8QqHfqqA3b9RrGDo6dKxSJyaiYbAm5vCGwiyzSlLx1HErOiUxJfZOpaezNq9OmG11pkZXW2eKa0jRE5gCpfv0bWELescGcjL3Rx8iO1SvhiiA7p/KOJh3HCoNfDAI8QZQgeyKBsOQpQg4/OSIhTMt59Z+61zxqd/MCnBqqRNUI/WTBWh+NnFnJ4AFhsEYz1jRBC6QEQ//5PWE+rilYFSMkuRHeT5oRCQ0p6GelzXYCMIxE2fqL1az05qh8t2vYE0Ng7IRg+l7ft8Tffder9n/L7oxrGGTCHUnQ548Liic48JG191ULdzt/1TChjylQapV8A5VXMaxtoDSKVWkJSvrtIgTgPqZzPyKHOn07HjE2WmaBGeEk6/tYPn3jfJ3CtldfI8GtvIpHMFy8AgHC/RpCuS4Ps+jO0RuAZTJnCMZPZOsiSA8bOAhp+gkcGV9x48wOjEyn21Yi6HzEl1PVrBPoxjJUgzEk3+L5mvjj2lrsQbM9rf34w0TcbeCfI+YmkLNBgkF10Qg86aXfosEdVdXGJxYAVNm0msbW3G7uHS4yKhK9SuDv4BUKPxGmtQpNv54pfZgplsJ4kvgOD6rG33nXyvffq/VF4fetAFn6ArI5kHCIvape9TlRcTgAc8tTrRy1wdPyAv5c6aNU9iFpSKESB2dQKMeCtwf+JA5Rp4qiLngbaKVhx5kgH7dzyPBcO70eDwWNvu/uJOz6Oa61cnzkxc9mqSjzFYSFKZQBl6NBEsbd0iVkNdqmYKenQrE5RoC4e1Sp/Skmpskc5gA10AJh/wopOsQjcjRiqoqNGzeD47Xc/8Z6PDTc3fAFqDhWG7/2LrlJV6hm10zbI1VMfjW0dRonyWmQsXtEwLHn5iwjCwqW+aGoAzmsdHlKX6IZyBfpOoC2ltpAqWxeEUO0nklSjJ97x0RN3fHzAGslBLJ2ic8phhS6lrUqQAqEhOMeyceCjAy/PhZ7KSzi4vMRkRbPkNb6vX0YsSA7irBOboiMLJ+MIVZtkIAQiKWh8D4lr7fa7T95xb32twW0M92iQACwH6Y5gkyFFVoEUbg23iKzxxSVGyBqvklJq1kDXpSnp0G4AfUrROt70qUm8j7TIbzNMssbG8LvX5vG3f8TXWhQG9FAh2By3/EV2BI/VgCGw6Hh9CPGRHp8tkb7q7AmU90HwBBGnlKjg0fWK1H78nL1apoD1qkNBptHO0BZtacBAb2eVm3dovD8atKjRyfd+AvcjmKUAvikcORZD8QpPP7SYkDTRTmZ4DxFZ+RQvDGkDsHdgnOJy5Q6KcMvwjuuggBGSdcJfLU8dCUwoFPmYNeDMFj+xOvV9pJ4owOgp86w6csCj+9Fjb7vr1B2f1P0IVLPRmotxebmLLHgqwMFw8j8P40uo9IGFI7jZz/w0zhAdRgWKofkBXH/yynS+ZvKDf1dCLoIcvtCUCJOhu2mnp+aP3YcvX3O3FTwQnrajd5PHGPdsfP187Pa7Tv79x1AjqTk2KYaqhZofsOZuwlrgH/zc81W+WafZRPO6QVoZLfvGxCh/3cFhjaj7giqRCiNAM1qc+t543w3j867EJwaavNEKLlDN7Pv3nD5yt/6FG0yySlWNhw5QXKokRqgR/q7xsW8MztnavPlqTlSXk9lwZcVtiDrwJXtr1+l7vnzyL/91MBrxtTpWRAwmgAeO0onppcVeIkqBbFotrVUsCEwRIpnHYjY79pWNgy8f7TkYW8F2tUhrOB7OH/uvJ+57x2B+Gluicq7tOgRc6DglnPlxfPLxb+Kb1o2br262NvAxpHIbXKmhFltbky8/cPzW97VPnMY/McrqLCVv/TLlvmTqlQKlYfmcWYZ9ZYhNNDk2efje0a5Dw71XDcdj/8aU7YirNv3hJ07c97bF6Qe1fZbVdx6DWlJHYTnH7U9+a/LFB0aH9o0vPr/ZvatBrPEGfptQPWAZL05Pznz0c8d//wPtD47jRzDaOnXadb/EL8YSNCz8hVlxBrxX6HRi87Kbw6LsafCftbXjfYc3D9w02n2x/xXkYvLI9OiXJo98Cf9kAT811QsR6M5gnU4Xt/aWjBmy3Z7hh1Xj6y4dvfiKzasODfHbMmN1beH3itMjj07/47+n93+X76f4lqoTVcq1WkkGnh0jlgIlekmQqoVc1IsF3kJoW/z7WtSCDC0bbxi4/jdYW5YnjBIsrKKgW0sIOxkPjCyhdbvFT37w4m1dxqsOADeG+pVjTa8A0S2CjgWr8QUZgPyzjxa2RISzD68NViz+rsNaDMrrFCPZ5xf3xOWZ/p4svjao7rgFFhoJxhdCA/yium3zx7DUca0KhfOQGQ06dZQ0x9mwAq69JvqNIhR45L0sJ2ajAqDrMLVi0ASLppph39xlXOwlb2v6Hc0azSSU0Ox4N9qFeujwia2gtRT69TAhNC7ZLeWWMksvKyWJggMfRtthrOVgrIeFstpZhdWaq3hbzFrlJj6S4rrySSCeRdnurF6SqnPwxQKxClQ8KwUC3c4KEpJLdiuuwqoEuu6ThJlQEl2K2MllFQCoMNxUeBS68fVWg2XJC0ulUCJUlyh2EOtfXNkpQqsuQIo34U//vCrliKv2JxljNWFY/IACOrWywXUbUQRCw3duNQFuD83ZOafeO7UlhZ1ZPQ9YHXHlSnACHaBHfVIDc3dSKPbSWSvqr1yZ3VJFlmhLwxV4NdW1cdYZ64h6bYogOK2EW8eX7SxI69dRapViL53a6z5dukkHpmSGDky22hiISqPOrIArf69bg2vHeiLRXDM8+nH7IwmtMdUB1vVB2SmfNXC/ijlMCebOkko9BKCA14iumH48GOrYRXGhYbDmtrg6rzqllZhnq0LJ5+wK1MQbxYLGcKf+kovMp3U4oTqKZWDhXS3c9KO7CluKuRNgNcpOajspZCD92M9yaTrb+SxIuOw9C8bSdU4dWFZ+GsEmSq08ny2lnXx1lJ0wT8K+/D+a3JFS59rNqoIjIed09szgrekxLN/woDx9lbOrVfF73VWWLXXoHuEsA92D4tJfC3NpGEDyaFbDryXuZFyic9iZ0Os+rdj8VGf1VPE75Sl7/f9y3RnY5b8z5hl6+EHBF1ddrsjxqWmfJduzuHaIgQ/f9Dwp4trXlR10n4a52zjeAks5PcOd+3TpT2IHOdGf6L5dXz4HQuvHEsjeJeOTHz59ut8H/dhITz/AOumdyv2TjbIu8lO0ISHfpJ8i75nCfwKF2KnGzzS1Ph+3RRWICT/9iE+J+ZTA/WyXRlB6hmJPgt7oJp2v8iToVry0whKy2ro7Nd/bmQEMOmyXFDQ3edc5Vmduy85YZ7yT32nUqqsWesFf76ip+KsIJlj+eu0/DYPWP4ohamFpYRyiB1jxWmyn+cBrEcOyj1f+okpP2oXSe+6wylA3q4FKRquu1RlF4ag4HAz/H23NUFlexZuaAAAAAElFTkSuQmCC";
var consoleLogo = Uint8Array.from(atob(logoBase64), (char) => char.charCodeAt(0));
var consoleLogoUrl = "data:image/png;base64," + logoBase64;
var _a;
var consoleTemplate = String.raw(_a || (_a = __template(['<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>\u8BBE\u5907\u7BA1\u7406 \xB7 Nodrelay</title>\n<style nonce="@@NONCE@@">', '</style>\n<link rel="icon" type="image/png" href="', '">\n</head>\n<body>\n<svg class="sr-only" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">\n  <symbol id="moon" viewBox="0 0 24 24"><path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454l0 .008"></path></symbol>\n  <symbol id="sun" viewBox="0 0 24 24"><path d="M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"></path><path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7"></path></symbol>\n  <symbol id="upgrade-available" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"></path><path d="M12 8l-4 4"></path><path d="M12 8v8"></path><path d="M16 12l-4 -4"></path></symbol>\n  <symbol id="upgrade-recovery" viewBox="0 0 24 24"><path d="M12 8l0 4l2 2"></path><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"></path></symbol>\n  <symbol id="monitor" viewBox="0 0 24 24"><path d="M3 5a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-10"></path><path d="M7 20h10"></path><path d="M9 16v4"></path><path d="M15 16v4"></path></symbol>\n  <symbol id="check" viewBox="0 0 24 24"><path d="M5 12l5 5l10 -10"></path></symbol>\n  <symbol id="plus" viewBox="0 0 24 24"><path d="M12 5l0 14"></path><path d="M5 12l14 0"></path></symbol>\n  <symbol id="copy" viewBox="0 0 24 24"><path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666"></path><path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1"></path></symbol>\n  <symbol id="link" viewBox="0 0 24 24"><path d="M9 15l6 -6"></path><path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464"></path><path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463"></path></symbol>\n  <symbol id="search" viewBox="0 0 24 24"><path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"></path><path d="M21 21l-6 -6"></path></symbol>\n  <symbol id="close" viewBox="0 0 24 24"><path d="M18 6l-12 12"></path><path d="M6 6l12 12"></path></symbol>\n  <symbol id="risk" viewBox="0 0 24 24"><path d="M12 9v4"></path><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0"></path><path d="M12 16h.01"></path></symbol>\n</svg>\n<header class="topbar">\n  <div class="brand"><img src="', '" width="35" height="35" alt="">Nodrelay\n    <button id="open-upgrade" type="button" class="button upgrade-launch" aria-haspopup="dialog" aria-label="\u5347\u7EA7" title="\u6709\u65B0\u7248\u672C\u53EF\u5347\u7EA7" hidden>\n      <svg class="icon upgrade-available-icon" aria-hidden="true"><use href="#upgrade-available"></use></svg>\n      <svg class="icon upgrade-recovery-icon" aria-hidden="true"><use href="#upgrade-recovery"></use></svg>\n    </button>\n    <span id="brand-version" class="brand-version" hidden></span>\n  </div>\n  <div class="theme">\n    <button id="theme" type="button" class="theme-trigger" aria-label="\u5916\u89C2\u4E3B\u9898\uFF1A\u8DDF\u968F\u7CFB\u7EDF" title="\u5916\u89C2\u4E3B\u9898\uFF1A\u8DDF\u968F\u7CFB\u7EDF"\n      aria-haspopup="menu" aria-expanded="false" aria-controls="theme-menu">\n      <svg class="icon" aria-hidden="true"><use id="theme-icon" href="#monitor"></use></svg>\n    </button>\n    <div class="theme-menu" id="theme-menu" role="menu" aria-label="\u5916\u89C2\u4E3B\u9898" hidden>\n      <button type="button" role="menuitemradio" tabindex="-1" data-theme-option="light" aria-checked="false">\u6D45\u8272<svg class="icon" aria-hidden="true"><use href="#check"></use></svg></button>\n      <button type="button" role="menuitemradio" tabindex="-1" data-theme-option="dark" aria-checked="false">\u6DF1\u8272<svg class="icon" aria-hidden="true"><use href="#check"></use></svg></button>\n      <button type="button" role="menuitemradio" tabindex="-1" data-theme-option="system" aria-checked="true">\u8DDF\u968F\u7CFB\u7EDF<svg class="icon" aria-hidden="true"><use href="#check"></use></svg></button>\n    </div>\n  </div>\n</header>\n<main>\n  <div class="page-intro">\n    <div class="heading">\n      <h1>\u8BBE\u5907\u7BA1\u7406</h1>\n      <p>\u67E5\u770B\u8BBE\u5907\u63A5\u5165\u72B6\u6001\uFF0C\u7BA1\u7406 MCP Portal \u7684\u8FDC\u7A0B\u8BBF\u95EE\u3002</p>\n    </div>\n    <section class="portal" aria-label="MCP Portal">\n      <strong>MCP Portal</strong>\n      <div class="portal-value">\n        <code id="address" tabindex="-1">@@PORTAL@@</code>\n        <button class="button" type="button" id="copy-address"><svg class="icon" aria-hidden="true"><use href="#copy"></use></svg><span>\u590D\u5236\u5730\u5740</span></button>\n      </div>\n      <span class="sr-only" id="copy-feedback" role="status"></span>\n    </section>\n  </div>\n\n  <div class="portal-tools">\n    <button class="button" type="button" id="open-callbacks" aria-haspopup="dialog"><svg class="icon" aria-hidden="true"><use href="#link"></use></svg>\u5BA2\u6237\u7AEF\u56DE\u8C03\u914D\u7F6E</button>\n  </div>\n\n  <section class="devices" aria-labelledby="devices-title">\n    <div class="registry-heading">\n      <h2 id="devices-title">\u8BBE\u5907\u5217\u8868</h2>\n      <button class="button primary" type="button" id="add"@@ADD_DISABLED@@><svg class="icon" aria-hidden="true"><use href="#plus"></use></svg>\u6DFB\u52A0\u8BBE\u5907</button>\n    </div>\n    <div class="toolbar">\n      <div class="filters" role="group" aria-label="\u6309\u63A5\u5165\u72B6\u6001\u7B5B\u9009">\n        <button type="button" data-filter="all" aria-pressed="true">\u5168\u90E8 <span class="count">@@COUNT_ALL@@</span></button>\n        <button type="button" data-filter="active" aria-pressed="false">\u5DF2\u6CE8\u518C <span class="count">@@COUNT_ACTIVE@@</span></button>\n        <button type="button" data-filter="pending" aria-pressed="false">\u5F85\u63A5\u5165 <span class="count">@@COUNT_PENDING@@</span></button>\n        <button type="button" data-filter="disabled" aria-pressed="false">\u505C\u7528 <span class="count">@@COUNT_DISABLED@@</span></button>\n      </div>\n      <label class="search">\n        <svg class="icon" aria-hidden="true"><use href="#search"></use></svg>\n        <span class="sr-only">\u641C\u7D22\u8BBE\u5907\u540D\u79F0\u6216 ID</span>\n        <input type="search" id="device-search" placeholder="\u641C\u7D22\u8BBE\u5907\u540D\u79F0\u6216 ID" autocomplete="off">\n      </label>\n    </div>\n    <div class="table-wrap">\n      <table role="table" aria-labelledby="devices-title">\n        <colgroup><col class="identity-col"><col class="state-col"><col></colgroup>\n        <thead role="rowgroup"><tr role="row"><th scope="col">\u8BBE\u5907\u4E0E\u7CFB\u7EDF</th><th scope="col">\u63A5\u5165\u72B6\u6001</th><th scope="col">\u64CD\u4F5C</th></tr></thead>\n        <tbody role="rowgroup">@@ROWS@@</tbody>\n      </table>\n      <div class="empty" id="empty" hidden>\n        <svg class="icon" aria-hidden="true"><use href="#search"></use></svg>\n        <strong role="status">\u672A\u627E\u5230\u5339\u914D\u7684\u8BBE\u5907</strong>\n        <p>\u8BD5\u8BD5\u5176\u4ED6\u8BBE\u5907\u540D\u79F0\uFF0C\u6216\u6E05\u9664\u7B5B\u9009\u3002</p>\n        <button class="button" type="button" id="clear-filters">\u6E05\u9664\u7B5B\u9009</button>\n      </div>\n    </div>\n    <p class="note" role="status" id="device-list-feedback"></p>\n    <button id="retry-device-list" class="button" type="button" hidden>\u91CD\u8BD5\u5237\u65B0\u5217\u8868</button>\n    <p class="note">\u6CE8\u518C\u72B6\u6001\u4E0D\u4EE3\u8868\u8BBE\u5907\u5B9E\u65F6\u5728\u7EBF\u3002\u8BF7\u901A\u8FC7\u300C\u67E5\u770B\u72B6\u6001\u300D\u68C0\u67E5 Tunnel \u4E0E MCP \u5DE5\u5177\u76EE\u5F55\u3002</p>\n  </section>\n</main>\n\n<dialog id="add-dialog" aria-labelledby="add-title" data-any-system="@@ANY_SYSTEM@@" data-browser-consent="@@BROWSER_CONSENT@@">\n  <header class="dialog-head">\n    <h2 id="add-title">\u6DFB\u52A0\u8BBE\u5907</h2>\n    <button type="submit" form="close-add" class="dialog-close" aria-label="\u5173\u95ED\u5F39\u5C42"><svg class="icon" aria-hidden="true"><use href="#close"></use></svg></button>\n  </header>\n  <form id="add-device-form" method="post" action="/admin/devices/reserve">\n    <div class="dialog-body">\n      <label>\u8BBE\u5907\u540D\u79F0 <input name="name" required autofocus placeholder="\u4F8B\u5982\uFF1A\u529E\u516C\u5BA4 Mac" autocomplete="off" aria-describedby="name-hint"></label>\n      <p class="field-hint" id="name-hint">\u6700\u591A 20 \u4E2A\u5B57\uFF0C\u8BBE\u5907 ID \u7531\u7CFB\u7EDF\u81EA\u52A8\u751F\u6210\u3002</p>\n      <p class="feedback" id="add-feedback" role="status" hidden></p>\n    </div>\n    <div class="dialog-actions"><button class="button" type="submit" form="close-add">\u53D6\u6D88</button><button class="button primary" type="submit" id="save-device">\u6DFB\u52A0\u8BBE\u5907</button></div>\n  </form>\n  <form id="setup-device-form" method="post" action="/admin/devices" hidden>\n    <div class="dialog-body">\n      <p><strong id="setup-device-target"></strong> \xB7 <span id="setup-device-hint">\u9009\u62E9\u76EE\u6807\u8BBE\u5907\u7684\u64CD\u4F5C\u7CFB\u7EDF\u3002</span></p>\n      <input type="hidden" name="deviceId">\n      <fieldset class="platform-tabs"><legend class="sr-only">\u76EE\u6807\u7CFB\u7EDF</legend>@@PLATFORMS@@</fieldset>\n      <label id="browser-consent" hidden><span><input id="confirm-browser" name="browserConsent" type="checkbox" value="1" aria-describedby="browser-consent-hint" disabled> \u4E3A\u6B64\u8BBE\u5907\u542F\u7528\u6D4F\u89C8\u5668\u5DE5\u5177</span>\n        <span class="field-hint" id="browser-consent-hint">\u5B89\u88C5\u524D\u9700\u5728\u76EE\u6807\u8BBE\u5907\u914D\u7F6E\u6D4F\u89C8\u5668\u4E13\u7528\u540E\u7AEF\u3002</span></label>\n      <p class="feedback" id="setup-feedback" role="status" hidden></p>\n    </div>\n    <div class="dialog-actions"><button class="button" type="submit" form="close-add">\u53D6\u6D88</button><button class="button primary" type="submit" id="issue-command">\u751F\u6210\u5B89\u88C5\u547D\u4EE4</button></div>\n  </form>\n  <section class="dialog-body device-command" id="device-command-result" aria-labelledby="device-command-label" hidden>\n    <p><strong id="device-command-target"></strong> \xB7 <span id="command-instructions"></span></p>\n    <fieldset class="platform-tabs" id="device-command-systems" hidden><legend class="sr-only">\u76EE\u6807\u7CFB\u7EDF</legend></fieldset>\n    <h3 id="device-command-label">\u6307\u4EE4</h3>\n    <pre id="device-command" tabindex="0" aria-labelledby="device-command-label"></pre>\n    <button class="button primary" type="button" id="copy-device-command"><svg class="icon" aria-hidden="true"><use href="#copy"></use></svg><span>\u590D\u5236</span></button>\n    <p id="device-command-feedback" role="status" hidden></p>\n    <p id="device-command-expiration" class="field-hint"></p>\n    <p id="device-enrollment-progress" class="feedback" role="status" tabindex="-1"></p>\n  </section>\n  <form id="close-add" method="dialog"></form>\n</dialog>\n\n<dialog id="device-dialog" aria-labelledby="device-dialog-title">\n  <span class="risk-mark" id="risk-mark" hidden><svg class="icon" aria-hidden="true"><use href="#risk"></use></svg></span>\n  <header class="dialog-head">\n    <h2 id="device-dialog-title"></h2>\n    <button type="submit" form="close-detail" class="dialog-close" aria-label="\u5173\u95ED\u5F39\u5C42"><svg class="icon" aria-hidden="true"><use href="#close"></use></svg></button>\n  </header>\n  <div class="dialog-body">\n    <p id="device-summary"></p>\n    <dl class="detail" id="device-details">\n      <dt>\u6700\u540E\u68C0\u67E5</dt><dd id="checked-detail">\u672A\u67E5\u8BE2</dd>\n      <dt>\u6CE8\u518C</dt><dd id="registration-detail"></dd>\n      <dt>Cloudflare Tunnel</dt><dd id="tunnel-detail">\u672A\u67E5\u8BE2</dd>\n      <dt>\u5F00\u53D1\u5DE5\u5177\u76EE\u5F55</dt><dd id="mcp-detail">\u672A\u67E5\u8BE2</dd>\n      <dt id="browser-label" hidden>\u6D4F\u89C8\u5668\u5DE5\u5177\u76EE\u5F55</dt><dd id="browser-detail" hidden></dd>\n      <dt id="release-label" hidden>\u5B89\u88C5\u5305\u7248\u672C</dt><dd id="release-detail" hidden></dd>\n      <dt id="revocation-label" hidden>\u64A4\u9500</dt><dd id="revocation-detail" hidden></dd>\n      <dt id="server-label" hidden>Portal \u670D\u52A1 ID</dt><dd id="server-detail" hidden></dd>\n    </dl>\n    <p class="feedback" id="device-feedback" role="status"></p>\n  </div>\n  <form class="dialog-actions" id="close-detail" method="dialog">\n    <button class="button" id="detail-dismiss">\u5173\u95ED</button>\n    <button class="button danger" id="detail-confirm" type="button" disabled hidden></button>\n  </form>\n</dialog>\n\n<dialog id="callback-dialog" aria-labelledby="callback-title">\n  <header class="dialog-head">\n    <h2 id="callback-title">\u5BA2\u6237\u7AEF\u56DE\u8C03\u914D\u7F6E</h2>\n    <button type="submit" form="close-callbacks" class="dialog-close" aria-label="\u5173\u95ED\u56DE\u8C03\u914D\u7F6E"><svg class="icon" aria-hidden="true"><use href="#close"></use></svg></button>\n  </header>\n  <div id="callback-overview">\n    <div class="dialog-body callback-body">\n      <div class="callback-current">\n        <div><strong>\u5B9E\u9645\u914D\u7F6E</strong><p id="callback-summary">\u6B63\u5728\u8BFB\u53D6 Portal \u4E2D\u7684\u914D\u7F6E\u2026</p></div>\n        <span class="callback-tag" id="callback-state">\u8BFB\u53D6\u4E2D</span>\n      </div>\n      <p id="callback-feedback" role="status" tabindex="-1" hidden></p>\n      <button id="retry-callback-read" class="button" type="button" hidden>\u91CD\u8BD5\u8BFB\u53D6\u56DE\u8C03\u8BBE\u7F6E</button>\n      <section class="callback-section" id="callback-configured" aria-labelledby="callback-configured-title" hidden>\n        <h3 id="callback-configured-title">\u5DF2\u8BBE\u56DE\u8C03\u5730\u5740</h3>\n        <p>\u7531 Portal \u8FD4\u56DE\uFF0C\u53EF\u4F9B OAuth \u5BA2\u6237\u7AEF\u6CE8\u518C\u4F7F\u7528\u3002</p>\n        <ul id="callback-configured-list" class="callback-clients"></ul>\n      </section>\n      <section class="callback-section" id="callback-presets" aria-labelledby="callback-presets-title">\n        <h3 id="callback-presets-title">\u9884\u7F6E\u56DE\u8C03\u89C4\u5219</h3>\n        <p>\u6309\u5BA2\u6237\u7AEF\u6838\u5BF9\u9884\u7F6E\u89C4\u5219\u548C Portal \u7684\u914D\u7F6E\u72B6\u6001\u3002</p>\n        <ul class="callback-clients">\n          <li class="callback-client" data-preset-name="ChatGPT">\n            <strong class="callback-identity">ChatGPT</strong>\n            <div class="callback-uris">\n              <div class="callback-uri"><span>\u56FA\u5B9A\u56DE\u8C03\uFF08\u9002\u7528\u65F6\uFF09</span><code data-callback-address>https://chatgpt.com/connector_platform_oauth_redirect</code></div>\n              <div class="callback-uri"><span>\u6309\u8FDE\u63A5\u5206\u914D \xB7 \u6A21\u677F</span><code data-callback-address="https://chatgpt.com/connector/oauth/*">https://chatgpt.com/connector/oauth/{callback_id}</code></div>\n            </div>\n          </li>\n          <li class="callback-client" data-preset-name="Claude">\n            <strong class="callback-identity">Claude</strong>\n            <div class="callback-uri"><span>\u81EA\u5B9A\u4E49\u8FDE\u63A5\u5668</span><code data-callback-address>https://claude.ai/api/mcp/auth_callback</code></div>\n          </li>\n          <li class="callback-client" data-preset-name="Cursor">\n            <strong class="callback-identity">Cursor</strong>\n            <div class="callback-uris">\n              <div class="callback-uri"><span>\u7F51\u9875\u4E0E Agents</span><code data-callback-address>https://www.cursor.com/agents/mcp/oauth/callback</code></div>\n              <div class="callback-uri"><span>\u684C\u9762</span><code data-callback-address>http://localhost:8787/callback</code></div>\n              <div class="callback-uri"><span>\u539F\u751F\u534F\u8BAE</span><code data-callback-address>cursor://anysphere.cursor-mcp/oauth/callback</code></div>\n            </div>\n          </li>\n          <li class="callback-client" data-preset-name="VS Code">\n            <strong class="callback-identity">VS Code</strong>\n            <div class="callback-uris">\n              <div class="callback-uri"><span>\u7F51\u9875</span><code data-callback-address>https://vscode.dev/redirect</code></div>\n              <div class="callback-uri"><span>\u684C\u9762</span><code data-callback-address>http://127.0.0.1:33418/</code></div>\n            </div>\n          </li>\n          <li class="callback-client">\n            <div class="callback-identity"><strong>WorkBuddy</strong><span class="callback-tag" id="workbuddy-state" data-tone="pending">\u5F85\u914D\u7F6E</span></div>\n            <div class="callback-unset"><p>\u6CA1\u6709\u5DF2\u9A8C\u8BC1\u7684\u901A\u7528\u5730\u5740\uFF0C\u8BF7\u586B\u5199\u5BA2\u6237\u7AEF\u63D0\u4F9B\u7684\u51C6\u786E\u56DE\u8C03\u3002</p><button class="button" type="button" id="add-workbuddy" data-client="WorkBuddy" disabled>\u586B\u5199 WorkBuddy \u56DE\u8C03</button></div>\n          </li>\n        </ul>\n      </section>\n    </div>\n    <div class="dialog-actions">\n      <button class="button" type="submit" form="close-callbacks">\u5173\u95ED</button>\n      <button class="button primary" type="button" id="add-client" disabled><svg class="icon" aria-hidden="true"><use href="#plus"></use></svg>\u6DFB\u52A0\u5176\u4ED6\u5BA2\u6237\u7AEF</button>\n    </div>\n  </div>\n  <form id="callback-form" novalidate hidden>\n    <div class="dialog-body callback-body">\n      <p>\u8F93\u5165\u5BA2\u6237\u7AEF\u63D0\u4F9B\u7684\u51C6\u786E\u5730\u5740\u3002\u4FDD\u5B58\u540E\uFF0C\u6B64 Portal \u53EF\u63A5\u53D7\u4F7F\u7528\u8BE5\u56DE\u8C03\u5730\u5740\u7684 OAuth \u5BA2\u6237\u7AEF\u6CE8\u518C\u3002</p>\n      <label for="callback-name">\u5BA2\u6237\u7AEF\u540D\u79F0</label>\n      <input id="callback-name" name="clientName" type="text" autocomplete="off" maxlength="64" required aria-describedby="callback-name-error">\n      <p id="callback-name-error" class="field-error" role="alert" hidden></p>\n      <label for="callback-url">\u56DE\u8C03\u5730\u5740</label>\n      <input id="callback-url" name="redirectUri" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="2048" placeholder="https://client.example/oauth/callback" required aria-describedby="callback-url-hint callback-url-error">\n      <p id="callback-url-hint" class="field-hint">\u586B\u5199\u5B8C\u6574\u56DE\u8C03 URL\uFF0C\u4E0D\u8981\u7C98\u8D34\u6388\u6743\u7801\u6216\u5BC6\u94A5\u3002</p>\n      <p id="callback-url-error" class="field-error" role="alert" hidden></p>\n      <p id="callback-save-error" class="field-error" role="alert" hidden></p>\n    </div>\n    <div class="dialog-actions">\n      <button class="button" type="button" id="cancel-callback">\u53D6\u6D88</button>\n      <button class="button primary" id="save-callback" type="submit">\u4FDD\u5B58</button>\n    </div>\n  </form>\n  <form id="close-callbacks" method="dialog"></form>\n</dialog>\n\n<dialog id="upgrade-dialog" aria-labelledby="upgrade-title" aria-describedby="upgrade-description">\n  <header class="dialog-head"><h2 id="upgrade-title">\u5347\u7EA7\u8BFA\u8054\u7BA1\u7406\u53F0</h2>\n    <button type="submit" form="close-upgrade" class="dialog-close" aria-label="\u5173\u95ED\u5347\u7EA7"><svg class="icon" aria-hidden="true"><use href="#close"></use></svg></button>\n  </header>\n  <div class="dialog-body">\n    <p id="upgrade-description"></p>\n    <p id="upgrade-status" class="feedback" role="status"></p>\n  </div>\n  <form class="dialog-actions" id="close-upgrade" method="dialog">\n    <button class="button" id="close-upgrade-button" type="submit">\u5173\u95ED</button>\n    <button class="button primary" id="reconcile-upgrade" type="button" hidden>\u6838\u5BF9\u5B9E\u9645\u72B6\u6001</button>\n    <button class="button primary" id="confirm-upgrade" type="button" hidden>\u786E\u8BA4\u5347\u7EA7</button>\n  </form>\n</dialog>\n<script nonce="@@NONCE@@">@@SCRIPT@@<\/script>\n</body>\n</html>\n'])), consoleStyles, consoleLogoUrl, consoleLogoUrl);

// ../cloud/upgrade-feed-migration.mjs
var legacyPreviewFeed = "https://raw.githubusercontent.com/Erlin0220/nodrelay-downloads/refs/heads/macos-preview/updates/";
var legacyPreviewMigrationMirror = legacyPreviewFeed + "migration/";
var publicPreviewFeed = "https://raw.githubusercontent.com/Erlin0220/nodrelay/refs/heads/updates/";
function normalizeFeedMigration(input, channel) {
  if (input === void 0) return;
  if (channel !== "preview" || !input || typeof input !== "object" || Object.keys(input).length !== 2 || input.from !== legacyPreviewFeed || input.to !== publicPreviewFeed) {
    throw new Error("Invalid signed Nodrelay preview feed migration");
  }
  return Object.freeze({ from: input.from, to: input.to });
}
__name(normalizeFeedMigration, "normalizeFeedMigration");

// ../cloud/upgrade-enrollment-release.mjs
var protocol = "intent-v1";
var hash = /^[a-f0-9]{64}$/;
var assetVersion = /^[0-9][A-Za-z0-9._-]{0,39}$/;
var record3 = /* @__PURE__ */ __name((value) => value !== null && typeof value === "object" && !Array.isArray(value), "record");
var matches3 = /* @__PURE__ */ __name((pattern, value) => typeof value === "string" && pattern.test(value), "matches");
var exact = /* @__PURE__ */ __name((value, keys) => record3(value) && Object.keys(value).length === keys.length && keys.every((key4) => Object.hasOwn(value, key4)), "exact");
var targets = Object.entries(operatingSystems).flatMap(([os, value]) => value.architectures.map((arch) => `${os}-${arch}`));
var enrollmentUpgradeAccessPaths = Object.freeze([enrollPath, activatePath, ...Object.keys(operatingSystems).map(installPath)]);
var enrollmentUpgradeBindingBudget = 4096;
var protocolName = "FLEET_ENROLLMENT_PROTOCOL";
var historyName = "FLEET_ENROLLMENT_HISTORY";
var catalogName = "FLEET_ENROLLMENT_CATALOG";
function hostedCatalog(input) {
  if (!record3(input) || !supportedEnrollmentTargets.every((target) => Object.hasOwn(input, target)) || Object.keys(input).some((target) => !targets.includes(target))) {
    throw new Error("Signed enrollment needs all currently supported installer targets");
  }
  return Object.freeze(Object.fromEntries(targets.filter((target) => Object.hasOwn(input, target)).map((target) => {
    const asset = input[target];
    const url = typeof asset?.url === "string" && URL.parse(asset.url);
    if (!exact(asset, ["url", "sha256", "version", "browser"]) || !matches3(hash, asset.sha256) || !matches3(assetVersion, asset.version) || typeof asset.browser !== "boolean" || !url || url.href !== asset.url || url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      throw new Error("Invalid signed hosted enrollment installer");
    }
    return [target, Object.freeze({ url: url.href, sha256: asset.sha256, version: asset.version, browser: asset.browser })];
  })));
}
__name(hostedCatalog, "hostedCatalog");
function validateSignedEnrollmentRelease({ release, manifestSha256 }) {
  if (!matches3(hash, manifestSha256) || release?.schema !== 2 || release.product !== "nodrelay-management" || !exact(release.enrollment, ["protocol", "releases"]) || release.enrollment.protocol !== protocol) {
    throw new Error("Verified schema-2 enrollment release and manifest digest are required");
  }
  const releases = hostedCatalog(release.enrollment.releases);
  const history = mergeEnrollmentBootstrapHistory({}, releases);
  return Object.freeze({ manifestSha256, protocol, releases, history });
}
__name(validateSignedEnrollmentRelease, "validateSignedEnrollmentRelease");
function loadPlain(bindings, name) {
  const fields = bindings.filter((binding) => binding?.name === name);
  if (!fields.length) return;
  if (fields.length !== 1 || fields[0].type !== "plain_text" || typeof fields[0].text !== "string" || !fields[0].text) {
    throw new Error("Unverified existing enrollment binding");
  }
  return fields[0].text;
}
__name(loadPlain, "loadPlain");
function parse2(text2) {
  try {
    return JSON.parse(text2);
  } catch {
    throw new Error("Unverified existing enrollment binding");
  }
}
__name(parse2, "parse");
function assertDistinctAssetPins(history, legacy) {
  const pins = /* @__PURE__ */ new Map();
  const observe = /* @__PURE__ */ __name((asset) => {
    if (asset?.url === void 0) return;
    const url = typeof asset.url === "string" && URL.parse(asset.url);
    if (!url || url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !matches3(hash, asset.sha256)) {
      throw new Error("Unverified hosted asset pin");
    }
    if (pins.has(url.href) && pins.get(url.href) !== asset.sha256) throw new Error("A published installer URL cannot be reassigned to different bytes");
    pins.set(url.href, asset.sha256);
  }, "observe");
  for (const asset of Object.values(legacy)) observe(asset);
  for (const versions of Object.values(history)) {
    for (const group of Object.values(versions)) for (const asset of Object.values(group.assets)) observe(asset);
  }
}
__name(assertDistinctAssetPins, "assertDistinctAssetPins");
function planEnrollmentUpgrade({ release, manifestSha256, expectedManifestSha256, activeBindings, readiness }) {
  const approved = validateSignedEnrollmentRelease({ release, manifestSha256 });
  if (manifestSha256 !== expectedManifestSha256) throw new Error("Signed enrollment manifest changed after approval");
  if (readiness?.verifiedD1 !== true || !record3(readiness.exactAccessRoutes) || enrollmentUpgradeAccessPaths.some((path) => !Object.hasOwn(readiness.exactAccessRoutes, path) || readiness.exactAccessRoutes[path] !== true)) {
    throw new Error("Verified enrollment D1 schema and exact Access routes are required");
  }
  if (!Array.isArray(activeBindings)) throw new Error("Missing active binding readback");
  const legacy = parse2(loadPlain(activeBindings, "RELEASE_CATALOG"));
  if (!record3(legacy) || !Object.keys(legacy).length) throw new Error("Unverified existing legacy catalog");
  const existingProtocol = loadPlain(activeBindings, protocolName);
  const existingHistory = loadPlain(activeBindings, historyName);
  const existingCatalog = loadPlain(activeBindings, catalogName);
  const anyIntentBinding = existingProtocol !== void 0 || existingHistory !== void 0 || existingCatalog !== void 0;
  let previous = {};
  if (anyIntentBinding) {
    if (existingProtocol !== protocol || existingHistory === void 0) throw new Error("Incomplete existing enrollment configuration");
    previous = mergeEnrollmentBootstrapHistory(parse2(existingHistory), {});
    const current = hostedCatalog(existingCatalog === void 0 ? legacy : parse2(existingCatalog));
    if (JSON.stringify(mergeEnrollmentBootstrapHistory(previous, current)) !== JSON.stringify(previous)) {
      throw new Error("Existing enrollment history is missing active installer pins");
    }
  }
  const history = mergeEnrollmentBootstrapHistory(previous, approved.releases);
  assertDistinctAssetPins(history, legacy);
  const changes = Object.freeze({
    [protocolName]: protocol,
    [historyName]: JSON.stringify(history),
    [catalogName]: JSON.stringify(approved.releases)
  });
  if (Object.values(changes).some((value) => new TextEncoder().encode(value).byteLength > enrollmentUpgradeBindingBudget)) {
    throw new Error("Enrollment history exceeds the binding budget; no historical pin may be removed");
  }
  return Object.freeze({ manifestSha256, changes });
}
__name(planEnrollmentUpgrade, "planEnrollmentUpgrade");

// ../cloud/upgrade-plan.mjs
var MAX_MANIFEST = 64 * 1024;
var MAX_WORKER = 8 * 1024 * 1024;
var MAX_VALIDITY = 90 * 864e5;
var versionPattern3 = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})(?:-preview\.(0|[1-9]\d{0,8}))?$/;
var uuidPattern3 = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
var requiredPlain = [
  "APP_ORIGIN",
  "ACCESS_ISSUER",
  "ACCESS_AUD",
  "OWNER_EMAIL",
  "FLEET_SPEC",
  "RELEASE_CATALOG",
  "FLEET_OAUTH_CLIENT_ID",
  "FLEET_OAUTH_MODE",
  "FLEET_OAUTH_RECOVERY"
];
var requiredSecrets = ["TICKET_KEY", "FLEET_OAUTH_KEY"];
var blockedBindings = ["PROVISIONER_TOKEN", "FLEET_OAUTH_SEED", "FLEET_OAUTH_RECONNECT"];
var permittedChanges = /* @__PURE__ */ new Set([
  "NODRELAY_RELEASE_VERSION",
  "NODRELAY_UPGRADE_FEED",
  "FLEET_ENROLLMENT_PROTOCOL",
  "FLEET_ENROLLMENT_HISTORY",
  "FLEET_ENROLLMENT_CATALOG"
]);
function version(value) {
  const parts = typeof value === "string" && versionPattern3.exec(value);
  if (!parts) throw new Error("Invalid Nodrelay upgrade version");
  return [Number(parts[1]), Number(parts[2]), Number(parts[3]), parts[4] === void 0 ? Infinity : Number(parts[4])];
}
__name(version, "version");
function compare(left, right) {
  const position = left.findIndex((part, index) => part !== right[index]);
  return position < 0 ? 0 : left[position] > right[position] ? 1 : -1;
}
__name(compare, "compare");
function timestamp(value) {
  if (typeof value !== "string") return NaN;
  const time2 = Date.parse(value);
  return Number.isFinite(time2) && new Date(time2).toISOString() === value ? time2 : NaN;
}
__name(timestamp, "timestamp");
async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(sha256, "sha256");
async function verifyUpgradeRelease({ manifest, signature, bundle, publicKey, channel, currentVersion, now: now4 = Date.now(), allowCurrent = false, format = 1 }) {
  if (format !== 1 && format !== 2) throw new Error("Invalid Nodrelay upgrade format");
  if (!(manifest instanceof Uint8Array) || manifest.length === 0 || manifest.length > MAX_MANIFEST || !(signature instanceof Uint8Array) || signature.length !== 64 || !(bundle instanceof Uint8Array) || bundle.length === 0 || bundle.length > MAX_WORKER) {
    throw new Error("Invalid Nodrelay upgrade artifact size or type");
  }
  if (!(publicKey instanceof CryptoKey) || publicKey.type !== "public" || publicKey.algorithm.name !== "Ed25519" || !publicKey.usages.includes("verify")) throw new Error("The pinned Nodrelay upgrade verification key is unavailable");
  if (!["stable", "preview"].includes(channel) || !Number.isFinite(now4)) throw new Error("Invalid upgrade channel or clock");
  const verifiedManifest = new Uint8Array(manifest);
  const verifiedBundle = new Uint8Array(bundle);
  if (!await crypto.subtle.verify("Ed25519", publicKey, new Uint8Array(signature), verifiedManifest)) {
    throw new Error("Invalid Nodrelay upgrade signature");
  }
  let release;
  try {
    release = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(verifiedManifest));
  } catch {
    throw new Error("Invalid Nodrelay upgrade metadata");
  }
  const fields = ["schema", "product", "channel", "version", "minimumVersion", "issuedAt", "expiresAt", "workerBundle", "workerSha256"];
  if (format === 2) {
    fields.push("enrollment");
    if (Object.hasOwn(release ?? {}, "feedMigration")) fields.push("feedMigration");
  }
  if (!release || !fields.every((name) => Object.hasOwn(release, name)) || Object.keys(release).length !== fields.length || release.schema !== format || release.product !== "nodrelay-management" || release.workerBundle !== "worker.js" || typeof release.workerSha256 !== "string" || !/^[a-f0-9]{64}$/.test(release.workerSha256)) {
    throw new Error("Invalid Nodrelay upgrade metadata");
  }
  const next = version(release.version), current = version(currentVersion), minimum = version(release.minimumVersion);
  if (release.channel !== channel || next[3] === Infinity !== (channel === "stable") || channel === "stable" && current[3] !== Infinity) throw new Error("Nodrelay upgrade channel does not match");
  const advance = compare(next, current);
  if (advance < 0 || advance === 0 && !allowCurrent) throw new Error("Nodrelay upgrade is not newer than the active version");
  if (compare(current, minimum) < 0) throw new Error("The current Nodrelay version cannot upgrade to this release");
  const start = timestamp(release.issuedAt), end = timestamp(release.expiresAt);
  if (!(start <= now4 && now4 < end && end - start <= MAX_VALIDITY)) throw new Error("Nodrelay upgrade metadata is not current");
  const actual = await sha256(verifiedBundle);
  if (actual !== release.workerSha256) throw new Error("Nodrelay upgrade Worker SHA-256 mismatch");
  if (format === 2) {
    const manifestSha256 = await sha256(verifiedManifest);
    if (Object.hasOwn(release, "feedMigration")) release.feedMigration = normalizeFeedMigration(release.feedMigration, channel);
    const enrollment = validateSignedEnrollmentRelease({ release, manifestSha256 });
    release.enrollment = Object.freeze({ protocol: enrollment.protocol, releases: enrollment.releases });
    return { release: Object.freeze(release), bundle: verifiedBundle, manifestSha256 };
  }
  return { release: Object.freeze(release), bundle: verifiedBundle };
}
__name(verifyUpgradeRelease, "verifyUpgradeRelease");
function canonical3(value) {
  if (Array.isArray(value)) return value.map(canonical3);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key4) => [key4, canonical3(value[key4])]));
}
__name(canonical3, "canonical");
function bindingMap(input) {
  if (!Array.isArray(input)) throw new Error("Missing Cloudflare Worker binding metadata");
  const result = /* @__PURE__ */ new Map();
  for (const binding of input) {
    if (!binding || typeof binding.name !== "string" || typeof binding.type !== "string" || result.has(binding.name) || blockedBindings.includes(binding.name) || binding.type === "secret_text" && Object.keys(binding).some((name) => !["name", "type"].includes(name))) {
      throw new Error("Unexpected or unsettled Cloudflare Worker binding metadata");
    }
    result.set(binding.name, binding);
  }
  for (const name of requiredPlain) {
    const binding = result.get(name);
    if (binding?.type !== "plain_text" || typeof binding.text !== "string" || !binding.text) {
      throw new Error("Missing required Nodrelay Worker binding");
    }
  }
  for (const name of requiredSecrets) {
    if (result.get(name)?.type !== "secret_text") throw new Error("Missing required Nodrelay Worker secret binding");
  }
  const db = result.get("TICKETS"), broker = result.get("PROVISIONER_OAUTH");
  if (db?.type !== "d1" || typeof db.id !== "string" || !uuidPattern3.test(db.id) || broker?.type !== "durable_object_namespace" || broker.class_name !== "OAuthProvisioner" || typeof broker.namespace_id !== "string" || !/^[a-f0-9]{32}$/.test(broker.namespace_id) || result.get("FLEET_OAUTH_MODE").text !== "managed" || result.get("FLEET_OAUTH_RECOVERY").text !== "1") {
    throw new Error("The existing deployment is not a verified managed OAuth Worker");
  }
  return result;
}
__name(bindingMap, "bindingMap");
function validateUpgradePreconditions({ deployments, latestVersion, activeBindings, candidateBindings, plannedChanges = {} }) {
  const current = Array.isArray(deployments) && deployments.length === 1 ? deployments[0] : void 0;
  if (typeof latestVersion !== "string" || !uuidPattern3.test(latestVersion) || current?.version_id !== latestVersion || current.percentage !== 100) {
    throw new Error("Cloudflare does not have exactly one 100% active version matching its latest upload");
  }
  validateUpgradeBindings(activeBindings, candidateBindings, plannedChanges);
  return { activeVersion: latestVersion };
}
__name(validateUpgradePreconditions, "validateUpgradePreconditions");
function validateUpgradeBindings(activeBindings, candidateBindings, plannedChanges = {}) {
  const active = bindingMap(activeBindings);
  const candidate = bindingMap(candidateBindings);
  const expected = new Map(active);
  for (const [name, text2] of Object.entries(plannedChanges)) {
    if (!permittedChanges.has(name) || typeof text2 !== "string" || !text2 || active.has(name) && active.get(name).type !== "plain_text") throw new Error("Unapproved Nodrelay binding change");
    if (name === "NODRELAY_UPGRADE_FEED" && (active.get(name)?.text !== legacyPreviewFeed || active.get("NODRELAY_UPGRADE_CHANNEL")?.text !== "preview" || text2 !== publicPreviewFeed)) {
      throw new Error("Unapproved Nodrelay feed migration");
    }
    expected.set(name, { ...active.get(name), name, type: "plain_text", text: text2 });
  }
  if (candidate.size !== expected.size || [...expected].some(([name, binding]) => JSON.stringify(canonical3(binding)) !== JSON.stringify(canonical3(candidate.get(name))))) {
    throw new Error("Cloudflare Worker bindings do not match the approved upgrade plan");
  }
}
__name(validateUpgradeBindings, "validateUpgradeBindings");

// ../cloud/upgrade-artifacts.mjs
var maxBytes = { manifest: 64 * 1024, signature: 64, worker: 8 * 1024 * 1024 };
var downloadRequest = /* @__PURE__ */ __name((url, request, signal) => request(url.href, {
  method: "GET",
  redirect: "manual",
  cache: "no-store",
  credentials: "omit",
  signal,
  headers: { Accept: "application/octet-stream, application/json, text/javascript" }
}), "downloadRequest");
async function download(url, max, request, signal, received) {
  const response2 = received ?? await downloadRequest(url, request, signal);
  const length = Number(response2.headers.get("Content-Length"));
  if (response2.status !== 200 || !response2.body || length > max) {
    await response2.body?.cancel();
    throw new Error("The Nodrelay upgrade feed is unavailable or returned an oversized artifact");
  }
  const reader = response2.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (; ; ) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) throw new Error("The Nodrelay upgrade feed returned an oversized artifact");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {
    });
  }
  const result = new Uint8Array(size);
  let cursor = 0;
  for (const chunk of chunks) {
    result.set(chunk, cursor);
    cursor += chunk.length;
  }
  return result;
}
__name(download, "download");
async function loadVerifiedUpgradeArtifacts({
  base,
  channel,
  currentVersion,
  publicKey,
  request = fetch,
  now: now4 = Date.now(),
  allowCurrent = false,
  format = 1
}) {
  const directory = typeof base === "string" && URL.parse(base);
  if (!directory || directory.protocol !== "https:" || directory.username || directory.password || directory.search || directory.hash || !directory.pathname.endsWith("/") || !["stable", "preview"].includes(channel) || format !== 1 && format !== 2 && format !== "auto") {
    throw new Error("Invalid trusted Nodrelay upgrade feed configuration");
  }
  const transfer = new AbortController();
  const signal = AbortSignal.any([AbortSignal.timeout(15e3), transfer.signal]);
  const path = /* @__PURE__ */ __name((mode, filename) => new URL(channel + (mode === 2 ? "/v2/" : "/") + filename, directory), "path");
  try {
    let received;
    if (format === "auto") {
      const v2 = await downloadRequest(path(2, "manifest.json"), request, signal);
      if (v2.status === 404) {
        await v2.body?.cancel();
        format = 1;
      } else {
        if (v2.status !== 200) {
          await v2.body?.cancel();
          throw new Error("The Nodrelay v2 upgrade feed cannot be verified");
        }
        format = 2;
        received = v2;
      }
    }
    const [manifest, signature, bundle] = await Promise.all([
      download(path(format, "manifest.json"), maxBytes.manifest, request, signal, received),
      download(path(format, "manifest.json.sig"), maxBytes.signature, request, signal),
      download(path(format, "worker.js"), maxBytes.worker, request, signal)
    ]);
    const verified = await verifyUpgradeRelease({ manifest, signature, bundle, publicKey, channel, currentVersion, now: now4, allowCurrent, format });
    return {
      release: verified.release,
      ...format === 2 && { manifestSha256: verified.manifestSha256 },
      artifact: { manifest, signature, bundle: verified.bundle, publicKey, channel, ...format === 2 && { format } }
    };
  } catch (error) {
    transfer.abort();
    throw error;
  }
}
__name(loadVerifiedUpgradeArtifacts, "loadVerifiedUpgradeArtifacts");

// ../cloud/upgrade-cloudflare.mjs
var accountId = /^[a-f0-9]{32}$/;
var workerName = /^fleet-[a-z][a-z0-9-]{2,15}-[a-f0-9]{12}$/;
var uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
var operationUuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
var identifier = /^[A-Za-z_][A-Za-z0-9_]{0,126}$/;
var semver = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})(?:-preview\.(0|[1-9]\d{0,8}))?$/;
var blocked = /* @__PURE__ */ new Set(["PROVISIONER_TOKEN", "FLEET_OAUTH_SEED", "FLEET_OAUTH_RECONNECT"]);
var usage = /* @__PURE__ */ new Set(["standard", "bundled", "unbound"]);
var maxWorkerBytes = 8 * 1024 * 1024;
var matches4 = /* @__PURE__ */ __name((pattern, value) => typeof value === "string" && pattern.test(value), "matches");
var keysOnly = /* @__PURE__ */ __name((value, fields) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every((field) => fields.includes(field)), "keysOnly");
var etag = /* @__PURE__ */ __name((value) => matches4(/^[a-zA-Z0-9_-]{16,128}$/, value), "etag");
function reject(message2) {
  throw new Error(message2);
}
__name(reject, "reject");
function deployment(value) {
  if (!matches4(uuid, value?.id) || value.strategy !== "percentage" || !Array.isArray(value.versions) || !value.versions.length || value.versions.length > 20) reject("Cloudflare did not return recognizable deployment metadata");
  let total = 0;
  const ids = /* @__PURE__ */ new Set();
  const versions = value.versions.map((item) => {
    if (!matches4(uuid, item?.version_id) || ids.has(item.version_id) || !Number.isFinite(item.percentage) || item.percentage < 0.01 || item.percentage > 100) {
      reject("Cloudflare did not return recognizable deployment traffic weights");
    }
    ids.add(item.version_id);
    total += item.percentage;
    return { version_id: item.version_id, percentage: item.percentage };
  });
  if (Math.abs(total - 100) > 1e-8) reject("Cloudflare did not return complete deployment traffic weights");
  return { id: value.id, versions };
}
__name(deployment, "deployment");
function normalizeBindings(output, worker2) {
  if (!Array.isArray(output) || !output.length) reject("Cloudflare did not return the version binding list");
  const ids = /* @__PURE__ */ new Set();
  const bindings = output.map((value) => {
    if (!matches4(identifier, value?.name) || ids.has(value.name) || blocked.has(value.name)) {
      reject("Cloudflare returned incomplete or unsettled Worker bindings");
    }
    const { name, type } = value;
    ids.add(name);
    if (type === "plain_text" && keysOnly(value, ["name", "type", "text"]) && typeof value.text === "string") {
      return { name, type, text: value.text };
    }
    if (type === "secret_text" && keysOnly(value, ["name", "type"])) return { name, type };
    if (type === "d1" && name === "TICKETS" && keysOnly(value, ["name", "type", "database_id", "id"])) {
      const id2 = value.database_id ?? value.id;
      if (matches4(uuid, id2) && (value.id === void 0 || value.id === id2) && (value.database_id === void 0 || value.database_id === id2)) return { name, type, id: id2 };
    }
    if (type === "durable_object_namespace" && name === "PROVISIONER_OAUTH" && keysOnly(value, ["name", "type", "namespace_id", "class_name", "script_name"]) && value.class_name === "OAuthProvisioner" && matches4(accountId, value.namespace_id) && (value.script_name === void 0 || value.script_name === worker2)) {
      return { name, type, namespace_id: value.namespace_id, class_name: value.class_name };
    }
    reject("Cloudflare returned an unsupported or incomplete Worker version binding");
  });
  if (!bindings.some((value) => value.name === "TICKETS" && value.type === "d1") || !bindings.some((value) => value.name === "PROVISIONER_OAUTH" && value.type === "durable_object_namespace")) {
    reject("Cloudflare did not return the D1 and Durable Object binding identities");
  }
  return bindings;
}
__name(normalizeBindings, "normalizeBindings");
function runtimeView(value) {
  const date = value?.compatibility_date;
  const flags = value?.compatibility_flags === void 0 ? [] : value.compatibility_flags;
  if (!matches4(/^\d{4}-\d{2}-\d{2}$/, date) || !Array.isArray(flags) || flags.some((flag) => !matches4(/^[a-z0-9_]{1,100}$/, flag)) || new Set(flags).size !== flags.length || !matches4(/^[a-zA-Z0-9_.-]{1,128}$/, value?.migration_tag) || !usage.has(value?.usage_model)) {
    reject("Cloudflare did not return complete runtime or Durable Object migration metadata");
  }
  const provisioner = value.exports?.OAuthProvisioner;
  if (provisioner && (provisioner.type !== "durable-object" || provisioner.storage !== "sqlite" || provisioner.state !== void 0 && provisioner.state !== "created")) {
    reject("Cloudflare did not identify the existing SQLite Durable Object export");
  }
  return { compatibilityDate: date, compatibilityFlags: [...flags], migrationTag: value.migration_tag, usageModel: value.usage_model };
}
__name(runtimeView, "runtimeView");
function versionView(value, worker2, requestedId) {
  const resources = value?.resources;
  if (value?.id !== requestedId || !etag(resources?.script?.etag)) reject("Cloudflare did not identify the requested Worker version");
  return {
    id: value.id,
    etag: resources.script.etag,
    bindings: normalizeBindings(resources.bindings, worker2),
    runtime: runtimeView(resources.script_runtime)
  };
}
__name(versionView, "versionView");
var baselineSettings = Object.freeze([
  "NODRELAY_RELEASE_VERSION",
  "NODRELAY_UPGRADE_CHANNEL",
  "NODRELAY_UPGRADE_PUBLIC_KEY",
  "NODRELAY_UPGRADE_FEED"
]);
var enrollmentSettings = Object.freeze([
  "FLEET_ENROLLMENT_PROTOCOL",
  "FLEET_ENROLLMENT_HISTORY",
  "FLEET_ENROLLMENT_CATALOG"
]);
function rolloutBindings(list, baseline = false, enrollment = false) {
  if (!Array.isArray(list) || list.length < 2) reject("Incomplete Worker upgrade upload bindings");
  const names = /* @__PURE__ */ new Set();
  const result = list.map((value) => {
    const { name, type } = value ?? {};
    if (!matches4(identifier, name) || names.has(name) || blocked.has(name)) reject("Invalid Worker upgrade upload binding");
    names.add(name);
    if (name === "NODRELAY_RELEASE_VERSION") {
      if (type !== "plain_text" || !keysOnly(value, ["type", "name", "text"]) || !matches4(semver, value.text)) {
        reject("Invalid Worker upgrade release binding");
      }
      return { name, type, text: value.text };
    }
    if (enrollment && enrollmentSettings.includes(name)) {
      let valid2;
      if (name === enrollmentSettings[0]) valid2 = value.text === "intent-v1";
      else if (typeof value.text === "string" && new TextEncoder().encode(value.text).byteLength <= 4096) {
        try {
          const contents = JSON.parse(value.text);
          valid2 = contents && typeof contents === "object" && !Array.isArray(contents) && Object.keys(contents).length > 0;
        } catch {
          valid2 = false;
        }
      }
      if (type !== "plain_text" || !keysOnly(value, ["type", "name", "text"]) || typeof value.text !== "string" || !valid2) {
        reject("Invalid signed Worker enrollment binding");
      }
      return { name, type, text: value.text };
    }
    if (baseline && baselineSettings.includes(name)) {
      const url = name === "NODRELAY_UPGRADE_FEED" && typeof value.text === "string" && URL.parse(value.text);
      const valid2 = name === "NODRELAY_UPGRADE_CHANNEL" ? ["stable", "preview"].includes(value.text) : name === "NODRELAY_UPGRADE_PUBLIC_KEY" ? matches4(/^[A-Za-z0-9_-]{59}$/, value.text) : url && url.href === value.text && url.protocol === "https:" && !url.port && !url.username && !url.password && !url.search && !url.hash && url.pathname.endsWith("/");
      if (type !== "plain_text" || !keysOnly(value, ["type", "name", "text"]) || !valid2) {
        reject("Invalid Worker baseline trust binding");
      }
      return { name, type, text: value.text };
    }
    if (type !== "inherit" || !keysOnly(value, ["name", "type"])) reject("A Worker upgrade may only inherit its existing bindings");
    return { name, type };
  });
  for (const name of [...baseline ? baselineSettings : [baselineSettings[0]], ...enrollment ? enrollmentSettings : [], "TICKETS", "PROVISIONER_OAUTH", "TICKET_KEY", "FLEET_OAUTH_KEY"]) {
    if (!names.has(name)) reject("Incomplete Worker upgrade upload bindings");
  }
  return result;
}
__name(rolloutBindings, "rolloutBindings");
function createCloudflareUpgradeAdapter(api, target, { baseline = false, enrollment = false } = {}) {
  const account = target?.accountId, worker2 = target?.worker;
  if (baseline === true && enrollment === true || !matches4(accountId, account) || !matches4(workerName, worker2) || typeof api?.get !== "function" || typeof api?.post !== "function") reject("Invalid Cloudflare upgrade adapter target");
  const script = "/accounts/" + account + "/workers/scripts/" + worker2;
  function assertTarget(input) {
    if (input?.accountId !== account || input.worker !== worker2) reject("Cloudflare upgrade adapter target changed");
  }
  __name(assertTarget, "assertTarget");
  return {
    async readDeployment(input) {
      assertTarget(input);
      const query = { page: 1, per_page: 1 };
      const [active, latest] = await Promise.all([api.get(script + "/deployments", query), api.get(script + "/versions", query)]);
      if (!Array.isArray(active?.deployments) || !Array.isArray(latest?.items) || !matches4(uuid, latest.items[0]?.id)) {
        reject("Cloudflare did not identify the active deployment and latest upload");
      }
      return { deployments: deployment(active.deployments[0]).versions, latestVersion: latest.items[0].id };
    },
    async readVersion(input, id2) {
      assertTarget(input);
      if (!matches4(uuid, id2)) reject("Invalid Cloudflare Worker version ID");
      return versionView(await api.get(script + "/versions/" + id2), worker2, id2);
    },
    async uploadVersion(input, options) {
      assertTarget(input);
      let metadata;
      try {
        if (!keysOnly(options, [
          "bundle",
          "module",
          "bindingsInherit",
          "bindings",
          "compatibilityDate",
          "compatibilityFlags",
          "usageModel",
          "operationId"
        ]) || options.module !== "worker.js" || options.bindingsInherit !== "strict" || !matches4(operationUuid, options.operationId) || !(options.bundle instanceof Uint8Array) || options.bundle.length < 1 || options.bundle.length > maxWorkerBytes || !matches4(/^\d{4}-\d{2}-\d{2}$/, options.compatibilityDate) || !Array.isArray(options.compatibilityFlags) || options.compatibilityFlags.some((flag) => !matches4(/^[a-z0-9_]{1,100}$/, flag)) || new Set(options.compatibilityFlags).size !== options.compatibilityFlags.length || !usage.has(options.usageModel)) {
          reject("Invalid staged Cloudflare Worker upload input");
        }
        metadata = JSON.stringify({
          main_module: "worker.js",
          compatibility_date: options.compatibilityDate,
          compatibility_flags: options.compatibilityFlags,
          usage_model: options.usageModel,
          bindings: rolloutBindings(options.bindings, baseline === true, enrollment === true),
          annotations: { "workers/tag": options.operationId }
        });
      } catch (error) {
        throw Object.assign(error, { notSent: true });
      }
      const body = new FormData();
      body.set("metadata", new Blob([metadata], { type: "application/json" }));
      body.set("worker.js", new Blob([options.bundle.slice()], { type: "application/javascript+module" }), "worker.js");
      const receipt = await api.post(script + "/versions?bindings_inherit=strict", body);
      if (!matches4(uuid, receipt?.id) || !etag(receipt.resources?.script?.etag) || receipt.exports_reconciliation !== void 0) {
        reject("Cloudflare did not confirm a code-only staged Worker version");
      }
      return { id: receipt.id, etag: receipt.resources.script.etag };
    },
    // Versions this Worker has that carry an upgrade operation's tag. Every
    // upload sets the tag, so this shows whether an unconfirmed upload landed.
    async taggedVersions(input, tag2) {
      assertTarget(input);
      if (!matches4(operationUuid, tag2)) reject("Invalid Cloudflare upgrade operation tag");
      const listed = await api.get(script + "/versions", { page: 1, per_page: 20 });
      if (!Array.isArray(listed?.items) || listed.items.some((item) => !matches4(uuid, item?.id))) {
        reject("Cloudflare did not list the Worker versions");
      }
      return listed.items.filter((item) => item.annotations?.["workers/tag"] === tag2).map((item) => item.id);
    },
    async deployVersion(input, options) {
      assertTarget(input);
      const entries = options?.versions;
      if (!keysOnly(options, ["strategy", "versions"]) || options.strategy !== "percentage" || !Array.isArray(entries) || entries.length !== 1 || !keysOnly(entries[0], ["version_id", "percentage"]) || !matches4(uuid, entries[0].version_id) || entries[0].percentage !== 100) {
        reject("Cloudflare upgrade rollout must target exactly one verified version");
      }
      const id2 = entries[0].version_id;
      const acknowledged = await api.post(script + "/deployments", {
        strategy: "percentage",
        versions: [{ version_id: id2, percentage: 100 }]
      });
      if (keysOnly(acknowledged, ["id"]) && matches4(uuid, acknowledged.id)) return { id: acknowledged.id };
      const response2 = deployment(acknowledged);
      if (response2.versions.length !== 1 || response2.versions[0].version_id !== id2 || response2.versions[0].percentage !== 100) {
        reject("Cloudflare did not return the requested full rollout");
      }
      return { id: response2.id };
    }
  };
}
__name(createCloudflareUpgradeAdapter, "createCloudflareUpgradeAdapter");

// ../cloud/upgrade-journal.mjs
var duration = 90;
function key3(target) {
  if (!/^[a-f0-9]{32}$/.test(target?.accountId ?? "") || !/^fleet-[a-z0-9][a-z0-9-]{1,14}[a-z0-9]-[a-f0-9]{12}$/.test(target?.worker ?? "")) {
    throw new Error("Invalid upgrade journal target");
  }
  return JSON.stringify([target.accountId, target.worker]);
}
__name(key3, "key");
async function readUpgradeJournal(db, target) {
  const row = await db.prepare("SELECT record FROM management_upgrade_journal WHERE target = ?").bind(key3(target)).first();
  return row ? JSON.parse(row.record) : void 0;
}
__name(readUpgradeJournal, "readUpgradeJournal");
function createUpgradeJournal(db) {
  return {
    async withLock(target, run) {
      const id2 = key3(target);
      const owner = base64url_exports.encode(crypto.getRandomValues(new Uint8Array(32)));
      const lease = await db.prepare(`INSERT INTO fleet_leases (id, owner, expires_at) VALUES (1, ?, unixepoch() + ?)
        ON CONFLICT(id) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at
        WHERE fleet_leases.expires_at <= unixepoch() RETURNING owner`).bind(owner, duration).first();
      if (!lease) throw new Error("\u5DF2\u6709\u7BA1\u7406\u64CD\u4F5C\u6B63\u5728\u6267\u884C\u3002\u8BF7\u5148\u7B49\u5F85\u5176\u7ED3\u679C\uFF0C\u4E0D\u8981\u91CD\u590D\u63D0\u4EA4\u3002");
      const assertHeld = /* @__PURE__ */ __name(async () => {
        const result = await db.prepare("UPDATE fleet_leases SET expires_at = unixepoch() + ? WHERE id = 1 AND owner = ? AND expires_at > unixepoch() RETURNING owner").bind(duration, owner).first();
        if (!result) throw new Error("\u5347\u7EA7\u64CD\u4F5C\u5DF2\u5931\u53BB\u9501\u3002\u8BF7\u6838\u5BF9\u72B6\u6001\u540E\u518D\u8BD5\u3002");
      }, "assertHeld");
      try {
        return await run({
          assertHeld,
          read: /* @__PURE__ */ __name(() => readUpgradeJournal(db, target), "read"),
          async write(record4) {
            const data = JSON.stringify(record4);
            if (typeof data !== "string" || data.length > 4096) throw new Error("Invalid upgrade journal record");
            const written = await db.prepare(`INSERT INTO management_upgrade_journal (target, record)
              SELECT ?, ? WHERE EXISTS (SELECT 1 FROM fleet_leases WHERE id = 1 AND owner = ? AND expires_at > unixepoch())
              ON CONFLICT(target) DO UPDATE SET record = excluded.record RETURNING target`).bind(id2, data, owner).first();
            if (!written) throw new Error("\u5347\u7EA7\u64CD\u4F5C\u5DF2\u5931\u53BB\u9501\u3002\u672A\u66F4\u6539\u5347\u7EA7\u8BB0\u5F55\u3002");
          }
        });
      } finally {
        await db.prepare("DELETE FROM fleet_leases WHERE id = 1 AND owner = ?").bind(owner).run().catch(() => {
        });
      }
    }
  };
}
__name(createUpgradeJournal, "createUpgradeJournal");

// ../cloud/upgrade-enrollment-readiness.mjs
var columns = Object.freeze({
  enrollment_intents: [
    "id",
    "device_id",
    "code_digest",
    "code_ciphertext",
    "snapshot",
    "state",
    "created_at",
    "resolved_at",
    "recovery_digest",
    "claimed_architecture"
  ],
  management_upgrade_journal: ["target", "record"]
});
function exactDestination(current, destination) {
  if (current.domain !== void 0 && current.domain !== "" && current.domain !== destination) return false;
  const values = current.destinations;
  return Array.isArray(values) && values.length === 1 && values[0]?.type === "public" && values[0].uri === destination;
}
__name(exactDestination, "exactDestination");
async function verifySchema(db) {
  for (const [table2, names] of Object.entries(columns)) {
    const query = "SELECT name, pk FROM pragma_table_info(?) ORDER BY cid";
    const { results } = await db.prepare(query).bind(table2).all();
    if (results?.length !== names.length || !names.every((name, index2) => results[index2].name === name) || results[0].pk !== 1) throw new Error("Device enrollment requires the expected D1 table schema");
  }
  const index = await db.prepare(`SELECT m.sql FROM sqlite_master m
    JOIN pragma_index_list('enrollment_intents') i ON i.name = m.name
    WHERE m.type = 'index' AND m.tbl_name = 'enrollment_intents'
      AND i.name = 'enrollment_intents_pending_device' AND i.[unique] = 1 AND i.partial = 1`).first();
  const expectedIndex = /^CREATE\s+UNIQUE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?enrollment_intents_pending_device\s+ON\s+enrollment_intents\s*\(\s*device_id\s*\)\s+WHERE\s+state\s*=\s*'pending'\s*;?$/;
  if (!expectedIndex.test(index?.sql ?? "")) throw new Error("Device enrollment requires the expected pending-device index");
}
__name(verifySchema, "verifySchema");
function checkedSpec(spec, api) {
  const url = typeof spec?.origin === "string" && URL.parse(spec.origin);
  if (!url || url.protocol !== "https:" || url.origin !== spec.origin || url.port || !/^[a-f0-9]{32}$/.test(spec.accountId ?? "") || !/^fleet-[a-z][a-z0-9-]{2,15}-[a-f0-9]{12}$/.test(spec.label ?? "") || spec.label !== spec.worker || spec.accountScopedAccess !== true || spec.zoneScopedAccess || typeof api?.get !== "function" || typeof api?.list !== "function") {
    throw new Error("Cannot verify the existing managed deployment enrollment configuration");
  }
  return url;
}
__name(checkedSpec, "checkedSpec");
var routeApp = /* @__PURE__ */ __name((spec, url, pathname) => publicAccessApp(spec.label + pathname.replaceAll("/", "-"), url.hostname + pathname), "routeApp");
async function inspectEnrollmentUpgradeReadiness({ api, db, spec }) {
  const url = checkedSpec(spec, api);
  if (typeof db?.prepare !== "function") throw new Error("Cannot verify the existing managed deployment enrollment configuration");
  await verifySchema(db);
  const path = "/accounts/" + spec.accountId + "/access/apps";
  const listed = await api.list(path);
  const readOnly = {
    get: /* @__PURE__ */ __name((...args) => api.get(...args), "get"),
    list: /* @__PURE__ */ __name((...args) => args[0] === path ? listed : api.list(...args), "list"),
    async post() {
      throw new Error("The original exact enrollment Access application or policy is missing");
    }
  };
  const exactAccessRoutes = Object.fromEntries(await Promise.all(enrollmentUpgradeAccessPaths.map(async (pathname) => {
    const target = url.hostname + pathname;
    const app = routeApp(spec, url, pathname);
    const found = await ensureScopedAccessApp(readOnly, spec, app, { accountScoped: true, bootstrap: true });
    if (!exactDestination(found, target)) throw new Error("An enrollment Access application includes a different or wider route");
    return [pathname, true];
  })));
  return Object.freeze({ verifiedD1: true, exactAccessRoutes: Object.freeze(exactAccessRoutes) });
}
__name(inspectEnrollmentUpgradeReadiness, "inspectEnrollmentUpgradeReadiness");

// ../cloud/upgrade-operation.mjs
var uuid2 = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
var operationUuid2 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
var uploadSettleMs = 15 * 60 * 1e3;
function uploadFailure(error) {
  if (error?.notSent === true) return { kind: "not_sent", reason: String(error.message).slice(0, 160) };
  if (error instanceof CloudflareError) {
    const codes = (Array.isArray(error.codes) ? error.codes : []).filter(Number.isInteger).slice(0, 5);
    const refused = error.status >= 400 && error.status < 500 && ![408, 409, 429].includes(error.status);
    return { kind: refused ? "refused" : "unknown", status: error.status, codes };
  }
  if (error instanceof CloudflareRequestTimeoutError) return { kind: "timeout" };
  return { kind: "unknown" };
}
__name(uploadFailure, "uploadFailure");
function failureText(failure) {
  if (failure.kind === "not_sent") return `the upload was not sent: ${failure.reason}`;
  if (failure.kind === "timeout") return "the request timed out";
  if (Number.isInteger(failure.status)) return `Cloudflare answered HTTP ${failure.status}${failure.codes.length ? ", codes " + failure.codes.join(", ") : ""}`;
  return "the reply was lost";
}
__name(failureText, "failureText");
var UpgradeOperationError = class extends Error {
  static {
    __name(this, "UpgradeOperationError");
  }
  constructor(code, message2) {
    super(message2);
    this.name = "UpgradeOperationError";
    this.code = code;
  }
};
function pinnedTarget(expected, operationId) {
  const { accountId: accountId2, worker: worker2, zoneId, origin, ownerEmail, accessAudience, activeVersion, currentVersion } = expected ?? {};
  if (typeof origin !== "string" || typeof accountId2 !== "string" || typeof zoneId !== "string" || typeof worker2 !== "string" || typeof ownerEmail !== "string" || typeof accessAudience !== "string" || typeof activeVersion !== "string" || typeof currentVersion !== "string" || typeof operationId !== "string") {
    throw new UpgradeOperationError("invalid_target", "The trusted Nodrelay upgrade target is incomplete");
  }
  const host = URL.parse(origin);
  if (!/^[a-f0-9]{32}$/.test(accountId2) || !/^[a-f0-9]{32}$/.test(zoneId) || !/^fleet-[a-z][a-z0-9-]{2,15}-[a-f0-9]{12}$/.test(worker2) || !host || host.origin !== origin || host.protocol !== "https:" || host.port || /\.(?:workers|pages)\.dev$/.test(host.hostname) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(ownerEmail) || !/^[a-zA-Z0-9._:-]{3,200}$/.test(accessAudience) || !uuid2.test(activeVersion) || !operationUuid2.test(operationId)) {
    throw new UpgradeOperationError("invalid_target", "The trusted Nodrelay upgrade target or operation ID is invalid");
  }
  return Object.freeze({ accountId: accountId2, worker: worker2, zoneId, origin, ownerEmail, accessAudience, activeVersion, currentVersion });
}
__name(pinnedTarget, "pinnedTarget");
function checkTarget(bindings, target) {
  const lookup = /* @__PURE__ */ __name((name) => bindings.find((binding) => binding.name === name)?.text, "lookup");
  let spec;
  try {
    spec = JSON.parse(lookup("FLEET_SPEC"));
  } catch {
  }
  if (lookup("APP_ORIGIN") !== target.origin || lookup("OWNER_EMAIL") !== target.ownerEmail || lookup("ACCESS_AUD") !== target.accessAudience || lookup("NODRELAY_RELEASE_VERSION") !== target.currentVersion || !spec?.accountScopedAccess || spec.accountId !== target.accountId || spec.zoneId !== target.zoneId || spec.origin !== target.origin || spec.ownerEmail !== target.ownerEmail || spec.worker !== target.worker || spec.label !== target.worker) {
    throw new UpgradeOperationError("target_drift", "The live Cloudflare bindings do not match this authorized Nodrelay target and release");
  }
}
__name(checkTarget, "checkTarget");
function snapshot(runtime) {
  const { compatibilityDate, compatibilityFlags, migrationTag, usageModel } = runtime ?? {};
  if (typeof compatibilityDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(compatibilityDate) || !Array.isArray(compatibilityFlags) || compatibilityFlags.some((flag) => typeof flag !== "string") || typeof migrationTag !== "string" || !migrationTag || !["standard", "bundled", "unbound"].includes(usageModel)) {
    throw new UpgradeOperationError("runtime_unproven", "Cloudflare Worker runtime or Durable Object migration metadata is unavailable");
  }
  return { compatibilityDate, compatibilityFlags: [...compatibilityFlags].sort(), migrationTag, usageModel };
}
__name(snapshot, "snapshot");
function compatibleRuntime(candidate, active) {
  if (JSON.stringify(snapshot(candidate)) !== JSON.stringify(active)) {
    throw new UpgradeOperationError("runtime_drift", "The proposed Worker changes runtime compatibility or Durable Object migration metadata");
  }
}
__name(compatibleRuntime, "compatibleRuntime");
function requireDeployment(state2, activeVersion, latestVersion) {
  const versions = state2?.deployments;
  if (state2?.latestVersion !== latestVersion || !Array.isArray(versions) || versions.length !== 1 || versions[0]?.version_id !== activeVersion || versions[0].percentage !== 100) {
    throw new UpgradeOperationError("deployment_drift", "The active or most recently uploaded Cloudflare version changed");
  }
}
__name(requireDeployment, "requireDeployment");
var validEtag = /* @__PURE__ */ __name((value) => typeof value === "string" && /^[a-zA-Z0-9_-]{16,128}$/.test(value), "validEtag");
var enrollmentBindings = ["FLEET_ENROLLMENT_PROTOCOL", "FLEET_ENROLLMENT_HISTORY", "FLEET_ENROLLMENT_CATALOG"];
var validHash = /* @__PURE__ */ __name((x) => typeof x === "string" && /^[a-f0-9]{64}$/.test(x), "validHash");
async function enrollmentPlanDigest(changes, migratesFeed = false) {
  const fields = migratesFeed ? [...enrollmentBindings, "NODRELAY_UPGRADE_FEED"] : enrollmentBindings;
  const value = JSON.stringify(fields.map((name) => [name, changes[name]]));
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (b) => b.toString(16).padStart(2, "0")).join("");
}
__name(enrollmentPlanDigest, "enrollmentPlanDigest");
async function runUpgradeOperation({ expected, artifact, operationId, api, journal, enrollmentApproval, now: now4 = Date.now() }) {
  const target = pinnedTarget(expected, operationId);
  const { release, bundle, manifestSha256 } = await verifyUpgradeRelease({ ...artifact, currentVersion: target.currentVersion, now: now4 });
  const enrollmentChange = release.schema === 2;
  if (enrollmentChange && (enrollmentApproval?.manifestSha256 !== manifestSha256 || typeof enrollmentApproval.inspect !== "function")) {
    throw new UpgradeOperationError("format_not_enabled", "This enrollment release was not confirmed.");
  }
  return journal.withLock(target, async (txn) => {
    const previous = await txn.read();
    if (previous?.phase === "confirmed" && previous.operationId === operationId) {
      if (previous.releaseVersion !== release.version || previous.releaseSha256 !== release.workerSha256 || previous.manifestSha256 !== manifestSha256 || previous.baseVersion !== target.activeVersion || !uuid2.test(previous.candidateVersion ?? "")) {
        throw new UpgradeOperationError("operation_conflict", "This operation ID already refers to a different upgrade");
      }
      return { status: "previously_confirmed", version: release.version, versionId: previous.candidateVersion };
    }
    if (previous && !["confirmed", "abandoned"].includes(previous.phase)) {
      throw new UpgradeOperationError("reconciliation_required", "An earlier upgrade is unsettled. Check Cloudflare before submitting another upgrade");
    }
    const baseline = await api.readDeployment(target);
    const live = baseline?.deployments;
    if (Array.isArray(live) && live.length === 1 && live[0]?.version_id === target.activeVersion && live[0].percentage === 100 && uuid2.test(baseline.latestVersion ?? "") && baseline.latestVersion !== target.activeVersion) {
      throw new UpgradeOperationError("baseline_version_mismatch", "Cloudflare is serving a different version from its latest upload. No upload or rollout was attempted");
    }
    requireDeployment(baseline, target.activeVersion, target.activeVersion);
    const read = await api.readVersion(target, target.activeVersion);
    if (read?.id !== target.activeVersion || !validEtag(read.etag)) {
      throw new UpgradeOperationError("baseline_unproven", "Cloudflare did not identify the active Worker version");
    }
    const active = structuredClone(read);
    const activeBindings = active.bindings;
    const state2 = { ...baseline, activeBindings };
    validateUpgradePreconditions({ ...state2, candidateBindings: activeBindings });
    checkTarget(activeBindings, target);
    const runtime = snapshot(active.runtime);
    let enrollmentChanges;
    if (enrollmentChange) {
      try {
        const readiness = await enrollmentApproval.inspect();
        enrollmentChanges = planEnrollmentUpgrade({
          release,
          manifestSha256,
          expectedManifestSha256: enrollmentApproval.manifestSha256,
          activeBindings,
          readiness
        }).changes;
      } catch {
        throw new UpgradeOperationError("enrollment_not_ready", "Existing D1, Access or enrollment settings do not support this signed release.");
      }
    }
    const currentFeed = activeBindings.find((binding) => binding.name === "NODRELAY_UPGRADE_FEED");
    const currentChannel = activeBindings.find((binding) => binding.name === "NODRELAY_UPGRADE_CHANNEL");
    const migratesFeed = Boolean(release.feedMigration && currentFeed?.text === legacyPreviewFeed);
    if (release.feedMigration) {
      const currentKey = activeBindings.find((binding) => binding.name === "NODRELAY_UPGRADE_PUBLIC_KEY");
      const pinnedKey = new Uint8Array(await crypto.subtle.exportKey("spki", artifact.publicKey));
      const keyText = btoa(String.fromCharCode(...pinnedKey)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
      if (currentFeed?.type !== "plain_text" || ![legacyPreviewFeed, publicPreviewFeed].includes(currentFeed.text) || currentChannel?.type !== "plain_text" || currentChannel.text !== release.channel || currentKey?.type !== "plain_text" || currentKey.text !== keyText) {
        throw new UpgradeOperationError("target_drift", "The active preview feed or signing key does not match the signed migration");
      }
    }
    const changes = {
      NODRELAY_RELEASE_VERSION: release.version,
      ...enrollmentChanges,
      ...migratesFeed && { NODRELAY_UPGRADE_FEED: release.feedMigration.to }
    };
    const names = new Set(activeBindings.map(({ name }) => name));
    const bindings = activeBindings.map(({ name }) => Object.hasOwn(changes, name) ? { name, type: "plain_text", text: changes[name] } : { name, type: "inherit" });
    for (const [name, text2] of Object.entries(changes)) if (!names.has(name)) bindings.push({ name, type: "plain_text", text: text2 });
    const record4 = {
      operationId,
      baseVersion: target.activeVersion,
      releaseVersion: release.version,
      releaseSha256: release.workerSha256,
      ...enrollmentChanges && { manifestSha256, enrollmentChangesSha256: await enrollmentPlanDigest(changes, migratesFeed) },
      ...migratesFeed && { migratesFeed: true }
    };
    const assertStable = /* @__PURE__ */ __name(async (latest) => {
      requireDeployment(await api.readDeployment(target), target.activeVersion, latest);
      await txn.assertHeld();
    }, "assertStable");
    await assertStable(target.activeVersion);
    const uploading = { ...record4, phase: "uploading", uploadStartedAt: now4 };
    await txn.write(uploading);
    let uploaded;
    try {
      uploaded = await api.uploadVersion(target, {
        bundle,
        module: "worker.js",
        bindingsInherit: "strict",
        bindings,
        compatibilityDate: runtime.compatibilityDate,
        compatibilityFlags: runtime.compatibilityFlags,
        usageModel: runtime.usageModel,
        operationId
      });
    } catch (error) {
      const failure = uploadFailure(error);
      await txn.write({ ...uploading, uploadFailure: failure }).catch(() => {
      });
      throw Object.assign(new UpgradeOperationError(
        "upload_unconfirmed",
        `Cloudflare staging was not confirmed (${failureText(failure)}). No rollout was attempted; check Cloudflare before retrying`
      ), { failure });
    }
    if (!uploaded || typeof uploaded.id !== "string" || !uuid2.test(uploaded.id) || uploaded.id === target.activeVersion || !validEtag(uploaded.etag)) {
      throw new UpgradeOperationError("upload_unconfirmed", "Cloudflare did not identify the staged version. No rollout was attempted");
    }
    const candidateVersion = uploaded.id;
    const staged = { ...record4, candidateVersion, candidateEtag: uploaded.etag };
    await txn.write({ ...staged, phase: "staged" });
    const candidate = await api.readVersion(target, candidateVersion);
    if (candidate?.id !== candidateVersion || candidate.etag !== uploaded.etag) {
      throw new UpgradeOperationError("candidate_unproven", "The staged Worker does not match Cloudflare readback. No rollout was attempted");
    }
    validateUpgradePreconditions({ ...state2, candidateBindings: candidate.bindings, plannedChanges: changes });
    compatibleRuntime(candidate.runtime, runtime);
    await assertStable(candidateVersion);
    await txn.write({ ...staged, phase: "deploying" });
    try {
      await assertStable(candidateVersion);
    } catch (error) {
      await txn.write({ ...staged, phase: "staged" });
      throw error;
    }
    try {
      await api.deployVersion(target, { strategy: "percentage", versions: [{ version_id: candidateVersion, percentage: 100 }] });
    } catch {
      throw new UpgradeOperationError("deployment_unconfirmed", "Cloudflare rollout was not confirmed. Check the current deployment; no automatic retry or rollback was attempted");
    }
    try {
      requireDeployment(await api.readDeployment(target), candidateVersion, candidateVersion);
      await txn.assertHeld();
      await txn.write({ ...staged, phase: "confirmed" });
    } catch {
      throw new UpgradeOperationError("deployment_unconfirmed", "Cloudflare rollout was not confirmed by readback. Check the current deployment before retrying");
    }
    return { status: "deployment_confirmed", version: release.version, versionId: candidateVersion };
  });
}
__name(runUpgradeOperation, "runUpgradeOperation");
async function confirmRecordedDeployment({ expected, operationId, api, journal, now: now4 = Date.now }) {
  const target = pinnedTarget(expected, operationId);
  return journal.withLock(target, async (txn) => {
    const record4 = await txn.read();
    const phase = record4?.phase;
    if (phase === "abandoned" && record4.operationId === operationId) {
      return { status: "upload_abandoned", version: record4.releaseVersion, operationId };
    }
    if (record4?.operationId !== operationId || !["uploading", "staged", "deploying", "confirmed"].includes(phase) || !uuid2.test(record4.baseVersion ?? "") || record4.baseVersion !== target.activeVersion || (phase === "uploading" ? record4.candidateVersion !== void 0 || record4.candidateEtag !== void 0 : !uuid2.test(record4.candidateVersion ?? "") || record4.candidateVersion === record4.baseVersion || !validEtag(record4.candidateEtag))) {
      throw new UpgradeOperationError("reconciliation_required", "There is no exact recorded version to reconcile");
    }
    if (record4.phase === "confirmed") {
      return { status: "previously_confirmed", version: record4.releaseVersion, operationId };
    }
    if (phase === "uploading") {
      const [deployment3, original2] = await Promise.all([api.readDeployment(target), api.readVersion(target, record4.baseVersion)]);
      if (!uuid2.test(deployment3?.latestVersion ?? "") || original2?.id !== record4.baseVersion || !validEtag(original2.etag)) {
        throw new UpgradeOperationError("candidate_unproven", "Cloudflare did not identify the original version");
      }
      checkTarget(original2.bindings, target);
      requireDeployment(deployment3, record4.baseVersion, deployment3.latestVersion);
      requireDeployment(await api.readDeployment(target), record4.baseVersion, deployment3.latestVersion);
      await txn.assertHeld();
      const unconfirmed = /* @__PURE__ */ __name((extra) => ({ status: "baseline_active_upload_unconfirmed", version: record4.releaseVersion, operationId, ...extra }), "unconfirmed");
      if (typeof api.taggedVersions !== "function") return unconfirmed();
      const tagged = await api.taggedVersions(target, operationId);
      if (tagged.length > 1) throw new UpgradeOperationError("candidate_unproven", "Cloudflare lists several versions for one upgrade");
      if (tagged.length === 1) {
        const landed = await api.readVersion(target, tagged[0]);
        if (landed?.id !== tagged[0] || landed.id === record4.baseVersion || !validEtag(landed.etag)) {
          throw new UpgradeOperationError("candidate_unproven", "Cloudflare did not identify the uploaded version");
        }
        await txn.write({ ...record4, phase: "staged", candidateVersion: landed.id, candidateEtag: landed.etag });
        return { status: "baseline_active_candidate_staged", version: record4.releaseVersion, operationId };
      }
      if (deployment3.latestVersion !== record4.baseVersion) return unconfirmed();
      const clock = now4();
      const since = Number.isSafeInteger(record4.uploadStartedAt) ? record4.uploadStartedAt : Number.isSafeInteger(record4.uploadCheckedAt) ? record4.uploadCheckedAt : void 0;
      const definite = ["refused", "not_sent"].includes(record4.uploadFailure?.kind);
      if (definite || since !== void 0 && clock - since >= uploadSettleMs) {
        await txn.write({ ...record4, phase: "abandoned", abandonedAt: clock });
        return { status: "upload_abandoned", version: record4.releaseVersion, operationId };
      }
      if (since === void 0) await txn.write({ ...record4, uploadCheckedAt: clock });
      return unconfirmed({ retryAfter: (since ?? clock) + uploadSettleMs });
    }
    const [deployment2, original, candidate] = await Promise.all([
      api.readDeployment(target),
      api.readVersion(target, record4.baseVersion),
      api.readVersion(target, record4.candidateVersion)
    ]);
    const rolloutStillUnconfirmed = phase === "deploying" && deployment2?.deployments?.[0]?.version_id === record4.baseVersion;
    const active = phase === "staged" || rolloutStillUnconfirmed ? record4.baseVersion : record4.candidateVersion;
    requireDeployment(deployment2, active, record4.candidateVersion);
    if (original?.id !== record4.baseVersion || !validEtag(original.etag) || candidate?.id !== record4.candidateVersion || candidate.etag !== record4.candidateEtag) {
      throw new UpgradeOperationError("candidate_unproven", "Cloudflare version identity cannot confirm the recorded deployment");
    }
    const currentVersion = original.bindings.find(({ name }) => name === "NODRELAY_RELEASE_VERSION")?.text;
    if (!currentVersion || !(phase === "staged" ? target.currentVersion === currentVersion : [currentVersion, record4.releaseVersion].includes(target.currentVersion))) {
      throw new UpgradeOperationError("target_drift", "Nodrelay runtime version does not match the recorded deployment");
    }
    checkTarget(original.bindings, { ...target, currentVersion });
    const changes = { NODRELAY_RELEASE_VERSION: record4.releaseVersion };
    if (record4.manifestSha256 !== void 0 || record4.enrollmentChangesSha256 !== void 0 || record4.migratesFeed !== void 0) {
      if (!validHash(record4.manifestSha256) || !validHash(record4.enrollmentChangesSha256)) {
        throw new UpgradeOperationError("candidate_unproven", "The enrollment release record is incomplete");
      }
      for (const name of enrollmentBindings) {
        changes[name] = candidate.bindings.find((binding) => binding.name === name && binding.type === "plain_text")?.text;
      }
      if (record4.migratesFeed === true) changes.NODRELAY_UPGRADE_FEED = publicPreviewFeed;
      else if (record4.migratesFeed !== void 0) {
        throw new UpgradeOperationError("candidate_unproven", "The feed migration record is invalid");
      }
      if (await enrollmentPlanDigest(changes, record4.migratesFeed === true) !== record4.enrollmentChangesSha256) {
        throw new UpgradeOperationError("candidate_unproven", "The enrollment settings do not match the original verified plan");
      }
    }
    validateUpgradeBindings(original.bindings, candidate.bindings, changes);
    compatibleRuntime(candidate.runtime, snapshot(original.runtime));
    requireDeployment(await api.readDeployment(target), active, record4.candidateVersion);
    await txn.assertHeld();
    if (phase === "staged") return { status: "baseline_active_candidate_staged", version: record4.releaseVersion, operationId };
    if (rolloutStillUnconfirmed) return { status: "baseline_active_rollout_unconfirmed", version: record4.releaseVersion, operationId };
    await txn.write({ ...record4, phase: "confirmed" });
    return { status: "deployment_confirmed", version: record4.releaseVersion, operationId };
  });
}
__name(confirmRecordedDeployment, "confirmRecordedDeployment");

// ../cloud/upgrade-admin.mjs
var versionPattern4 = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})(?:-preview\.(0|[1-9]\d{0,8}))?$/;
var operationUuid3 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
var uuid3 = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
var id = /^[a-f0-9]{32}$/;
var sha2562 = /^[a-f0-9]{64}$/;
var worker = /^fleet-[a-z][a-z0-9-]{2,15}-[a-f0-9]{12}$/;
var phases = /* @__PURE__ */ new Set(["uploading", "staged", "deploying", "confirmed", "abandoned"]);
var matches5 = /* @__PURE__ */ __name((pattern, value) => typeof value === "string" && pattern.test(value), "matches");
var errors = {
  unavailable: [503, "\u6B64\u7BA1\u7406\u53F0\u672A\u542F\u7528\u53EF\u4FE1\u5347\u7EA7\u914D\u7F6E\u3002"],
  invalid_request: [400, "\u5347\u7EA7\u64CD\u4F5C\u7F16\u53F7\u6216\u76EE\u6807\u7248\u672C\u65E0\u6548\u3002"],
  format_not_enabled: [409, "\u7B7E\u540D\u6E05\u5355\u4E0D\u662F\u672C\u6B21\u786E\u8BA4\u7684\u5347\u7EA7\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u7248\u672C\u3002"],
  enrollment_not_ready: [409, "\u8BBE\u5907\u4E0B\u8F7D\u914D\u7F6E\u6216\u6570\u636E\u5E93\u4E0D\u6EE1\u8DB3\u65B0\u7248\u672C\u8981\u6C42\uFF0C\u672A\u5207\u6362\u7248\u672C\u3002"],
  feed_unavailable: [503, "\u672A\u80FD\u9A8C\u8BC1\u5B98\u65B9\u5347\u7EA7\u5305\uFF0C\u672A\u6267\u884C\u5347\u7EA7\u3002"],
  release_changed: [409, "\u5B98\u65B9\u5347\u7EA7\u5305\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u7248\u672C\u540E\u63D0\u4EA4\u3002"],
  authorization_unavailable: [503, "Cloudflare \u7BA1\u7406\u6388\u6743\u4E0D\u53EF\u7528\uFF0C\u672A\u6267\u884C\u5347\u7EA7\u3002"],
  status_unavailable: [503, "\u65E0\u6CD5\u8BFB\u53D6\u5347\u7EA7\u8BB0\u5F55\uFF0C\u8BF7\u7A0D\u540E\u67E5\u770B\u72B6\u6001\uFF0C\u4E0D\u8981\u91CD\u590D\u63D0\u4EA4\u3002"],
  operation_conflict: [409, "\u6B64\u64CD\u4F5C\u7F16\u53F7\u5DF2\u7528\u4E8E\u53E6\u4E00\u5347\u7EA7\u7248\u672C\u3002"],
  reconciliation_required: [409, "\u6709\u672A\u5B8C\u6210\u7684\u5347\u7EA7\u3002\u8BF7\u5148\u6838\u5BF9 Cloudflare \u90E8\u7F72\u72B6\u6001\uFF0C\u4E0D\u8981\u91CD\u590D\u63D0\u4EA4\u3002"],
  target_drift: [409, "Cloudflare \u5F53\u524D\u90E8\u7F72\u4E0E\u6B64\u7BA1\u7406\u53F0\u4E0D\u4E00\u81F4\uFF0C\u672A\u6267\u884C\u5347\u7EA7\u3002"],
  baseline_version_mismatch: [409, "Cloudflare \u5F53\u524D\u63A5\u6536\u6D41\u91CF\u7684\u7248\u672C\u4E0E\u6700\u8FD1\u4E0A\u4F20\u7684\u7248\u672C\u4E0D\u540C\uFF08\u56DE\u6EDA\u6216\u5355\u72EC\u4E0A\u4F20\u540E\u53EF\u80FD\u51FA\u73B0\uFF09\u3002\u4E3A\u907F\u514D\u7EE7\u627F\u9519\u8BEF\u914D\u7F6E\uFF0C\u672C\u6B21\u672A\u4E0A\u4F20\u6216\u5207\u6362\u7248\u672C\u3002\u8BF7\u5148\u5728 Cloudflare \u6838\u5BF9\u751F\u6548\u7248\u672C\u548C\u7248\u672C\u5386\u53F2\uFF0C\u4E0D\u8981\u91CD\u590D\u63D0\u4EA4\u3002"],
  deployment_drift: [409, "Cloudflare \u90E8\u7F72\u72B6\u6001\u5DF2\u53D8\u5316\uFF0C\u8BF7\u67E5\u770B\u5347\u7EA7\u72B6\u6001\u3002"],
  upload_unconfirmed: [502, "\u672A\u80FD\u786E\u8BA4 Cloudflare \u5DF2\u6682\u5B58\u65B0\u7248\u672C\uFF0C\u672A\u5207\u6362\u6D41\u91CF\u3002\u8BF7\u5148\u6838\u5BF9\u5347\u7EA7\u72B6\u6001\u3002"],
  deployment_unconfirmed: [502, "\u672A\u80FD\u786E\u8BA4 Cloudflare \u7684\u7248\u672C\u5207\u6362\u3002\u8BF7\u5148\u6838\u5BF9\u5347\u7EA7\u72B6\u6001\uFF0C\u4E0D\u8981\u91CD\u590D\u63D0\u4EA4\u3002"],
  candidate_unproven: [502, "\u672A\u80FD\u786E\u8BA4 Cloudflare \u6682\u5B58\u7248\u672C\u4E0E\u5347\u7EA7\u5305\u4E00\u81F4\uFF0C\u672A\u5207\u6362\u6D41\u91CF\u3002"],
  operation_unavailable: [503, "\u65E0\u6CD5\u786E\u8BA4\u5347\u7EA7\u64CD\u4F5C\u7ED3\u679C\u3002\u8BF7\u67E5\u770B\u5347\u7EA7\u72B6\u6001\uFF0C\u4E0D\u8981\u91CD\u590D\u63D0\u4EA4\u3002"]
};
var UpgradeAdminError = class extends Error {
  static {
    __name(this, "UpgradeAdminError");
  }
  constructor(code) {
    const [status, message2] = errors[code];
    super(message2);
    this.name = "UpgradeAdminError";
    this.code = code;
    this.status = status;
  }
};
function readConfig(env) {
  const {
    NODRELAY_RELEASE_VERSION: currentVersion,
    NODRELAY_UPGRADE_CHANNEL: channel,
    NODRELAY_UPGRADE_PUBLIC_KEY: key4,
    NODRELAY_UPGRADE_FEED: base,
    FLEET_SPEC: fleet,
    APP_ORIGIN: origin,
    OWNER_EMAIL: ownerEmail,
    ACCESS_AUD: accessAudience
  } = env;
  const directory = typeof base === "string" && URL.parse(base);
  const site = typeof origin === "string" && URL.parse(origin);
  let spec;
  try {
    spec = JSON.parse(fleet);
  } catch {
    return;
  }
  if (!matches5(versionPattern4, currentVersion) || !["stable", "preview"].includes(channel) || channel === "stable" && currentVersion.includes("-preview.") || !matches5(/^[A-Za-z0-9_-]{59}$/, key4) || !directory || directory.href !== base || directory.protocol !== "https:" || directory.port || directory.username || directory.password || directory.search || directory.hash || !directory.pathname.endsWith("/") || !site || site.origin !== origin || site.protocol !== "https:" || site.port || /\.(?:workers|pages)\.dev$/.test(site.hostname) || !matches5(/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u, ownerEmail) || !matches5(/^[a-zA-Z0-9._:-]{3,200}$/, accessAudience) || !matches5(id, spec?.accountId) || !matches5(id, spec?.zoneId) || !matches5(worker, spec?.worker) || spec.worker !== spec.label || spec.origin !== origin || spec.ownerEmail !== ownerEmail || spec.accountScopedAccess !== true || env.FLEET_OAUTH_MODE !== "managed" || env.FLEET_OAUTH_RECOVERY !== "1" || !env.PROVISIONER_OAUTH || !env.TICKETS || env.PROVISIONER_TOKEN) return;
  return Object.freeze({ base, channel, currentVersion, key: key4, spec: Object.freeze(spec), target: Object.freeze({
    accountId: spec.accountId,
    worker: spec.worker,
    zoneId: spec.zoneId,
    origin,
    ownerEmail,
    accessAudience
  }) });
}
__name(readConfig, "readConfig");
function safeRecord(row) {
  if (row === void 0) return { phase: "idle" };
  if (!phases.has(row?.phase) || !matches5(operationUuid3, row.operationId) || !matches5(versionPattern4, row.releaseVersion) || !matches5(sha2562, row.releaseSha256) || !matches5(uuid3, row.baseVersion) || !["uploading", "abandoned"].includes(row.phase) && !matches5(uuid3, row.candidateVersion)) {
    throw new UpgradeAdminError("status_unavailable");
  }
  if (row.manifestSha256 !== void 0 && !matches5(sha2562, row.manifestSha256)) throw new UpgradeAdminError("status_unavailable");
  return {
    phase: row.phase,
    operationId: row.operationId,
    version: row.releaseVersion,
    releaseSha256: row.releaseSha256,
    ...row.manifestSha256 && { manifestSha256: row.manifestSha256 }
  };
}
__name(safeRecord, "safeRecord");
async function verificationKey(value) {
  const b64 = value.replaceAll("-", "+").replaceAll("_", "/") + "=";
  const decoded = atob(b64);
  if (btoa(decoded) !== b64) throw new Error("Invalid SPKI encoding");
  return crypto.subtle.importKey("spki", Uint8Array.from(decoded, (c) => c.charCodeAt(0)), "Ed25519", true, ["verify"]);
}
__name(verificationKey, "verificationKey");
function createUpgradeAdmin(env, {
  loadArtifacts = loadVerifiedUpgradeArtifacts,
  createAdapter = createCloudflareUpgradeAdapter,
  runOperation = runUpgradeOperation,
  confirmOperation = confirmRecordedDeployment,
  createJournal = createUpgradeJournal,
  readJournal = readUpgradeJournal,
  oauthAccess = workerOAuthAccess,
  request = fetch,
  clock = Date.now,
  inspectEnrollment = inspectEnrollmentUpgradeReadiness
} = {}) {
  const config = readConfig(env);
  async function artifacts(allowCurrent = false) {
    try {
      const { base, channel, currentVersion, key: key4 } = config;
      return await loadArtifacts({ base, channel, currentVersion, publicKey: await verificationKey(key4), request, now: clock(), allowCurrent, format: "auto" });
    } catch {
      throw new UpgradeAdminError("feed_unavailable");
    }
  }
  __name(artifacts, "artifacts");
  async function persisted() {
    try {
      return safeRecord(await readJournal(env.TICKETS, config.target));
    } catch {
      throw new UpgradeAdminError("status_unavailable");
    }
  }
  __name(persisted, "persisted");
  async function ownerAdapter(enrollment = false) {
    if (env.FLEET_OAUTH_SEED || env.FLEET_OAUTH_RECONNECT) throw new UpgradeAdminError("authorization_unavailable");
    let token;
    try {
      token = await oauthAccess(env.PROVISIONER_OAUTH);
    } catch {
      throw new UpgradeAdminError("authorization_unavailable");
    }
    if (!matches5(oauthTokenValue, token)) throw new UpgradeAdminError("authorization_unavailable");
    const provider = cloudflareApi(token, { request });
    return { provider, api: createAdapter(provider, config.target, { enrollment }) };
  }
  __name(ownerAdapter, "ownerAdapter");
  function mapError(error) {
    if (error instanceof UpgradeAdminError) return error;
    if (error instanceof UpgradeOperationError && Object.hasOwn(errors, error.code)) return new UpgradeAdminError(error.code);
    return new UpgradeAdminError("operation_unavailable");
  }
  __name(mapError, "mapError");
  return {
    async check() {
      if (!config) return { available: false };
      const { release, manifestSha256 } = await artifacts(true);
      return release.version === config.currentVersion ? { currentVersion: config.currentVersion } : {
        currentVersion: config.currentVersion,
        nextVersion: release.version,
        ...manifestSha256 ? { manifestSha256, includesEnrollment: true } : { releaseSha256: release.workerSha256 }
      };
    },
    async status() {
      if (!config) return { phase: "idle" };
      const { releaseSha256, manifestSha256, ...status } = await persisted();
      return { ...status, currentVersion: config.currentVersion };
    },
    async reconcile(input) {
      if (!config) throw new UpgradeAdminError("unavailable");
      if (!input || Object.keys(input).length !== 1 || !matches5(operationUuid3, input.operationId)) {
        throw new UpgradeAdminError("invalid_request");
      }
      try {
        const record4 = await readJournal(env.TICKETS, config.target);
        const stored = safeRecord(record4);
        if (stored.operationId !== input.operationId || !phases.has(stored.phase)) {
          throw new UpgradeAdminError("reconciliation_required");
        }
        if (stored.phase === "confirmed") return { status: "previously_confirmed", version: stored.version, operationId: stored.operationId };
        return await confirmOperation({
          expected: { ...config.target, currentVersion: config.currentVersion, activeVersion: record4.baseVersion },
          operationId: stored.operationId,
          api: (await ownerAdapter()).api,
          journal: createJournal(env.TICKETS),
          now: clock
        });
      } catch (error) {
        throw mapError(error);
      }
    },
    async start(input) {
      if (!config) throw new UpgradeAdminError("unavailable");
      if (!input || Array.isArray(input) || typeof input !== "object" || Object.keys(input).length !== 3 || !Object.hasOwn(input, "operationId") || !Object.hasOwn(input, "version") || !matches5(operationUuid3, input.operationId) || !matches5(versionPattern4, input.version) || Number(Object.hasOwn(input, "releaseSha256")) + Number(Object.hasOwn(input, "manifestSha256")) !== 1 || !matches5(sha2562, input.manifestSha256 ?? input.releaseSha256)) {
        throw new UpgradeAdminError("invalid_request");
      }
      const { operationId, version: version2, releaseSha256, manifestSha256 } = input;
      const previous = await persisted();
      if (previous.operationId === operationId && (previous.version !== version2 || (previous.manifestSha256 ? previous.manifestSha256 !== manifestSha256 : previous.releaseSha256 !== releaseSha256))) {
        throw new UpgradeAdminError("operation_conflict");
      }
      if (previous.phase === "confirmed" && previous.operationId === operationId) {
        return { status: "previously_confirmed", version: version2, operationId };
      }
      if (!["idle", "confirmed", "abandoned"].includes(previous.phase)) throw new UpgradeAdminError("reconciliation_required");
      const { release, artifact, manifestSha256: verifiedDigest } = await artifacts();
      if (release.version !== version2 || (verifiedDigest ? verifiedDigest !== manifestSha256 : manifestSha256 !== void 0 || release.workerSha256 !== releaseSha256)) throw new UpgradeAdminError("release_changed");
      try {
        const { api, provider } = await ownerAdapter(Boolean(verifiedDigest));
        const enrollmentApproval = verifiedDigest && {
          manifestSha256,
          inspect: /* @__PURE__ */ __name(() => inspectEnrollment({ api: provider, db: env.TICKETS, spec: config.spec }), "inspect")
        };
        const baseline = await api.readDeployment(config.target);
        const active = baseline?.deployments;
        if (!Array.isArray(active) || active.length !== 1 || active[0]?.percentage !== 100 || !matches5(uuid3, active[0]?.version_id) || !matches5(uuid3, baseline.latestVersion)) {
          throw new UpgradeAdminError("target_drift");
        }
        if (baseline.latestVersion !== active[0].version_id) throw new UpgradeAdminError("baseline_version_mismatch");
        const expected = { ...config.target, currentVersion: config.currentVersion, activeVersion: active[0].version_id };
        const result = await runOperation({ expected, artifact, operationId, api, enrollmentApproval, journal: createJournal(env.TICKETS), now: clock() });
        if (result?.version !== version2 || !["deployment_confirmed", "previously_confirmed"].includes(result?.status)) {
          throw new UpgradeAdminError("operation_unavailable");
        }
        return { status: result.status, version: version2, operationId };
      } catch (error) {
        throw mapError(error);
      }
    }
  };
}
__name(createUpgradeAdmin, "createUpgradeAdmin");

// ../cloud/management.mjs
var document = /* @__PURE__ */ __name((title, body) => `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="/admin/fleet.css"><main><h1>${escapeHtml(title)}</h1>${body}</main></html>`, "document");
var assets = {
  "/admin/console.css": ["text/css", consoleStyles],
  "/admin/console-logo.png": ["image/png", consoleLogo],
  "/admin/devices.js": ["text/javascript", consoleScript],
  "/admin/fleet.css": ["text/css", `
:root { color-scheme: light dark; font: 16px/1.6 system-ui, sans-serif; }
body { margin: 0; background: Canvas; color: CanvasText; }
main { width: min(52rem, calc(100% - 2.5rem)); margin: 3rem auto; }
h1 { margin: 0 0 1.5rem; font-size: clamp(1.8rem, 6vw, 2.65rem); letter-spacing: -.025em; }
h2 { margin: 0 0 .75rem; font-size: 1.2rem; }
[hidden] { display: none !important; }
.toolbar { display: flex; align-items: end; justify-content: space-between; gap: .65rem; flex-wrap: wrap; margin-bottom: .75rem; }
dialog { width: min(35rem, calc(100% - 3.5rem)); border: 1px solid GrayText; border-radius: .7rem; padding: 1.25rem; }
dialog::backdrop { background: rgb(0 0 0 / .45); }
.dialog-actions { display: flex; flex-wrap: wrap; gap: .6rem; margin-top: .8rem; }
section { border: 1px solid color-mix(in srgb, CanvasText 21%, Canvas); border-radius: .7rem; padding: 1.15rem; margin: 1rem 0; }
form { display: flex; align-items: end; gap: .6rem; flex-wrap: wrap; }
label { display: grid; gap: .2rem; }
input, select, button, textarea { font: inherit; padding: .35rem .55rem; border-radius: .35rem; }
input, select, textarea { border: 1px solid GrayText; }
button { cursor: pointer; border: 1px solid currentColor; }
.strong { background: Highlight; color: HighlightText; }
.table { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; text-align: left; }
th, td { border-bottom: 1px solid color-mix(in srgb, CanvasText 18%, Canvas); padding: .65rem .5rem; }
textarea { display: block; box-sizing: border-box; width: 100%; font-family: ui-monospace, monospace; margin-bottom: .7rem; resize: vertical; }
code { overflow-wrap: anywhere; }
dd { margin: 0 0 .65rem; }
`],
  "/admin/copy.js": ["text/javascript", `
const field = document.querySelector('#command');
const button = document.querySelector('#copy');
if (field && button && navigator.clipboard) {
  button.hidden = false;
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(field.value);
      document.querySelector('#copy-status').textContent = '\u547D\u4EE4\u5DF2\u590D\u5236';
    } catch {
      field.focus();
      field.select();
      document.querySelector('#copy-status').textContent = '\u8BF7\u624B\u52A8\u590D\u5236\u5DF2\u9009\u4E2D\u7684\u547D\u4EE4';
    }
  });
}
`]
};
var label2 = {
  ...Object.fromEntries(Object.entries(operatingSystems).map(([platform, entry]) => [platform, entry.label])),
  "windows-x64": "Windows x64",
  "macos-arm64": "macOS Apple Silicon",
  "macos-x64": "macOS Intel",
  "linux-x64": "Linux x64",
  "linux-arm64": "Linux ARM64"
};
var state = { draft: "\u5F85\u5B89\u88C5", pending: "\u7B49\u5F85\u8BBE\u5907\u63A5\u5165", active: "\u5DF2\u6CE8\u518C\u5230 Portal", disabled: "\u5DF2\u6807\u8BB0\u505C\u7528", installing: "\u5B89\u88C5\u4E2D" };
var mcpState = {
  catalog_verified: "\u76EE\u5F55\u5DF2\u9A8C\u8BC1",
  unavailable: "\u76EE\u5F55\u65E0\u6CD5\u8BBF\u95EE",
  unverified: "\u7B49\u5F85\u9A8C\u8BC1",
  not_enabled: "\u672A\u542F\u7528",
  disabled: "\u5DF2\u505C\u7528"
};
var durableInstructions = "\u8BF7\u5728\u76EE\u6807\u8BBE\u5907\u8FD0\u884C\u3002\u9996\u6B21\u9886\u53D6\u6216\u4E3B\u52A8\u64A4\u9500\u540E\u5931\u6548\uFF0C\u8BF7\u52FF\u8F6C\u53D1\u3002";
var shells = { windows: "PowerShell", macos: "\u7EC8\u7AEF", linux: "\u7EC8\u7AEF" };
function durableCommand(result, intentId) {
  const systems = Object.entries(result.commands ?? { [result.platform]: result.command }).map(([id2, command]) => ({
    id: id2,
    label: label2[id2] ?? id2,
    command,
    instructions: `\u5728\u76EE\u6807\u8BBE\u5907\u7684${shells[id2] ?? "\u7EC8\u7AEF"}\u8FD0\u884C\u3002\u9996\u6B21\u9886\u53D6\u6216\u4E3B\u52A8\u64A4\u9500\u540E\u5931\u6548\uFF0C\u8BF7\u52FF\u8F6C\u53D1\u3002`
  }));
  const { commands, ...rest } = result;
  return { ...rest, intentId, platform: label2[result.platform], system: result.platform, systems, instructions: durableInstructions };
}
__name(durableCommand, "durableCommand");
function devicePage(devices, releases, portalHostname, intents, nonce) {
  const portal = /^[a-z0-9.-]+$/.test(portalHostname ?? "") ? "https://" + portalHostname : "";
  const hosted = hostedInstallers(releases);
  const options = Object.entries(operatingSystems).flatMap(([platform, { architectures, label: text2 }]) => {
    if (hosted[platform]) return [{ value: platform, text: text2, enabled: true, browser: hosted[platform].browser }];
    const local = architectures.map((arch) => platform + "-" + arch).filter((value) => releases[value]?.localFile);
    return local.length ? local.map((value) => ({ value, text: label2[value], enabled: true, browser: releases[value].browser })) : [{ value: platform, text: text2, enabled: false }];
  });
  const selected = options.findIndex((option) => option.enabled);
  const platforms = options.map(({ value, text: text2, enabled, browser }, index) => `<label${enabled ? "" : ' title="\u5F53\u524D\u65E0\u53EF\u7528\u5B89\u88C5\u5305"'}><input class="sr-only" type="radio" name="platform" value="${escapeHtml(value)}"${browser === true ? ' data-browser="true"' : ""}${enabled ? "" : " disabled"}${index === selected ? " checked" : ""}><span>${escapeHtml(text2)}</span></label>`).join("\n");
  const button = /* @__PURE__ */ __name((action, text2, quiet = false) => `<button class="button${quiet ? " quiet" : ""}" type="button" data-action="${action}">${text2}</button>`, "button");
  const rows = devices.map((device) => {
    const name = device.displayName ?? device.id;
    const initial = [...name][0]?.toUpperCase() ?? "";
    const canReissue = !intents && device.status === "pending" && options.some((option) => option.enabled && option.value === device.platform);
    return `
    <tr role="row" data-state="${escapeHtml(device.status === "installing" ? "pending" : device.status)}" data-device="${escapeHtml(device.id)}"${device.intentId ? ` data-intent="${escapeHtml(device.intentId)}"` : ""}${canReissue ? ` data-platform="${escapeHtml(device.platform)}"` : ""}>
      <th role="rowheader" scope="row"><div class="identity"><span class="initial" aria-hidden="true">${escapeHtml(initial)}</span><div><span class="device-name">${escapeHtml(name)}</span><span class="system">${escapeHtml(label2[device.platform] ?? (device.platform || "\u672A\u9009\u62E9\u7CFB\u7EDF"))}</span></div></div></th>
      <td role="cell"><span class="state">${escapeHtml(state[device.status] ?? device.status)}</span></td>
      <td role="cell"><div class="row-actions">${device.status === "draft" ? button("setup-command", "\u5B89\u88C5\u547D\u4EE4") : device.intentId && device.status === "pending" ? button("intent-command", "\u5B89\u88C5\u547D\u4EE4") + button("intent-revoke", "\u64A4\u9500\u547D\u4EE4", true) : device.intentId ? button("disable", "\u505C\u7528\u8FDC\u7A0B\u63A5\u5165", true) : (canReissue ? button("setup-command", "\u5B89\u88C5\u547D\u4EE4") : "") + button("status", "\u67E5\u770B\u72B6\u6001") + (device.status === "pending" ? button("cancel", "\u53D6\u6D88\u7968\u636E", true) : "") + (device.status === "disabled" ? button("review", "\u590D\u6838\u505C\u7528", true) : button("disable", "\u505C\u7528\u8FDC\u7A0B\u63A5\u5165", true))}</div></td>
    </tr>`;
  }).join("");
  const total = /* @__PURE__ */ __name((status) => devices.filter((device) => device.status === status).length, "total");
  const values = {
    NONCE: nonce,
    SCRIPT: consoleScript,
    // Enrollment-intent consoles issue one command for every hosted system.
    ANY_SYSTEM: intents ? "true" : "false",
    BROWSER_CONSENT: Object.values(hosted).some((group) => group.browser === true) ? "true" : "false",
    PORTAL: portal ? escapeHtml(portal) + "<wbr>/mcp" : "\u5C1A\u672A\u914D\u7F6E",
    ROWS: rows,
    PLATFORMS: platforms,
    ADD_DISABLED: "",
    COUNT_ALL: devices.length,
    COUNT_ACTIVE: total("active"),
    COUNT_PENDING: total("draft") + total("pending") + total("installing"),
    COUNT_DISABLED: total("disabled")
  };
  return consoleTemplate.replace(/@@([A-Z_]+)@@/g, (_, name) => values[name]);
}
__name(devicePage, "devicePage");
var back = '<p><a href="/">\u8FD4\u56DE\u8BBE\u5907\u5217\u8868</a></p>';
async function manage(request, env, url, { limitedBody: limitedBody2, html: html2, json: json2, assetResponse: assetResponse2, provider = createDevices, upgradeProvider = createUpgradeAdmin, execution }) {
  const devices = provider(env);
  const getIntents = /* @__PURE__ */ __name(() => enrollmentContext(env), "getIntents");
  const wantsJson = request.headers.get("Accept")?.split(",").some((value) => value.split(";", 1)[0].trim() === "application/json");
  try {
    if (request.method === "GET") {
      if (Object.hasOwn(assets, url.pathname)) return assetResponse2(...assets[url.pathname]);
      if (url.pathname === "/admin/client-callbacks") return json2(await devices.clientCallbacks());
      if (url.pathname === "/admin/upgrade/check") return json2(await upgradeProvider(env).check());
      if (url.pathname === "/admin/upgrade/status") return json2(await upgradeProvider(env).status());
      if (url.pathname === "/admin/devices/enrollment") {
        const id2 = url.searchParams.get("deviceId");
        const intentId = url.searchParams.get("intentId");
        if (intentId !== null) {
          if (url.searchParams.getAll("intentId").length !== 1 || url.searchParams.getAll("deviceId").length !== 1) {
            return json2({ error: "Invalid enrollment query" }, 400);
          }
          const state2 = enrollmentIsEnabled(env) ? await readBoundEnrollmentState(env.TICKETS, id2, intentId) : void 0;
          if (state2 === "pending" || state2 === "revoked") return json2({ registration: state2 });
          if (state2 !== "claimed") return json2({ error: "Device command unavailable" }, 404);
          let registered;
          try {
            registered = (await devices.enrollmentStatus(id2)).registration;
          } catch (error) {
            if (error.status !== 404) throw error;
          }
          return json2({ registration: ["active", "disabled"].includes(registered) ? registered : "installing" });
        }
        let status;
        try {
          status = await devices.enrollmentStatus(id2);
        } catch (error) {
          if (error.status !== 404 || !enrollmentIsEnabled(env)) throw error;
        }
        if (enrollmentIsEnabled(env) && (!status || ["draft", "pending"].includes(status.registration))) {
          status = await getIntents().registration(id2) ?? status;
        }
        return status ? json2(status) : json2({ error: "Device unavailable" }, 404);
      }
      if (url.pathname === "/") {
        const intents = getIntents();
        const existing = new Map((await devices.list()).map((row) => [row.id, row]));
        if (intents) {
          for (const pending of await intents.list()) {
            const established = existing.get(pending.id);
            if (!established || established.status === "draft" || established.status === "pending" && pending.status === "installing") {
              existing.set(pending.id, { ...established, ...pending });
            }
          }
        }
        const rows = [...existing.values()].sort((left, right) => (left.displayName ?? left.id).localeCompare(right.displayName ?? right.id) || left.id.localeCompare(right.id));
        const nonce = crypto.randomUUID();
        return html2(devicePage(rows, intents?.releases ?? devices.releases, JSON.parse(env.FLEET_SPEC).portalHostname, Boolean(intents), nonce), 200, nonce);
      }
    }
    if (request.method !== "POST") return json2({ error: "Unknown route" }, 404);
    if (url.pathname === activatePath) {
      if (request.headers.get("Content-Type")?.split(";", 1)[0] !== "application/json") return json2({ error: "Expected JSON" }, 415);
      let input2;
      try {
        input2 = JSON.parse(await limitedBody2(request));
      } catch {
        return json2({ error: "Invalid request" }, 400);
      }
      const token = /^Bearer (.+)$/.exec(request.headers.get("Authorization") ?? "")?.[1];
      const result = await devices.activate(input2?.deviceId, token);
      return json2(result, result.status === "revoked" ? 410 : 200);
    }
    if (request.headers.get("Origin") !== url.origin) return json2({ error: "Invalid origin" }, 403);
    if (request.headers.get("Content-Type")?.split(";", 1)[0] !== "application/x-www-form-urlencoded") return json2({ error: "Expected form" }, 415);
    const fields = [...new URLSearchParams(await limitedBody2(request))];
    const input = Object.fromEntries(fields);
    if (url.pathname === "/admin/devices/reserve") {
      if (fields.length !== 1 || !(Object.hasOwn(input, "name") || Object.hasOwn(input, "deviceId"))) {
        const error = "\u6DFB\u52A0\u8BBE\u5907\u53EA\u9700\u8981\u4E00\u4E2A\u8BBE\u5907\u540D\u79F0\u3002";
        return wantsJson ? json2({ error }, 400) : html2(document("\u8BBE\u5907\u64CD\u4F5C\u5931\u8D25", `<p>${escapeHtml(error)}</p>${back}`), 400);
      }
      const reserved = Object.hasOwn(input, "name") ? await devices.reserveNamed(input.name) : await devices.reserve(input.deviceId);
      return wantsJson ? json2(reserved) : html2(document("\u8BBE\u5907\u5DF2\u6DFB\u52A0", back));
    }
    if (url.pathname.startsWith("/admin/upgrade/") && fields.length !== Object.keys(input).length) {
      return json2({ error: "\u5347\u7EA7\u8BF7\u6C42\u5305\u542B\u91CD\u590D\u5B57\u6BB5\uFF0C\u8BF7\u91CD\u65B0\u68C0\u67E5\u7248\u672C\u3002" }, 400);
    }
    if (fields.length !== Object.keys(input).length && (url.pathname === "/admin/enrollment-intents" || url.pathname === "/admin/devices" && enrollmentIsEnabled(env))) {
      const error = "\u63A5\u5165\u8BF7\u6C42\u5305\u542B\u91CD\u590D\u5B57\u6BB5\uFF0C\u8BF7\u8FD4\u56DE\u8BBE\u5907\u5217\u8868\u540E\u91CD\u8BD5\u3002";
      return wantsJson ? json2({ error, code: "duplicate_fields" }, 400) : html2(document("\u8BBE\u5907\u64CD\u4F5C\u5931\u8D25", `<p>${escapeHtml(error)}</p>${back}`), 400);
    }
    if (url.pathname === "/admin/upgrade/reconcile") return json2(await upgradeProvider(env).reconcile(input));
    if (url.pathname === "/admin/upgrade/start") {
      const operation = upgradeProvider(env).start(input);
      execution?.waitUntil(operation.catch(() => {
      }));
      return json2(await operation);
    }
    if (url.pathname === "/admin/client-callbacks") {
      return json2(await devices.registerClientCallback(input.clientName, input.redirectUri));
    }
    if (url.pathname === "/admin/enrollment-intents") {
      const intents = getIntents();
      if (!intents) return json2({ error: "\u63A5\u5165\u547D\u4EE4\u670D\u52A1\u6682\u4E0D\u53EF\u7528\u3002" }, 404);
      const target = { deviceId: input.deviceId, intentId: input.intentId };
      if (input.action === "reveal") {
        const result = await intents.command(url.origin, target);
        return json2(durableCommand(result, target.intentId));
      }
      if (input.action === "revoke") {
        await intents.admin.revoke(target);
        return json2({ status: "cancelled" });
      }
      return json2({ error: "\u672A\u77E5\u7684\u63A5\u5165\u547D\u4EE4\u64CD\u4F5C\u3002" }, 400);
    }
    if (url.pathname === "/admin/devices") {
      if (enrollmentIsEnabled(env)) {
        const intents = getIntents();
        const anySystem = input.platform === void 0 || input.platform === "";
        const intent = await intents.admin.create({
          deviceId: input.deviceId,
          ...!anySystem && { platform: input.platform },
          confirmBrowser: input.browserConsent === "1"
        });
        if (wantsJson && intent.preparedDraft) {
          const result = await intents.command(url.origin, { deviceId: intent.deviceId, intentId: intent.id });
          return json2(durableCommand(result, intent.id));
        }
        if (wantsJson) return json2({ intentSaved: true, deviceId: intent.deviceId });
        return html2(document("\u8BBE\u5907\u5DF2\u6DFB\u52A0", back));
      }
      const { asset, ticket, expiresAt } = await devices.launch(input.deviceId, input.platform, { confirmBrowser: input.browserConsent === "1" });
      const command = asset.assets ? shortInstallCommand(url.origin, input.platform, asset.version, ticket, input.deviceId) : installCommand(url.origin, input.platform, asset, ticket, input.deviceId);
      const shell = input.platform === "windows" || input.platform.startsWith("windows-") ? " PowerShell" : "\u7EC8\u7AEF";
      const instructions = `${asset.localFile ? "\u8BF7\u5728\u9884\u7F6E\u5B89\u88C5\u5305\u6240\u5728\u76EE\u5F55\u8FD0\u884C\u547D\u4EE4\u3002" : ""}${asset.browser ? "\u8BF7\u5148\u5728\u76EE\u6807\u8BBE\u5907\u914D\u7F6E\u6D4F\u89C8\u5668\u4E13\u7528\u540E\u7AEF\u3002" : ""}\u5728\u76EE\u6807\u8BBE\u5907\u7684${shell}\u8FD0\u884C\u8FD9\u6761\u547D\u4EE4\u3002\u7968\u636E\u6709\u6548\u671F\u5341\u5206\u949F\uFF0C\u4EC5\u53EF\u4F7F\u7528\u4E00\u6B21\uFF0C\u8BF7\u52FF\u8F6C\u53D1\u3002`;
      if (wantsJson) return json2({ command, instructions, expiresAt, serverTime: Math.floor(Date.now() / 1e3), deviceId: input.deviceId, platform: label2[input.platform] });
      return html2(document("\u8FDE\u63A5\u547D\u4EE4", `${asset.localFile ? `<p>\u672C\u6B21\u8BD5\u70B9\u4F7F\u7528\u76EE\u6807\u8BBE\u5907\u4E0A\u5DF2\u51C6\u5907\u7684\u5B89\u88C5\u5305 <code>${escapeHtml(asset.localFile)}</code>\u3002\u8BF7\u5728\u5B89\u88C5\u5305\u6240\u5728\u76EE\u5F55\u8FD0\u884C\u547D\u4EE4\u3002</p>` : ""}
        <p id="install-instructions">${escapeHtml(instructions)}\u83B7\u51C6\u7684\u7BA1\u7406\u5458\u53EF\u8C03\u7528\u6B64\u8BBE\u5907\u5F00\u653E\u7684\u6587\u4EF6\u548C\u547D\u4EE4\u5DE5\u5177\u3002</p>
        <p>${escapeHtml(label2[input.platform])} \xB7 <strong>${escapeHtml(input.deviceId)}</strong> \xB7 \u7248\u672C ${escapeHtml(asset.version)} \xB7 ${escapeHtml(new Date(expiresAt * 1e3).toISOString().replace("T", " ").slice(0, 16))} UTC \u5230\u671F</p>
        <textarea id="command" rows="${asset.assets ? 3 : 8}" readonly aria-label="\u8BBE\u5907\u8FDE\u63A5\u547D\u4EE4">${escapeHtml(command)}</textarea>
        <button class="strong" type="button" id="copy" hidden>\u590D\u5236\u547D\u4EE4</button> <span role="status" id="copy-status"></span>
        <script src="/admin/copy.js" defer><\/script>${back}`));
    }
    if (url.pathname === "/admin/device") {
      if (input.action === "status") {
        const result = await devices.status(input.deviceId);
        if (wantsJson) return json2(result);
        const development = result.mcpProfiles?.development ?? result.mcp;
        const browser = result.mcpProfiles?.browser;
        return html2(document("\u8BBE\u5907\u72B6\u6001", `<p><strong>${escapeHtml(result.deviceId)}</strong></p><dl>
          <dt>\u6700\u540E\u68C0\u67E5\uFF08UTC\uFF09</dt><dd>${escapeHtml(new Date(result.checkedAt * 1e3).toISOString())}</dd>
          <dt>\u6CE8\u518C</dt><dd>${escapeHtml(state[result.registration] ?? result.registration)}</dd>
          <dt>Cloudflare Tunnel</dt><dd>${escapeHtml(result.tunnel === "check_failed" ? "\u65E0\u6CD5\u67E5\u8BE2" + (result.tunnelDiagnostic?.httpStatus ? " \xB7 HTTP " + result.tunnelDiagnostic.httpStatus : "") : result.tunnel)}</dd>
          <dt>\u5F00\u53D1\u5DE5\u5177\u76EE\u5F55</dt><dd>${escapeHtml(mcpState[development] ?? development)}</dd>
          ${browser ? `<dt>\u6D4F\u89C8\u5668\u5DE5\u5177\u76EE\u5F55</dt><dd>${escapeHtml(mcpState[browser] ?? browser)}</dd>` : ""}
          ${result.release ? `<dt>\u5B89\u88C5\u5305\u7248\u672C</dt><dd>${escapeHtml(result.release)}</dd>` : ""}
          ${result.serverIds ? `<dt>Portal \u670D\u52A1 ID</dt><dd>${result.serverIds.map((id2) => `<code>${escapeHtml(id2)}</code>`).join(" \xB7 ")}</dd>` : ""}
          ${result.revocation ? `<dt>\u64A4\u9500</dt><dd>${result.revocation === "complete" ? "\u5DF2\u5B8C\u6210" : "\u5C1A\u672A\u5B8C\u6210\uFF0C\u8BF7\u91CD\u8BD5\u505C\u7528"}</dd>` : ""}
          </dl>${back}`));
      }
      if (input.action === "cancel") {
        const cancelled = await cancelTicket(env.TICKETS, input.deviceId);
        if (wantsJson) return json2({ status: cancelled ? "cancelled" : "no_pending_ticket" });
        return html2(document(cancelled ? "\u5DF2\u53D6\u6D88\u5B89\u88C5\u7968\u636E" : "\u6CA1\u6709\u53EF\u53D6\u6D88\u7684\u7968\u636E", back));
      }
      if (input.action === "confirm-disable") {
        const result = await devices.status(input.deviceId);
        if (result.revocation === "complete") return html2(document("\u8FDC\u7A0B\u63A5\u5165\u5DF2\u505C\u7528", back));
        return html2(document("\u505C\u7528\u8FDC\u7A0B\u63A5\u5165", `<p>\u8BBE\u5907 <strong>${escapeHtml(result.deviceId)}</strong> \u7684\u5B89\u88C5\u7968\u636E\u3001Tunnel \u51ED\u636E\u548C Portal \u8DEF\u7531\u5C06\u88AB\u64A4\u9500\u3002</p>
          <form method="post" action="/admin/device"><input type="hidden" name="deviceId" value="${escapeHtml(result.deviceId)}">
          <button class="strong" name="action" value="disable">\u786E\u8BA4\u505C\u7528</button></form>${back}`));
      }
      if (input.action === "disable") {
        await devices.disable(input.deviceId);
        if (wantsJson) return json2({ status: "disabled" });
        return html2(document("\u8FDC\u7A0B\u63A5\u5165\u5DF2\u505C\u7528", back));
      }
    }
    return json2({ error: "Unknown route" }, 404);
  } catch (error) {
    if (url.pathname === activatePath) {
      return error instanceof DeviceError ? json2({
        error: error.message,
        ...error.status === 409 && activationErrorCodes.includes(error.activationCode) && { code: error.activationCode }
      }, error.status) : json2({ error: "Device activation failed" }, 503);
    }
    if (error instanceof EnrollmentAdminError) {
      return wantsJson ? json2({ error: error.message, code: error.code }, error.status) : html2(document("\u8BBE\u5907\u64CD\u4F5C\u5931\u8D25", `<p>${escapeHtml(error.message)}</p>${back}`), error.status);
    }
    if (error instanceof UpgradeAdminError) return json2({ error: error.message, code: error.code }, error.status);
    if (url.pathname.startsWith("/admin/upgrade/")) return json2({ error: "\u65E0\u6CD5\u786E\u8BA4\u5347\u7EA7\u72B6\u6001\u3002\u8BF7\u5148\u6838\u5BF9\uFF0C\u4E0D\u8981\u91CD\u590D\u63D0\u4EA4\u3002" }, 503);
    const expected = error instanceof DeviceError || error instanceof PortalCallbackError;
    const message2 = expected ? error.message : "\u8BF7\u68C0\u67E5 Cloudflare \u6743\u9650\u548C\u8BBE\u5907\u8FDE\u63A5\u540E\u91CD\u8BD5\u3002";
    const status = expected ? error.status : 503;
    if (wantsJson || ["/admin/client-callbacks", "/admin/devices/enrollment"].includes(url.pathname)) return json2({ error: message2 }, status);
    return html2(document("\u8BBE\u5907\u64CD\u4F5C\u5931\u8D25", `<p>${escapeHtml(message2)}</p>${back}`), status);
  }
}
__name(manage, "manage");

// ../cloud/worker.mjs
function contentSecurityPolicy(nonce) {
  const inline = nonce ? ` 'nonce-${nonce}'` : "";
  const imageData = nonce ? " data:" : "";
  return `default-src 'none'; script-src 'self'${inline}; style-src 'self'${inline}; img-src 'self'${imageData}; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`;
}
__name(contentSecurityPolicy, "contentSecurityPolicy");
var responseHeaders = {
  "Cache-Control": "no-store",
  // Browser form POSTs need a same-origin Origin header for CSRF protection.
  "Referrer-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": contentSecurityPolicy()
};
var json = /* @__PURE__ */ __name((value, status = 200) => Response.json(value, { status, headers: responseHeaders }), "json");
var issuers = /* @__PURE__ */ new Map();
async function accessAdmin(request, env) {
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_ISSUER ?? "") || !env.ACCESS_AUD || !env.OWNER_EMAIL) return false;
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return false;
  const issuer = env.ACCESS_ISSUER;
  if (!issuers.has(issuer)) {
    issuers.set(issuer, createRemoteJWKSet(new URL("/cdn-cgi/access/certs", issuer), { timeoutDuration: 4e3 }));
  }
  try {
    const { payload } = await jwtVerify(token, issuers.get(issuer), {
      issuer,
      audience: env.ACCESS_AUD,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "sub", "email"]
    });
    return typeof payload.email === "string" && payload.email.toLowerCase() === env.OWNER_EMAIL.toLowerCase();
  } catch {
    return false;
  }
}
__name(accessAdmin, "accessAdmin");
async function limitedBody(request) {
  if (!request.body) throw new Error("Expected request body");
  const reader = request.body.getReader();
  const decoder2 = new TextDecoder("utf-8", { fatal: true });
  let value = "", bytes = 0;
  try {
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) return value + decoder2.decode();
      bytes += chunk.length;
      if (bytes > 1e4) throw new Error("Request body too large");
      value += decoder2.decode(chunk, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {
    });
  }
}
__name(limitedBody, "limitedBody");
var page = `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width"><title>\u8BFA\u8054 Nodrelay \u8BBE\u5907\u63A5\u5165</title>
<main><h1>\u8BFA\u8054 Nodrelay \u8BBE\u5907\u63A5\u5165</h1>
<p>\u4F7F\u7528\u5DF2\u4E3A\u6B64\u8BBE\u5907\u521B\u5EFA\u7684 Tunnel \u4E0E Portal \u6E90\u7AD9\u51ED\u636E\u751F\u6210\u5341\u5206\u949F\u5B89\u88C5\u7968\u636E\u3002</p>
<form method="post" action="/admin/tickets" autocomplete="off">
<p><label>\u8BBE\u5907 ID <input name="deviceId" required pattern="[a-z][a-z0-9\\-]{0,23}"></label></p>
<p><label>Tunnel \u4EE4\u724C <input name="tunnelToken" required type="password" maxlength="4096"></label></p>
<p><label>Portal \u6E90\u7AD9\u4EE4\u724C <input name="portalToken" required type="password" minlength="43" maxlength="43"></label></p>
<button>\u751F\u6210\u7968\u636E</button></form>
<h2>\u53D6\u6D88\u672A\u4F7F\u7528\u7684\u7968\u636E</h2>
<form method="post" action="/admin/cancel">
<label>\u8BBE\u5907 ID <input name="deviceId" required pattern="[a-z][a-z0-9\\-]{0,23}"></label>
<button>\u53D6\u6D88\u7968\u636E</button></form></main></html>`;
var assetResponse = /* @__PURE__ */ __name((contentType, body, status = 200, headers) => new Response(body, {
  status,
  headers: { ...responseHeaders, "Content-Type": typeof body === "string" ? contentType + "; charset=utf-8" : contentType, ...headers }
}), "assetResponse");
var html = /* @__PURE__ */ __name((body, status, nonce) => assetResponse(
  "text/html",
  body,
  status,
  nonce ? { "Content-Security-Policy": contentSecurityPolicy(nonce) } : void 0
), "html");
function createWorker({ verifyAdmin = accessAdmin, deviceProvider, upgradeProvider } = {}) {
  return {
    async fetch(request, env, execution) {
      const url = new URL(request.url);
      if (url.origin !== env.APP_ORIGIN || url.protocol !== "https:") return json({ error: "Unknown origin" }, 404);
      const { pathname } = url;
      const provisioner = Boolean(env.PROVISIONER_TOKEN) !== Boolean(env.PROVISIONER_OAUTH);
      const managed = Boolean(env.FLEET_SPEC && provisioner && env.RELEASE_CATALOG);
      if (env.FLEET_SPEC && !managed) return json({ error: "Managed deployment bindings missing" }, 503);
      const installPlatform = managed && Object.keys(operatingSystems).find((platform) => pathname === installPath(platform));
      if (installPlatform) {
        if (request.method === "POST") {
          if (!enrollmentIsEnabled(env)) return json({ error: "Installer unavailable" }, 404);
          if (request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
            return json({ error: "Expected JSON" }, 415);
          }
          let input;
          try {
            input = JSON.parse(await limitedBody(request));
          } catch {
            return json({ error: "Invalid request" }, 400);
          }
          try {
            const script = await enrollmentContext(env).launch(env.APP_ORIGIN, installPlatform, input);
            return script ? assetResponse("text/plain", script) : json({ error: "Install code unavailable. Copy the current command from the management console." }, 404);
          } catch {
            return json({ error: "Installer temporarily unavailable. Retry the same command." }, 503);
          }
        }
        if (url.searchParams.has("manifest") || url.searchParams.has("v")) {
          if (!enrollmentIsEnabled(env)) return json({ error: "Approved installer unavailable" }, 404);
          try {
            return await resolveEnrollmentBootstrap(request, { origin: env.APP_ORIGIN, ...enrollmentContext(env) });
          } catch {
            return json({ error: "Approved installer unavailable" }, 404);
          }
        }
        const [version2] = url.searchParams.getAll("version");
        if (request.method !== "GET" || !version2 || [...url.searchParams].length !== 1) {
          return json({ error: "Installer version unavailable. Generate a new connection command." }, 404);
        }
        try {
          const group = hostedInstallers(JSON.parse(env.RELEASE_CATALOG))[installPlatform];
          if (!group || version2 !== group.version) {
            return json({ error: "Installer version unavailable. Generate a new connection command." }, 404);
          }
          return assetResponse("text/plain", bootstrapInstaller(url.origin, installPlatform, group));
        } catch {
          return json({ error: "Installer catalog temporarily unavailable. Contact the management console administrator." }, 503);
        }
      }
      const redeem = pathname === (managed ? enrollPath : "/enroll");
      const activate = managed && pathname === activatePath;
      const mediaType = request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
      if (!redeem && !activate && !await verifyAdmin(request, env)) return json({ error: "Administrator login required" }, 403);
      if (managed && !redeem) return manage(request, env, url, { limitedBody, html, json, assetResponse, provider: deviceProvider, upgradeProvider, execution });
      if (request.method === "GET" && pathname === "/") return html(page);
      if (request.method !== "POST") return json({ error: "Unknown route" }, 404);
      if (!redeem && request.headers.get("Origin") !== url.origin) return json({ error: "Invalid origin" }, 403);
      try {
        if (redeem) {
          if (mediaType !== "application/json") return json({ error: "Expected JSON" }, 415);
          let input2;
          try {
            input2 = JSON.parse(await limitedBody(request));
          } catch {
            return json({ error: "Invalid request" }, 400);
          }
          if (input2?.protocol === "intent-v1") {
            if (!managed || !enrollmentIsEnabled(env)) return json({ error: "Enrollment protocol unavailable" }, 404);
            try {
              const devices = (deviceProvider ?? createDevices)(env);
              const enrolled = await devices.claimHostedEnrollment(input2);
              return enrolled ? json(enrolled) : json({ error: "Enrollment command unavailable" }, 404);
            } catch (error) {
              return error instanceof DeviceError ? json({ error: "Enrollment could not proceed" }, error.status) : json({ error: "Enrollment interrupted; retry only on the same device" }, 503);
            }
          }
          const credentials2 = await redeemTicket(env.TICKETS, env.TICKET_KEY, input2?.ticket);
          return credentials2 ? json(credentials2) : json({ error: "Ticket unavailable" }, 404);
        }
        if (!["/admin/tickets", "/admin/cancel"].includes(pathname)) return json({ error: "Unknown route" }, 404);
        if (mediaType !== "application/x-www-form-urlencoded") return json({ error: "Expected form" }, 415);
        let input;
        try {
          input = Object.fromEntries(new URLSearchParams(await limitedBody(request)));
        } catch {
          return json({ error: "Invalid form" }, 400);
        }
        if (pathname === "/admin/cancel") {
          if (!devicePattern2.test(input.deviceId ?? "")) return json({ error: "Invalid device id" }, 400);
          await cancelTicket(env.TICKETS, input.deviceId);
          return html('<!doctype html><p>\u5F85\u9886\u53D6\u7968\u636E\u5DF2\u53D6\u6D88\u3002</p><p><a href="/">\u8FD4\u56DE\u8BBE\u5907\u63A5\u5165</a></p>');
        }
        let credentials;
        try {
          credentials = validateCredentials(input);
        } catch {
          return json({ error: "Invalid device credentials" }, 400);
        }
        const issued = await issueTicket(env.TICKETS, env.TICKET_KEY, credentials);
        if (!issued) return json({ error: "This device already has an unclaimed ticket" }, 409);
        const command = `npm run enroll -- ${url.origin} .fleet-${credentials.deviceId}`;
        return html(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>\u8BBE\u5907\u5B89\u88C5\u7968\u636E</title>
          <h1>\u51ED\u636E\u9886\u53D6</h1><p>\u5728\u76EE\u6807\u8BBE\u5907\u5DF2\u9A8C\u8BC1\u7684\u9879\u76EE\u76EE\u5F55\u8FD0\u884C\u4E0B\u65B9\u547D\u4EE4\uFF0C\u5E76\u7C98\u8D34\u6B64\u7968\u636E\u3002</p>
          <pre>${command}</pre><p>\u7968\u636E\uFF08\u6709\u6548\u671F\u5341\u5206\u949F\uFF0C\u6210\u529F\u9886\u53D6\u540E\u7ACB\u5373\u5931\u6548\uFF09</p>
          <pre>${issued.ticket}</pre><p><a href="/">\u8FD4\u56DE\u8BBE\u5907\u63A5\u5165</a></p></html>`);
      } catch {
        return json({ error: "Enrollment temporarily unavailable" }, 503);
      }
    }
  };
}
__name(createWorker, "createWorker");
var worker_default = createWorker();
export {
  OAuthProvisioner,
  createWorker,
  worker_default as default
};
//# sourceMappingURL=worker.js.map
