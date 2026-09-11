# Contributing to OpenPatch

Thanks for helping improve OpenPatch. By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before opening a pull request

- Search existing issues and pull requests first.
- Keep each pull request focused on one user-visible change or repair.
- Explain the problem, the chosen approach, and any behavior or privacy impact.
- Add or update tests when behavior changes.
- Do not add telemetry, hosted services, or new outbound data flows without an explicit issue and documentation update.

## Local checks

Use Node.js 22 or later:

```bash
npm ci
npm test
npm run package:vsix
```

`npm test` compiles TypeScript, bundles the extension, runs linting, and starts the VS Code extension-host tests. Test the generated VSIX in a real VS Code profile when changing activation, commands, settings, or patch behavior.

## Style and compatibility

- Keep the extension free of runtime dependencies unless there is a clear user benefit.
- Preserve the configured-endpoint model: users control where their document data is sent.
- Maintain the declared VS Code compatibility range, or explicitly update it with testing evidence.
- Update `README.md`, `CHANGELOG.md`, and security/privacy text when public behavior changes.

## Pull request review and release

Merge only reviewed pull requests. Each pull request merged into `main` triggers the release workflow, which bumps the minor zero-major version (`0.x.0`), creates a tag and GitHub release, and publishes to the Marketplace when publishing credentials are configured. Do not edit the package version in an ordinary feature pull request.
