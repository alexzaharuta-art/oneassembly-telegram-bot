import { checkMarketplace } from "./monitor.mjs";

const { products, changes } = await checkMarketplace();

console.log(`Products found: ${products.length}`);
console.log(`Changes found: ${changes.length}`);

for (const product of products.slice(0, 10)) {
  console.log(`- ${product.title}${product.price ? ` | ${product.price}` : ""}`);
}
