target "docker-metadata-action" {}
target "docker-platforms" {}

target "default" {
  inherits = ["docker-metadata-action", "docker-platforms"]
  args = {
    BASE_IMAGE                    = "debian:bookworm-20240311"
    CARTESI_IMAGE_KERNEL_VERSION  = "0.20.0"
    DEVNET_VERSION                = "1.6.0"
    LINUX_KERNEL_VERSION          = "6.5.13-ctsi-1-v0.20.0"
    XGENEXT2_VERSION              = "1.5.6"
  }
}
