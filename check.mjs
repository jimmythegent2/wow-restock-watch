// Checks the Blizzard Gear Store (a Shopify store) for the WoW: Forever
// Collector's Edition and pushes a phone alert through ntfy when it's buyable.
// Exits 0 when sold out, 10 when in stock (the workflow uses that to stop itself).

const PRODUCT_URL =
  'https://gear.blizzard.com/products/wowccl0012-world-of-warcraft-forever-collectors-edition';
const topic = process.env.NTFY_TOPIC;
const testMode = process.env.TEST_ALERT === 'true';

if (!topic) {
  console.error('NTFY_TOPIC is not set');
  process.exit(1);
}

async function notify(title, message, priority) {
  const res = await fetch(`https://ntfy.sh/${topic}`, {
    method: 'POST',
    body: message,
    headers: {
      Title: title,
      Priority: priority,
      Tags: 'shopping_cart',
      Click: PRODUCT_URL,
    },
  });
  if (!res.ok) throw new Error(`ntfy responded ${res.status}`);
}

if (testMode) {
  await notify('Restock watcher test', 'Alerts are working. Tap to open the product page.', 'default');
  console.log('Test alert sent');
  process.exit(0);
}

// Shopify serves product JSON at <product>.js, including live availability.
const res = await fetch(`${PRODUCT_URL}.js`, {
  headers: { 'User-Agent': 'Mozilla/5.0 (restock watcher)' },
});
if (!res.ok) {
  console.error(`Gear Store responded ${res.status}`);
  process.exit(1);
}
const product = await res.json();
const inStock = product.available || product.variants.some((v) => v.available);
console.log(`${product.title}: ${inStock ? 'IN STOCK' : 'sold out'} ($${product.price / 100})`);

if (inStock) {
  await notify(
    'WoW Forever CE is back in stock!',
    `$${product.price / 100} on the Blizzard Gear Store. Tap to buy before it's gone.`,
    'urgent',
  );
  process.exit(10);
}
