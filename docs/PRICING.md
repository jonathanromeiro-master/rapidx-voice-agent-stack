# AI runtime pricing boundary

## Public claim

The allowed claim is: "AI runtime from about ₹1 per minute."

It covers only STT, LLM, and TTS. It never includes telephony, DID/SIP,
carrier, server, tax, or other external costs. Do not publish a different
all-in rate without a dated, provider-backed calculation for the deployed
configuration.

## Current metering

The dashboard records TTS characters, approximate LLM tokens, and dial counts.
It does not yet record call duration or provider invoices, so it deliberately
reports AI-runtime spend as `not_metered`. A dial count must never be converted
into an AI-runtime or carrier cost estimate.

## Before quoting a measured rate

1. Capture real session duration plus provider invoices for STT, LLM, and TTS.
2. Reconcile those figures for the selected provider configuration and date.
3. Keep the public AI-runtime figure separate from the carrier invoice and all
   fixed infrastructure costs.
