# syntax=docker.io/docker/dockerfile:1
ARG CARTESI_ESPRESSO_READER_VERSION
ARG CARTESI_IMAGE_KERNEL_VERSION
ARG CARTESI_LINUX_KERNEL_VERSION
ARG CARTESI_MACHINE_EMULATOR_VERSION
ARG CARTESI_ROLLUPS_GRAPHQL_VERSION
ARG CARTESI_ROLLUPS_NODE_BASE_IMAGE
ARG CARTESI_SDK_BASE_IMAGE
ARG CRANE_VERSION
ARG ESPRESSO_DEV_NODE_TAG
ARG FOUNDRY_VERSION
ARG NODEJS_VERSION
ARG POSTGRES_VERSION
ARG SU_EXEC_VERSION
ARG XGENEXT2_VERSION

################################################################################
# https://github.com/EspressoSystems/espresso-sequencer/pkgs/container/espresso-sequencer%2Fespresso-dev-node
FROM ghcr.io/espressosystems/espresso-sequencer/espresso-dev-node:${ESPRESSO_DEV_NODE_TAG} AS espresso-dev-node

################################################################################
# sdk-base image
FROM ${CARTESI_SDK_BASE_IMAGE} AS sdk-base
SHELL ["/bin/bash", "-euo", "pipefail", "-c"]
ARG DEBIAN_FRONTEND=noninteractive
RUN <<EOF
apt-get update
apt-get install -y --no-install-recommends \
    ca-certificates \
    curl
EOF

################################################################################
# rollups-base image
FROM ${CARTESI_ROLLUPS_NODE_BASE_IMAGE} AS rollups-node-base
SHELL ["/bin/bash", "-euo", "pipefail", "-c"]
ARG DEBIAN_FRONTEND=noninteractive
RUN <<EOF
apt-get update
apt-get install -y --no-install-recommends \
    ca-certificates \
    curl
EOF

################################################################################
# builder image
FROM sdk-base AS builder
WORKDIR /usr/local/src
ARG DEBIAN_FRONTEND=noninteractive
RUN <<EOF
apt-get install -y --no-install-recommends \
    autoconf \
    automake \
    build-essential \
    libarchive-dev \
    libtool
