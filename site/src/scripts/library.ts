/**
 * The /library page's behaviour: fetch the public index, render exactly what
 * came back, and be explicit about every state that is not "here are the pets".
 *
 * Rules this file holds to, from the design handoff §5:
 *  - no placeholder or invented rows, ever: a row is rendered only from a pet
 *    the API sent;
 *  - capability is text plus a shape (the badge), never colour alone;
 *  - loading is six skeleton cards, not a spinner-only screen;
 *  - error, empty-library and filtered-empty are three different, reachable
 *    states;
 *  - at most 60 cards are drawn, and when the index is larger the page says so
 *    rather than pretending it showed everything.
 */

import {
  LIBRARY_ENDPOINT,
  declaredGates,
  fetchManifest,
  manifestUrl,
  shortDate,
  statusText,
  type ManifestPayload,
  type ManifestPet,
} from './manifest';

const PAGE_LIMIT = 60;

type Filter = 'all' | 'capable' | 'stock';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function badge(pet: ManifestPet): HTMLElement {
  const span = el('span', pet.capable ? 'badge badge--capable' : 'badge badge--stock');
  span.textContent = pet.capable ? 'Evolving' : 'Stock';
  span.title = pet.capable
    ? 'Declares an evopet block, so it evolves'
    : 'No evopet block: an EvoPet-compatible package that does not evolve';
  return span;
}

function gateChips(pet: ManifestPet): HTMLElement | null {
  if (!pet.capable) return null;
  const gates = declaredGates(pet);
  if (gates.length === 0) {
    return el('p', 'pet-install', 'Capable, with no evolutionGates declared in its evopet block.');
  }
  const list = el('ul', 'gates');
  list.setAttribute('aria-label', `Declared evolution gates for ${pet.slug}`);
  for (const gate of gates) {
    const item = el('li');
    item.appendChild(el('span', 'gate-chip', `L${gate}`));
    list.appendChild(item);
  }
  return list;
}

function detail(pet: ManifestPet): HTMLElement {
  const box = el('div', 'pet-detail');
  box.hidden = true;

  const preview = el('img');
  preview.src = pet.spritesheetUrl;
  preview.alt = `${pet.displayName} (${pet.slug}) sprite atlas: the published 1536×1872 sheet`;
  preview.width = 260;
  preview.height = 317;
  preview.loading = 'lazy';
  box.appendChild(preview);

  const rows: [string, string][] = [
    ['spritesheetUrl', pet.spritesheetUrl],
    ['petJsonUrl', pet.petJsonUrl],
    ['version', pet.version],
    ['updatedAt', pet.updatedAt],
  ];
  // This list is laid out by `.pet-detail dl` in the stylesheet, so the spacing
  // lives with the rest of the rhythm instead of inline here.
  const dl = el('dl', 'pet-meta');
  for (const [key, value] of rows) {
    const dt = el('dt', 'mono-label', key);
    const dd = el('dd', 'num');
    dd.textContent = value || '—';
    dl.append(dt, dd);
  }
  box.appendChild(dl);
  return box;
}

function card(pet: ManifestPet): HTMLLIElement {
  const item = el('li', 'pet-card');

  const head = el('div', 'pet-head');
  if (pet.thumbnailUrl) {
    const thumb = el('img', 'pet-thumb');
    thumb.src = pet.thumbnailUrl;
    thumb.alt = `Thumbnail of ${pet.displayName}, published slug ${pet.slug}`;
    thumb.width = 72;
    thumb.height = 72;
    thumb.loading = 'lazy';
    head.appendChild(thumb);
  } else {
    const missing = el('p', 'pet-thumb pet-thumb--missing', 'no thumbnail');
    head.appendChild(missing);
  }

  const title = el('div');
  const name = el('h3', 'pet-name', pet.displayName);
  title.appendChild(name);
  title.appendChild(el('span', 'pet-slug', pet.slug));
  head.appendChild(title);
  item.appendChild(head);

  const meta = el('div', 'pet-meta');
  meta.appendChild(el('span', 'gate-chip', `v${pet.version}`));
  const updated = el('span', '', `updated ${shortDate(pet.updatedAt)}`);
  meta.appendChild(updated);
  meta.appendChild(badge(pet));
  item.appendChild(meta);

  const chips = gateChips(pet);
  if (chips) item.appendChild(chips);

  const links = el('div', 'pet-links');
  const petJson = el('a', '', 'pet.json');
  petJson.href = pet.petJsonUrl;
  petJson.rel = 'noopener noreferrer';
  petJson.setAttribute('data-external', '');
  const sheet = el('a', '', 'spritesheet');
  sheet.href = pet.spritesheetUrl;
  sheet.rel = 'noopener noreferrer';
  sheet.setAttribute('data-external', '');
  links.append(petJson, sheet);
  item.appendChild(links);

  const detailId = `pet-detail-${pet.slug}`;
  const toggle = el('button', 'chip', 'Details');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', detailId);
  const expanded = detail(pet);
  expanded.id = detailId;
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
    expanded.hidden = open;
    toggle.textContent = open ? 'Details' : 'Hide details';
  });
  item.appendChild(toggle);
  item.appendChild(expanded);

  const install = el('p', 'pet-install');
  install.appendChild(
    el('span', '', 'Install it: drop the package into ~/.petdex/pets/ and select it in the app. '),
  );
  const how = el('a', '', 'Publishing docs');
  how.href = '/docs#library';
  install.appendChild(how);
  item.appendChild(install);

  return item;
}

