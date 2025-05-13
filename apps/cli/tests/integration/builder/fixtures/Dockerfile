FROM --platform=linux/riscv64 ubuntu:24.04@sha256:6015f66923d7afbc53558d7ccffd325d43b4e249f41a6e93eef074c9505d2233 AS test
ADD ./file2 .

FROM --platform=linux/riscv64 ubuntu:24.04@sha256:6015f66923d7afbc53558d7ccffd325d43b4e249f41a6e93eef074c9505d2233
ADD ./file1 .
