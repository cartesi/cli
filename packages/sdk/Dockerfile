# syntax=docker.io/docker/dockerfile:1
ARG CARTESI_BASE_IMAGE
ARG ESPRESSO_DEV_NODE_BASE_IMAGE
ARG POSTGRES_BASE_IMAGE

################################################################################
# https://github.com/EspressoSystems/espresso-sequencer/pkgs/container/espresso-sequencer%2Fespresso-dev-node
FROM ${ESPRESSO_DEV_NODE_BASE_IMAGE} AS espresso-dev-node

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
FROM base AS crane
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
FROM base AS foundry
ARG FOUNDRY_VERSION
ARG TARGETARCH
ARG TARGETOS
RUN curl -fsSL https://github.com/foundry-rs/foundry/releases/download/v${FOUNDRY_VERSION}/foundry_v${FOUNDRY_VERSION}_${TARGETOS}_${TARGETARCH}.tar.gz \
    | tar -zx -C /usr/local/bin

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
# kubo installer
FROM base AS kubo
ARG KUBO_VERSION
ARG TARGETARCH
ARG TARGETOS
RUN <<EOF
curl -fssL "https://github.com/ipfs/kubo/releases/download/v${KUBO_VERSION}/kubo_v${KUBO_VERSION}_${TARGETOS}-${TARGETARCH}.tar.gz" \
    -o /tmp/kubo.tar.gz
case "${TARGETARCH}" in
    amd64) echo "4e4b13c600d5a9422f2d0a03e674b65e14defa65dfc6048facdea3a195f967ece0573b8a2292800d902d69fd6ef5aad825b95d8147cbf902f55b60ee0b4c419e /tmp/kubo.tar.gz" | sha512sum --check ;;
    arm64) echo "04dd6e9caaf6f287d19a0c11d90f907e578022b4369209830ec00ccb315d865469779013a856bcb72be54a83d2215100ae76dd9181a40cfa920233d1de93c94b /tmp/kubo.tar.gz" | sha512sum --check ;;
    *) echo "unsupported architecture: $ARCH"; exit 1 ;;
esac
tar -zxf /tmp/kubo.tar.gz -C /usr/local/bin --strip-components=1 kubo
ls -lha /usr/local/bin
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
    amd64) echo "0882a1c7a608ae6e1631ab9b3a04d531  /tmp/cartesi-rollups-graphql.tar.gz" | md5sum --check ;;
    arm64) echo "759e7edc97ad39908fef56c3bd971a9b  /tmp/cartesi-rollups-graphql.tar.gz" | md5sum --check ;;
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
# cartesi-rollups-espresso-reader installer
FROM base AS espresso-reader
ARG CARTESI_ESPRESSO_READER_VERSION
ARG TARGETOS
ARG TARGETARCH
RUN curl -fsSL https://github.com/cartesi/rollups-espresso-reader/releases/download/v${CARTESI_ESPRESSO_READER_VERSION}/cartesi-rollups-espresso-reader-v${CARTESI_ESPRESSO_READER_VERSION}-${TARGETOS}-${TARGETARCH}.tar.gz \
    | tar -xzf - -C /usr/local/bin

################################################################################
# rollups-espresso-reader migration code installer
FROM base AS espresso-reader-migration
ARG CARTESI_ESPRESSO_READER_VERSION
RUN <<EOF
ESPRESSO_DEST_FOLDER="/usr/share/cartesi/rollups-espresso-reader/migrations"

mkdir -p "$ESPRESSO_DEST_FOLDER"
curl -fsSL "https://github.com/cartesi/rollups-espresso-reader/archive/refs/tags/v${CARTESI_ESPRESSO_READER_VERSION}.tar.gz" \
    | tar --wildcards -xz -C ${ESPRESSO_DEST_FOLDER} --strip-components=6 '*/migrations/*.sql'
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

# Install cartesi-machine emulator
RUN <<EOF
curl -fsSL https://github.com/cartesi/machine-emulator/releases/download/v${CARTESI_MACHINE_EMULATOR_VERSION}/cartesi-machine-v${CARTESI_MACHINE_EMULATOR_VERSION%%-*}_${TARGETARCH}.deb \
    -o /tmp/cartesi-machine.deb
