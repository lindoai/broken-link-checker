import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { parseHTML } from 'linkedom';
import { readTurnstileTokenFromUrl, verifyTurnstileToken } from '../../_shared/turnstile';
import { renderTextToolPage, turnstileSiteKeyFromEnv } from '../../_shared/tool-page';

type Env = { Bindings: { TURNSTILE_SITE_KEY?: string; TURNSTILE_SECRET_KEY?: string } };

const app = new Hono<Env>();
app.use('/api/*', cors());

app.get('/', (c) =>
  c.html(
    renderTextToolPage({
      title: 'Broken Link Checker',
      description: 'Check outbound and internal links from a page for broken URLs and errors.',
      endpoint: '/api/check',
      sample: '{ "url": "https://example.com", "totalLinks": 25, "checked": 25, "broken": 2, "results": [...] }',
      siteKey: turnstileSiteKeyFromEnv(c.env),
      buttonLabel: 'Check',
      toolSlug: 'broken-link-checker',
    })
  )
);

app.get('/health', (c) => c.json({ ok: true }));

app.get('/api/check', async (c) => {
  const captcha = await verifyTurnstileToken(
    c.env,
    readTurnstileTokenFromUrl(c.req.url),
    c.req.header('CF-Connecting-IP')
  );
  if (!captcha.ok) return c.json({ error: captcha.error }, 403);

  const normalized = normalizeUrl(c.req.query('url') ?? '');
  if (!normalized) return c.json({ error: 'A valid http(s) URL is required.' }, 400);

  const html = await fetchHtml(normalized);
  if (!html) return c.json({ error: 'Failed to fetch page.' }, 502);

  const { document } = parseHTML(html);
  const anchors = document.querySelectorAll('a[href]');
  const seen = new Set<string>();
  const links: string[] = [];

  for (const a of anchors) {
    const href = (a as any).getAttribute('href')?.trim();
    if (!href) continue;
    if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:') || href === '#' || href.startsWith('#')) continue;

    let absolute: string;
    try {
      absolute = new URL(href, normalized).toString();
    } catch {
      continue;
    }

    if (!seen.has(absolute)) {
      seen.add(absolute);
      links.push(absolute);
    }
    if (links.length >= 50) break;
  }

  const results = await Promise.all(links.map((href) => checkLink(href)));

  const brokenCount = results.filter((r) => r.type === 'broken').length;
  const redirectCount = results.filter((r) => r.type === 'redirect').length;

  return c.json({
    url: normalized,
    totalLinks: anchors.length,
    checked: links.length,
    broken: brokenCount,
    redirects: redirectCount,
    results,
  });
});

async function checkLink(href: string): Promise<{ href: string; status: number; statusText: string; type: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const r = await fetch(href, {
      method: 'HEAD',
      redirect: 'manual',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const status = r.status;
    const statusText = r.statusText || '';
    let type = 'ok';
    if (status >= 300 && status < 400) type = 'redirect';
    else if (status >= 400) type = 'broken';

    return { href, status, statusText, type };
  } catch {
    return { href, status: 0, statusText: 'Network error or timeout', type: 'error' };
  }
}

async function fetchHtml(url: string) {
  const r = await fetch(url, {
    headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'Lindo Free Tools/1.0 (+https://lindo.ai/tools)' },
  }).catch(() => null);
  return r?.ok ? r.text() : null;
}

function normalizeUrl(value: string): string | null {
  try {
    return new URL(value.startsWith('http') ? value : `https://${value}`).toString();
  } catch {
    return null;
  }
}

export default app;
