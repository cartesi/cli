# syntax=docker.io/docker/dockerfile:1
ARG CARTESI_BASE_IMAGE
ARG POSTGRES_BASE_IMAGE
ARG NODE_VERSION

################################################################################
# base image
FROM ${CARTESI_BASE_IMAGE} AS base
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
FROM base AS builder
WORKDIR /usr/local/src
ARG DEBIAN_FRONTEND=noninteractive
RUN <<EOF
apt-get install -y --no-install-recommends \
    autoconf \
    automake \
    build-essential \
    libarchive-dev \
    libtool \
    liblz4-dev \
    liblzma-dev \
    liblzo2-dev \
    libzstd-dev \
    zlib1g-dev
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
# foundry installer
FROM base AS foundry
ARG FOUNDRY_VERSION
ARG TARGETARCH
ARG TARGETOS
RUN curl -fsSL https://github.com/foundry-rs/foundry/releases/download/v${FOUNDRY_VERSION}/foundry_v${FOUNDRY_VERSION}_${TARGETOS}_${TARGETARCH}.tar.gz \
    | tar -zx -C /usr/local/bin

################################################################################
# nitro installer
FROM builder AS nitro
ARG NITRO_VERSION
WORKDIR /usr/local/src
ADD https://github.com/leahneukirchen/nitro.git#v${NITRO_VERSION} /usr/local/src
RUN <<EOF
make
EOF

################################################################################
# build msquashfs-tools
FROM builder AS squashfs-tools
ARG SQUASHFS_TOOLS_VERSION
WORKDIR /usr/local/src/squashfs-tools
ADD https://github.com/plougher/squashfs-tools.git#${SQUASHFS_TOOLS_VERSION}:squashfs-tools .
RUN <<EOF
make
./mksquashfs -version
EOF

################################################################################
# go migrate db cli installer
FROM base AS go-migrate
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
FROM base AS graphql
ARG CARTESI_ROLLUPS_GRAPHQL_VERSION
ARG TARGETOS
ARG TARGETARCH
RUN <<EOF
curl -fsSL https://github.com/cartesi/rollups-graphql/releases/download/v${CARTESI_ROLLUPS_GRAPHQL_VERSION}/cartesi-rollups-graphql-v${CARTESI_ROLLUPS_GRAPHQL_VERSION}-${TARGETOS}-${TARGETARCH}.tar.gz \
    -o /tmp/cartesi-rollups-graphql.tar.gz

case "${TARGETARCH}" in
    amd64) echo "b1b27069956c379e29d5668504bb02db  /tmp/cartesi-rollups-graphql.tar.gz" | md5sum --check ;;
    arm64) echo "ca41f76ab2e6c1a8b15ac0c1ab96e951  /tmp/cartesi-rollups-graphql.tar.gz" | md5sum --check ;;
    *) echo "unsupported architecture: ${TARGEARCH}"; exit 1 ;;
esac

tar -xzf /tmp/cartesi-rollups-graphql.tar.gz -C /usr/local/bin
EOF

################################################################################
# cartesi-rollups-graphql migration code installer
FROM base AS graphql-migration
ARG CARTESI_ROLLUPS_GRAPHQL_VERSION
RUN <<EOF
GRAPHQL_DEST_FOLDER="/usr/share/cartesi/rollups-graphql/migrations"

mkdir -p "$GRAPHQL_DEST_FOLDER"
curl -fsSL "https://github.com/cartesi/rollups-graphql/archive/refs/tags/v${CARTESI_ROLLUPS_GRAPHQL_VERSION}.tar.gz" \
    | tar --wildcards -xz -C ${GRAPHQL_DEST_FOLDER} --strip-components=3 '*/migrations/*.sql'
EOF

################################################################################
# cartesi rollups-runtime target
FROM base AS rollups-runtime
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
useradd \
    --comment "cartesi user" \
    --no-create-home \
    --home-dir /nonexistent \
    --shell /usr/sbin/nologin \
    --system \
    --uid 102 \
    --user-group \
    cartesi
EOF

# Install cartesi-machine emulator
RUN <<EOF
curl -fsSL https://github.com/cartesi/machine-emulator/releases/download/v${CARTESI_MACHINE_EMULATOR_VERSION}/machine-emulator_${TARGETARCH}.deb \
    -o /tmp/machine-emulator.deb
