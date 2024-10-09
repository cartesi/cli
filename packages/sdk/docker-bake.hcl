target "docker-metadata-action" {}
target "docker-platforms" {}

target "default" {
  inherits = ["docker-metadata-action", "docker-platforms"]
  args = {
    BASE_IMAGE                    = "debian:bookworm-20240926"
    SERVER_MANAGER_REGISTRY       = "docker.io"
    SERVER_MANAGER_ORG            = "cartesi"
    SERVER_MANAGER_VERSION        = "0.9.1"
    CARTESI_IMAGE_KERNEL_VERSION  = "0.19.1"
    ALTO_VERSION                  = "0.0.4"
    PAYMASTER_VERSION             = "0.2.0"
    DEVNET_VERSION                = "1.8.0"
    LINUX_KERNEL_VERSION          = "6.5.9-ctsi-1-v0.19.1"
    XGENEXT2_VERSION              = "1.5.6"
    CRANE_VERSION                 = "0.19.1"
  }
}
