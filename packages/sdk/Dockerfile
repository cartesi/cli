# syntax=docker.io/docker/dockerfile:1
ARG BASE_IMAGE
ARG CARTESI_MACHINE_EMULATOR_VERSION
ARG CARTESI_IMAGE_KERNEL_VERSION
ARG LINUX_KERNEL_VERSION
ARG XGENEXT2_VERSION
ARG CRANE_VERSION
ARG NODEJS_VERSION
ARG SU_EXEC_VERSION
ARG ANVIL_VERSION

FROM ${BASE_IMAGE} AS base
ARG DEBIAN_FRONTEND=noninteractive
RUN <<EOF
set -e
apt-get update
apt-get install -y --no-install-recommends \
    ca-certificates \
    curl
EOF

FROM base AS builder
WORKDIR /usr/local/src
ARG DEBIAN_FRONTEND=noninteractive
RUN <<EOF
set -e
apt-get install -y --no-install-recommends \
    autoconf \
    automake \
    build-essential \
    libarchive-dev \
    libtool
rm -rf /var/lib/apt/lists/*
EOF

FROM builder AS su-exec
ARG SU_EXEC_VERSION
WORKDIR /usr/local/src
ADD https://github.com/ncopa/su-exec.git#v${SU_EXEC_VERSION} /usr/local/src
RUN make

FROM builder AS crane
ARG CRANE_VERSION
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
FROM node:${NODEJS_VERSION}-bookworm AS alto
ARG ALTO_VERSION
RUN npm install -g @pimlico/alto@${ALTO_VERSION}

# devnet files
FROM node:${NODEJS_VERSION}-bookworm AS devnet
ARG DEVNET_VERSION
RUN npm install -g @cartesi/devnet@${DEVNET_VERSION}

# sdk image
FROM base
ARG CARTESI_MACHINE_EMULATOR_VERSION
ARG CARTESI_IMAGE_KERNEL_VERSION
ARG LINUX_KERNEL_VERSION
ARG XGENEXT2_VERSION
ARG PAYMASTER_VERSION

USER root
ARG DEBIAN_FRONTEND=noninteractive
RUN <<EOF
set -e
apt-get install -y --no-install-recommends \
    jq \
    libarchive-tools \
    libslirp0 \
    locales \
    lua5.4 \
    nodejs \
    npm \
    squashfs-tools \
    xxd \
    xz-utils

# Install e2fsprogs from backports
echo 'deb http://deb.debian.org/debian bookworm-backports main' > /etc/apt/sources.list.d/backports.list
apt-get update
apt-get install -y --no-install-recommends -t bookworm-backports \
    e2fsprogs
rm -rf /var/lib/apt/lists/*

sed -i -e 's/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen
locale-gen
update-locale LANG=en_US.UTF-8
EOF

# Install dpkg release of xgenext2fs
RUN <<EOF
set -eu
ARCH=$(dpkg --print-architecture)
curl -fsSL https://github.com/cartesi/genext2fs/releases/download/v${XGENEXT2_VERSION}/xgenext2fs_${ARCH}.deb \
    -o ./xgenext2fs.deb
dpkg -i ./xgenext2fs.deb
rm ./xgenext2fs.deb
xgenext2fs --version
EOF

# Install mock-verifying-paymaster
RUN <<EOF
npm install -g @cartesi/mock-verifying-paymaster@${PAYMASTER_VERSION}
EOF

ENV LC_ALL=en_US.UTF-8
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en

# download anvil pre-compiled binaries
ARG ANVIL_VERSION
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

RUN <<EOF
set -eu
ARCH=$(dpkg --print-architecture)
curl -fsSL https://github.com/cartesi/machine-emulator/releases/download/v${CARTESI_MACHINE_EMULATOR_VERSION}/cartesi-machine-v${CARTESI_MACHINE_EMULATOR_VERSION}_${ARCH}.deb \
    -o /tmp/cartesi-machine.deb
dpkg -i /tmp/cartesi-machine.deb
rm /tmp/cartesi-machine.deb
cartesi-machine --version-json
EOF

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

WORKDIR /mnt
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
