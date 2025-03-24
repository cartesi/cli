target "sdk" {
  tags = ["cartesi/sdk:devel"]
  labels = {
    "org.opencontainers.image.title" = "Cartesi SDK Image"
    "org.opencontainers.image.description" = "Cartesi SDK tools image"
  }
}

target "rollups-runtime" {
  tags = ["cartesi/rollups-runtime:devel"]
  labels = {
    "org.opencontainers.image.title" = "Cartesi Rollups Runtime image"
    "org.opencontainers.image.description" = "Cartesi Rollups Runtime for production usage"
  }
}

target "rollups-database" {
  tags = ["cartesi/rollups-database:devel"]
  labels = {
    "org.opencontainers.image.title" = "Cartesi SDK Rollups Database image"
    "org.opencontainers.image.description" = "Cartesi SDK PostgreSQL Database with preinitialized database for local development"
  }
}
