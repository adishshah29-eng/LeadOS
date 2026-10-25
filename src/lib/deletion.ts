/** Typed confirmation before deleting a workspace: the exact name, spaces around it ignored. */
export function nameMatches(typed: string, name: string) {
  return typed.trim() !== "" && typed.trim() === name.trim();
}

/** Typed confirmation before deleting an account: the user's email, any case. */
export function emailMatches(typed: string, email: string) {
  return typed.trim() !== "" && typed.trim().toLowerCase() === email.trim().toLowerCase();
}
