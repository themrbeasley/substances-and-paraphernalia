# Contributing

See [CLAUDE.md](CLAUDE.md) for the architecture overview, command reference, and release flow. The notes here cover policies that aren't already captured there.

## Adding a new optional-module integration

When you add a new entry to `KNOWN_INTEGRATIONS` in [scripts/integrations/index.js](scripts/integrations/index.js), update [docs/INTEGRATION-LICENSES.md](docs/INTEGRATION-LICENSES.md) in the same change: fetch the integration's LICENSE, record the SPDX identifier, and document our compatibility posture (RECOMMEND / DROP / REQUIRE-USER-INSTALLED).
