import {
  addTurn,
  MAX_SNAPSHOT_BYTES,
  parseGateInput,
  parseSnapshot,
  progress,
  type Snapshot,
} from "../data/companion";
import { DEFAULT_EVOLUTION_GATES, formatXp, gateReport } from "../data/curve";

export function initCompanion(): void {
  const root = document.querySelector<HTMLElement>("[data-companion]");
  if (!root) return;
  const find = <T extends HTMLElement>(selector: string): T => {
    const node = root.querySelector<T>(selector);
    if (!node) throw new Error(`Companion control missing: ${selector}`);
    return node;
  };
  const status = find("[data-status]");
  let sandboxXp = 0;
  let gates = [...DEFAULT_EVOLUTION_GATES];
  let snapshot: Snapshot | null = null;
  const say = (message: string, error = false) => {
    status.textContent = message;
    status.dataset.error = String(error);
  };
  const guard = (action: () => void) => {
    try {
      action();
    } catch (error) {
      say(
        error instanceof Error
          ? error.message
          : "This action could not be completed.",
        true,
      );
    }
  };
  const render = () => {
    const xp = snapshot?.xp ?? sandboxXp;
    const displayGates = snapshot?.gates ?? gates;
    const state = progress(xp, displayGates);
    find("[data-mode]").textContent = snapshot
      ? "Local ledger snapshot"
      : "Sandbox preview";
    find("[data-level]").textContent = String(state.level);
    find("[data-stage]").textContent = state.stage;
    find("[data-xp]").textContent = `${formatXp(xp)} total XP`;
    find("[data-level-progress]").textContent =
      state.ceiling === null
        ? "Highest level reached"
        : `${formatXp(xp - state.floor)} / ${formatXp(state.ceiling - state.floor)} to next level`;
    find<HTMLProgressElement>("[data-progress]").value = state.percent;
    find("[data-next]").textContent = state.next
      ? `${formatXp(state.next.xp - xp)} XP until ${state.next.to} · level ${state.next.gate}`
      : "Every evolution gate reached. The journey continues.";
    find("[data-snapshot-note]").hidden = !snapshot;
    find("[data-return]").hidden = !snapshot;
    const track = find("[data-track]");
    track.replaceChildren();
    for (const row of [
      { to: "egg", xp: 0, gate: 1 },
      ...gateReport(displayGates),
    ]) {
      const li = document.createElement("li");
      if (xp >= row.xp) li.className = "reached";
      const title = document.createElement("strong");
      title.textContent = row.to;
      const detail = document.createElement("span");
      detail.textContent = `L${row.gate} · ${formatXp(row.xp)}`;
      li.append(title, detail);
      track.append(li);
    }
    find<HTMLInputElement>("[data-xp-input]").value = String(xp);
    find("[data-manifest]").textContent =
      `"evopet": { "evolutionGates": [${displayGates.join(", ")}] }`;
    for (const button of root.querySelectorAll<HTMLButtonElement>(
      "[data-turn], [data-set-xp], [data-jump], [data-apply-gates]",
    ))
      button.disabled = !!snapshot;
    find<HTMLInputElement>("[data-gates]").value = displayGates.join(", ");
    find<HTMLInputElement>("[data-gates]").disabled = !!snapshot;
    find<HTMLInputElement>("[data-xp-input]").disabled = !!snapshot;
    const details = find("[data-snapshot-details]");
    details.replaceChildren();
    if (snapshot) {
      const metrics = document.createElement("div");
      metrics.className = "snapshot-metrics";
      for (const [key, value] of Object.entries(snapshot.stats)) {
        const item = document.createElement("span");
        item.textContent = `${key}: ${value}`;
        metrics.append(item);
      }
      for (const source of snapshot.sources) {
        const item = document.createElement("span");
        item.textContent = `${source.label}: ${formatXp(source.xp)} XP`;
        metrics.append(item);
      }
      details.append(metrics);
      const note = document.createElement("p");
      note.className = "field-help";
      note.textContent =
        "Source totals describe the whole ledger, while XP above follows the active pet when per-pet buckets exist. Names are discarded. Unattributed XP can include care or migrations.";
      details.append(note);
    }
  };
  root.querySelectorAll<HTMLButtonElement>("[data-turn]").forEach((button) => {
    button.addEventListener("click", () =>
      guard(() => {
        if (snapshot) return;
        const success = button.dataset.turn === "success";
        const previousXp = sandboxXp;
        sandboxXp = addTurn(sandboxXp, success ? "success" : "failure");
        const gained = sandboxXp - previousXp;
        render();
        say(
          `${success ? "Completed" : "Failed"} sandbox turn. ${gained} XP added.${gained === 0 ? " The sandbox numeric limit has been reached." : ""}`,
        );
      }),
    );
  });
  find("[data-set-xp]").addEventListener("click", () =>
    guard(() => {
      if (snapshot) return;
      const raw = find<HTMLInputElement>("[data-xp-input]").value;
      if (!/^\d+$/.test(raw))
        throw new Error("Enter a non-negative whole XP value.");
      const xp = Number(raw);
      progress(xp, gates);
      sandboxXp = xp;
      render();
      say("Sandbox updated. Your installed pet is unchanged.");
    }),
  );
  find("[data-jump]").addEventListener("click", () => {
    if (snapshot) return;
    const next = progress(sandboxXp, gates).next;
    if (next) {
      sandboxXp = next.xp;
      render();
      say(
        `Previewing ${next.to} at ${formatXp(next.xp)} XP. Artwork is unchanged.`,
      );
    } else say("All configured evolution gates are already reached.");
  });
  find("[data-apply-gates]").addEventListener("click", () =>
    guard(() => {
      if (snapshot) return;
      gates = parseGateInput(find<HTMLInputElement>("[data-gates]").value);
      render();
      say("Evolution gates applied to the sandbox.");
    }),
  );
  const forget = () => {
    request++;
    snapshot = null;
    find<HTMLInputElement>("[data-file]").value = "";
    render();
    say("Snapshot forgotten. Back to your sandbox.");
  };
  find("[data-return]").addEventListener("click", forget);
  find("[data-reset]").addEventListener("click", () => {
    request++;
    snapshot = null;
    sandboxXp = 0;
    gates = [...DEFAULT_EVOLUTION_GATES];
    find<HTMLInputElement>("[data-file]").value = "";
    find<HTMLInputElement>("[data-gates]").value = gates.join(", ");
    render();
    say("Sandbox reset. No installed progress changed.");
  });
  let request = 0;
  find<HTMLInputElement>("[data-file]").addEventListener(
    "change",
    async (event) => {
      const current = ++request;
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        if (file.size > MAX_SNAPSHOT_BYTES)
          throw new Error(
            "Snapshot is too large. Choose a file no larger than 4 MiB.",
          );
        const text = await file.text();
        if (current !== request) return;
        const parsed = parseSnapshot(text);
        snapshot = parsed;
        render();
        say(
          "Local snapshot opened. Only supported numbers are held in this tab. No file data was uploaded.",
        );
      } catch (error) {
        if (current !== request) return;
        find<HTMLInputElement>("[data-file]").value = "";
        say(
          error instanceof Error ? error.message : "Could not read this file.",
          true,
        );
      }
    },
  );
  find("[data-export]").addEventListener("click", () => {
    const blob = new Blob(
      [
        `${JSON.stringify({ evopet: { evolutionGates: snapshot?.gates ?? gates } }, null, 2)}\n`,
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "evopet-evolution.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    say(
      "Downloaded a manifest fragment. Merge it into your pet.json; stage art still needs to match the declared forms.",
    );
  });
  render();
}
