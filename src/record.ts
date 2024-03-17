/**
 * Hold a query record
 */
export default class Record {

	private _header: string[];
	private _values: object[];

	/**
     * Builds a Record object
	 *
     * @param {string[]} header 
     * @param {object[]} values 
     */
	constructor(header: string[], values: object[]) {
		this._header = header;
		this._values = values;
	}

    /**
     * Returns a value of the given schema key or in the given position.
     * @param {string | number} key (integer)
     * @returns {object} Requested value.
     */
	get(key: string|number): object {
		const index = typeof key === "string" ? this._header.indexOf(key) : key;
		return this._values[index];
	}

    /**
     * Returns a string representation for the value of the given schema key or in the given position.
     * @param {string | number} key (integer)
     * @returns {string} Requested string representation of the value.
     */
	getString(key: string|number) {
		const index = typeof key === "string" ? this._header.indexOf(key) : key
		const value = this._values[index];
		if (value !== undefined && value !== null) {
			return value.toString();
		}

		return null;
	}

    /**
     * @returns {string[]} The record header - List of strings.
     */
	keys() {
		return this._header;
	}

    /**
     * @returns {object[]} The record values - List of values.
     */
	values() {
		return this._values;
	}

    /**
     * Returns if the header contains a given key.
     * @param {string} key 
     * @returns {boolean} true if header contains key.
     */
	containsKey(key: string) {
		return this._header.includes(key);
	}

    /**
     * @returns {number} The amount of values in the record. (integer)
     */
	size() {
		return this._header.length;
	}
}