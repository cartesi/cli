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
    curl \
    xz-utils
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
FROM base AS su-exec
ARG SU_EXEC_VERSION
ARG TARGETARCH
WORKDIR /usr/local/bin
RUN <<EOF
ARCH=${TARGETARCH}

if [ "$ARCH" = "amd64" ]; then
    ARCH="x86_64"
fi

curl -fsSL https://github.com/ncopa/su-exec/releases/download/v${SU_EXEC_VERSION}/su-exec-static-v${SU_EXEC_VERSION}-${ARCH} \
  -o su-exec
case "${TARGETARCH}" in
    amd64) echo "675e7b454ad96e7631029f0b71c9ad5a6c23b553a8952ed528de1e591ca7cef0 su-exec" | sha256sum --check ;;
    arm64) echo "a08773d4af76a30371f8d1c93e86e8ac2b0379c9e75dce9d694c5059b0544909 su-exec" | sha256sum --check ;;
    *) echo "unsupported architecture: ${TARGETARCH}"; exit 1 ;;
esac
chmod +x su-exec
EOF

################################################################################
# foundry installer
FROM base AS foundry
ARG FOUNDRY_VERSION
ARG TARGETARCH
ARG TARGETOS
RUN <<EOF
mkdir -p /usr/local/bin
curl -fsSL https://github.com/foundry-rs/foundry/releases/download/v${FOUNDRY_VERSION}/foundry_v${FOUNDRY_VERSION}_${TARGETOS}_${TARGETARCH}.tar.gz \
  -o /tmp/foundry.tar.gz
case "${TARGETARCH}" in
    amd64) echo "325ba04dc5cb41c110723b00ac291f8269f8cd785028299aad8252ef980961a7 /tmp/foundry.tar.gz" | sha256sum --check ;;
    arm64) echo "209492cb4ebd723d9eac002fa30f41f53c8810105b67d3c32fe8201cf70f89d4 /tmp/foundry.tar.gz" | sha256sum --check ;;
    *) echo "unsupported architecture: ${TARGETARCH}"; exit 1 ;;
esac
tar -zx -f /tmp/foundry.tar.gz -C /usr/local/bin
EOF

################################################################################
# nitro builder
FROM builder AS nitro
ARG NITRO_VERSION
WORKDIR /usr/local/src
ADD https://github.com/leahneukirchen/nitro.git#${NITRO_VERSION} /usr/local/src
RUN make

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
# install tini
FROM base AS tini
ARG TINI_VERSION
ARG TARGETARCH
RUN <<EOF
case "${TARGETARCH}" in
    amd64)
        curl -fsSL https://github.com/krallin/tini/releases/download/v${TINI_VERSION}/tini-${TARGETARCH} \
        -o /usr/local/bin/tini;
        echo "93dcc18adc78c65a028a84799ecf8ad40c936fdfc5f2a57b1acda5a8117fa82c /usr/local/bin/tini" | sha256sum --check ;;
    arm64)
        curl -fsSL https://github.com/krallin/tini/releases/download/v${TINI_VERSION}/tini-${TARGETARCH} \
        -o /usr/local/bin/tini;
        echo "07952557df20bfd2a95f9bef198b445e006171969499a1d361bd9e6f8e5e0e81 /usr/local/bin/tini" | sha256sum --check ;;
    *) echo "unsupported architecture: ${TARGETARCH}"; exit 1 ;;
esac
chmod +x /usr/local/bin/tini
tini --version
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
    lua5.4
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
    *) echo "unsupported architecture: ${TARGETARCH}"; exit 1 ;;
esac
apt-get install -y --no-install-recommends /tmp/machine-emulator.deb
rm /tmp/machine-emulator.deb
cartesi-machine --version-json
EOF

# Install cartesi-rollups-node
RUN <<EOF
curl -fsSL https://github.com/cartesi/rollups-node/releases/download/v${CARTESI_ROLLUPS_NODE_VERSION}/cartesi-rollups-node-v${CARTESI_ROLLUPS_NODE_VERSION}_${TARGETARCH}.deb \
    -o /tmp/cartesi-rollups-node.deb
case "${TARGETARCH}" in
    amd64) echo "47b29eddf55ee66d93881cf488ba65dc0e7bd650d53683e5e9b50f20f8160b89 /tmp/cartesi-rollups-node.deb" | sha256sum --check ;;
    arm64) echo "72033a355cd603bff81a6f68af876a013ce44daa818dbdbb968594a4fc8e0816 /tmp/cartesi-rollups-node.deb" | sha256sum --check ;;
    *) echo "unsupported architecture: ${TARGETARCH}"; exit 1 ;;
esac
apt-get install -y --no-install-recommends /tmp/cartesi-rollups-node.deb
rm /tmp/cartesi-rollups-node.deb
mkdir -p /var/lib/cartesi-rollups-node/snapshots
chmod 755 /var/lib/cartesi-rollups-node/snapshots
chown cartesi:cartesi /var/lib/cartesi-rollups-node/snapshots
cartesi-rollups-node --version
EOF