export function initLibrary(): void {
  const root = document.querySelector<HTMLElement>('[data-library]');
  if (!root) return;

  const skeletonList = root.querySelector<HTMLElement>('[data-skeletons]');
  const grid = root.querySelector<HTMLUListElement>('[data-grid]');
  const error = root.querySelector<HTMLElement>('[data-error]');
  const errorReason = root.querySelector<HTMLElement>('[data-error-reason]');
  const empty = root.querySelector<HTMLElement>('[data-empty]');
  const filteredEmpty = root.querySelector<HTMLElement>('[data-filtered-empty]');
  const status = root.querySelector<HTMLElement>('[data-status]');
  const indexMeta = root.querySelector<HTMLElement>('[data-index-meta]');
  const truncated = root.querySelector<HTMLElement>('[data-truncated]');
  const search = root.querySelector<HTMLInputElement>('[data-search]');
  const retry = root.querySelector<HTMLButtonElement>('[data-retry]');
  const clear = root.querySelector<HTMLButtonElement>('[data-clear-filters]');
  const chips = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-filter]'));

  if (!grid || !status) return;

  let payload: ManifestPayload | null = null;
  let filter: Filter = 'all';
  let query = '';

  const show = (node: HTMLElement | null, visible: boolean) => {
    if (node) node.hidden = !visible;
  };

  const matching = (): ManifestPet[] => {
    if (!payload) return [];
    const needle = query.trim().toLowerCase();
    return payload.pets.filter((pet) => {
      if (filter === 'capable' && !pet.capable) return false;
      if (filter === 'stock' && pet.capable) return false;
      if (!needle) return true;
      return (
        pet.slug.toLowerCase().includes(needle) || pet.displayName.toLowerCase().includes(needle)
      );
    });
  };

  const render = () => {
    if (!payload) return;
    const all = matching();
    const shown = all.slice(0, PAGE_LIMIT);

    grid.replaceChildren(...shown.map(card));
    grid.hidden = shown.length === 0;

    const filtering = filter !== 'all' || query.trim() !== '';
    show(empty, payload.pets.length === 0);
    show(filteredEmpty, payload.pets.length > 0 && shown.length === 0);
    show(grid, shown.length > 0);

    if (truncated) {
      if (all.length > PAGE_LIMIT) {
        truncated.hidden = false;
        truncated.textContent = `Showing the first ${PAGE_LIMIT} of ${all.length} matching pets. The library has no client-side pagination yet.`;
      } else {
        truncated.hidden = true;
        truncated.textContent = '';
      }
    }

    status.textContent = filtering
      ? `${shown.length} of ${statusText(payload)} shown · filter is ${
          filter === 'all' ? 'all' : filter
        }${query.trim() ? ` · “${query.trim()}”` : ''}`
      : statusText(payload);

    const generated = payload.generatedAt ? shortDate(payload.generatedAt) : 'time not reported';
    const anywhere = payload.assetBase ? `assets served from ${payload.assetBase}` : 'asset base not reported';
    if (indexMeta) indexMeta.textContent = `index generated ${generated} · ${anywhere}`;
  };

  const load = async () => {
    show(skeletonList, true);
    show(error, false);
    show(empty, false);
    show(filteredEmpty, false);
    show(grid, false);
    if (truncated) truncated.hidden = true;
    status.textContent = `Reading ${manifestUrl(LIBRARY_ENDPOINT)} …`;

    try {
      payload = await fetchManifest(LIBRARY_ENDPOINT);
      show(skeletonList, false);
      render();
    } catch (caught) {
      payload = null;
      show(skeletonList, false);
      show(grid, false);
      show(empty, false);
      show(filteredEmpty, false);
      show(error, true);
      const message = caught instanceof Error ? caught.message : String(caught);
      const url = (caught as { url?: string }).url ?? manifestUrl(LIBRARY_ENDPOINT);
      if (errorReason) {
        errorReason.textContent = `GET ${url} failed: ${message}. Nothing is shown in place of the pets, because nothing was received.`;
      }
      status.textContent = 'The library could not be reached.';
    }
  };

  for (const chip of chips) {
    chip.addEventListener('click', () => {
      filter = (chip.dataset.filter as Filter | undefined) ?? 'all';
      for (const other of chips) {
        other.setAttribute('aria-pressed', other === chip ? 'true' : 'false');
      }
      render();
    });
  }

  search?.addEventListener('input', () => {
    query = search.value;
    render();
  });

  retry?.addEventListener('click', () => {
    void load();
  });

  clear?.addEventListener('click', () => {
    filter = 'all';
    query = '';
    if (search) search.value = '';
    for (const chip of chips) {
      chip.setAttribute('aria-pressed', chip.dataset.filter === 'all' ? 'true' : 'false');
    }
    render();
  });

  void load();
}
