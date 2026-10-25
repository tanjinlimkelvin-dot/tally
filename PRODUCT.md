# Tally Cloud

A single-owner, MYR spending-only PWA for a friend, derived from Jin's existing Tally. Independent Cloudflare Workers + D1 deployment. No AI, CPA, Mini PC, Tailscale, bank login or Hermes dependency. Empty database; never copy Jin's personal ledger. Keep manual capture, rule-based category memory, Apple Pay / supported TNG notification / Alliance SMS capture, budget, recurring, review/merge, Trash/history, CSV. English interface and English in-app instructions. Owner chooses password via private one-time setup, sessions via HttpOnly cookie, separate revocable upload-only tokens for Shortcuts. Each installation is one person's private ledger, not a shared multi-user service. Public shell and guides may be hosted; financial API must require auth. This instance is an evaluation installation on Jin's Cloudflare account; friend can deploy source independently.

## Success
Working deployed authenticated app, real D1, exercised API and 390px browser flow, setup guide with variable diagrams, source/deployment guide and test evidence. Explicit limitations for actual iPhone OS triggers (not executable from this environment) and unsupported bank formats.
