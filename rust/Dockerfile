FROM rust:1.95-bookworm AS builder
ARG BSB_VERSION=
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY set-version.sh ./
RUN if [ -n "$BSB_VERSION" ]; then sh set-version.sh "$BSB_VERSION"; fi
COPY src ./src
COPY examples/rabbit-peer.rs ./examples/rabbit-peer.rs
RUN cargo build --locked --release --bin bsb

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 bsb
WORKDIR /home/bsb
COPY --from=builder /build/target/release/bsb /usr/local/bin/bsb
USER bsb
ENV BSB_MODE=production BSB_CONTAINER=true
ENTRYPOINT ["bsb"]
