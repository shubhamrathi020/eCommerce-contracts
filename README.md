# @ecom/contracts

The shared contract between the shop's frontend (`eCommerce`) and backend (`eCommerce-api`):

- the data shapes both sides exchange (products, carts, orders, users, errors, admin and seller types),
- the error codes and limits (`ApiErrorCode`, `MAX_LINE_QUANTITY`, `ORDER_TRANSITIONS`, ...),
- the pure business rules that must give the same answer in the browser and on the server: cart pricing, promotions,
  returns, recommendations, analytics and marketplace commission.

It has no framework code (no Angular, no Nest), so either side can use it. If the browser and the server ever
disagreed about a price, it would be because they were not using the same copy of this package.

## Using it

Today the two repositories are siblings on disk and depend on it by path:

```jsonc
// in eCommerce/package.json and eCommerce-api/package.json
"@ecom/contracts": "link:../eCommerce-contracts"
```

After you push this repository, replace that with a git dependency so CI and Docker can install it
(pnpm builds it on install through the `prepare` script):

```jsonc
"@ecom/contracts": "github:<your-account>/eCommerce-contracts#v0.1.0"
```

Use a tag, never a branch, so a build is reproducible. A private npm registry (GitHub Packages) works too.

## Changing it

Change the contract here first, then bump the version, tag it, and update the two consumers.
A breaking change (a removed field, a changed rule) needs both sides updated before either is deployed.

```bash
pnpm install
pnpm verify      # typecheck, build, test
```

`pnpm build` produces `dist/index.js` (+ types) for ES-module consumers and `dist/index.cjs` for `require`.
