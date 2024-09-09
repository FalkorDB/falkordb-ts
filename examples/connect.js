import { FalkorDB } from 'falkordb';

const db = await FalkorDB.connect({
    // username: 'myUsername',
    // password: 'myPassword',
    socket: {
        host: 'localhost',
        port: 26379
    }
})
db.on('error', console.error)

console.log('Connected to FalkorDB')

const graph = db.selectGraph('myGraph')

await graph.query(`CREATE (:Rider {name:'Valentino Rossi'})-[:rides]->(:Team {name:'Yamaha'}),
        (:Rider {name:'Dani Pedrosa'})-[:rides]->(:Team {name:'Honda'}),
        (:Rider {name:'Andrea Dovizioso'})-[:rides]->(:Team {name:'Ducati'})`)

result = await graph.query(`MATCH (r:Rider)-[:rides]->(t:Team) 
                            WHERE t.name = $name RETURN r.name`, 
                            {params: {name: 'Yamaha'}})
                            
console.log(result) // Valentino Rossi

console.log(await db.list())
console.log(await db.info())
console.log(await db.connection.info())

db.close()
