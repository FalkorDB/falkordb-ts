import { FalkorDB } from 'falkordb';

const db = await FalkorDB.connect()
console.log('Connected to FalkorDB')

const graph = db.selectGraph('myGraph')
const result = await graph.query('MATCH (n) RETURN n')

console.log(result)

db.close()