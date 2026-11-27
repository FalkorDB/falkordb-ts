# Contributing

## Running the tests

The tests need a FalkorDB server. The suites for clusters and sentinels need the Docker Compose
stacks in `docker/`, while the others run against any single server.

### Against one server

Start a server on a port of your own, so that a server you already run on 6379 is left alone,
and leave out the cluster and sentinel suites:

```bash
docker run -d --rm --name falkordb-test -p 16379:6379 falkordb/falkordb:latest
FALKORDB_HOST=127.0.0.1 FALKORDB_PORT=16379 npx jest --forceExit --testPathIgnorePatterns 'cluster|sentinel|Replicas'
docker rm -f falkordb-test
```

The test run starts by naming the server it found, for example:

```text
FalkorDB under test: graph module 60201, schema version counter, SCHEMA_HASH supported
```

### Against every stack

The Compose stacks bind fixed host ports (6379, 6380, 6381, 26379 to 26381, 17000 to 17005), and the
tests reach them by container name, so the names need entries in `/etc/hosts` that point at
`127.0.0.1`. See the `Add entries to the host file` step in `.github/workflows/node.js.yml`.

```bash
for stack in standalone sentinel cluster; do docker compose -f docker/$stack-compose.yml up -d; done
FALKORDB_HOST=127.0.0.1 FALKORDB_PORT=6379 npx jest --forceExit
```

## Server versions

The client supports FalkorDB 4.x and 6.x, and they behave differently. For example, 4.x versions the
schema of a graph with a hash of its names and 6.x with a counter, and only 6.2.0 and later answer
`SCHEMA_HASH`. CI therefore runs every suite on both lines: the newest 4.x release and `latest`
on pull requests, and `edge` with the newest 4.x every night.

`scripts/falkordb-image.sh` picks the image for a line, in CI as on your machine:

```bash
scripts/falkordb-image.sh 4      # the newest v4.x.y release, e.g. v4.22.5
scripts/falkordb-image.sh 6      # latest
scripts/falkordb-image.sh edge   # edge
```

The Compose stacks read the image tag from `FALKORDB_VERSION`:

```bash
export FALKORDB_VERSION=$(scripts/falkordb-image.sh 4)
docker compose -f docker/standalone-compose.yml up -d
```

To run CI on chosen lines, start the workflow by hand with `falkordb_lines`, e.g. `4,6,edge`, or
with `falkordb_image_tag` for one image.

**Run the tests on both lines before opening a pull request that changes how the client talks to
the server**: what it sends, or how it reads a reply.

### Tests that depend on the server

A test that holds on only some servers asserts what each server does. It never skips, or returns
early, on the others, so every leg runs all of it. Ask the server through `tests/serverVersion.ts`:

- `serverModuleVersion()` returns the `graph` module version, e.g. 42205 for 4.22.5. The `edge`
  build reports 999999.
- `serverAnswersSchemaHash()` asks the server whether it answers `SCHEMA_HASH`. A test of a feature
  should ask the server whether it has the feature, rather than compare versions.

`tests/globalSetup.ts` also records how the server versions a schema in `FALKORDB_SCHEMA_VERSION`
(`hash` on 4.x, `counter` on 6.x).
