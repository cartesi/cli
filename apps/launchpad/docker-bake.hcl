target "docker-metadata-action" {}
target "docker-platforms" {}

target "default" {
    inherits = ["docker-metadata-action", "docker-platforms"]
    context = "../.."
    dockerfile = "apps/launchpad/Dockerfile"
}
