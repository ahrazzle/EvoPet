// Single source of the pet's XP event values shown on the site.
//
// The XP numbers are the values in `tamahermes/state.py`'s `EVENT_DELTAS`
// (the TamaHermes tree, not this checkout). The /docs Mechanics page and the
// homepage used to retype them by hand; both import this table instead so the
// two can never disagree. If the deltas change upstream, change them here.

export interface XpEventRow {
  event: string;
  xp: number;
  when: string;
}

export const XP_EVENTS: XpEventRow[] = [
  { event: 'task_success', xp: 14, when: 'a turn ends successfully, once per turn' },
  { event: 'recovery', xp: 6, when: 'a success after a failure in the same turn' },
  { event: 'task_failure', xp: 5, when: 'a turn fails' },
  { event: 'review_opened', xp: 5, when: 'a review or critique is opened' },
  { event: 'prompt_sent', xp: 4, when: 'every prompt you send' },
  { event: 'care', xp: 3, when: 'you tend the pet yourself' },
  { event: 'session_start', xp: 2, when: 'an agent session begins' },
];
