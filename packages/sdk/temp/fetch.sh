#!/usr/bin/env bash
# TEMPORARY: fetch the cartesi-rollups-node .deb files the SDK image installs.
#
# These come from an unreleased build:
# https://github.com/cartesi/rollups-node/actions/runs/31189416046
# (branch feature/bump-emulator-v0.21.0). The published v2.0.0-alpha.12 release carries the
# same version string but different binaries, so it cannot be used. Delete this folder once a
# release with these builds exists.
#
# nightly.link proxies the artifact without authentication (the GitHub API requires a token
# even for public repos). The artifact expires 2026-11-05, after which this script stops
# working and the SDK image can no longer be built.
#
# Run via `bun run fetch:temp`; `bun run build` calls it first. The download is skipped when
# both .deb files are already present *and* match the checksums pinned below — set FORCE=1 to
# refetch unconditionally. The same checksums are pinned in the Dockerfile, which re-verifies
# at install time; update both together.
set -euo pipefail

RUN_ID=31189416046
VERSION=2.0.0-alpha.12
SHA256_AMD64=6ab8bf675e4d2a3bc3e8d14521c2b2fb0ecc291fc26474f4b3c0db6d9e800a7b
SHA256_ARM64=d3c4876d2c4de7578755ad67255cac303ea6e677bd8f182e8df22f1b41d81063
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CHECKSUMS="${SHA256_AMD64}  ${DIR}/cartesi-rollups-node-v${VERSION}_amd64.deb
${SHA256_ARM64}  ${DIR}/cartesi-rollups-node-v${VERSION}_arm64.deb"

# A present-but-corrupt file fails the check and falls through to a refetch.
if [ "${FORCE:-0}" != "1" ] && printf '%s\n' "${CHECKSUMS}" | shasum -a 256 --check --status 2>/dev/null; then
    echo "cartesi-rollups-node v${VERSION} .deb files already present and verified, skipping download."
    exit 0
fi

curl -fL --progress-bar \
    "https://nightly.link/cartesi/rollups-node/actions/runs/${RUN_ID}/artifacts.zip" \
    -o "${DIR}/artifacts.zip"

# The archive holds both debs at the root, already correctly named.
unzip -o -j "${DIR}/artifacts.zip" "cartesi-rollups-node-v${VERSION}_*.deb" -d "${DIR}"
rm "${DIR}/artifacts.zip"

printf '%s\n' "${CHECKSUMS}" | shasum -a 256 --check
