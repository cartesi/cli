target "docker-metadata-sdk" {}
target "docker-metadata-rollups-runtime" {}
target "docker-metadata-rollups-database" {}
target "docker-platforms" {}

target "default" {
  inherits = ["docker-platforms"]
  args = {
    ALTO_VERSION                      = "1.2.8"
    ALTO_PACKAGE_VERSION              = "0.0.20"
    CARTESI_BASE_IMAGE                = "docker.io/library/debian:trixie-20261104@sha256:9c6e381421d0f48d1b8133e573f33c185ee16cbf505eda9c4a8a4791b25ea8a6"
    CARTESI_LINUX_KERNEL_VERSION      = "6.18.56-ctsi-1"
    CARTESI_MACHINE_EMULATOR_VERSION  = "0.22.0"
    CARTESI_PASSKEY_SERVER_VERSION    = "1.0.3"
    CARTESI_PAYMASTER_VERSION         = "0.2.0"
    CARTESI_PRT_VERSION               = "3.0.0-alpha.6"
    CARTESI_ROLLUPS_NODE_VERSION      = "2.0.0-alpha.14"
    FOUNDRY_VERSION                   = "1.5.1"
    NITRO_VERSION                     = "c937fa4fd202074dd250086ebd92de6884968b84" # v0.8.1
    NODE_VERSION                      = "24.22.3"
    NVM_VERSION                       = "4e8758a801eea9479b32a904f31093e410ddaba4" # 0.41.0
    POSTGRES_BASE_IMAGE               = "docker.io/library/postgres:18-trixie@sha256:eb63372c1e05c755f55fa30cbd07aecc443676fc6c0fa90b9002d01537841e1a"
    SQUASHFS_TOOLS_VERSION            = "708c59ae80853b0845017c33b42e56061cc546cd" # 4.7.5
    SU_EXEC_VERSION                   = "0.3"
    TELEGRAF_VERSION                  = "1.40.3"
    TINI_VERSION                      = "0.19.0"
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
