export type MapMethodName = "size" | "empty";

export type MapMethodSpec = {
  name: MapMethodName;
  minArgs: number;
  maxArgs: number;
  returns: "int" | "bool";
};

const MAP_METHOD_SPECS: Record<MapMethodName, MapMethodSpec> = {
  size: { name: "size", minArgs: 0, maxArgs: 0, returns: "int" },
  empty: { name: "empty", minArgs: 0, maxArgs: 0, returns: "bool" },
};

export function getMapMethodSpec(name: string): MapMethodSpec | null {
  return MAP_METHOD_SPECS[name as MapMethodName] ?? null;
}

export function isMapMethodName(name: string): name is MapMethodName {
  return getMapMethodSpec(name) !== null;
}
