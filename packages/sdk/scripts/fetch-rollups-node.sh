#!/usr/bin/env bash
# Download the rollups-node debs of a GitHub Actions run of a public repository
# without a login, through nightly.link, and unzip them into artifacts/.
#
# cartesi/rollups-node has no release for machine-emulator 0.23 yet. PR 831 builds
# one, and the SDK image installs the debs its CI uploaded (packages/sdk/Dockerfile,
# rollups-runtime stage). The run id below is the one the Dockerfile's checksums
# were taken from; change both together. The release URL replaces all of this
# once rollups-node is tagged.
#
#   fetch-rollups-node.sh [--force]
#
# nightly.link redirects to a short-lived signed blob URL, so the download is a
# plain GET that follows redirects; a HEAD request returns 404 even when the
# artifact exists. Artifacts expire with the repository's retention (90 days
# by default), and an in-progress run serves an artifact as soon as the job
# that uploaded it has finished.
#
# The script pins nothing: the Dockerfile verifies the debs with sha256sum. It
# prints the sha256 of every extracted file so those pins can be copied from
# its output.
#
# A destination that already holds files is left alone unless --force is given,
# so a build that calls this script on every run only downloads once.
set -euo pipefail

cd "$(dirname "$0")/.."

REPO=cartesi/rollups-node
RUN_ID=45906622121 # main at 961f479e, after PR 831: emulator 0.23.0, dave 3.0.0-beta.1
ARTIFACT=artifacts
DEST=artifacts

usage() {
    echo "usage: $0 [--force]" >&2
    exit 2
}

[ $# -le 1 ] || usage
force=${1:-}
[ -z "$force" ] || [ "$force" = "--force" ] || usage

for tool in curl unzip; do
    command -v "$tool" >/dev/null 2>&1 || { echo "$tool is required" >&2; exit 1; }
done

# coreutils on Linux, shasum on macOS
digest() {
    if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi
}

mkdir -p "$DEST"
if [ -z "$force" ] && [ -n "$(ls -A "$DEST")" ]; then
    echo "$DEST already holds files; skipping the download (use --force to refetch)"
    (cd "$DEST" && digest ./*)
    exit 0
fi

url="https://nightly.link/${REPO}/actions/runs/${RUN_ID}/${ARTIFACT}.zip"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "Downloading $url"
curl -fsSL --retry 3 --retry-delay 2 -o "$tmp/artifact.zip" "$url"

# unzip refuses to overwrite silently, so --force clears the directory first
if [ -n "$force" ]; then
    find "$DEST" -mindepth 1 -delete
fi
unzip -q -o "$tmp/artifact.zip" -d "$DEST"

echo "Extracted into $DEST:"
(cd "$DEST" && digest ./*)
