# Kaiko Core SDK — Platform Backend (showcase excerpt)

An excerpt from the platform backend behind Kaiko's SDK products: auth, multi-tenant API key
management, and Stripe-based usage billing. This repo shows the **SaaS platform infrastructure** —
API key auth, project/user management, subscription and usage-based billing, and the API gateway
layer that meters access to a paid ML API — as a demonstration of production backend engineering,
not any of the ML models the platform serves.

This is a curated excerpt, not the full SDK: the actual emotion-classification model, its training
pipeline, and the 18GB+ of training data/benchmarks that live alongside this code are entirely
excluded, so this repo is for reading, not running.

## What's included here

- **`src/auth/`** — API key authentication and authorization (`authorizer.ts` — an
  API-Gateway-style Lambda authorizer with unit tests covering JWT and API-key auth paths), project/
  user management, OAuth middleware, and the auth database schema.
- **`src/billing/`** — Stripe-integrated billing: subscriptions, invoices, payment methods,
  usage-based billing and usage logs, and webhook handlers for Stripe events.
- **`src/emotion/`** — the thin API-gateway layer in front of the actual emotion-classification
  service: request routing, metrics middleware, rate limiting, and API-key-plus-balance
  verification (usage-based access gating for a paid ML API). The classification model itself is
  not part of this layer and is not included.
- **`src/shared/`** — cross-cutting utilities: logging, error/security middleware, a base API
  client, pagination/sorting helpers, and request validation.

## What was built but isn't shown here

- **The emotion-classification model and its serving code** (`src/emotion_classification/`) — the
  actual ML model this whole platform exists to serve.
- **Training data, benchmarks, and model artifacts** — tens of gigabytes of training/benchmark data
  for the classification model.
- Deployment infrastructure (Serverless Framework configs, Terraform/infra, monitoring dashboards).

I'm happy to walk through the design of the ML side in conversation — it's just not published as
code.

## Stack

TypeScript backend (API-Gateway/Lambda-style authorizer, modular service architecture), Stripe
billing integration, SQL schema/migrations.
