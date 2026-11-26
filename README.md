# Token Launch Radar

[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/jawaddevisser-coder/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/jawaddevisser-coder/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

Entry for the [make.fun token-radar-01 bounty](https://make.fun/bounty/token-radar-01): build the best token launch radar.

## What it is

A radar over 758 DeFi protocols from a frozen DefiLlama snapshot (14 Nov 2026). It ranks the 198 genuine pre-token launch candidates by an implied value — what their token would be worth if the protocol's record stayed as it is — and gives every one a concrete farm plan with costs and durations. Sixty live protocols are ranked alongside by market cap, so a reader can compare a pre-token protocol against what already trades. The other 144 token-less protocols are wrapped, staked, bridged, versioned or exchange products; they are listed separately with the reason instead of being ranked as launches that will never happen.

## The value model

No protocol name is hardcoded. For a pre-token protocol:

```
implied = TVL x category multiple x growth factor x maturity factor x breadth factor
```

- **Category multiple**: the median market-cap-to-TVL ratio of the live protocols in the same category that report both numbers (global median when a category has fewer than three), clamped to 0.05–1.5.
- **Growth factor**: seven-day TVL change, clamped to −25%…+80%.
- **Maturity factor**: days since listing, rising to 1.0 at three years.
- **Breadth factor**: +3% per extra chain, up to ten.

Live protocols use market cap instead of the model. The board covers all 40 watchlist protocols plus every other genuine pre-token candidate and 60 live comparables — 258 rows.

## The dashboard

`dashboard/` is a static page (no network, no framework): sortable board, search, category / chain / scope filters, and a detail view per protocol with the model breakdown and farm steps. `main.ts` writes `board.json`, `data.js` and `dossier.json` to the output directory.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Node 22.18+ (the program runs its TypeScript as-is). Output: `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/`, `out/dossier.json`.

## Layout

- `main.ts` — entrypoint: read snapshot, build board, write outputs, copy dashboard and screenshots, write the dossier.
- `lib/radar.ts` — snapshot parsing, the value model, farm-step plans, board validation, the dashboard data script.
- `dashboard/` — the page: `index.html`, `app.css`, `app.js`.
- `screenshots/` — board, detail and filtered views.
- `vendor/makefun-board.ts` — the house dossier library (vendored from the kit).
