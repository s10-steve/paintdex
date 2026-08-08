/**
 * Save a Blob to the user's device.
 *
 * The site has no server, so every "download" is a synthetic anchor click over
 * an object URL. This was inline in `scheme-visualiser` (the scheme JSON) and
 * copied into `poster-studio` (the share PNG), whose copy carried a comment
 * saying as much; the collection export would have been the third.
 *
 * The two copies had drifted, and this keeps the safe half of the difference:
 * `poster-studio` deferred `revokeObjectURL` to the next task, because revoking
 * synchronously after `click()` has historically aborted the download in
 * Firefox and Safari, which read the blob asynchronously. `scheme-visualiser`
 * revoked immediately and got away with it only because a scheme's JSON is
 * small enough to be read within the same task.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Convenience for the two JSON exports: schemes and the paint collection. */
export function downloadJSON(json: string, filename: string): void {
  downloadBlob(new Blob([json], { type: "application/json" }), filename);
}
