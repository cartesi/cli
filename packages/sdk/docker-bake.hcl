target "docker-metadata-sdk" {}
target "docker-metadata-rollups-runtime" {}
target "docker-metadata-rollups-database" {}
target "docker-platforms" {}

target "default" {
  inherits = ["docker-platforms"]
  args = {
    ALTO_VERSION                      = "1.2.5"
    ALTO_PACKAGE_VERSION              = "0.0.18"
    CARTESI_BASE_IMAGE                = "docker.io/library/debian:trixie-20251229-slim@sha256:4bcb9db66237237d03b55b969271728dd3d955eaaa254b9db8a3db94550b1885"
    CARTESI_DEVNET_VERSION            = "2.0.0-alpha.9"
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
    POSTGRES_BASE_IMAGE               = "docker.io/library/postgres:17-trixie@sha256:bac8128cd62a35471a1e97966861aa2ac88c8d2f408767a425ae70695a607c99"
    SQUASHFS_TOOLS_VERSION            = "99d23a31b471433c51e9c145aeba2ab1536e34df" # 4.7.2
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
