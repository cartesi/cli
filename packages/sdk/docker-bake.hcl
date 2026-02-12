target "docker-metadata-sdk" {}
target "docker-metadata-rollups-runtime" {}
target "docker-metadata-rollups-database" {}
target "docker-platforms" {}

target "default" {
  inherits = ["docker-platforms"]
  args = {
    ALTO_VERSION                      = "1.2.5"
    ALTO_PACKAGE_VERSION              = "0.0.18"
    CARTESI_BASE_IMAGE                = "docker.io/library/debian:trixie-20260202-slim@sha256:f6e2cfac5cf956ea044b4bd75e6397b4372ad88fe00908045e9a0d21712ae3ba"
    CARTESI_DEVNET_VERSION            = "2.0.0-alpha.10"
    CARTESI_IMAGE_KERNEL_VERSION      = "0.20.0"
    CARTESI_LINUX_KERNEL_VERSION      = "6.5.13-ctsi-1-v0.20.0"
    CARTESI_MACHINE_EMULATOR_VERSION  = "0.19.0"
    CARTESI_PASSKEY_SERVER_VERSION    = "1.0.1"
    CARTESI_PAYMASTER_VERSION         = "0.2.0"
    CARTESI_ROLLUPS_NODE_VERSION      = "2.0.0-alpha.9"
    FOUNDRY_VERSION                   = "1.4.3"
    NITRO_VERSION                     = "8c376d4a5baa7f32999620f9fe3eb51ca8e0dcbc" # v0.5
    NODE_VERSION                      = "24.12.0"
    NVM_VERSION                       = "977563e97ddc66facf3a8e31c6cff01d236f09bd" # 0.40.3
    POSTGRES_BASE_IMAGE               = "docker.io/library/postgres:17-trixie@sha256:4493696c5ba6a9cd4a3303411d5dd6af52cf5e34cdd87ba8ebf26a19735f84d1"
    SQUASHFS_TOOLS_VERSION            = "bad1d213ab6df587d6fa0ef7286180fbf7b86167" # 4.7.4
    SU_EXEC_VERSION                   = "0.3"
    XGENEXT2_VERSION                  = "1.5.6"
  }
}

target "sdk" {
  inherits = ["default", "docker-metadata-sdk"]
  labels = {
    "org.opencontainers.image.title" = "Cartesi SDK Image"
    "org.opencontainers.image.description" = "Cartesi SDK tools image"
  }
}

target "rollups-runtime" {
  inherits = ["default", "docker-metadata-rollups-runtime"]
  target = "rollups-runtime"
  labels = {
    "org.opencontainers.image.title" = "Cartesi Rollups Runtime image"
    "org.opencontainers.image.description" = "Cartesi Rollups Runtime for production usage"
  }
}

target "rollups-database" {
  inherits = ["default", "docker-metadata-rollups-database"]
  target = "rollups-database"
  labels = {
    "org.opencontainers.image.title" = "Cartesi SDK Rollups Database image"
    "org.opencontainers.image.description" = "Cartesi SDK PostgreSQL Database with preinitialized database for local development"
  }
}

group "default" {
  targets = ["sdk", "rollups-runtime", "rollups-database"]
}
