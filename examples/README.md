# FalkorDB: Examples

This folder contains example scripts showing how to use `falkordb` in different scenarios.

| File Name                      | Description  |
|--------------------------------|-----------------------------------------------------------------|
| `conenct.js`                   | Simple connect example                                                   |

## Contributing

We'd love to see more examples here. If you have an idea that you'd like to see included here, submit a Pull Request and we'll be sure to review it! Don't forget to check out our [contributing guide](../CONTRIBUTING.md).

## Setup

To set up the examples folder so that you can run an example / develop one of your own:

```
$ git clone https://github.com/falkordb/falkordb-ts.git
$ cd falkordb-ts
$ npm install -ws && npm run build-all
$ cd examples
$ npm install
```

### Example Template

Here's a starter template for adding a new example, imagine this is stored in `do-something.js`:

```javascript
// This comment should describe what the example does
// and can extend to multiple lines.
import { FalkorDB } from 'falkordb';

const db = await FalkorDB.connect()

// Add your example code here...

await db.quit();
```