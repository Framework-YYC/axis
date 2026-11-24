import type { Actor } from "./types";

/** Thrown when an actor reaches for a module it was not granted. Mapped to a `forbidden` result by every operation. */
export class Forbidden extends Error {}

export function canAccessModule(actor: Actor, module: string): boolean {
  return !actor.modules || actor.modules.has(module);
}

export function assertModule(actor: Actor, module: string): void {
  if (!canAccessModule(actor, module)) throw new Forbidden(`This connection cannot access the ${module} module`);
}

/** Modules to restrict a read to, or null for no restriction. */
export function moduleFilter(actor: Actor): string[] | null {
  return actor.modules ? [...actor.modules] : null;
}

/** The module a new record belongs to when the request does not say: an assistant's own module, otherwise Daily. */
export function defaultModule(actor: Actor): string {
  if (actor.assistant) return actor.assistant;
  if (actor.modules && actor.modules.size === 1) return [...actor.modules][0];
  return "daily";
}
