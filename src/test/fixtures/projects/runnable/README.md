# WinCC OA Runnable Test Project

A dummy runnable WinCC OA project used for integration tests.

## SQLite Databases

The `db/wincc_oa/sqlite/` directory containing `ident.sqlite`, `config.sqlite` and
`last_value.sqlite` is **generated** and not committed to the repository.

Run once after `npm install`:

```bash
npm run test:fixtures
# or directly:
node scripts/create-test-fixtures.js
```

This is also called automatically as part of `npm test` via the `pretest` hook.