COPY --from=su-exec /usr/local/bin/su-exec /usr/local/bin/
COPY --from=nitro /usr/local/src/nitro /usr/local/bin/
COPY --from=nitro /usr/local/src/nitroctl /usr/local/bin/
COPY --from=tini /usr/local/bin/tini /usr/local/bin/
COPY skel/ /
RUN <<EOF
mkdir -p /run/nitro
chown -R cartesi:cartesi /run/nitro
chmod +x /etc/nitro/*/run
EOF

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

ARG POSTGRES_PASSWORD=password

# create rollupsdb databases
COPY <<EOF /docker-entrypoint-initdb.d/00-createdb.sql
CREATE DATABASE rollupsdb;
CREATE DATABASE explorer;
EOF

# rollups-node migrations
COPY <<EOF /docker-entrypoint-initdb.d/01-rollups-node-migrations.sh
#!/usr/bin/env bash
set -e
export CARTESI_DATABASE_CONNECTION="postgres://postgres@/rollupsdb?host=/var/run/postgresql"
cartesi-rollups-cli db init --upgrade --verbose
EOF

RUN /usr/local/bin/docker-ensure-initdb.sh postgres

################################################################################
# rollups-database image
FROM ${POSTGRES_BASE_IMAGE} AS rollups-database
COPY --from=postgresql-initdb /var/lib/postgresql/data /var/lib/postgresql/data

################################################################################
# rundler install
FROM base AS rundler
ARG RUNDLER_VERSION
ARG TARGETARCH
ARG TARGETOS
WORKDIR /usr/local/bin
RUN <<EOF
case "${TARGETARCH}" in
    amd64)
        curl -fsSL https://github.com/alchemyplatform/rundler/releases/download/v${RUNDLER_VERSION}/rundler-v${RUNDLER_VERSION}-x86_64-unknown-${TARGETOS}-gnu.tar.gz \
            -o /tmp/rundler.tar.gz
        echo "b9d9baf7ee145976aab5c392e3e6de16d6aae2e9126a0b20b10a0acab3d75240 /tmp/rundler.tar.gz" | sha256sum --check ;;
    arm64)
        https://github.com/alchemyplatform/rundler/releases/download/v${RUNDLER_VERSION}/rundler-v${RUNDLER_VERSION}-x86_64-unknown-${TARGETOS}-gnu.tar.gz \
            -o /tmp/rundler.tar.gz
        echo "3c00812dfc10770d3b7e9ca946e8678927664b65a130a4e47c796380471cfb43 /tmp/rundler.tar.gz" | sha256sum --check ;;
    *) echo "unsupported architecture: ${TARGETARCH}"; exit 1 ;;
esac
tar -xvzf /tmp/rundler.tar.gz
EOF

################################################################################
# linux kernel image stage
FROM scratch AS kernel-image
ARG CARTESI_IMAGE_KERNEL_VERSION
ARG CARTESI_LINUX_KERNEL_VERSION

ADD --checksum=sha256:65dd100ff6204346ac2f50f772721358b5c1451450ceb39a154542ee27b4c947 \
    https://github.com/cartesi/image-kernel/releases/download/v${CARTESI_IMAGE_KERNEL_VERSION}/linux-${CARTESI_LINUX_KERNEL_VERSION}.bin \
    /usr/share/cartesi-machine/images/linux.bin

################################################################################
# linux headers stage
FROM base AS kernel-headers
ARG CARTESI_IMAGE_KERNEL_VERSION
ARG CARTESI_LINUX_KERNEL_VERSION

ADD --checksum=sha256:4a4714bfa8c0028cb443db2036fad4f8da07065c1cb4ac8e0921a259fddd731b \
    https://github.com/cartesi/image-kernel/releases/download/v${CARTESI_IMAGE_KERNEL_VERSION}/linux-headers-${CARTESI_LINUX_KERNEL_VERSION}.tar.xz \
    /tmp/linux-headers-${CARTESI_LINUX_KERNEL_VERSION}.tar.xz
RUN tar -xJf "/tmp/linux-headers-${CARTESI_LINUX_KERNEL_VERSION}.tar.xz" -C /

################################################################################
# sdk final image
FROM rollups-runtime
ARG CARTESI_DEVNET_VERSION
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
RUN <<EOF
npm install -g \
    @cartesi/devnet@${CARTESI_DEVNET_VERSION} \
    @cartesi/mock-verifying-paymaster@${CARTESI_PAYMASTER_VERSION} \
    @cartesi/passkey-server@${CARTESI_PASSKEY_SERVER_VERSION}

mkdir -p /usr/share/cartesi
cp -r "$(npm root -g)/@cartesi/devnet/deployments" /usr/share/cartesi/
cp "$(npm root -g)/@cartesi/devnet/anvil_state.json" /usr/share/cartesi/
EOF

ENV LC_ALL=en_US.UTF-8
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en

# healthcheck script using net_listening JSON-RPC method
COPY devnet /usr/local/bin
COPY eth_isready /usr/local/bin

COPY entrypoint.sh /usr/local/bin/
COPY --from=foundry /usr/local/bin/anvil /usr/local/bin/
COPY --from=foundry /usr/local/bin/cast /usr/local/bin/
COPY --from=squashfs-tools /usr/local/src/squashfs-tools/mksquashfs /usr/local/bin/
COPY --from=kernel-image /usr/share/cartesi-machine/images/linux.bin /usr/share/cartesi-machine/images/linux.bin
COPY --from=kernel-headers /include/linux /include/linux
COPY --from=rundler /usr/local/bin/rundler /usr/local/bin/

WORKDIR /mnt
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
