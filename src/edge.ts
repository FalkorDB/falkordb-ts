import Node from "./node";

/**
 * An edge connecting two nodes.
 */
export default class Edge {

    private _id: number;
    private _relationshipType: string;
    private _srcNode: Node;
    private _destNode: Node;
    private _properties: Map<string, any>;

    /**
     * Builds an Edge object.
     * @param {Node} srcNode - Source node of the edge.
     * @param {string} relationshipType - Relationship type of the edge.
     * @param {Node} destNode - Destination node of the edge.
     * @param {Map} properties - Properties map of the edge.
     */
    constructor(id: number, srcNode: Node, relationshipType: string, destNode: Node, properties: Map<string, any>) {
        this._id = id;            //edge's id - set by RedisGraph
        this._relationshipType = relationshipType;       //edge's relationship type
        this._srcNode = srcNode;         //edge's source node
        this._destNode = destNode;       //edge's destination node
        this._properties = properties;   //edge's list of properties (list of Key:Value)
    }

    public get id() {
        return this._id;
    }

    public get relationshipId() {
        return this._relationshipType;
    }

    public get srcNode() {
        return this._srcNode;
    }

    public get destNode() {
        return this._destNode;
    }

    public get properties() {
        return this._properties;
    }

    /**
     * @returns The string representation of the edge.
     */
    toString() {
        return JSON.stringify(this);
    }
}