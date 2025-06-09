target "docker-metadata-sdk" {}
target "docker-metadata-rollups-runtime" {}
target "docker-metadata-rollups-database" {}
target "docker-platforms" {}

target "default" {
  inherits = ["docker-platforms"]
  args = {
    ALTO_VERSION                      = "1.2.5"
    ALTO_PACKAGE_VERSION              = "0.0.18"
    CARTESI_BASE_IMAGE                = "docker.io/library/debian:bookworm-20250520-slim@sha256:90522eeb7e5923ee2b871c639059537b30521272f10ca86fdbbbb2b75a8c40cd"
    CARTESI_DEVNET_VERSION            = "2.0.0-alpha.7"
    CARTESI_ESPRESSO_READER_VERSION   = "0.3.0"
    CARTESI_IMAGE_KERNEL_VERSION      = "0.20.0"
    CARTESI_LINUX_KERNEL_VERSION      = "6.5.13-ctsi-1-v0.20.0"
    CARTESI_MACHINE_EMULATOR_VERSION  = "0.19.0"
    CARTESI_PASSKEY_SERVER_VERSION    = "1.0.1"
    CARTESI_PAYMASTER_VERSION         = "0.2.0"
    CARTESI_ROLLUPS_GRAPHQL_VERSION   = "2.3.14"
    CARTESI_ROLLUPS_NODE_VERSION      = "2.0.0-alpha.5"
    CRANE_VERSION                     = "0.19.1"
    ESPRESSO_DEV_NODE_BASE_IMAGE      = "ghcr.io/espressosystems/espresso-sequencer/espresso-dev-node:20250428-dev-node-decaf-pos@sha256:78024bc092d51b47e81c0f715dc7a87ac9da81f62a4f8bf3165b3a199f9867fb"
    FOUNDRY_VERSION                   = "1.2.1"
    GO_MIGRATE_VERSION                = "4.18.2"
    NODE_VERSION                      = "22.15.1"
    NVM_VERSION                       = "977563e97ddc66facf3a8e31c6cff01d236f09bd" # 0.40.3
    POSTGRES_BASE_IMAGE               = "docker.io/library/postgres:17@sha256:7f29c02ba9eeff4de9a9f414d803faa0e6fe5e8d15ebe217e3e418c82e652b35"
    SU_EXEC_VERSION                   = "0.2"
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