rm -rf /var/lib/apt/lists/*
EOF

################################################################################
# su-exec builder
FROM builder AS su-exec
ARG SU_EXEC_VERSION
WORKDIR /usr/local/src
ADD https://github.com/ncopa/su-exec.git#v${SU_EXEC_VERSION} /usr/local/src
RUN make

################################################################################
# crane installer
FROM sdk-base AS crane
ARG CRANE_VERSION
RUN <<EOF
#FIXME: ugly hack to download the right go-containerregistry binary
case "$(arch)" in
aarch64) ARCH="arm64" ;;
*) ARCH=$(arch) ;;
esac

curl -fsSL https://github.com/google/go-containerregistry/releases/download/v${CRANE_VERSION}/go-containerregistry_Linux_${ARCH}.tar.gz \
    | tar -zx -C /usr/local/bin
EOF

################################################################################
# foundry installer
FROM sdk-base AS foundry
ARG FOUNDRY_VERSION
ARG TARGETARCH
ARG TARGETOS
RUN curl -fsSL https://github.com/foundry-rs/foundry/releases/download/v${FOUNDRY_VERSION}/foundry_v${FOUNDRY_VERSION}_${TARGETOS}_${TARGETARCH}.tar.gz \
    | tar -zx -C /usr/local/bin

################################################################################
# go migrate db cli installer
FROM sdk-base AS go-migrate
ARG GO_MIGRATE_VERSION
ARG TARGETARCH
ARG TARGETOS
RUN <<EOF
curl -fsSL https://github.com/golang-migrate/migrate/releases/download/v${GO_MIGRATE_VERSION}/migrate.${TARGETOS}-${TARGETARCH}.tar.gz \
    | tar -zx -C /usr/local/bin
migrate --version
EOF

################################################################################
# cartesi-rollups-graphql installer
FROM sdk-base AS graphql
ARG CARTESI_ROLLUPS_GRAPHQL_VERSION
ARG TARGETOS
ARG TARGETARCH
RUN curl -fsSL https://github.com/cartesi/rollups-graphql/releases/download/v${CARTESI_ROLLUPS_GRAPHQL_VERSION}/cartesi-rollups-graphql-v${CARTESI_ROLLUPS_GRAPHQL_VERSION}-${TARGETOS}-${TARGETARCH}.tar.gz \
    | tar -xzf - -C /usr/local/bin

################################################################################
# cartesi-rollups-graphql migration code installer
FROM sdk-base AS graphql-migration
ARG CARTESI_ROLLUPS_GRAPHQL_VERSION
RUN <<EOF
GRAPHQL_DEST_FOLDER="/usr/share/cartesi/rollups-graphql/migrations"

mkdir -p "$GRAPHQL_DEST_FOLDER"
curl -fsSL "https://github.com/cartesi/rollups-graphql/archive/refs/tags/v${CARTESI_ROLLUPS_GRAPHQL_VERSION}.tar.gz" \
    | tar --wildcards -xz -C ${GRAPHQL_DEST_FOLDER} --strip-components=3 '*/migrations/*.sql'
EOF

################################################################################
# cartesi-rollups-espresso-reader installer
FROM sdk-base AS espresso-reader
ARG CARTESI_ESPRESSO_READER_VERSION
ARG TARGETOS
ARG TARGETARCH
RUN curl -fsSL https://github.com/cartesi/rollups-espresso-reader/releases/download/v${CARTESI_ESPRESSO_READER_VERSION}/cartesi-rollups-espresso-reader-v${CARTESI_ESPRESSO_READER_VERSION}-${TARGETOS}-${TARGETARCH}.tar.gz \
    | tar -xzf - -C /usr/local/bin

################################################################################
# rollups-espresso-reader migration code installer
FROM sdk-base AS espresso-reader-migration
ARG CARTESI_ESPRESSO_READER_VERSION
RUN <<EOF
ESPRESSO_DEST_FOLDER="/usr/share/cartesi/rollups-espresso-reader/migrations"

mkdir -p "$ESPRESSO_DEST_FOLDER"
curl -fsSL "https://github.com/cartesi/rollups-espresso-reader/archive/refs/tags/v${CARTESI_ESPRESSO_READER_VERSION}.tar.gz" \
    | tar --wildcards -xz -C ${ESPRESSO_DEST_FOLDER} --strip-components=6 '*/migrations/*.sql'
EOF

################################################################################
# postgresql initdb
FROM postgres:${POSTGRES_VERSION} AS postgresql-initdb
ENV POSTGRES_PASSWORD=password
RUN /usr/local/bin/docker-ensure-initdb.sh postgres

################################################################################
# cartesi rollups-node target
FROM rollups-node-base AS rollups-node
ARG CARTESI_MACHINE_EMULATOR_VERSION
ARG CARTESI_ROLLUPS_NODE_VERSION
ARG TARGETARCH

USER root
ARG DEBIAN_FRONTEND=noninteractive
RUN <<EOF
apt-get install -y --no-install-recommends \
    libslirp0 \
    lua5.4 \
    xz-utils
rm -rf /var/lib/apt/lists/*
EOF

RUN <<EOF
set -e
addgroup --system --gid 102 cartesi
adduser --system --uid 102 \
    --disabled-login \
    --gecos "cartesi user" \
    --home /nonexistent \
    --ingroup cartesi \
    --no-create-home \
    --shell /bin/false \
    cartesi
EOF

RUN mkdir -p /tmp/.cartesi && chmod 1777 /tmp/.cartesi

# Install cartesi-machine emulator
RUN <<EOF
curl -fsSL https://github.com/cartesi/machine-emulator/releases/download/v${CARTESI_MACHINE_EMULATOR_VERSION}/cartesi-machine-v${CARTESI_MACHINE_EMULATOR_VERSION}_${TARGETARCH}.deb \
    -o /tmp/cartesi-machine.deb
dpkg -i /tmp/cartesi-machine.deb
rm /tmp/cartesi-machine.deb
cartesi-machine --version-json
EOF

# Install cartesi-rollups-node
RUN <<EOF
curl -fsSL https://github.com/cartesi/rollups-node/releases/download/v${CARTESI_ROLLUPS_NODE_VERSION}/cartesi-rollups-node-v${CARTESI_ROLLUPS_NODE_VERSION%%-*}_${TARGETARCH}.deb \
    -o /tmp/cartesi-rollups-node.deb
dpkg -i /tmp/cartesi-rollups-node.deb
rm /tmp/cartesi-rollups-node.deb
mkdir -p /var/lib/cartesi-rollups-node/snapshots
chmod 755 /var/lib/cartesi-rollups-node/snapshots
chown cartesi:cartesi /var/lib/cartesi-rollups-node/snapshots
cartesi-rollups-node --version
EOF

COPY --from=go-migrate /usr/local/bin/migrate /usr/local/bin/
COPY --from=graphql /usr/local/bin/cartesi-rollups-graphql /usr/local/bin/
COPY --from=graphql-migration /usr/share/cartesi/rollups-graphql/migrations /usr/share/cartesi/rollups-graphql/migrations
COPY --from=espresso-reader /usr/local/bin/cartesi-rollups-espresso-reader /usr/local/bin/
COPY --from=espresso-reader-migration /usr/share/cartesi/rollups-espresso-reader/migrations /usr/share/cartesi/rollups-espresso-reader/migrations

USER cartesi

################################################################################
# sdk final image
FROM sdk-base
ARG ALTO_VERSION
ARG CARTESI_DEVNET_VERSION
ARG CARTESI_IMAGE_KERNEL_VERSION
ARG CARTESI_LINUX_KERNEL_VERSION
ARG CARTESI_MACHINE_EMULATOR_VERSION
ARG CARTESI_PAYMASTER_VERSION
ARG CARTESI_ROLLUPS_NODE_VERSION
ARG TARGETARCH
ARG TARGETARCH
ARG XGENEXT2_VERSION

USER root
ARG DEBIAN_FRONTEND=noninteractive
RUN <<EOF
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
rm -rf /var/lib/apt/lists/*
EOF

# Install e2fsprogs from backports
RUN <<EOF
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
curl -fsSL https://github.com/cartesi/genext2fs/releases/download/v${XGENEXT2_VERSION}/xgenext2fs_${TARGETARCH}.deb \
    -o /tmp/xgenext2fs.deb
dpkg -i /tmp/xgenext2fs.deb
rm /tmp/xgenext2fs.deb
xgenext2fs --version
EOF

# Install nodejs packages
RUN <<EOF
npm install -g \
    @cartesi/devnet@${CARTESI_DEVNET_VERSION} \
    @cartesi/mock-verifying-paymaster@${CARTESI_PAYMASTER_VERSION} \
    @pimlico/alto@${ALTO_VERSION}

mkdir -p /usr/share/cartesi
cp /usr/local/lib/node_modules/@cartesi/devnet/export/abi/localhost.json /usr/share/cartesi/
cp /usr/local/lib/node_modules/@cartesi/devnet/build/anvil_state.json /usr/share/cartesi/
EOF

# Install cartesi-machine emulator
RUN <<EOF
curl -fsSL https://github.com/cartesi/machine-emulator/releases/download/v${CARTESI_MACHINE_EMULATOR_VERSION}/cartesi-machine-v${CARTESI_MACHINE_EMULATOR_VERSION}_${TARGETARCH}.deb \
    -o /tmp/cartesi-machine.deb
dpkg -i /tmp/cartesi-machine.deb
rm /tmp/cartesi-machine.deb
cartesi-machine --version-json
EOF

# Install cartesi-rollups-node
RUN <<EOF
curl -fsSL https://github.com/cartesi/rollups-node/releases/download/v${CARTESI_ROLLUPS_NODE_VERSION}/cartesi-rollups-node-v${CARTESI_ROLLUPS_NODE_VERSION%%-*}_${TARGETARCH}.deb \
    -o /tmp/cartesi-rollups-node.deb
dpkg -i /tmp/cartesi-rollups-node.deb
rm /tmp/cartesi-rollups-node.deb
mkdir -p /var/lib/cartesi-rollups-node/snapshots
cartesi-rollups-node --version
EOF

# Install linux kernel image
RUN <<EOF
curl -fsSL "https://github.com/cartesi/image-kernel/releases/download/v${CARTESI_IMAGE_KERNEL_VERSION}/linux-${CARTESI_LINUX_KERNEL_VERSION}.bin" \
    -o /usr/share/cartesi-machine/images/linux.bin
echo "e4663365ea565792110129a6b479eca896cb31c23f561cb42214609588689f9d3d173a82b4ea27ff74ae05334747cc76ed6bc4c200a7499ac5134abfd2b3045e /usr/share/cartesi-machine/images/linux.bin" \
    | sha512sum -c
EOF

# Install linux headers
RUN <<EOF
curl -fsSL "https://github.com/cartesi/image-kernel/releases/download/v${CARTESI_IMAGE_KERNEL_VERSION}/linux-headers-${CARTESI_LINUX_KERNEL_VERSION}.tar.xz" \
    -o "/tmp/linux-headers-${CARTESI_LINUX_KERNEL_VERSION}.tar.xz"
echo "2ecdb9c9f02a96faed2605ec811ef7188f963feb21b32d057b1ab3278f27ac42887f235a3f52eadd5f5caa56a61e141ad2bb666793d5bdd755c273adba167d45 /tmp/linux-headers-${CARTESI_LINUX_KERNEL_VERSION}.tar.xz" \
    | sha512sum -c
tar -xJf "/tmp/linux-headers-${CARTESI_LINUX_KERNEL_VERSION}.tar.xz" -C /
rm "/tmp/linux-headers-${CARTESI_LINUX_KERNEL_VERSION}.tar.xz"
EOF

ENV LC_ALL=en_US.UTF-8
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en

# healthcheck script using net_listening JSON-RPC method
COPY alto /usr/local/bin
COPY devnet /usr/local/bin
COPY eth_isready /usr/local/bin
COPY eth_dump /usr/local/bin
COPY eth_load /usr/local/bin
COPY create_machine_snapshot /usr/local/bin

COPY entrypoint.sh /usr/local/bin/
COPY --from=su-exec /usr/local/src/su-exec /usr/local/bin/
COPY --from=crane /usr/local/bin/crane /usr/local/bin/
COPY --from=foundry /usr/local/bin/anvil /usr/local/bin/
COPY --from=foundry /usr/local/bin/cast /usr/local/bin/
COPY --from=espresso-dev-node /usr/bin/espresso-dev-node /usr/local/bin/
COPY --from=postgresql-initdb /var/lib/postgresql/data /var/lib/postgresql/data

WORKDIR /mnt
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
