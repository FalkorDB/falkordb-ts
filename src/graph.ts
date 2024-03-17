import { RedisClientType } from 'redis';
import ResultSet from './resultset';

/**
 * FalkorDB Graph
 */
export default class Graph {

	private _graphId: string; // Graph ID
	private _labels: string[]; // List of node labels.
	private _relationshipTypes: string[]; // List of relation types.
	private _properties: string[]; // List of properties.

	private	_labelsPromise: Promise<string[]> | null; // used as a synchronization mechanizom for labels retrival
	private _propertyPromise: Promise<string[]> | null; // used as a synchronization mechanizom for property names retrival
	private _relationshipPromise: Promise<string[]> | null; // used as a synchronization mechanizom for relationship types retrival
	private _client: RedisClientType;
	
     /**
      * Creates a client to a specific graph
      * 
      * @param {string} graphId the graph id
      * @param {RedisClient} [client] Redis host or node_redis client or ioredis client
      */
	constructor(client: RedisClientType, graphId: string) {
		this._client = client;
		this._graphId = graphId;        // Graph ID
		this._labels = [];              // List of node labels.
		this._relationshipTypes = [];   // List of relation types.
		this._properties = [];          // List of properties.

		this._labelsPromise = null;        // used as a synchronization mechanizom for labels retrival
		this._propertyPromise = null;      // used as a synchronization mechanizom for property names retrival
		this._relationshipPromise = null;  // used as a synchronization mechanizom for relationship types retrival
    }

	/**
	 * Auxiliary function to extract string(s) data from procedures such as:
	 * db.labels, db.propertyKeys and db.relationshipTypes
	 * @param {ResultSet} resultSet - a procedure result set
     * @returns {string[]} strings array.
	 */
	_extractStrings(resultSet: ResultSet) {
		var strings: string[] = [];
		while (resultSet.hasNext()) {

			// TODO handle null values
			strings.push(resultSet.next().getString(0)?? "");
		}
		return strings;
	}

