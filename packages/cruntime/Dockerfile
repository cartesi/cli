# (c) Cartesi and individual authors (see AUTHORS)
# SPDX-License-Identifier: Apache-2.0 (see LICENSE)

# syntax=docker.io/docker/dockerfile:1
ARG IMAGE_REGISTRY
ARG IMAGE_NAMESPACE
ARG IMAGE_NAME
ARG IMAGE_TAG

###############################################################################
# STAGE: base-image
#
# This stage creates a base-image with apt repository cache and ca-certificates
# to be used by later stages.
#
FROM ${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/${IMAGE_NAME}:$IMAGE_TAG AS base-image
ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates

###############################################################################
# STAGE: chisel
#
# Build the chiselled filesystem based on the desired slices.
# This image should have the machine-emulator-tools and crun dependencies
# installed.
#
FROM base-image AS chisel

WORKDIR /rootfs

# Extract machine-emulator-tools into the chiselled filesystem
ARG MACHINE_EMULATOR_TOOLS_VERSION
ADD https://github.com/cartesi/machine-emulator-tools/releases/download/v${MACHINE_EMULATOR_TOOLS_VERSION}/machine-emulator-tools-v${MACHINE_EMULATOR_TOOLS_VERSION}.deb /
RUN dpkg -x /machine-emulator-tools-v${MACHINE_EMULATOR_TOOLS_VERSION}.deb /rootfs

# Get chisel binary
ARG CHISEL_VERSION
ADD "https://github.com/canonical/chisel/releases/download/v${CHISEL_VERSION}/chisel_v${CHISEL_VERSION}_linux_riscv64.tar.gz" chisel.tar.gz
RUN tar -xvf chisel.tar.gz -C /usr/bin/

# Extract crun dependencies into the chiselled filesystem
# FIXME: remove this when crun's dependecies slices are upstream
ADD https://github.com/endersonmaia/chisel-releases.git#14cd0571ac7646c0e2b70e3dc41855b70805d7eb /chisel-24.04
RUN chisel cut \
    --release /chisel-24.04 \
    --root /rootfs \
    --arch=riscv64 \
    # base rootfs dependencies
    base-files_base \
    base-files_release-info \
    base-passwd_data \
    # machine-emulator-tools dependencies
    busybox-static_bins \
    libgcc-s1_libs \
    # cruntime dependencies
    crun_bins \
    uidmap_bins

# Prepare the chiselled filesystem with the necessary configuration
# some directories, dapp user and root's shell
RUN <<EOF
set -e
ln -s /usr/bin/busybox bin/sh
mkdir -p proc sys dev run/cruntime mnt
echo "dapp:x:1000:1000::/home/dapp:/bin/sh" >> etc/passwd
echo "dapp:x:1000:" >> etc/group
mkdir home/dapp
chown 1000:1000 home/dapp
sed -i '/^root/s/bash/sh/g' etc/passwd
EOF

###############################################################################
# STAGE: final image
#
# This stage creates the final image with the crun binary and the chiselled filesystem.
#
FROM scratch
COPY --chown=root:root --chmod=644 skel/etc/subgid /etc/subgid
COPY --chown=root:root --chmod=644 skel/etc/subuid /etc/subuid
COPY --chown=root:root --chmod=755 skel/etc/cartesi-init.d/cruntime-init /etc/cartesi-init.d/cruntime-init
COPY --from=chisel /rootfs /
