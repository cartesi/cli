target "docker-metadata-action" {}
target "docker-platforms" {}

target "default" {
  inherits = ["docker-metadata-action", "docker-platforms"]
  args = {
    BASE_IMAGE                    = "debian:bookworm-20240423"
    MACHINE_EMULATOR_REGISTRY     = "docker.io"
    MACHINE_EMULATOR_ORG          = "cartesi"
    MACHINE_EMULATOR_VERSION      = "0.17.0"
    CARTESI_IMAGE_KERNEL_VERSION  = "0.20.0"
    LINUX_KERNEL_VERSION          = "6.5.13-ctsi-1-v0.20.0"
  }
}
