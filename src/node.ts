/**
 * A node within the graph.
 */
export default class Node {

    private _id: number;
    private _labels: string[];
    private _properties: Map<string, any>;

    /**
     * Builds a node object.
     *
     * @param {number} id - label id
     * @param {string[]} labels - node labels.
     * @param {Map} properties - properties map.
     */
    constructor(id: number, labels: string[], properties: Map<string, any>) {
        this._id = id;            //node's id - set by FalkorDB
        this._labels = labels;             //node's label
        this._properties = properties;   //node's list of properties (list of Key:Value)
    }

    public get id() {
        return this._id;
    }

    public get labelIds() {
        return this._labels;
    }

    public get propeties() {
        return this._properties;
    }

    /**
     * @returns {string} The string representation of the node.
     */
    toString() {
        return JSON.stringify(this);
    }
}