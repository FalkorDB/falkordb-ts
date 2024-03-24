# falkordb-ts

[![Tests](https://img.shields.io/github/actions/workflow/status/falkordb/falkordb-ts/node.js.yml?branch=main)](https://github.com/falkordb/falkordb-ts/actions/workflows/node.js.yml)
[![Coverage](https://codecov.io/gh/falkordb/falkordb-ts/branch/main/graph/badge.svg?token=nNxm2N0Xrl)](https://codecov.io/gh/falkordb/falkordb-ts)
[![License](https://img.shields.io/github/license/falkordb/falkordb-ts.svg)](https://github.com/falkordb/falkordb-ts/blob/main/LICENSE)

[![Discord](https://img.shields.io/discord/1146782921294884966.svg?style=social&logo=discord)](https://discord.com/invite/99y2Ubh6tg)
[![Twitter](https://img.shields.io/twitter/follow/falkordb?style=social)](https://twitter.com/falkordb)

`falkordb` is a [FalkorDB](https://www.falkordb.com) client for Node.js.

## Installation

Start a falkordb via docker:

``` bash
docker run -p 6379:6379 -it falkordb/falkordb:latest
```

To install node falkordb, simply:

```bash
npm install falkordb
```

## Usage

### Basic Example

```typescript
import { FalkorDB } from 'falkordb';

const db = await FalkorDB.connect({
    username: 'myUsername',
    password: 'myPassword',
    socket: {
        host: 'localhost',
        port: 6379
    }
})

console.log('Connected to FalkorDB')

const graph = db.selectGraph('myGraph')

const result = await graph.query('MATCH (n) RETURN n')
console.log(result)

console.log(await db.list())
console.log(await db.info())

db.close()
```

#### `.close()`

Forcibly close a client's connection to FalkorDB immediately. Calling `close` will not send further pending commands to the Redis server, or wait for or parse outstanding responses.

```typescript
await client.close();
```
## License

This repository is licensed under the "MIT" license. See [LICENSE](LICENSE).
