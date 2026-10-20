# SDK

This produces a Docker image containing tools used during the build of a Cartesi application.

The image starts from the Cartesi emulator image, and adds the following:

-   linux kernel published by Cartesi
-   a custom [genext2fs](https://github.com/cartesi/genext2fs/tree/next) tool used to generate the root filesystem of the application.

The produced image is published to both [DockerHub](https://hub.docker.com/repository/docker/cartesi/sdk/general) and [GitHub](https://github.com/orgs/cartesi/packages/container/package/sdk), for better availability.

```shell
docker run cartesi/sdk:<version> xgenext2fs --help
docker run cartesi/sdk:<version> cartesi-machine --help
```

## Building the image

> **WIP, until the next rollups-node release:** the images install a rollups-node built by
> rollups-node CI instead of a release. `bun run build` (here or at the repository root)
> first runs `scripts/fetch-rollups-node.sh`, which downloads the `.deb` files of the
> pinned run into `rollups-node/` (git-ignored) and skips the download once they are
> there, then bakes `cartesi/sdk:devel`, `cartesi/rollups-runtime:devel` and
> `cartesi/rollups-database:devel`. Use them with `sdk = "cartesi/sdk:devel"` in
> `cartesi.toml` and `cartesi run --runtime-version devel`. Set `ROLLUPS_NODE_RUN_ID`
> to take another run.

To build and publish the images to the registry, you need to have the `docker` CLI installed and logged in to both `ghcr.io/cartesi` and `docker.io` registries.

Then you can run the following command:

```bash
docker buildx bake --push --provenance=false
```

The `--provenance=false` is needed because of an issue with GHCR not handling well new docker images produced with provenance by default by BuildKit 0.11+.
