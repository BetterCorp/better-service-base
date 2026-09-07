FROM rust:1.95-bookworm AS builder
ARG BSB_VERSION=
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY rust ./rust
COPY plugins/rust ./plugins/rust
COPY plugins/contracts ./plugins/contracts
RUN if [ -n "$BSB_VERSION" ]; then sh rust/set-version.sh "$BSB_VERSION"; fi
RUN cargo build --locked --release -p better-service-base-cli --bin bsb

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 bsb
WORKDIR /home/bsb
COPY --from=builder /build/target/release/bsb /usr/local/bin/bsb
USER bsb
ENV BSB_MODE=production BSB_CONTAINER=true
ENTRYPOINT ["bsb"]
