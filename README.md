# MELATO DECONSTRUCT / Studio

Local fashion extraction and product photography workstation. Dark MELATO atelier interface, responsive product rack, individual views, editable detection, source/logo/construction references, branding modes, direct aspect ratios, per-image download and optional AI inspection.

## Run

Requires Node.js 22. No npm dependencies.

    npm start

Open http://127.0.0.1:8766. Manual mode is available immediately: upload source, add products, copy the photography prompt into your preferred image tool (attach source and references), and import each result. Images are held in browser memory; download before refreshing.

## Optional automated generation

Copy .env.example to .env locally, set GEMINI_API_KEY and ALLOW_AI_REQUESTS=true, then restart. Check Google's pricing and your account eligibility first. API calls may be billable; each session requires explicit consent. No key is exposed to the browser. Images are transmitted to Google only on explicitly requested AI operations. This is a standalone Gemini Developer API implementation, not a Flow SDK app or a way to reuse Flow credits. Model availability and supported settings depend on account access; errors are visible rather than silently substituted. No auto-retries.

Default image model: Nano Banana 2.1. Text model: Gemini 3.5 Flash-Lite. The manual path does not require either model. API reference: https://aistudio.google.com/docs/image-generation and https://aistudio.google.com/docs/models.

## Reliability

One operation at a time; bounded provider and browser timeouts; separate QC outcome; valid JSON and image response checks; no fictional products or quality scores. A timeout cannot guarantee the remote job was cancelled. Batch stops after failure, or when requested by operator, and skips completed selected views. AI assessment is advisory. Hidden garment details and branding must be verified by a human before publication.

## Tests

    npm run check

Tests exercise validation, prompt constraints, mocked provider generation, timeout, and local HTTP behavior. Live generation and visual fidelity require an authorized real API request and human review. Local-only binding: do not expose this server publicly without authentication and operational hardening.

## Scope

Initial standalone implementation. Session-only storage, no cloud deployment, no camera/media-gallery SDK, no Shopify publication, no billing guarantees. Future: persistent project library, explicit human approval ledger, crop masks, fidelity benchmarks and authenticated deployment.
