#!/usr/bin/env bash
# TEMPORARY: fetch the cartesi-rollups-node .deb files the SDK image installs.
#
# These come from an unreleased build of rollups-node PR #798
# (https://github.com/cartesi/rollups-node/pull/798, branch feature/contracts-bump):
# https://github.com/cartesi/rollups-node/actions/runs/36619844164
# built from head e99e85a95e74ac1fb59b7173d1684cb414fc1a1d.
#
# These binaries carry #794 (deterministic input outcomes), #795 (terminal machine outcomes)
# and #798 (contracts 3.0.0-alpha.10 + Dave 3.0.0-alpha.5). They report themselves as
# v2.0.0-alpha.12 — the same version string as the published release, but different binaries —
# so the checksums below are the only reliable way to tell them apart. Unlike the release, they
# depend on cartesi-machine-emulator (>= 0.21.0, << 0.22.0), which is what this image ships;
# the published v2.0.0-alpha.12 requires (<< 0.21.0) and therefore cannot be installed here.
#
# Delete this folder once a release with these builds exists.
#
# nightly.link proxies the artifact without authentication (the GitHub API requires a token
# even for public repos). The artifact expires 2026-12-28, after which this script stops
# working and the SDK image can no longer be built from this branch.
#
# Run via `bun run fetch:temp`; `bun run build` calls it first. The download is skipped when
# both .deb files are already present *and* match the checksums pinned below — set FORCE=1 to
# refetch unconditionally. The same checksums are pinned in the Dockerfile, which re-verifies
# at install time; update both together.
set -euo pipefail

RUN_ID=36619844164
VERSION=2.0.0-alpha.12
SHA256_AMD64=1cd6cc1e40acb3dd9f13798090a76a79afaf0da3fbfcba27407c3082997053d6
SHA256_ARM64=ec42eef10eaf2e8d11073ea8f227bc750cdaaa4abf0a14d95834568a8d75bc29
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
