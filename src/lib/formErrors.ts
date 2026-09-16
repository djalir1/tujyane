/**
 * Global form error UX helpers.
 *
 * Fixes the "user submits an invalid form and gets no clue where the error
 * is" bug. Consistent behaviour across every TUJYANE form:
 *   * Scroll the first invalid field into view (smooth, block-center).
 *   * Focus it so keyboard users pick up where the visual jumped.
 *   * The form itself still renders the per-field inline errors — this
 *     helper just gets the user's eyeballs there.
 *
 * Convention: every focusable input carries `data-invalid` when it holds an
 * error. Non-input UI (RadioGroup, Toggle, DatePicker button) also sets it
 * on its outer control so the scroll target is meaningful.
 *
 * The Toast is fired by the caller (they hold the toast context). This
 * module stays UI-framework-agnostic.
 */

/** Find the first element in the form marked as invalid, scroll to it and
 * focus it. Returns true when something was focused. */
export function focusFirstInvalid(root?: HTMLElement | null): boolean {
  const scope: ParentNode = root ?? document;
  // 1. Prefer aria-invalid=true (the standard HTML signal our TextField sets).
  const invalid = scope.querySelector<HTMLElement>(
    '[aria-invalid="true"], [data-invalid="true"]',
  );
  if (!invalid) return false;

  // Scroll THEN focus — focus() would jump-scroll in a jarring way otherwise.
  try {
    invalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch { /* older browsers */ }

  // Focus after scroll frame so the input isn't scrolled again by focus().
  requestAnimationFrame(() => {
    try {
      // preventScroll skips the auto-scroll browsers do on focus.
      (invalid as HTMLElement & { focus: (o?: { preventScroll?: boolean }) => void })
        .focus({ preventScroll: true });
    } catch { /* ignore */ }
  });
  return true;
}

/** How many `data-invalid` / `aria-invalid` elements are in a form. Handy
 * for the summary toast text. */
export function countInvalid(root?: HTMLElement | null): number {
  const scope: ParentNode = root ?? document;
  return scope.querySelectorAll('[aria-invalid="true"], [data-invalid="true"]').length;
}

/** Convenience: run after setErrors(next) — waits one frame so React has
 * committed the aria-invalid attributes to the DOM. Returns count of
 * invalid fields (0 when the form was clean). */
export function afterErrorsRender(root: HTMLElement | null, run: (count: number) => void) {
  requestAnimationFrame(() => {
    const n = countInvalid(root);
    if (n > 0) focusFirstInvalid(root);
    run(n);
  });
}