case "${TARGETARCH}" in
    amd64) echo "726c510632eedad51aec366634711f5062808c5aedf34b7fb7e6b2263de88e1f  /tmp/cartesi-machine.deb" | sha256sum --check ;;
    arm64) echo "45712294ddd9cef0130074066b800d3b090a5e576ec9215e1a16f3ddcb146d29  /tmp/cartesi-machine.deb" | sha256sum --check ;;
    *) echo "unsupported architecture: $ARCH"; exit 1 ;;
esac
apt-get install -y --no-install-recommends /tmp/cartesi-machine.deb
rm /tmp/cartesi-machine.deb
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
COPY --from=espresso-reader /usr/local/bin/cartesi-rollups-espresso-reader /usr/local/bin/
COPY --from=go-migrate /usr/local/bin/migrate /usr/local/bin/
COPY --from=graphql-migration /usr/share/cartesi/rollups-graphql/migrations /usr/share/cartesi/rollups-graphql/migrations
COPY --from=espresso-reader-migration /usr/share/cartesi/rollups-espresso-reader/migrations /usr/share/cartesi/rollups-espresso-reader/migrations

USER cartesi

################################################################################
# postgresql rollups initdb
FROM ${POSTGRES_BASE_IMAGE} AS postgresql-initdb

ARG DEBIAN_FRONTEND=noninteractive
RUN <<EOF
set -eo
apt-get update
apt-get install -y --no-install-recommends \
    libslirp0
EOF

COPY --from=rollups-runtime /usr/bin/cartesi-rollups-cli /usr/bin/
COPY --from=rollups-runtime /usr/lib/libcartesi* /usr/lib/
COPY --from=go-migrate /usr/local/bin/migrate /usr/local/bin/
COPY --from=graphql-migration /usr/share/cartesi/rollups-graphql/migrations /usr/share/cartesi/rollups-graphql/migrations
COPY --from=espresso-reader-migration /usr/share/cartesi/rollups-espresso-reader/migrations /usr/share/cartesi/rollups-espresso-reader/migrations

ARG POSTGRES_PASSWORD=password

# create rollupsdb, graphql and espresso databases
COPY <<EOF /docker-entrypoint-initdb.d/00-createdb.sql
CREATE DATABASE rollupsdb;
CREATE DATABASE graphql;
CREATE DATABASE espresso;
CREATE DATABASE explorer;
CREATE DATABASE coprocessor;
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

# espresso-reader migrations
COPY <<EOF /docker-entrypoint-initdb.d/03-espresso-reader-migrations.sh
#!/usr/bin/env bash
set -e
migrate -verbose -path /usr/share/cartesi/rollups-espresso-reader/migrations -database 'postgres://postgres@/rollupsdb?host=/var/run/postgresql&x-migrations-table=espresso_reader_schema_migrations' up
EOF

RUN /usr/local/bin/docker-ensure-initdb.sh postgres

################################################################################
# rollups-database image
FROM ${POSTGRES_BASE_IMAGE} AS rollups-database
COPY --from=postgresql-initdb /var/lib/postgresql/data /var/lib/postgresql/data

################################################################################
# coprocessor-database image
FROM ${POSTGRES_BASE_IMAGE} AS coprocessor-database
COPY <<EOF /docker-entrypoint-initdb.d/00-createdb.sql
CREATE DATABASE coprocessor;
EOF
RUN /usr/local/bin/docker-ensure-initdb.sh postgres

################################################################################
# sdk final image
FROM rollups-runtime
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
apt-get update
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

mkdir -p /usr/share/cartesi/rollups
cp -r /usr/local/lib/node_modules/@cartesi/devnet/deployments /usr/share/cartesi/rollups/
cp /usr/local/lib/node_modules/@cartesi/devnet/anvil_state.json /usr/share/cartesi/rollups/
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
COPY --from=kubo /usr/local/bin/ipfs /usr/local/bin/

WORKDIR /mnt
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
