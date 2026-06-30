# Self-Hosting the Chat Widget Bundle (CDN migration plan)

> **Why this exists:** customer embeds load the widget from `cdn.jsdelivr.net/gh/PUNKU-AI/punku-embedded-chat@v1/...`. jsDelivr's GitHub (`/gh/`) backend has repeated, multi-hour 503 / timeout outages (e.g. three waves on 2026-06-30), and when it's down **every embedded widget on every customer site breaks at once** and we can do nothing — the URL points at jsDelivr's hostname, which we don't control. This plan moves delivery to a **PUNKU-controlled origin (S3 + CloudFront)** as the primary, with jsDelivr/githack kept only as automatic fallbacks. It also wires **automatic publish to S3 on every release**, so the bundle goes to GitHub *and* S3 with one tag.

---

## 0. Repository map (read this first)

Everything the widget touches lives across **two repos**. Both are checked out locally under `~/dev/Coding projects/`.

| Role | GitHub | Local path | What's here |
|---|---|---|---|
| **Widget (this repo)** | `PUNKU-AI/punku-embedded-chat` | `~/dev/Coding projects/punku-embedded-chat` | The `punku-chat` web component source, the webpack build, the release tags, and **this plan + the publish workflow** |
| **Main app** | `PUNKU-AI/PUNKU.AI` | `~/dev/Coding projects/PUNKU-AI/PUNKU.AI` | The app that **generates the embed snippet** handed to customers (see §4) |

### Build facts (this repo)
- Build command: `npm run build` → runs CRA build, then webpack bundles `build/static/js/main.*.js` into a **single self-contained file**.
- **The one and only CDN artifact:** `dist/build/static/js/bundle.min.js` (~3 MB) + `dist/build/static/js/bundle.min.js.LICENSE.txt`. No code-split chunks — hosting that one file is enough.
- Webpack output path is the default (`dist/`); see [`webpack.config.js`](./webpack.config.js).
- Releases are **manual today**: `git tag v1.0.x && git push --tags`. jsDelivr auto-serves the tag. Tags so far: `v1.0.0`–`v1.0.6`. The embed uses `@v1`, which jsDelivr resolves to the latest `v1.x.x`.

### Where the embed URL is hard-coded (must change in §4)
In **`PUNKU-AI/PUNKU.AI`**:
- `src/frontend/src/modals/apiModal/utils/get-widget-code.tsx` — the UI "copy embed code" button.
- `src/backend/base/langflow/api/v1/bookingkit_agents.py` — const `EMBEDDED_CHAT_SCRIPT_URL` (~line 42), used as `script_url` in the Bookingkit partner API.
- Docs/tests also reference the URL: `docs/bookingkit-*.md`, `src/backend/tests/unit/api/v1/test_bookingkit_agents.py`.

---

## 1. Target architecture

```
                         build on `git push --tags`  (GitHub Action, this repo)
 punku-embedded-chat ───────────────────────────────────────────────┐
   (source + tags)                                                   ▼
                                                        S3 bucket  s3://punku-cdn
                                                        ├── chat/v1/bundle.min.js        (floating: latest v1.x, short cache)
                                                        └── chat/v1.0.7/bundle.min.js    (pinned: immutable, 1y cache)
                                                                     ▲
                                                                     │ origin (OAC, private bucket)
                                                        CloudFront distribution + ACM cert
                                                                     │
                                                        https://cdn.punku.ai/chat/v1/bundle.min.js   ← PRIMARY embed URL
```

Customer embed loads the **primary** (our CloudFront URL) and falls back automatically to jsDelivr → githack if it ever hiccups (§4). Result: no single CDN can take the widget down again.

---

## 2. One-time AWS setup

Defaults below — confirm/adjust the values in **§6 Decisions** before running.

- **Account / region:** PUNKU AWS account; bucket region **`eu-central-1`** (EU customers). CloudFront is global. The ACM cert for CloudFront **must be in `us-east-1`**.
- **Domain:** `cdn.punku.ai` (we already run `app.punku.ai`, so DNS for `punku.ai` is ours).

**Checklist:**

1. **S3 bucket** `punku-cdn` in `eu-central-1`. Keep *Block Public Access ON* — serve only through CloudFront (OAC).
2. **ACM certificate** for `cdn.punku.ai` in **`us-east-1`** (DNS-validated).
3. **CloudFront distribution:**
   - Origin = the S3 bucket via **Origin Access Control (OAC)**.
   - Alternate domain (CNAME): `cdn.punku.ai`; attach the ACM cert.
   - **Compression: ON** (gzip + Brotli — a 3 MB JS file compresses to well under 1 MB).
   - Response-headers policy: `Access-Control-Allow-Origin: *` and `Cross-Origin-Resource-Policy: cross-origin` (widget loads cross-origin from customer sites).
   - Default cache behavior: respect origin `Cache-Control` (set per-object by the workflow).
