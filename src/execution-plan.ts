/**
 * Structured views of the plans returned by `GRAPH.EXPLAIN` and
 * `GRAPH.PROFILE`, which describe one operation per line and convey nesting
 * by indentation:
 *
 *     Results
 *         Project
 *             Conditional Traverse | (a)->(b)
 *                 Node By Label Scan | (a:A)
 *
 * Profile lines also end with the operation's runtime statistics, e.g.
 * `| Records produced: 4, Execution time: 0.001200 ms`.
 */

const INDENT = "    ";
// Matched against the text after a line's last `|` only: anchored at both
// ends so it runs in linear time on any input
const PROFILE_STATS =
  /^\s*Records produced: (\d+),\s*Execution time: (\d+(?:\.\d+)?) ms$/;

/** A single operation of an execution plan and the operations feeding it. */
export class Operation {
  /** The operation's name, e.g. `Conditional Traverse` */
  readonly name: string;
  /** What follows the `|` on the plan line, e.g. `(a)->(b)`, if anything */
  readonly args?: string;
  /** How many records the operation produced (profile only) */
  readonly recordsProduced?: number;
  /** How long the operation ran, in milliseconds (profile only) */
  readonly executionTime?: number;
  /** The operations feeding this one, in plan order */
  readonly children: Operation[] = [];

  constructor(
    name: string,
    args?: string,
    recordsProduced?: number,
    executionTime?: number
  ) {
    this.name = name;
    this.args = args;
    this.recordsProduced = recordsProduced;
    this.executionTime = executionTime;
  }

  /** Parses one plan line, ignoring its indentation. */
  static fromLine(line: string): Operation {
    let text = line.trim();
    let recordsProduced: number | undefined;
    let executionTime: number | undefined;

    const last = text.lastIndexOf("|");
    const stats = last === -1 ? null : PROFILE_STATS.exec(text.slice(last + 1));
    if (stats) {
      recordsProduced = parseInt(stats[1], 10);
      executionTime = parseFloat(stats[2]);
      text = text.slice(0, last).trimEnd();
    }

    // Names never contain a `|`, while arguments may (e.g. `(a:A|B)`)
    const separator = text.indexOf("|");
    const name = (separator === -1 ? text : text.slice(0, separator)).trim();
    const args = separator === -1 ? undefined : text.slice(separator + 1).trim();

    return new Operation(name, args || undefined, recordsProduced, executionTime);
  }

  /** The operation as it appears in an explain plan, e.g. `Filter` */
  toString(): string {
    return this.args === undefined ? this.name : `${this.name} | ${this.args}`;
  }
}

/** The operation tree of a query, as returned by `Graph.explain`/`Graph.profile`. */
export class ExecutionPlan implements Iterable<Operation> {
  /** The plan lines exactly as the server returned them */
  readonly steps: readonly string[];
  /** The operation producing the query's result */
  readonly root: Operation;

  constructor(steps: readonly string[]) {
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new TypeError("An execution plan must be a non-empty array of lines");
    }

    this.steps = steps;

    // stack[level] is the latest operation seen at that depth, so the parent
    // of an operation at depth `level` is always stack[level - 1]
    const stack: Operation[] = [];
    steps.forEach((line, index) => {
      const spaces = line.length - line.trimStart().length;
      const level = spaces / INDENT.length;
      const valid =
        Number.isInteger(level) &&
        (index === 0 ? level === 0 : level > 0 && level <= stack.length);
      if (!valid) {
        throw new Error(`Malformed execution plan at line ${index}: "${line}"`);
      }

      const operation = Operation.fromLine(line);
      if (level > 0) {
        stack[level - 1].children.push(operation);
      }
      stack.length = level;
      stack.push(operation);
    });

    this.root = stack[0];
  }

  /** All operations named `name`, in plan order. */
  collectOperations(name: string): Operation[] {
    return [...this].filter((operation) => operation.name === name);
  }

  /** Iterates over every operation, parents before their children. */
  *[Symbol.iterator](): Iterator<Operation> {
    const pending: Operation[] = [this.root];
    while (pending.length > 0) {
      const operation = pending.pop()!;
      yield operation;
      for (let i = operation.children.length - 1; i >= 0; i--) {
        pending.push(operation.children[i]);
      }
    }
  }

  /** The plan as indented lines, without profile statistics. */
  toString(): string {
    const lines: string[] = [];
    const render = (operation: Operation, level: number) => {
      lines.push(INDENT.repeat(level) + operation.toString());
      operation.children.forEach((child) => render(child, level + 1));
    };
    render(this.root, 0);
    return lines.join("\n");
  }
}
