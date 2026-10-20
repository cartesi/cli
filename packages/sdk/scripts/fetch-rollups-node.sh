#!/usr/bin/env bash
# Fetch the rollups-node .deb files built by cartesi/rollups-node CI, through
# nightly.link. WIP plumbing until the next rollups-node release.
set -euo pipefail

BRANCH="${ROLLUPS_NODE_BRANCH:-next/2.0}"
RUN_ID="${ROLLUPS_NODE_RUN_ID:-}"
BASE="https://nightly.link/cartesi/rollups-node"
DEST="$(cd "$(dirname "$0")/.." && pwd)/rollups-node"

sha256() {
    if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi
}

if [[ -z "$RUN_ID" ]]; then
    page="$BASE/workflows/build/${BRANCH//\//%2F}"
    RUN_ID="$(curl -fsSL "$page" | grep -oE 'actions/runs/[0-9]+/artifacts\.zip' | head -n1 | grep -oE '[0-9]+' || true)"
    [[ -n "$RUN_ID" ]] || { echo "no successful run found at $page" >&2; exit 1; }
fi

url="$BASE/actions/runs/$RUN_ID/artifacts.zip"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "$url" -o "$tmp/artifacts.zip"
unzip -q "$tmp/artifacts.zip" -d "$tmp/artifacts"

mkdir -p "$DEST"
rm -f "$DEST"/*.deb
for arch in amd64 arm64; do
    src=("$tmp"/artifacts/cartesi-rollups-node-v*_"$arch".deb)
    [[ -f "${src[0]}" ]] || { echo "missing $arch .deb in run $RUN_ID" >&2; exit 1; }
    cp "${src[0]}" "$DEST/cartesi-rollups-node_$arch.deb"
done

{
    echo "run: https://github.com/cartesi/rollups-node/actions/runs/$RUN_ID"
    echo "url: $url"
    (cd "$DEST" && sha256 cartesi-rollups-node_*.deb)
} | tee "$DEST/SOURCE"