case "${TARGETARCH}" in
    amd64) echo "adae6b030a8990e316997aad53d175192bfeaa84ad12ee19491366377073572b  /tmp/machine-emulator.deb" | sha256sum --check ;;
    arm64) echo "15ebb64d8cd3296564d2297dd809d1d72c13a938976bb4ecc5e5c82e71bb8069  /tmp/machine-emulator.deb" | sha256sum --check ;;
    *) echo "unsupported architecture: $ARCH"; exit 1 ;;
esac
apt-get install -y --no-install-recommends /tmp/machine-emulator.deb
rm /tmp/machine-emulator.deb
cartesi-machine --version-json
EOF

# Install cartesi-rollups-node
RUN <<EOF
curl -fsSL https://github.com/cartesi/rollups-node/releases/download/v${CARTESI_ROLLUPS_NODE_VERSION}/cartesi-rollups-node-v${CARTESI_ROLLUPS_NODE_VERSION}_${TARGETARCH}.deb \
    -o /tmp/cartesi-rollups-node.deb
dpkg -i /tmp/cartesi-rollups-node.deb
rm /tmp/cartesi-rollups-node.deb
mkdir -p /var/lib/cartesi-rollups-node/snapshots
chmod 755 /var/lib/cartesi-rollups-node/snapshots
chown cartesi:cartesi /var/lib/cartesi-rollups-node/snapshots
cartesi-rollups-node --version
EOF

COPY --from=graphql /usr/local/bin/cartesi-rollups-graphql /usr/local/bin/
COPY --from=go-migrate /usr/local/bin/migrate /usr/local/bin/
COPY --from=graphql-migration /usr/share/cartesi/rollups-graphql/migrations /usr/share/cartesi/rollups-graphql/migrations
COPY --from=su-exec /usr/local/src/su-exec /usr/local/bin/
COPY --from=nitro /usr/local/src/nitro /usr/local/bin/
COPY --from=nitro /usr/local/src/nitroctl /usr/local/bin/
COPY skel/ /
RUN mkdir -p /run/nitro && chown -R cartesi:cartesi /run/nitro

USER cartesi

################################################################################
# postgresql initdb
FROM ${POSTGRES_BASE_IMAGE} AS postgresql-initdb

ARG DEBIAN_FRONTEND=noninteractive
RUN <<EOF
set -e
apt-get update
apt-get install -y --no-install-recommends \
    libslirp0
EOF

COPY --from=rollups-runtime /usr/bin/cartesi-rollups-cli /usr/bin/
COPY --from=rollups-runtime /usr/lib/libcartesi* /usr/lib/
COPY --from=go-migrate /usr/local/bin/migrate /usr/local/bin/
COPY --from=graphql-migration /usr/share/cartesi/rollups-graphql/migrations /usr/share/cartesi/rollups-graphql/migrations

ARG POSTGRES_PASSWORD=password

# create rollupsdb and graphql databases
COPY <<EOF /docker-entrypoint-initdb.d/00-createdb.sql
CREATE DATABASE rollupsdb;
CREATE DATABASE graphql;
CREATE DATABASE explorer;
EOF

# rollups-node migrations
COPY <<EOF /docker-entrypoint-initdb.d/01-rollups-node-migrations.sh
#!/usr/bin/env bash
set -e
export CARTESI_DATABASE_CONNECTION="postgres://postgres@/rollupsdb?host=/var/run/postgresql"
cartesi-rollups-cli db init --upgrade --verbose
EOF

# rollups-graphql migrations
COPY <<EOF /docker-entrypoint-initdb.d/02-graphql-migrations.sh
#!/usr/bin/env bash
set -e
migrate -verbose -path /usr/share/cartesi/rollups-graphql/migrations -database 'postgres://postgres@/graphql?host=/var/run/postgresql' up
EOF

RUN /usr/local/bin/docker-ensure-initdb.sh postgres

################################################################################
# rollups-database image
FROM ${POSTGRES_BASE_IMAGE} AS rollups-database
COPY --from=postgresql-initdb /var/lib/postgresql/data /var/lib/postgresql/data

