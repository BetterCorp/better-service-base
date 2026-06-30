# Stage 1: Build
ARG GO_BUILDER_IMAGE=golang:1.26-alpine
ARG GO_RUNTIME_IMAGE=alpine:3.24

FROM ${GO_BUILDER_IMAGE} AS builder
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /bsb ./cmd/bsb

# Stage 2: Runtime
FROM ${GO_RUNTIME_IMAGE}
RUN adduser -D -u 1000 bsb
WORKDIR /home/bsb
COPY --from=builder /bsb /usr/local/bin/bsb
RUN chown -R bsb:bsb /home/bsb

USER bsb

ENV BSB_MODE=production
ENV BSB_CONTAINER=true

ENTRYPOINT ["bsb"]
