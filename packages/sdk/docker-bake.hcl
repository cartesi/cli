target "docker-metadata-sdk" {}
target "docker-metadata-rollups-runtime" {}
target "docker-metadata-rollups-database" {}
target "docker-platforms" {}

target "default" {
  inherits = ["docker-platforms"]
  args = {
    ALTO_VERSION                      = "0.0.4"
    CARTESI_BASE_IMAGE                = "docker.io/library/debian:bookworm-20250317-slim@sha256:1209d8fd77def86ceb6663deef7956481cc6c14a25e1e64daec12c0ceffcc19d"
    CARTESI_DEVNET_VERSION            = "2.0.0-alpha.3"
    CARTESI_ESPRESSO_READER_VERSION   = "0.2.3-node-20250128"
    CARTESI_IMAGE_KERNEL_VERSION      = "0.20.0"
    CARTESI_LINUX_KERNEL_VERSION      = "6.5.13-ctsi-1-v0.20.0"
    CARTESI_MACHINE_EMULATOR_VERSION  = "0.18.1"
    CARTESI_PAYMASTER_VERSION         = "0.2.0"
    CARTESI_ROLLUPS_GRAPHQL_VERSION   = "2.3.8"
    CARTESI_ROLLUPS_NODE_VERSION      = "2.0.0-alpha.1"
    CRANE_VERSION                     = "0.19.1"
    ESPRESSO_DEV_NODE_BASE_IMAGE      = "ghcr.io/espressosystems/espresso-sequencer/espresso-dev-node:20241120-patch6@sha256:453264eab19e3313c85a8720c784f16f15e36bacb28ae917034e24342cecf3c3"
    FOUNDRY_VERSION                   = "0.3.0"
    GO_MIGRATE_VERSION                = "4.18.2"
    POSTGRES_BASE_IMAGE               = "docker.io/library/postgres:16@sha256:e95b0cb95f719e0ce156c2bc5545c89fbd98a1a692845a5331ddc79ea61f1b1e"
    SU_EXEC_VERSION                   = "0.2"
    XGENEXT2_VERSION                  = "1.5.6"
  }
}

target "sdk"  {
  inherits = ["default", "docker-metadata-sdk"]
  labels = {
    "org.opencontainers.image.title" = "Cartesi SDK Image"
    "org.opencontainers.image.description" = "Cartesi SDK tools image"
  }
}

target "rollups-runtime"  {
  inherits = ["default", "docker-metadata-rollups-runtime"]
  target = "rollups-runtime"
  labels = {
    "org.opencontainers.image.title" = "Cartesi Rollups Runtime image"
    "org.opencontainers.image.description" = "Cartesi Rollups Runtime for production usage"
  }
}

target "rollups-database"  {
  inherits = ["default", "docker-metadata-rollups-database"]
  target = "rollups-database"
  labels = {
    "org.opencontainers.image.title" = "Cartesi SDK Rollups Database image"
    "org.opencontainers.image.description" = "Cartesi SDK PostgreSQL Database with preinitialized database for local development"
  }
}
