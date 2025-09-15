FROM --platform=linux/riscv64 ubuntu:24.04@sha256:3f83fb03282ef4e453bdf0060e0d83833bb3cf6e6f36f54d9b8517d311d78e03 AS test
ADD ./file2 .

FROM --platform=linux/riscv64 ubuntu:24.04@sha256:3f83fb03282ef4e453bdf0060e0d83833bb3cf6e6f36f54d9b8517d311d78e03
ADD ./file1 .
