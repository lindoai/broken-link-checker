# Broken Link Checker

Check outbound and internal links from a page for broken URLs and errors.

## API

```
GET /api/check?url=https://example.com
```

Returns JSON with total links found, number checked, broken count, redirect count, and detailed results for each link.

## Deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/lindoai/broken-link-checker)

## Environment

- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
