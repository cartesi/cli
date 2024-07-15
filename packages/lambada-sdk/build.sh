#!/bin/sh
docker buildx bake --set default.platform=linux/arm64 --set default.tags=zippiehq/cartesi-lambada-sdk:devel-arm64 --push
echo $?

docker buildx bake --set default.platform=linux/amd64 --set default.tags=zippiehq/cartesi-lambada-sdk:devel-amd64 --push
echo $?

docker manifest rm zippiehq/cartesi-lambada-sdk:devel
echo $?

docker manifest create zippiehq/cartesi-lambada-sdk:devel --amend zippiehq/cartesi-lambada-sdk:devel-arm64 --amend zippiehq/cartesi-lambada-sdk:devel-amd64
echo $?

docker manifest push -p zippiehq/cartesi-lambada-sdk:devel
echo $?