    /**
     * Transforms a parameter value to string.
     * @param {*} paramValue
     * @returns {string} the string representation of paramValue.
     */
	paramToString(paramValue: any) {
		if (paramValue == null) return "null";
		let paramType = typeof paramValue;
		if (paramType == "string") {
			let strValue = "";
            paramValue = paramValue.replace(/[\\"']/g, '\\$&');  
			if (paramValue[0] != '"') strValue += '"';
			strValue += paramValue;
			if (!paramValue.endsWith('"') || paramValue.endsWith("\\\"")) strValue += '"';
			return strValue;
		}
		if (Array.isArray(paramValue)) {
			let stringsArr = new Array(paramValue.length);
			for (var i = 0; i < paramValue.length; i++) {
				stringsArr[i] = this.paramToString(paramValue[i]);
			}
			return ["[", stringsArr.join(", "), "]"].join("");
		}
		return paramValue;
	}

	/**
	 * Extracts parameters from dictionary into cypher parameters string.
	 * @param {Map} params parameters dictionary.
	 * @return {string} a cypher parameters string.
	 */
	buildParamsHeader(params: Map<string, any>) {
		let paramsArray = ["CYPHER"];

		for (var key in params) {
			let value = this.paramToString(params.get(key));
			paramsArray.push(`${key}=${value}`);
		}
		paramsArray.push(" ");
		return paramsArray.join(" ");
	}

	/**
	 * Execute a Cypher query
     * @async
	 * @param {string} query Cypher query
	 * @param {Map} [params] Parameters map
	 * @returns {Promise<ResultSet>} a promise contains a result set
	 */
	query(query: string, params?: Map<string, any>) {
		return this._query("graph.QUERY", query, params);
	}

	/**
	 * Execute a Cypher readonly query
	 * @async
	 * @param {string} query Cypher query
	 * @param {Map} [params] Parameters map
	 *
	 * @returns {Promise<ResultSet>} a promise contains a result set
	 */
	readonlyQuery(query: string, params: Map<string, any>) {
		return this._query("graph.RO_QUERY", query, params);
	}

	/**
	 * Execute a Cypher query
	 * @private
	 * @async
	 * @param {'graph.QUERY'|'graph.RO_QUERY'} command
	 * @param {string} query Cypher query
	 * @param {Map} [params] Parameters map
	 *
	 * @returns {Promise<ResultSet>} a promise contains a result set
	 */
	async _query(command: string, query: string, params?: Map<string, any>) {
		if (params) {
			query = this.buildParamsHeader(params) + query;
		}
		var res = await this._client.sendCommand([
			command,
			this._graphId,
			query,
			"--compact"
		]);
		var resultSet = new ResultSet(this);
		return resultSet.parseResponse(res as any[]);
	}

	/**
	 * Deletes the entire graph
     * @async
	 * @returns {Promise<ResultSet>} a promise contains the delete operation running time statistics
	 */
	async deleteGraph() {
		const res = await this._client.sendCommand(["graph.DELETE", this._graphId]);
		//clear internal graph state
		this._labels = [];
		this._relationshipTypes = [];
		this._properties = [];
		var resultSet = new ResultSet(this);
		return resultSet.parseResponse(res as any[]);
	}

	/**
	 * Calls procedure
	 * @param {string} procedure Procedure to call
	 * @param {string[]} [args] Arguments to pass
	 * @param {string[]} [y] Yield outputs
	 * @returns {Promise<ResultSet>} a promise contains the procedure result set data
	 */
	callProcedure(procedure: string, args = new Array(), y = new Array()) {
		let q = "CALL " + procedure + "(" + args.join(",") + ")" + y.join(" ");
		return this.query(q);
	}

	/**
	 * Retrieves all labels in graph.
     * @async
	 */
	async labels() {
		if (this._labelsPromise == null) {
			this._labelsPromise = this.callProcedure("db.labels").then(
				response => {
					return this._extractStrings(response);
				}
			);
			this._labels = await this._labelsPromise;
			this._labelsPromise = null;
		} else {
			await this._labelsPromise;
		}
	}

	/**
	 * Retrieves all relationship types in graph.
     * @async
	 */
	async relationshipTypes() {
		if (this._relationshipPromise == null) {
			this._relationshipPromise = this.callProcedure(
				"db.relationshipTypes"
			).then(response => {
				return this._extractStrings(response);
			});
			this._relationshipTypes = await this._relationshipPromise;
			this._relationshipPromise = null;
		} else {
			await this._relationshipPromise;
		}
	}

	/**
	 * Retrieves all properties in graph.
     * @async
	 */
	async propertyKeys() {
		if (this._propertyPromise == null) {
			this._propertyPromise = this.callProcedure("db.propertyKeys").then(
				response => {
					return this._extractStrings(response);
				}
			);
			this._properties = await this._propertyPromise;
			this._propertyPromise = null;
		} else {
			await this._propertyPromise;
		}
	}

	/**
	 * Retrieves label by ID.
	 * @param {number} id internal ID of label. (integer)
	 * @returns {string} String label.
	 */
	getLabel(id: number) : string {
		return this._labels[id];
	}

	/**
	 * Retrieve all the labels from the graph and returns the wanted label
     * @async
	 * @param {number} id internal ID of label. (integer)
	 * @returns {Promise<string>} String label.
	 */
	async fetchAndGetLabel(id: number){
		await this.labels();
		return this._labels[id];
	}

	/**
	 * Retrieves relationship type by ID.
	 * @param {number} id internal ID of relationship type. (integer)
	 * @returns {string} relationship type.
	 */
	getRelationship(id: number) {
		return this._relationshipTypes[id];
	}

	/**
	 * Retrieves al the relationships types from the graph, and returns the wanted type
     * @async
	 * @param {number} id internal ID of relationship type. (integer)
	 * @returns {Promise<string>} String relationship type.
	 */
	async fetchAndGetRelationship(id: number) {
		await this.relationshipTypes();
		return this._relationshipTypes[id];
	}

	/**
	 * Retrieves property name by ID.
	 * @param {number} id internal ID of property. (integer)
	 * @returns {string} String property.
	 */
	getProperty(id: number) {
		return this._properties[id];
	}

	/**
	 * Retrieves al the properties from the graph, and returns the wanted property
     * @asyncTODO
	 * @param {number} id internal ID of property. (integer)
	 * @returns {Promise<string>} String property.
	 */
	async fetchAndGetProperty(id: number) {
		await this.propertyKeys();
		return this._properties[id];
	}
}