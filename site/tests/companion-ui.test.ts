import { expect, test } from "bun:test";

import { gateReport, TOP_XP } from "../src/data/curve";
import { initCompanion } from "../src/scripts/companion";

// A deliberately small event/DOM harness exercises the shipped controller,
// without adding a browser implementation or changing production code.
class Node {
  textContent = "";
  value: string | number = "";
  hidden = false;
  disabled = false;
  className = "";
  dataset: Record<string, string> = {};
  children: Node[] = [];
  files: { size: number; text: () => Promise<string> }[] = [];
  handlers = new Map<string, ((event: { target: Node }) => unknown)[]>();
  addEventListener(
    name: string,
    handler: (event: { target: Node }) => unknown,
  ) {
    this.handlers.set(name, [...(this.handlers.get(name) ?? []), handler]);
  }
  append(...nodes: Node[]) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes: Node[]) {
    this.children = nodes;
  }
  async fire(name = "click") {
    for (const handler of this.handlers.get(name) ?? [])
      await handler({ target: this });
  }
  click() {}
}
test("snapshot controls, displayed gates and downloaded fragment agree; sandbox restores", async () => {
  const oldDocument = globalThis.document;
  const oldWindow = globalThis.window;
  const oldCreate = URL.createObjectURL;
  const nodes = new Map<string, Node>();
  const get = (selector: string) => {
    let node = nodes.get(selector);
    if (!node) {
      node = new Node();
      nodes.set(selector, node);
    }
    return node;
  };
  const success = get('[data-turn="success"]');
  success.dataset.turn = "success";
  const failure = get('[data-turn="failure"]');
  failure.dataset.turn = "failure";
  const root = {
    querySelector: get,
    querySelectorAll: (selector: string) =>
      selector === "[data-turn]"
        ? [success, failure]
        : [
            success,
            failure,
            get("[data-set-xp]"),
            get("[data-jump]"),
            get("[data-apply-gates]"),
          ],
  };
  let downloaded: Blob | null = null;
  try {
    Object.assign(globalThis, {
      document: { querySelector: () => root, createElement: () => new Node() },
      window: { setTimeout: () => 0 },
    });
    URL.createObjectURL = (blob) => {
      downloaded = blob as Blob;
      return "blob:fixture";
    };
    initCompanion();
    get("[data-gates]").value = "12, 24";
    await get("[data-apply-gates]").fire();
    const gates = [4, 8, 16];
    const encoded = JSON.stringify({
      schemaVersion: 1,
      xp: 100,
      levels: {
        maxLevel: 999,
        topXp: TOP_XP,
        evolutionGates: gates,
        gateXp: gateReport(gates),
      },
    });
    get("[data-file]").files = [
      { size: encoded.length, text: async () => encoded },
    ];
    await get("[data-file]").fire("change");
    expect(get("[data-gates]").value).toBe("4, 8, 16");
    expect(get("[data-gates]").disabled).toBe(true);
    expect(get("[data-manifest]").textContent).toContain("[4, 8, 16]");
    await get("[data-export]").fire();
    expect(downloaded).not.toBeNull();
    expect(
      JSON.parse(await (downloaded as unknown as Blob).text()).evopet
        .evolutionGates,
    ).toEqual(gates);
    await success.fire();
    expect(get("[data-xp]").textContent).toBe("100 total XP");
    await get("[data-return]").fire();
    expect(get("[data-gates]").value).toBe("12, 24");
    expect(get("[data-gates]").disabled).toBe(false);
    get("[data-xp-input]").value = String(Number.MAX_SAFE_INTEGER - 2);
    await get("[data-set-xp]").fire();
    await success.fire();
    expect(get("[data-status]").textContent).toContain("2 XP added");
    await success.fire();
    expect(get("[data-status]").textContent).toContain("0 XP added");
    expect(get("[data-status]").textContent).toContain("limit");
  } finally {
    Object.assign(globalThis, { document: oldDocument, window: oldWindow });
    URL.createObjectURL = oldCreate;
  }
});
