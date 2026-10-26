# Tally Cloud

A single-owner, MYR spending-only PWA hosted on Cloudflare Workers + D1. Independent deployment. No AI, Mini PC, Tailscale, bank login or server dependencies. Empty database. Supports manual entry, rule-based category memory, Apple Pay / supported TNG notification / Alliance SMS capture, budget, recurring, review/merge, Trash/history, and CSV export. English interface and in-app instructions. Owner chooses password via private one-time setup, sessions via HttpOnly cookie, separate revocable upload-only tokens for Shortcuts. Each installation is one person's private ledger, not a shared multi-user service. Public shell and guides may be hosted; financial API must require auth. Deployable independently on any Cloudflare account.

## Success
Working deployed authenticated app, real D1, exercised API and 390px browser flow, setup guide with variable diagrams, source/deployment guide and test evidence. Explicit limitations for actual iPhone OS triggers (not executable from this environment) and unsupported bank formats.
