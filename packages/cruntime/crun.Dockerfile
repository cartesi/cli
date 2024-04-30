FROM docker.io/riscv64/ubuntu:22.04
ARG DEBIAN_FRONTEND=noninteractive
RUN <<EOF
set -e
apt-get update
apt-get install -y \
    autoconf \
    automake \
    build-essential \
    gcc \
    git \
    go-md2man \
    libcap-dev \
    libprotobuf-c-dev \
    libseccomp-dev \
    libtool \
    libyajl-dev \
    make \
    pkgconf \
    python3
EOF

WORKDIR /usr/local/src
