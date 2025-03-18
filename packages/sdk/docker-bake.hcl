target "docker-metadata-action" {}
target "docker-platforms" {}

target "default" {
  inherits = ["docker-metadata-action", "docker-platforms"]
  args = {
    ALTO_VERSION                      = "0.0.4"
    CARTESI_ESPRESSO_READER_VERSION   = "0.2.3-node-20250128"
    CARTESI_IMAGE_KERNEL_VERSION      = "0.20.0"
    CARTESI_MACHINE_EMULATOR_VERSION  = "0.18.1"
    CARTESI_ROLLUPS_GRAPHQL_VERSION   = "2.3.8"
    CARTESI_ROLLUPS_NODE_VERSION      = "2.0.0-alpha.1"
    CRANE_VERSION                     = "0.19.1"
    DEVNET_VERSION                    = "2.0.0-alpha.3"
    ESPRESSO_DEV_NODE_TAG             = "20241120-patch6"
    FOUNDRY_VERSION                   = "0.3.0"
    GO_MIGRATE_VERSION                = "4.18.2"
    LINUX_KERNEL_VERSION              = "6.5.13-ctsi-1-v0.20.0"
    NODEJS_VERSION                    = "18.19.0"
    PAYMASTER_VERSION                 = "0.2.0"
    POSTGRES_VERSION                  = "16"
    ROLLUPS_NODE_BASE_IMAGE           = "debian:bookworm-20250317-slim"
    SDK_BASE_IMAGE                    = "debian:bookworm-20250317-slim"
    SU_EXEC_VERSION                   = "0.2"
    XGENEXT2_VERSION                  = "1.5.6"
  }
}

target "rollups-node"  {
  inherits = ["default", "docker-metadata-action", "docker-platforms"]
  target = "rollups-node"
}