# Dependency review

## Tokio 1.53.3 — 2026-11-14

[Socket's PR dependency overview](https://github.com/BetterCorp/better-service-base/pull/109#issuecomment-5557877005) reports supply-chain security 58/100, vulnerability 100/100, quality 93/100, maintenance 100/100 and license 100/100. These are category scores, not probabilities of compromise. The detailed alerts behind Tokio's supply-chain score were unavailable during this review; the score remains unexplained and is not dismissed.

`Cargo.lock` pins Tokio 1.53.3 from crates.io. The crate matches the registry checksum `ce3335fa71841cda333a58d7615b03901380ecf09d59b3296d21f8bbac0dde4e`. This is the patched 1.53.x release for RUSTSEC-2026-0386. These checks establish artifact identity and advisory disposition, not source safety.

Tokio runs BSB's Rust tasks, networking, filesystem operations, timers and CLI subprocesses, and is also used by HTTP and Rabbit dependencies. A compromise would have broad impact. Replacing one direct dependency would not remove this exposure.

The supplied [CVE-2025-6251](https://nvd.nist.gov/vuln/detail/CVE-2025-6251) concerns the WordPress Royal Elementor plugin, not Tokio. The similarly numbered [CVE-2025-62518](https://github.com/advisories/GHSA-j5gw-2vrg-8fgx) concerns the separate archive parsers `tokio-tar` and `astral-tokio-tar`; neither is present in this workspace's `Cargo.lock`. Neither advisory calls for changing this project's Tokio runtime dependency.

Retain the reviewed lockfile and locked builds while investigating the specific Socket alerts. Do not downgrade, replace the runtime, or suppress alerts solely to improve the aggregate score. Changes require evidence tied to an affected version or behavior; checksums alone do not protect against a compromised upstream release.

The 2026-11-14 advisory refresh also pins `quinn-proto` 0.11.19,
`quinn-udp` 0.5.16, and `rustix` 1.1.6 to address RUSTSEC-2026-0524,
RUSTSEC-2026-0523, RUSTSEC-2026-0538, and RUSTSEC-2026-0486. The complete
locked Rust workspace test suite passes with these versions.

[Socket's separate PR warning report](https://github.com/BetterCorp/better-service-base/pull/109#issuecomment-5557877189) flags suspected obfuscation in `hyper-util` 0.1.20 and `System.CodeDom` 7.0.0. Those alerts remain open; the Tokio provenance check does not clear them.
