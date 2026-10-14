# Chinese Meme Launch Pipeline

Chinese trend discovery with an English dashboard, an X publishing adapter, and a BSC multi-wallet buy engine.

## Current behavior

- Weibo and Bilibili collectors preserve original Chinese titles.
- The dashboard uses English controls, source context and a launch-readiness panel.
- Context is explicitly marked unverified. Translation, meme explanation, real growth tracking and automated candidate selection are not implemented yet.
- The X adapter validates weighted character length, verifies the configured account and records a post intent before sending. An uncertain outcome blocks retries; a confirmed result is reusable after restart.
- The existing buy engine supports selected wallets, limits, simulation and durable transaction tracking. A second buy of the same token is rejected.
- Live deploy is disabled. The required `src/flap-deploy.ts` adapter is not implemented yet. No unattended launch worker is running.

## Planned sequence

1. Select and review a Chinese meme candidate using agreed examples.
2. Prepare a Chinese first post; validate using `twitter-text` (Chinese characters have weight 2; URLs have transformed length).
3. Publish from the verified X account and save the confirmed post ID and URL.
4. Upload the logo and metadata containing the confirmed post URL, then verify the uploaded metadata. Flap's skill documents `twitter` as a handle while its UI accepts a Twitter link; full post URL handling still needs an integration check.
5. Prepare, simulate and submit a Flap tax-token deployment. Record the signed transaction before broadcast, then verify the receipt and actual token address before buying.
6. Refresh balances and nonces, prepare the selected 10-wallet buy, broadcast and reconcile receipts. Parallel broadcasts do not guarantee atomic success or the same block.

A tweet can remain published if deployment fails. A deployment can succeed while some buys fail. Treat these as separate persisted stages; never retry a timeout blindly.

## Pending configuration

`launch.settings.json` records preparation mode, 2% buy tax, 2% sell tax and 10 target buy wallets. Revenue distribution (dividends or recipient), beneficiary, durations, buy budget and daily limits remain unset. No defaults silently choose these values.

Copy `.env.launch.example` into a local environment file only when connecting X and signing. The X adapter requires a user-context OAuth 2.0 token with `tweet.write`, `tweet.read` and `users.read`, plus the expected account ID. An open browser session alone does not provide an unattended API connection. Token refresh and the unattended worker are not implemented yet.

## Local development

Node.js 24 or newer is required.

```sh
npm ci
npm test
npm run build
# Existing terminal bot: check MODE and spending configuration before starting.
npm run dev
```

The radar launcher is independent of the trading bot:

```sh
cd chinese-meme-radar
./start.sh
```

The dashboard runs on port 5000 (Vite may select another free port); the API listens on `127.0.0.1:8000`.

Offline backend checks (from `chinese-meme-radar/backend`):

```sh
../venv/bin/python -m unittest discover -s tests -v
```

## Repository hygiene

Do not commit environment files, keystores, watch-wallet identities, encrypted exports, runtime databases, virtual environments or wallet diagnostic scripts. Import passwords are prompted locally and must never be placed in source. Runtime data stays in the original local folder.

Remote: https://github.com/hakkiayberk/flap_auto

Use `git pull --ff-only` before work and push reviewed source changes. GitHub hosting does not run the trading process; unattended execution needs a continuously running host.

## Integration sources

- [X create posts](https://docs.x.com/x-api/posts/create-post)
- [X counting characters](https://docs.x.com/fundamentals/counting-characters)
- [Flap launch reference](https://github.com/flap-sh/flap-skills/tree/main/launch-bnb-token-on-flap)
- [Flap Portal interface](https://github.com/flap-sh/FlapVaultExample/blob/main/src/flap/IPortal.sol)

## Reviewed naming references

The three supplied post/token pairs are stored in `chinese-meme-radar/backend/reference/examples.json` and displayed through `/api/examples`. They demonstrate a cultural entity (泡菜 / 김치), a named panda (萌兰), and a character extracted from a brand post (Black Shiba / 黑柴). These are observations, not verified causal links or profitability evidence. The first reference uses an older source post. Exact post-to-deployment latency is not established.

Chinese candidates preserve specific entities. English controls and explanations remain separate. Unknown subjects receive no invented fallback name; broad keyword matches require review, and ambiguous titles have no single candidate. The reviewed alias registry is small; generalized entity extraction and live X ingestion remain outstanding.

The reference pools display EWYB, FXIon and BABAB. The user selected native BNB for the first release; do not automatically copy reference pool assets. The first-post URL must be saved and verified in metadata, and brand source posts must never be represented as company endorsement of a token.
