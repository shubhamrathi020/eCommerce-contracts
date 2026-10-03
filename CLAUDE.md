# eCommerce contracts: Claude Instructions

The shared contract between `../eCommerce` (frontend) and `../eCommerce-api` (backend): types, error codes and pure business rules. No framework code (no Angular, no Nest).

- Relative imports in `src` must end in `.js` (the ES-module build runs under plain Node).
- Run `pnpm verify` (typecheck, build, test) before committing.
- A change here affects both sides: bump `version`, tag it, then update both consumers. Never remove or rename an exported name without updating both repositories first.
- Never push; the owner pushes.
