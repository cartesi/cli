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

# alto
FROM node:18.19.0-bookworm AS alto
ARG ALTO_VERSION
RUN npm install -g @pimlico/alto@${ALTO_VERSION}

# devnet files
FROM node:slim as devnet
ARG DEVNET_VERSION
RUN npm install -g @cartesi/devnet@${DEVNET_VERSION}

# sdk image
FROM $SERVER_MANAGER_REGISTRY/$SERVER_MANAGER_ORG/server-manager:$SERVER_MANAGER_VERSION
ARG SERVER_MANAGER_REGISTRY
ARG SERVER_MANAGER_ORG
ARG SERVER_MANAGER_VERSION
ARG CARTESI_IMAGE_KERNEL_VERSION
ARG LINUX_KERNEL_VERSION
ARG XGENEXT2_VERSION
ARG PAYMASTER_VERSION

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
    nodejs \
    npm \
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

# Install mock-verifying-paymaster
RUN <<EOF
npm install -g @cartesi/mock-verifying-paymaster@${PAYMASTER_VERSION}
EOF

ENV LC_ALL en_US.UTF-8
ENV LANG en_US.UTF-8
ENV LANGUAGE en_US:en

# download anvil pre-compiled binaries
ARG ANVIL_VERSION=e90348416c3a831ab75bb43f6fa5f0a0be4106c4
RUN curl -sSL https://github.com/foundry-rs/foundry/releases/download/nightly-${ANVIL_VERSION}/foundry_nightly_linux_$(dpkg --print-architecture).tar.gz | \
    tar -zx -C /usr/local/bin

# healthcheck script using net_listening JSON-RPC method
COPY alto /usr/local/bin
COPY devnet /usr/local/bin
COPY eth_isready /usr/local/bin
COPY eth_dump /usr/local/bin
COPY eth_load /usr/local/bin
COPY create_machine_snapshot /usr/local/bin

COPY entrypoint.sh /usr/local/bin/
COPY --from=alto /usr/local/lib/node_modules/@pimlico/alto /usr/local/lib/node_modules/@pimlico/alto
COPY --from=su-exec /usr/local/src/su-exec /usr/local/bin/
COPY --from=crane /usr/local/bin/crane /usr/local/bin/
COPY --from=devnet /usr/local/lib/node_modules/@cartesi/devnet/export/abi/localhost.json /usr/share/cartesi/
COPY --from=devnet /usr/local/lib/node_modules/@cartesi/devnet/build/anvil_state.json /usr/share/cartesi/
RUN mkdir -p /tmp/.cartesi && chmod 1777 /tmp/.cartesi

ADD --chmod=644 \
    --checksum=sha256:1dc36e05bf04d3fff097e51408556cef4d5ac09792e245b37c470d9188a4c173 \
    https://github.com/cartesi/image-kernel/releases/download/v${CARTESI_IMAGE_KERNEL_VERSION}/linux-${LINUX_KERNEL_VERSION}.bin \
    /usr/share/cartesi-machine/images/linux.bin

ADD --chmod=644 \
    --checksum=sha256:58d1b232e6c2ed735f362ef0454802ae72a39798d472c0253cabec041703a16a \
    https://github.com/cartesi/image-kernel/releases/download/v$CARTESI_IMAGE_KERNEL_VERSION/linux-headers-$LINUX_KERNEL_VERSION.tar.xz \
    /usr/share/cartesi-machine/images/linux-headers.tar.xz
RUN tar -xJf /usr/share/cartesi-machine/images/linux-headers.tar.xz -C / && \
    rm /usr/share/cartesi-machine/images/linux-headers.tar.xz

WORKDIR /mnt
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
