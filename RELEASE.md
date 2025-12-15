# Release Process

This document explains how to release a new version of `falkordb` to npm.

> **Quick Answer**: To trigger npm publish after merging a version bump PR, you need to **create a GitHub Release**. Merging to main alone is not enough. See [How to Trigger npm Publish](#how-to-trigger-npm-publish) below.

## Understanding the Publish Workflow

The npm publish process is automated via GitHub Actions but requires a **GitHub Release** to be created. Simply merging code to the `main` branch **will NOT** trigger a publish to npm.

### Why wasn't my merge published?

The CI workflow (`.github/workflows/node.js.yml`) contains a `publish-npm` job that only runs when:
- A GitHub Release is **created** (not just tagged)
- The workflow event is `release` with action `created`

A regular merge to main or creating a git tag alone will not trigger the publish workflow.

## How to Trigger npm Publish

### Option 1: Create a GitHub Release (Recommended)

1. **Ensure the version is updated** in `package.json` and `package-lock.json`
   - This should be done in a PR before creating the release
   - Example: Update version from `6.3.0` to `6.4.0`

2. **Merge the version bump PR to main**
   - The PR should only update version numbers
   - Wait for CI to pass on main

3. **Create a GitHub Release**
   - Go to: https://github.com/FalkorDB/falkordb-ts/releases/new
   - Choose or create a tag: `falkordb@6.4.0` (matches the format in `.release-it.json`)
   - Set the target: `main` branch
   - Release title: `falkordb@6.4.0` or `Release 6.4.0`
   - Add release notes describing the changes
   - Click **"Publish release"**

4. **Monitor the workflow**
   - Go to: https://github.com/FalkorDB/falkordb-ts/actions
   - The CI workflow will run with the `publish-npm` job included
   - Check that the build passes and npm publish succeeds

### Option 2: Using release-it (Alternative)

The repository includes `release-it` configuration (`.release-it.json`). To use it:

1. **Install release-it** (if not already installed):
   ```bash
   npm install -g release-it
   ```

2. **Run release-it**:
   ```bash
   release-it
   ```
   
   This will:
   - Bump the version in `package.json`
   - Create a git commit
   - Create a git tag (format: `falkordb@${version}`)
   - Push to GitHub

3. **Create a GitHub Release manually** (still required):
   - After release-it pushes the tag, you still need to create a GitHub Release from that tag
   - Follow step 3 from Option 1

## Troubleshooting

### The publish-npm job was skipped

**Symptom**: You see the CI workflow run but the `publish-npm` job shows as skipped.

**Cause**: The workflow was not triggered by a GitHub Release creation.

**Solution**: Create a GitHub Release as described in Option 1, step 3.

### Version mismatch between package.json and git tag

**Symptom**: The git tag shows `6.3.2` but `package.json` shows `6.4.0`.

**Example**: PR #446 merged with version bump to 6.4.0, but publish was skipped.

**Cause**: The version was updated in package.json but the corresponding GitHub Release/tag wasn't created with the matching version.

**Solution**: 
1. Create a new GitHub Release with the correct tag matching `package.json` version
   - For example, create a release with tag `falkordb@6.4.0` targeting the main branch
2. This will trigger the CI workflow with the `publish-npm` job
3. Ensure future releases follow the proper process to avoid version mismatches

### npm publish fails with authentication error

**Symptom**: The `publish-npm` job fails with `npm ERR! code ENEEDAUTH`.

**Cause**: The `NPM_TOKEN` secret is missing or invalid.

**Solution**: Contact repository administrators to ensure the `NPM_TOKEN` secret is configured in GitHub repository settings.

## Release Checklist

Before creating a release:

- [ ] All intended changes are merged to `main`
- [ ] CI is passing on `main`
- [ ] Version is updated in `package.json` and `package-lock.json`
- [ ] CHANGELOG or release notes are prepared (if applicable)
- [ ] You have the correct permissions to create releases

To publish:

- [ ] Create a GitHub Release with the correct tag (format: `falkordb@X.Y.Z`)
- [ ] Add meaningful release notes
- [ ] Monitor the CI workflow to ensure publish succeeds
- [ ] Verify the package is published on npm: https://www.npmjs.com/package/falkordb

## Quick Reference

- **Workflow file**: `.github/workflows/node.js.yml`
- **Release-it config**: `.release-it.json`
- **Tag format**: `falkordb@X.Y.Z` (e.g., `falkordb@6.4.0`)
- **Create releases**: https://github.com/FalkorDB/falkordb-ts/releases/new
- **View published versions**: https://www.npmjs.com/package/falkordb
