# syntax=docker.io/docker/dockerfile:1
ARG BASE_IMAGE
ARG SERVER_MANAGER_REGISTRY
ARG SERVER_MANAGER_ORG
ARG SERVER_MANAGER_VERSION
ARG CARTESI_IMAGE_KERNEL_VERSION
ARG LINUX_KERNEL_VERSION
ARG XGENEXT2_VERSION

FROM ${BASE_IMAGE} as builder

WORKDIR /usr/local/src
ARG DEBIAN_FRONTEND=noninteractive
RUN <<EOF
set -e
apt-get update
apt-get install -y --no-install-recommends \
    autoconf \
    automake \
    build-essential \
    ca-certificates \
    curl \
    libarchive-dev \
    libtool
rm -rf /var/lib/apt/lists/*
EOF

FROM builder as su-exec

# v0.2 -> f85e5bde1afef399021fbc2a99c837cf851ceafa
WORKDIR /usr/local/src
ADD https://github.com/ncopa/su-exec.git#f85e5bde1afef399021fbc2a99c837cf851ceafa /usr/local/src
RUN make

FROM builder as crane
ARG CRANE_VERSION=0.19.1
RUN <<EOF
set -e

#FIXME: ugly hack to download the right go-containerregistry binary
case "$(arch)" in
aarch64) ARCH="arm64" ;;
*) ARCH=$(arch) ;;
esac

curl -sSL https://github.com/google/go-containerregistry/releases/download/v${CRANE_VERSION}/go-containerregistry_Linux_${ARCH}.tar.gz | \
    tar -zx -C /usr/local/bin
EOF

# devnet files
FROM node:slim as devnet
ARG DEVNET_VERSION
RUN npm install -g @cartesi/devnet@${DEVNET_VERSION}

# sdk image
FROM ghcr.io/zippiehq/cartesi-lambada:latest
ARG CARTESI_IMAGE_KERNEL_VERSION
ARG LINUX_KERNEL_VERSION
ARG XGENEXT2_VERSION

USER root
ARG DEBIAN_FRONTEND=noninteractive
RUN <<EOF
set -e
apt-get update
apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    jq \
    libarchive-tools \
    locales \
    squashfs-tools \
    xxd \
    xz-utils
rm -rf /var/lib/apt/lists/*

sed -i -e 's/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen
locale-gen
update-locale LANG=en_US.UTF-8
EOF

# Install dpkg release of xgenext2fs
RUN <<EOF
ARCH=$(dpkg --print-architecture)
curl -sSL https://github.com/cartesi/genext2fs/releases/download/v${XGENEXT2_VERSION}/xgenext2fs_${ARCH}.deb \
    -o ./xgenext2fs.deb
dpkg -i ./xgenext2fs.deb
rm ./xgenext2fs.deb
xgenext2fs --version
EOF

ENV LC_ALL en_US.UTF-8
ENV LANG en_US.UTF-8
ENV LANGUAGE en_US:en

# download anvil pre-compiled binaries
ARG ANVIL_VERSION=8b694bbcabaedffc0337bf8dea9a135da5694ef9
RUN curl -sSL https://github.com/foundry-rs/foundry/releases/download/nightly-${ANVIL_VERSION}/foundry_nightly_linux_$(dpkg --print-architecture).tar.gz | \
    tar -zx -C /usr/local/bin

# healthcheck script using net_listening JSON-RPC method
COPY devnet /usr/local/bin
COPY eth_isready /usr/local/bin
COPY eth_dump /usr/local/bin
COPY eth_load /usr/local/bin
COPY create_machine_snapshot /usr/local/bin

COPY entrypoint.sh /usr/local/bin/
COPY run /run-node
COPY make_avail_chain /make_avail_chain
COPY make_avail_chain_ext /make_avail_chain_ext
COPY node /node
COPY --from=su-exec /usr/local/src/su-exec /usr/local/bin/
COPY --from=crane /usr/local/bin/crane /usr/local/bin/
COPY --from=devnet /usr/local/lib/node_modules/@cartesi/devnet/export/abi/localhost.json /usr/share/cartesi/
COPY --from=devnet /usr/local/lib/node_modules/@cartesi/devnet/build/anvil_state.json /usr/share/cartesi/
RUN mkdir -p /tmp/.cartesi && chmod 1777 /tmp/.cartesi

ADD --chmod=644 \
    --checksum=sha256:65dd100ff6204346ac2f50f772721358b5c1451450ceb39a154542ee27b4c947 \
    https://github.com/cartesi/image-kernel/releases/download/v${CARTESI_IMAGE_KERNEL_VERSION}/linux-${LINUX_KERNEL_VERSION}.bin \
    /usr/share/cartesi-machine/images/linux.bin

ADD --chmod=644 \
    --checksum=sha256:4a4714bfa8c0028cb443db2036fad4f8da07065c1cb4ac8e0921a259fddd731b \
    https://github.com/cartesi/image-kernel/releases/download/v$CARTESI_IMAGE_KERNEL_VERSION/linux-headers-$LINUX_KERNEL_VERSION.tar.xz \
    /usr/share/cartesi-machine/images/linux-headers.tar.xz
RUN tar -xJf /usr/share/cartesi-machine/images/linux-headers.tar.xz -C / && \
    rm /usr/share/cartesi-machine/images/linux-headers.tar.xz
RUN <<EOF
set -e

case "$(arch)" in
aarch64) ARCH="arm64" ;;
x86_64) ARCH="amd64" ;;
*) ARCH="$(arch)" ;;
esac
curl -LO https://github.com/ipfs/kubo/releases/download/v0.24.0/kubo_v0.24.0_linux-${ARCH}.tar.gz && tar -xvzf kubo_v0.24.0_linux-${ARCH}.tar.gz && bash kubo/install.sh && rm -rf kubo kubo_v0.24.0_linux-${ARCH}.tar.gz

EOF

WORKDIR /mnt
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
