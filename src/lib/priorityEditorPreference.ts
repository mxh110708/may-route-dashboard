export const PRIORITY_EDITOR_GROUPS_PREFERENCE = "priority-editor-groups";

export function parsePriorityEditorGroups(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("invalid priority editor groups preference");
  }
  const entries = Object.entries(value);
  if (entries.some(([profileId, group]) => !profileId || typeof group !== "string" || !group)) {
    throw new Error("invalid priority editor groups preference");
  }
  return Object.fromEntries(entries);
}

export function priorityEditorGroup(
  groups: readonly { tag: string }[],
  remembered: string | undefined,
  policyGroup: string,
  activeGroups: readonly { group: string }[] = [],
): string {
  return [remembered, policyGroup, ...activeGroups.map(group => group.group)]
    .find(candidate => groups.some(group => group.tag === candidate)) ?? groups[0]?.tag ?? "";
}
