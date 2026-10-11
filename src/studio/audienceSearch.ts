export type AudiencePerson = { name?: string; bio?: string };

export function audienceMatchesQuery(person: AudiencePerson, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = (person.name ?? '').toLowerCase();
  const bio = (person.bio ?? '').toLowerCase();
  return name.includes(q) || bio.includes(q);
}

export function filterAudience<T extends AudiencePerson>(people: T[], query: string): T[] {
  return people.filter((person) => audienceMatchesQuery(person, query));
}