4. **Bucket policy** granting the CloudFront OAC `s3:GetObject`.
5. **DNS:** `cdn.punku.ai` → the distribution domain (`dxxxx.cloudfront.net`).
6. **IAM deploy role (OIDC)** — so the GitHub Action assumes a role instead of storing static keys:
   - Add the GitHub OIDC provider (`token.actions.githubusercontent.com`) if not present.
   - Role `punku-cdn-deploy` trust policy restricted to this repo:
     ```json
     { "Condition": { "StringLike": {
         "token.actions.githubusercontent.com:sub": "repo:PUNKU-AI/punku-embedded-chat:*" } } }
     ```
   - Permissions (scoped to the bucket + distribution): `s3:PutObject` on `arn:aws:s3:::punku-cdn/chat/*` and `cloudfront:CreateInvalidation` on the distribution.
   - *(Fast alternative if OIDC setup is a blocker: create a scoped IAM user, store `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` as repo secrets, and swap the `configure-aws-credentials` step to use them.)*

---

## 3. Automatic publish on update (already wired)

The workflow is in this repo at **[`.github/workflows/publish-cdn.yml`](./.github/workflows/publish-cdn.yml)**. It is **dormant until configured** (guarded on the `CDN_DEPLOY_ROLE_ARN` variable), so it won't create failed runs before AWS is ready.

On `git push --tags` (e.g. `v1.0.7`) it:
1. `npm run build`
2. uploads the pinned immutable copy → `chat/v1.0.7/bundle.min.js` (1-year cache)
3. overwrites the floating copy → `chat/v1/bundle.min.js` (5-min cache)
4. invalidates the floating path on CloudFront

**Activate it** by adding these **repo variables** (Settings → Secrets and variables → Actions → *Variables*):

| Variable | Example |
|---|---|
| `CDN_DEPLOY_ROLE_ARN` | `arn:aws:iam::<ACCOUNT_ID>:role/punku-cdn-deploy` |
| `CDN_AWS_REGION` | `eu-central-1` |
| `CDN_BUCKET` | `punku-cdn` |
| `CDN_CLOUDFRONT_ID` | `<DISTRIBUTION_ID>` |

GitHub keeps publishing to GitHub tags exactly as before; this just **adds** the S3 push. To backfill the current release once configured, run the workflow manually (`workflow_dispatch`) with `tag: v1.0.6`.

---

## 4. Switch the embed snippet (main app: `PUNKU-AI/PUNKU.AI`)

Make our CloudFront URL the **primary**, jsDelivr/githack the **fallbacks**, via a tiny loader with a watchdog (today's failures are *timeouts*, so a plain `onerror` isn't enough).

**Final generated snippet:**
```html
<script>
(function () {
  var SOURCES = [
    "https://cdn.punku.ai/chat/v1/bundle.min.js",                                                       // PRIMARY (ours)
    "https://cdn.jsdelivr.net/gh/PUNKU-AI/punku-embedded-chat@v1/dist/build/static/js/bundle.min.js",   // fallback 1
    "https://raw.githack.com/PUNKU-AI/punku-embedded-chat/v1.0.6/dist/build/static/js/bundle.min.js"    // fallback 2
  ];
  function load(i) {
    if (i >= SOURCES.length) return;
    var done = false, s = document.createElement("script");
    s.src = SOURCES[i]; s.async = true;
    var t = setTimeout(function () { if (!done) { done = true; load(i + 1); } }, 4000);
    s.onload  = function () { done = true; clearTimeout(t); };
    s.onerror = function () { if (!done) { done = true; clearTimeout(t); load(i + 1); } };
    document.head.appendChild(s);
  }
  load(0);
})();
</script>
<punku-chat ...></punku-chat>
```

Files to update (and their tests/docs):
- `src/frontend/src/modals/apiModal/utils/get-widget-code.tsx`
- `src/backend/base/langflow/api/v1/bookingkit_agents.py` (`EMBEDDED_CHAT_SCRIPT_URL` + the snippet builder)
- `docs/bookingkit-partner-api.md`, `docs/bookingkit-widget-config-api.md`, and `src/backend/tests/unit/api/v1/test_bookingkit_agents.py`

After changes: `make format_backend && make lint` (repo standard: 0 mypy errors), and run `test_bookingkit_agents.py`.

---

## 5. Cut over existing customers + monitor

- **In-the-wild embeds can't be fixed remotely** — they hard-code `cdn.jsdelivr.net`, a hostname we don't control. They must re-paste the new snippet.
- **Sites we control** (Daniel has access to ~2): paste the §4 snippet now for immediate relief.
- **High-value customers** to push the new snippet to: Swarovski, PS.SPEICHER, TimeRide, Bookingkit partners.
- **Better Stack monitor:** currently checks the jsDelivr URL directly — repoint it to `https://cdn.punku.ai/chat/v1/bundle.min.js` **after** the origin is live, so it reflects what we actually serve.

---

## 6. Decisions to confirm before executing
- Domain: `cdn.punku.ai`? (else pick the host)
- Bucket name / region: `punku-cdn` / `eu-central-1`?
- Auth: OIDC role (recommended) vs static IAM keys?
- Who provisions AWS (S3/CloudFront/ACM/IAM) — Daniel via console, or IaC (Terraform/CloudFormation)?

## 7. Recommended follow-up (separate from this migration)
The bundle is **~3 MB** — heavy for an embed, and it's what makes cold-fetch CDN recovery fragile. Worth code-splitting / dropping unused deps (e.g. `rehype-mathjax`) and enabling Brotli at the edge (CloudFront §2.3 already does the latter). Tracked separately from this CDN move.
