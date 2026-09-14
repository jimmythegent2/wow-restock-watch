// Cloudflare Worker version of check.mjs. GitHub's scheduler never fired the
// cron workflow, so Cloudflare's cron trigger runs the check instead.
// Alerts once, then stays quiet for 6 hours (tracked in KV) so a restock
// doesn't buzz the phone every 5 minutes.

const PRODUCT_URL =
  'https://gear.blizzard.com/products/wowccl0012-world-of-warcraft-forever-collectors-edition';
const QUIET_SECONDS = 6 * 60 * 60;

async function notify(env, title, message, priority) {
  const res = await fetch(`https://ntfy.sh/${env.NTFY_TOPIC}`, {
    method: 'POST',
    body: message,
    headers: { Title: title, Priority: priority, Tags: 'shopping_cart', Click: PRODUCT_URL },
  });
  if (!res.ok) throw new Error(`ntfy responded ${res.status}`);
}

async function check(env) {
  const res = await fetch(`${PRODUCT_URL}.js`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (restock watcher)' },
  });
  if (!res.ok) throw new Error(`Gear Store responded ${res.status}`);
  const product = await res.json();
  const inStock = product.available || product.variants.some((v) => v.available);
  const line = `${new Date().toISOString()} ${inStock ? 'IN STOCK' : 'sold out'} ($${product.price / 100})`;
  await env.STATE.put('last-check', line);

  if (inStock && !(await env.STATE.get('alerted'))) {
    await notify(
      env,
      'WoW Forever CE is back in stock!',
      `$${product.price / 100} on the Blizzard Gear Store. Tap to buy before it's gone.`,
      'urgent',
    );
    await env.STATE.put('alerted', line, { expirationTtl: QUIET_SECONDS });
  }
  return line;
}

export default {
  async scheduled(_event, env, ctx) {
    // A failed check must still leave a trace on the status page.
    ctx.waitUntil(
      check(env).catch((err) =>
        env.STATE.put('last-check', `${new Date().toISOString()} ERROR ${err.message}`),
      ),
    );
  },
  // /check runs a check on demand (for an outside pinger, or testing); the
  // alert is still deduplicated, so hitting it repeatedly can't spam the phone.
  // Any other path just shows the last check.
  async fetch(request, env) {
    if (new URL(request.url).pathname === '/check') {
      try {
        return new Response(`Checked: ${await check(env)}\n`);
      } catch (err) {
        return new Response(`Check failed: ${err.message}\n`, { status: 502 });
      }
    }
    const last = (await env.STATE.get('last-check')) ?? 'no checks yet';
    return new Response(`Last check: ${last}\n`, { headers: { 'Content-Type': 'text/plain' } });
  },
};
