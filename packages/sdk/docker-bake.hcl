target "docker-metadata-sdk" {}
target "docker-metadata-rollups-runtime" {}
target "docker-metadata-rollups-database" {}
target "docker-platforms" {}

target "default" {
  inherits = ["docker-platforms"]
  args = {
    ALTO_VERSION                            = "0.0.4"
    CARTESI_BASE_IMAGE                      = "docker.io/library/debian:bookworm-20250317-slim@sha256:1209d8fd77def86ceb6663deef7956481cc6c14a25e1e64daec12c0ceffcc19d"
    CARTESI_COPROCESSOR_OPERATOR_BASE_IMAGE = "ghcr.io/zippiehq/cartesi-coprocessor-operator:v1.1.0@sha256:a1094b33f3098f2846a5568c510f55ac51dab7cb727d03b3b798aac84761de13"
    CARTESI_COPROCESSOR_SOLVER_BASE_IMAGE   = "ghcr.io/zippiehq/cartesi-coprocessor-solver:v1.0.0@sha256:69a542400381e935be03a9d09f643f5bb7bcb69ad793fab8a35c3ddf0f73d7e0"
    CARTESI_DEVNET_VERSION                  = "2.0.0-alpha.5"
    CARTESI_ESPRESSO_READER_VERSION         = "0.2.3-node-20250128"
    CARTESI_IMAGE_KERNEL_VERSION            = "0.20.0"
    CARTESI_LINUX_KERNEL_VERSION            = "6.5.13-ctsi-1-v0.20.0"
    CARTESI_MACHINE_EMULATOR_VERSION        = "0.19.0-alpha3"
    CARTESI_PAYMASTER_VERSION               = "0.2.0"
    CARTESI_ROLLUPS_GRAPHQL_VERSION         = "2.3.13"
    CARTESI_ROLLUPS_NODE_VERSION            = "2.0.0-alpha.4"
    CRANE_VERSION                           = "0.19.1"
    ESPRESSO_DEV_NODE_BASE_IMAGE            = "ghcr.io/espressosystems/espresso-sequencer/espresso-dev-node:20241120-patch6@sha256:453264eab19e3313c85a8720c784f16f15e36bacb28ae917034e24342cecf3c3"
    FOUNDRY_VERSION                         = "1.0.0"
    GO_MIGRATE_VERSION                      = "4.18.2"
    KUBO_VERSION                            = "0.34.1"
    POSTGRES_BASE_IMAGE                     = "docker.io/library/postgres:17@sha256:7f29c02ba9eeff4de9a9f414d803faa0e6fe5e8d15ebe217e3e418c82e652b35"
    SU_EXEC_VERSION                         = "0.2"
    XGENEXT2_VERSION                        = "1.5.6"
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

target "coprocessor-database" {
  inherits = ["default", "docker-metadata-coprocessor-database"]
  target = "coprocessor-database"
  labels = {
    "org.opencontainers.image.title" = "Cartesi SDK Coprocessor Database image"
    "org.opencontainers.image.description" = "Cartesi SDK Coprocessor PostgreSQL Database with preinitialized database for local development"
  }
}

group "default" {
  targets = ["sdk", "rollups-runtime", "rollups-database", "coprocessor-database"]
}
