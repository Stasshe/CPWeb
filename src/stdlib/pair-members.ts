export type PairMemberName = "first" | "second";

export type PairMemberSpec = {
  name: PairMemberName;
};

const PAIR_MEMBER_SPECS: Record<PairMemberName, PairMemberSpec> = {
  first: { name: "first" },
  second: { name: "second" },
};

export function getPairMemberSpec(name: string): PairMemberSpec | null {
  return PAIR_MEMBER_SPECS[name as PairMemberName] ?? null;
}
