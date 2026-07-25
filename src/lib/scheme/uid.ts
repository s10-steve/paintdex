/**
 * Runtime-unique ids for paints and elements.
 *
 * These are client-side React keys / reorder handles, not persisted identity —
 * `toExportShape` strips them — so they only need to be unique within a session.
 * One shared counter keeps that true across everything that builds scheme
 * objects (the editor, its localStorage restore, the account sync, JSON import).
 */
let counter = 0;

export const uid = (): string => `u${++counter}`;
