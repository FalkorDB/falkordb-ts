# Release Process

This document explains how to release a new version of `falkordb` to npm.

> **Quick answer**: create a GitHub Release whose tag is the new version, e.g. `7.1.0`. The tag sets
> the version, so no pull request bumps it, and npm publishing waits for CI to pass on it.

## How a release is published

`package.json` always holds the placeholder version `0.0.0-dev`. Creating a GitHub Release starts
these workflows:

1. **CI** (`.github/workflows/node.js.yml`) runs the whole suite on the released commit, against
   the newest FalkorDB 6.x and 4.x, on Node.js 20 and 22.
2. **Publish to npm** (`.github/workflows/publish.yml`) waits for that CI run, and publishes nothing
   unless it passes. Only a CI run started for this release counts, not one left over from an
   earlier release of the same tag. It then builds the package and sets its version from the tag
   (`npm version <tag> --no-git-tag-version`, with a leading `v` dropped). It publishes the package
   to npm with provenance, through npm trusted publishing, so no npm token is involved.
3. **Polish release notes** (`.github/workflows/release-notes.yml`) rewrites the notes that GitHub
   generated into ones written for users.

Merging to `main` or pushing a tag alone publishes nothing.

**Publish the release directly, without saving it as a draft first.** CI and Publish to npm start
on the `release: created` event. GitHub runs no workflow for a draft, and publishing a saved draft
sends `published` but not `created`, so a release that was a draft never reaches npm.

## Releasing a version

1. **Make sure CI passes on `main`.** See https://github.com/FalkorDB/falkordb-ts/actions.

2. **Pick the version.** Follow semantic versioning against the last release
   (https://github.com/FalkorDB/falkordb-ts/releases):
   - **Patch** (`7.0.1` → `7.0.2`): only bug fixes.
   - **Minor** (`7.0.1` → `7.1.0`): new features or options, backward compatible.
   - **Major** (`7.0.1` → `8.0.0`): breaking changes. Update [MIGRATION.md](MIGRATION.md) first.

3. **Create the release.** The tag is the bare version, with no `v` or `falkordb@` prefix. Check
   first that the tag does not exist yet: this prints nothing for a new version.

   ```bash
   git ls-remote --tags origin 7.1.0
   ```

   If it prints a commit, the tag is left over from an earlier attempt. `--target main` does not
   move an existing tag, so the release would publish that commit. Delete the tag
   (`git push origin :refs/tags/7.1.0`) unless it already points at the commit to release. Then:

   ```bash
   gh release create 7.1.0 --target main --title 7.1.0 --generate-notes
   ```

   Or, on https://github.com/FalkorDB/falkordb-ts/releases/new: create the tag `7.1.0` on `main`,
   title it `7.1.0`, click **Generate release notes**, then **Publish release**.

4. **Watch it publish.** On https://github.com/FalkorDB/falkordb-ts/actions, the CI run for the
   release and **Publish to npm** should both pass. Then check the new version is on npm:

   ```bash
   npm view falkordb version
   ```

### Beta versions

`publish.yml` runs `npm publish` without `--tag`, and npm 11 refuses to publish a prerelease
version such as `7.1.0-beta.1` that way ("You must specify a tag using --tag when publishing a
prerelease version"). A beta release therefore fails at the publish step, and nothing reaches npm.
Don't release one until `publish.yml` publishes prereleases under a dist-tag other than `latest`,
such as `beta`.

## Troubleshooting

### Nothing was published

If the release was saved as a draft before it was published, Publish to npm never ran (see above).
Delete the release and its tag, and create it again directly.

### Publish to npm failed at "Wait for CI to pass"

CI failed on the released commit, or did not finish within 55 minutes, so nothing was published.
Delete the release and its tag, fix the cause on `main`, and release the same version again:

```bash
gh release delete 7.1.0 --cleanup-tag
```

Once a version is on npm, it can't be published again, even after it is unpublished. A fix to a
published version needs a new one.

### Publish fails with `ENEEDAUTH`

npm trusted publishing matches the workflow's filename, `publish.yml`, against the publisher
registered for the `falkordb` package on npmjs.com. A renamed workflow, or a changed publisher
on npmjs.com, makes the publish fail. Ask an npm owner of the package to check the trusted publisher
settings.

## Checklist

- [ ] Everything intended for the release is merged to `main`, and CI passes there
- [ ] Breaking changes, if any, are in [MIGRATION.md](MIGRATION.md), and the version is a major
- [ ] The tag of the release is the bare version (e.g. `7.1.0`) and targets `main`
- [ ] **Publish to npm** passed, and `npm view falkordb version` prints the new version
