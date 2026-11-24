/** The seeded task categories (ids match the `categories` table). */
export const CATEGORIES: ReadonlyArray<readonly [id: string, name: string]> = [
  ["personal", "Personal"], ["work", "Work"], ["finance", "Finance"], ["framework", "Framework"], ["nexus", "Nexus"], ["health", "Health"], ["learning", "Learning & Development"],
];
export const categoryName = (id: string | null) => CATEGORIES.find(([i]) => i === id)?.[1] ?? id ?? "";
