target "docker-metadata-action" {}
target "docker-platforms" {}

target "default" {
  inherits = ["docker-metadata-action", "docker-platforms"]
  args = {
    BASE_IMAGE                        = "debian:bookworm-20240926"
    CARTESI_MACHINE_EMULATOR_VERSION  = "0.18.1"
    CARTESI_IMAGE_KERNEL_VERSION      = "0.20.0"
    ALTO_VERSION                      = "0.0.4"
    PAYMASTER_VERSION                 = "0.2.0"
    DEVNET_VERSION                    = "1.8.0"
    LINUX_KERNEL_VERSION              = "6.5.13-ctsi-1-v0.20.0"
    XGENEXT2_VERSION                  = "1.5.6"
    CRANE_VERSION                     = "0.19.1"
    NODEJS_VERSION                    = "18.19.0"
    SU_EXEC_VERSION                   = "0.2"
    ANVIL_VERSION                     = "e90348416c3a831ab75bb43f6fa5f0a0be4106c4"
  }
}
