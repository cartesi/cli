target "docker-metadata-action" {}

target "default" {
  platforms = [ "linux/riscv64"]
  inherits = ["docker-metadata-action"]
  args = {
    #FIXME: replace the image with the official one when it's available
    #       from: docker.io/riscv64/ubuntu to: docker.io/library/ubuntu
    IMAGE_REGISTRY="docker.io"
    IMAGE_NAMESPACE="riscv64"
    IMAGE_NAME="ubuntu"
    IMAGE_TAG="22.04"
    CHISEL_VERSION="0.9.1"
    TARGETARCH="riscv64"
    MACHINE_EMULATOR_TOOLS_VERSION="0.14.1"
  }
}
