# Stage 1: Build
FROM golang:1.26-alpine AS builder
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /bsb ./cmd/bsb

# Stage 2: Runtime
FROM alpine:3.21
RUN adduser -D -u 1000 bsb
WORKDIR /home/bsb
COPY --from=builder /bsb /usr/local/bin/bsb
RUN chown -R bsb:bsb /home/bsb

USER bsb

ENV BSB_MODE=production
ENV BSB_CONTAINER=true

ENTRYPOINT ["bsb"]
