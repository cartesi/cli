target "docker-metadata-sdk" {}
target "docker-metadata-rollups-runtime" {}
target "docker-metadata-rollups-database" {}
target "docker-platforms" {}

target "default" {
  inherits = ["docker-platforms"]
  args = {
    ALTO_VERSION                      = "1.2.7"
    ALTO_PACKAGE_VERSION              = "0.0.20"
    CARTESI_BASE_IMAGE                = "docker.io/library/debian:trixie-20260610@sha256:fe7312b5f05bf5f43fad76bcd8945642e4e47a68aefd1b73f447615899d0fac1"
    CARTESI_DEVNET_VERSION            = "2.0.0-alpha.14"
    CARTESI_IMAGE_KERNEL_VERSION      = "0.20.0"
    CARTESI_LINUX_KERNEL_VERSION      = "6.5.13-ctsi-1-v0.20.0"
    CARTESI_MACHINE_EMULATOR_VERSION  = "0.20.0"
    CARTESI_PASSKEY_SERVER_VERSION    = "1.0.1"
    CARTESI_PAYMASTER_VERSION         = "0.2.0"
    CARTESI_ROLLUPS_NODE_VERSION      = "2.0.0-alpha.12"
    FOUNDRY_VERSION                   = "1.4.3"
    NITRO_VERSION                     = "c937fa4fd202074dd250086ebd92de6884968b84" # v0.8.1
    NODE_VERSION                      = "24.14.0"
    NVM_VERSION                       = "977563e97ddc66facf3a8e31c6cff01d236f09bd" # 0.40.3
    POSTGRES_BASE_IMAGE               = "docker.io/library/postgres:17-trixie@sha256:2203e6282d9e7de7c24d7da234e2a744fb325df366a3fd8ed940e8abbee39527"
    SQUASHFS_TOOLS_VERSION            = "bad1d213ab6df587d6fa0ef7286180fbf7b86167" # 4.7.4
    SU_EXEC_VERSION                   = "0.3"
    TELEGRAF_VERSION                  = "1.38.0"
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
