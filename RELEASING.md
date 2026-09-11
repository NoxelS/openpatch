# Releasing OpenPatch

OpenPatch uses a deliberately simple release policy: every pull request merged into `main` becomes the next zero-major minor release. For example, `0.0.1` becomes `0.1.0`, then `0.2.0`. Contributors never manually bump the package version.

## One-time setup

1. Create the Marketplace publisher at [Manage Publishers & Extensions](https://marketplace.visualstudio.com/manage/publishers/). Its ID is immutable. OpenPatch uses `NoelPascalSchwabenland` in `package.json`; change it before the first publish only if the Marketplace shows a different ID.
2. In GitHub repository settings, set **Actions → General → Workflow permissions** to **Read and write permissions**. The release workflow must commit the version bump and create its tag.
3. Protect `main`: require pull requests, at least one approving review, and the `CI / test-and-package` status check. Allow GitHub Actions to push the version-bump commit.
4. Create a repository secret named `VSCE_PAT`. It must be an Azure DevOps token limited to the Visual Studio Marketplace **Manage** scope. Do not commit, print, or pass this token by command line.

The current GitHub release workflow uses `VSCE_PAT` because it is the practical bridge for this repository. Microsoft has announced that global Azure DevOps PATs retire on 1 December 2026; migrate Marketplace publication to its [Microsoft Entra workload-identity flow](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) before that date. The normal CI and VSIX release steps remain unchanged.

## What happens after a merge

`.github/workflows/release-on-merge.yml` runs for each trusted push to `main`, including a merged pull request. It ignores its own `chore(release): ...` version-bump commit, so it cannot loop.

1. It increments `0.x.0` to the next `0.(x+1).0` version.
2. It runs the full test suite and packages a VSIX.
3. It commits the version change, creates the matching `v0.x.0` tag, and pushes both.
4. It publishes to the Visual Studio Marketplace when `VSCE_PAT` is available.
5. It creates a GitHub release with generated notes and attaches the tested VSIX.

Until `VSCE_PAT` exists, steps 1–3 and 5 still complete, so every merge remains downloadable from GitHub. Once the publisher setup is complete, use **Actions → Publish an existing release to Marketplace → Run workflow**, select an existing tag such as `v0.1.0`, and the workflow will re-test, re-package, and publish that exact tagged version.

## Maintainer recovery

If Marketplace publication fails after a tag has been created, do not merge an empty pull request merely to retry. Add or correct `VSCE_PAT`, then run **Publish an existing release to Marketplace** for the existing tag. The workflow confirms that the tag and `package.json` version match before publishing.