################################################################################
# alto build
FROM node:${NODE_VERSION} AS alto
ARG ALTO_VERSION
ARG NODE_VERSION
ARG FOUNDRY_VERSION
ARG TARGETARCH
ARG TARGETOS

# install foundry, necessary for building alto
RUN curl -fsSL https://github.com/foundry-rs/foundry/releases/download/v${FOUNDRY_VERSION}/foundry_v${FOUNDRY_VERSION}_${TARGETOS}_${TARGETARCH}.tar.gz \
    | tar -zx -C /usr/local/bin

WORKDIR /app
COPY alto.patch /app/alto.patch

RUN <<EOF
set -eu
npm install -g pnpm
git clone --branch v${ALTO_VERSION} --depth 1 --recurse-submodules https://github.com/pimlicolabs/alto.git
cd alto
patch -p1 < /app/alto.patch
pnpm install
pnpm run build:contracts
pnpm run build
cd src && pnpm pack # produces pimlico-alto-${ALTO_PACKAGE_VERSION}.tgz
EOF

################################################################################
# sdk final image
FROM rollups-runtime
ARG ALTO_VERSION
ARG ALTO_PACKAGE_VERSION
ARG CARTESI_DEVNET_VERSION
ARG CARTESI_IMAGE_KERNEL_VERSION
ARG CARTESI_LINUX_KERNEL_VERSION
ARG CARTESI_MACHINE_EMULATOR_VERSION
ARG CARTESI_PAYMASTER_VERSION
ARG CARTESI_PASSKEY_SERVER_VERSION
ARG CARTESI_ROLLUPS_NODE_VERSION
ARG NODE_VERSION
ARG NVM_VERSION
ARG TARGETARCH
ARG XGENEXT2_VERSION

USER root
ARG DEBIAN_FRONTEND=noninteractive
RUN <<EOF
apt-get update
apt-get install -y --no-install-recommends \
    jq \
    libarchive-tools \
    liblzo2-2 \
    libslirp0 \
    locales \
    lua5.4 \
    xxd \
    xz-utils
rm -rf /var/lib/apt/lists/*
EOF

# Install nvm and node
ENV NVM_DIR=/root/.nvm
RUN <<EOF
curl -o- --fail --proto '=https' --tlsv1.2 https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh | bash
. "$NVM_DIR/nvm.sh"
nvm install $NODE_VERSION
nvm use $NODE_VERSION
nvm alias default $NODE_VERSION
EOF
ENV PATH="${NVM_DIR}/versions/node/v${NODE_VERSION}/bin:$PATH"

# Install dpkg release of xgenext2fs
RUN <<EOF
curl -fsSL https://github.com/cartesi/genext2fs/releases/download/v${XGENEXT2_VERSION}/xgenext2fs_${TARGETARCH}.deb \
    -o /tmp/xgenext2fs.deb
dpkg -i /tmp/xgenext2fs.deb
rm /tmp/xgenext2fs.deb
xgenext2fs --version
sed -i -e 's/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen
locale-gen
update-locale LANG=en_US.UTF-8
EOF

# Install nodejs packages
COPY --from=alto /app/alto/src/pimlico-alto-${ALTO_PACKAGE_VERSION}.tgz /tmp/pimlico-alto.tgz
RUN <<EOF
npm install -g \
    @cartesi/devnet@${CARTESI_DEVNET_VERSION} \
    @cartesi/mock-verifying-paymaster@${CARTESI_PAYMASTER_VERSION} \
    @cartesi/passkey-server@${CARTESI_PASSKEY_SERVER_VERSION} \
    /tmp/pimlico-alto.tgz

rm /tmp/pimlico-alto.tgz
mkdir -p /usr/share/cartesi
cp -r "$(npm root -g)/@cartesi/devnet/deployments" /usr/share/cartesi/
cp "$(npm root -g)/@cartesi/devnet/anvil_state.json" /usr/share/cartesi/
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

COPY entrypoint.sh /usr/local/bin/
COPY --from=foundry /usr/local/bin/anvil /usr/local/bin/
COPY --from=foundry /usr/local/bin/cast /usr/local/bin/
COPY --from=squashfs-tools /usr/local/src/squashfs-tools/mksquashfs /usr/local/bin/

WORKDIR /mnt
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
