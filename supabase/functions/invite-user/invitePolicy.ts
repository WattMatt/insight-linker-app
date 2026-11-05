/**
 * The one way an invite (or invite re-send) may reach a user: their login
 * details emailed with a generated temporary password, flagged for a forced
 * change at first sign-in (docs/AUTH_PASSWORD_REVIEW_2026-10-29.md, Step 3).
 *
 * Retired: the single-use invite link (burned by mail scanners, expired within
 * the hour) and returning the temporary password to the admin (shown in a
 * toast, relayed by hand). Pure, so it runs under vitest as well as Deno.
 */
import { MIN_TEMPORARY_PASSWORD_LENGTH } from './adminReset.ts';

export function assertInviteCredentials(params: {
  deliverByEmail?: boolean;
  temporaryPassword?: string;
}): asserts params is { deliverByEmail: true; temporaryPassword: string } {
  if (!params.deliverByEmail || !params.temporaryPassword) {
    throw new Error(
      'Invites must email a generated temporary password (deliverByEmail with temporaryPassword). Invite links are no longer sent - reload the page and try again.',
    );
  }
  if (params.temporaryPassword.length < MIN_TEMPORARY_PASSWORD_LENGTH) {
    throw new Error(
      `The temporary password must be at least ${MIN_TEMPORARY_PASSWORD_LENGTH} characters. Nothing was changed.`,
    );
  }
}
