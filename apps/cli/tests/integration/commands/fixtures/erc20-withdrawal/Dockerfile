# syntax=docker.io/docker/dockerfile:1

ARG UBUNTU_TAG=noble-20260610
ARG APT_UPDATE_SNAPSHOT=20260701T030400Z
ARG MACHINE_GUEST_TOOLS_VERSION=0.18.0-test7
ARG MACHINE_GUEST_TOOLS_SHA256SUM=e21bf93d4858e95fe9078ef436e9c13a6616125a7f65629c2fd571d72307f59a

FROM --platform=linux/riscv64 ubuntu:${UBUNTU_TAG}

ARG MACHINE_GUEST_TOOLS_VERSION
ARG MACHINE_GUEST_TOOLS_SHA256SUM
ADD --checksum=sha256:${MACHINE_GUEST_TOOLS_SHA256SUM} \
  https://github.com/cartesi/machine-guest-tools/releases/download/v${MACHINE_GUEST_TOOLS_VERSION}/machine-guest-tools_riscv64.deb \
  /tmp/machine-guest-tools_riscv64.deb

ARG APT_UPDATE_SNAPSHOT
ARG DEBIAN_FRONTEND=noninteractive
RUN <<EOF
set -eu
apt-get update
apt-get install -y --no-install-recommends ca-certificates
apt-get update --snapshot=${APT_UPDATE_SNAPSHOT}
apt-get install -y --no-install-recommends --snapshot=${APT_UPDATE_SNAPSHOT} \
  busybox-static \
  jq \
  xxd \
  /tmp/machine-guest-tools_riscv64.deb
apt-get remove -y --purge ca-certificates
apt-get autoremove -y --purge
rm /tmp/machine-guest-tools_riscv64.deb
rm -rf /var/lib/apt/lists/* /var/log/* /var/cache/*
EOF

COPY --chmod=755 dapp.sh /usr/local/bin/erc20-withdrawal-dapp

ENTRYPOINT ["/usr/local/bin/erc20-withdrawal-dapp"]
