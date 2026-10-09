#!/usr/bin/env bash
# TEMPORARY: fetch the cartesi-rollups-node .deb files the SDK image installs.
#
# They come from an unreleased build of the rollups-node next/2.0 branch at
# e9da54b29b0d6d9ef200f95c8e0932e088890e3b, which is v2.0.0-alpha.13 plus
# "fix(machine-tool): support nvram accounts drives", so the machine-tool can prove an
# accounts drive kept in an nvram:
# https://github.com/cartesi/rollups-node/actions/runs/37725861959 (artifact "artifacts")
#
# They report themselves as v2.0.0-alpha.13, the same version and file names as the
# published release but different binaries, so the checksums below are the only reliable
# way to tell them apart. The same checksums are pinned in the Dockerfile, which re-verifies
# them at install time; update both together.
#
# nightly.link proxies the artifact without authentication (the GitHub API requires a token
# even for public repositories). The artifact expires 2027-01-06, after which this script
# stops working. Delete this folder once a rollups-node release with the fix exists.
#
# Run via `bun run fetch:temp`; `bun run build` calls it first. The download is skipped when
# both .deb files are already present and match their checksums; set FORCE=1 to refetch.
set -euo pipefail

RUN_ID=37725861959
VERSION=2.0.0-alpha.13
# digest of the artifact archive, as published by GitHub
SHA256_ARCHIVE=0c513969e4527bffc31f10848b4924510e7ccbcb52a8be992a40759f02a51626
SHA256_AMD64=061e1c2806f04cb05b48b1e82815312e65d282d2952d640d028ce3e296bb5eed
SHA256_ARM64=984c7aae10a2ee47de0340e30cee877e902c031953e4df8b8272ba7312838062
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CHECKSUMS="${SHA256_AMD64}  ${DIR}/cartesi-rollups-node-v${VERSION}_amd64.deb
${SHA256_ARM64}  ${DIR}/cartesi-rollups-node-v${VERSION}_arm64.deb"

# a present but corrupt file fails the check and falls through to a refetch
if [ "${FORCE:-0}" != "1" ] && printf '%s\n' "${CHECKSUMS}" | shasum -a 256 --check --status 2>/dev/null; then
    echo "cartesi-rollups-node v${VERSION} .deb files already present and verified, skipping download."
    exit 0
fi

curl -fL --progress-bar \
    "https://nightly.link/cartesi/rollups-node/actions/runs/${RUN_ID}/artifacts.zip" \
    -o "${DIR}/artifacts.zip"

# nothing is extracted from an archive that isn't the published one
echo "${SHA256_ARCHIVE}  ${DIR}/artifacts.zip" | shasum -a 256 --check

# the archive holds both debs at its root, already correctly named
unzip -o -j "${DIR}/artifacts.zip" "cartesi-rollups-node-v${VERSION}_*.deb" -d "${DIR}"
rm "${DIR}/artifacts.zip"

printf '%s\n' "${CHECKSUMS}" | shasum -a 256 --check
