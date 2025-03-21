target "default" {
  tags = ["cartesi/sdk:devel"]
}

target "rollups-node" {
  tags = ["cartesi/sdk-node:devel"]
}

target "database" {
  tags = ["cartesi/rollups-database:devel"]
}
