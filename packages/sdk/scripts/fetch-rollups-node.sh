#!/usr/bin/env bash
# Fetch the rollups-node .deb files built by cartesi/rollups-node CI, through
# nightly.link. WIP plumbing until the next rollups-node release.
#
# By default this takes the build the branch is verified against:
# rollups-node#815 (chore/bump-version-alpha14) at e9eebb72, 2.0.0-alpha.14.
# ROLLUPS_NODE_RUN_ID picks another run; ROLLUPS_NODE_RUN_ID=latest takes the
# latest successful run of ROLLUPS_NODE_BRANCH (default next/2.0).
#
# The download is skipped when the .deb files of the same run are already in
# place with the checksums recorded in SOURCE, so `bun run build` can call this
# every time.
set -euo pipefail

DEFAULT_RUN_ID="41211121596"
BRANCH="${ROLLUPS_NODE_BRANCH:-next/2.0}"
RUN_ID="${ROLLUPS_NODE_RUN_ID:-$DEFAULT_RUN_ID}"
BASE="https://nightly.link/cartesi/rollups-node"
DEST="$(cd "$(dirname "$0")/.." && pwd)/rollups-node"

sha256() {
    if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi
}

if [[ "$RUN_ID" == "latest" ]]; then
    page="$BASE/workflows/build/${BRANCH//\//%2F}"
    RUN_ID="$(curl -fsSL "$page" | grep -oE 'actions/runs/[0-9]+/artifacts\.zip' | head -n1 | grep -oE '[0-9]+' || true)"
    [[ -n "$RUN_ID" ]] || { echo "no successful run found at $page" >&2; exit 1; }
fi

run_url="https://github.com/cartesi/rollups-node/actions/runs/$RUN_ID"

# already fetched: SOURCE names the same run, and each .deb still has the
# checksum recorded there (compared here: macOS's sha256sum has no --check)
fetched() {
    [[ -f "$DEST/SOURCE" ]] && grep -qx "run: $run_url" "$DEST/SOURCE" || return 1
    for arch in amd64 arm64; do
        local file="cartesi-rollups-node_$arch.deb" expected actual
        [[ -f "$DEST/$file" ]] || return 1
        expected="$(grep " $file\$" "$DEST/SOURCE" | cut -d' ' -f1)"
        actual="$(cd "$DEST" && sha256 "$file" | cut -d' ' -f1)"
        [[ -n "$expected" && "$expected" == "$actual" ]] || return 1
    done
}

if fetched; then
    echo "rollups-node packages of run $RUN_ID already in $DEST"
    exit 0
fi

url="$BASE/actions/runs/$RUN_ID/artifacts.zip"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
echo "fetching rollups-node packages of run $RUN_ID..."
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
    echo "run: $run_url"
    echo "url: $url"
    (cd "$DEST" && sha256 cartesi-rollups-node_*.deb)
} | tee "$DEST/SOURCE"
