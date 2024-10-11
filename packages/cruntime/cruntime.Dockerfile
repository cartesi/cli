# (c) Cartesi and individual authors (see AUTHORS)
# SPDX-License-Identifier: Apache-2.0 (see LICENSE)

# syntax=docker.io/docker/dockerfile:1

###############################################################################
# STAGE: base-image
#
# This stage creates a base-image with apt repository cache and ca-certificates
# to be used by later stages.
FROM --platform=linux/riscv64 ubuntu:24.04 AS base-image
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
ARG TARGETARCH

WORKDIR /rootfs

# Extract machine-emulator-tools into the chiselled filesystem
ARG MACHINE_EMULATOR_TOOLS_VERSION=0.16.1
ADD https://github.com/cartesi/machine-emulator-tools/releases/download/v${MACHINE_EMULATOR_TOOLS_VERSION}/machine-emulator-tools-v${MACHINE_EMULATOR_TOOLS_VERSION}.deb /tmp/
RUN dpkg -x /tmp/machine-emulator-tools-v${MACHINE_EMULATOR_TOOLS_VERSION}.deb /rootfs

# Get chisel binary
ARG CHISEL_VERSION=1.0.0
ADD "https://github.com/canonical/chisel/releases/download/v${CHISEL_VERSION}/chisel_v${CHISEL_VERSION}_linux_${TARGETARCH}.tar.gz" chisel.tar.gz
RUN tar -xvf chisel.tar.gz -C /usr/bin/

# Extract crun dependencies into the chiselled filesystem
ADD https://github.com/cartesi/chisel-releases.git#ubuntu-24.04-busybox-static /ubuntu-22.04
RUN chisel cut \
    --release /ubuntu-22.04 \
    --root /rootfs \
    --arch=${TARGETARCH} \
    base-files_base \
    base-files_release-info \
    base-passwd_data \
    busybox-static_bins \
    libc6_libs \
    libcap2_libs \
    libgcc-s1_libs \
    libseccomp2_libs \
    libstdc++6_libs \
    libyajl2_libs \
    uidmap_bins

# Prepare the chiselled filesystem with the necessary configuration
# some directories, dapp user and root's shell
RUN <<EOF
set -e
ln -s /bin/busybox bin/sh
ln -s /bin/sh bin/bash
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

ARG CRUN_VERSION=1.17
COPY --chown=root:root --chmod=644 skel/etc/subgid /etc/subgid
COPY --chown=root:root --chmod=644 skel/etc/subuid /etc/subuid
COPY --chown=root:root --chmod=755 skel/etc/cartesi-init.d/cruntime-init /etc/cartesi-init.d/cruntime-init
COPY --from=chisel /rootfs /
ADD --chown=root:root --chmod=0755 https://github.com/containers/crun/releases/download/${CRUN_VERSION}/crun-${CRUN_VERSION}-linux-riscv64-disable-systemd /usr/bin/crun

#ENTRYPOINT [ "rollup-init", "crun", "run", "--config", "/run/cruntime/config/config.json", "--bundle", "/run/cruntime", "app" ]
ENTRYPOINT [ "rollup-init", "echo-dapp" ]
