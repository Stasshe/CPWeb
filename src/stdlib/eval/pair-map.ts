import type { RuntimeValue } from "@/runtime/value";
import type { EvalCtx } from "@/stdlib/eval-context";
import { registerMemberHandler, registerMethodHandler } from "@/stdlib/eval-registry";
import { getMapMethodSpec } from "@/stdlib/map-methods";
import { getPairMemberSpec } from "@/stdlib/pair-members";
import type { ExprNode } from "@/types";

export function evalPairMember(
  receiver: Extract<RuntimeValue, { kind: "pair" }>,
  member: string,
  line: number,
  ctx: EvalCtx,
): RuntimeValue {
  const spec = getPairMemberSpec(member);
  if (spec === null) ctx.fail(`unknown pair member '${member}'`, line);
  return spec.name === "first" ? receiver.first : receiver.second;
}

export function evalMapMethod(
  receiver: Extract<RuntimeValue, { kind: "map" }>,
  method: string,
  args: ExprNode[],
  line: number,
  ctx: EvalCtx,
): RuntimeValue {
  const mapSpec = getMapMethodSpec(method);
  if (mapSpec === null) ctx.fail(`unknown map method '${method}'`, line);
  if (args.length < mapSpec.minArgs || args.length > mapSpec.maxArgs) {
    ctx.fail(`${method} requires no arguments`, line);
  }
  return { kind: "int", value: BigInt(receiver.entries.length) };
}

registerMemberHandler({
  matches: (v) => v.kind === "pair",
  handle: (receiver, member, line, ctx) =>
    evalPairMember(receiver as Extract<RuntimeValue, { kind: "pair" }>, member, line, ctx),
});

registerMethodHandler({
  matches: (v) => v.kind === "map",
  handle: (receiver, method, args, line, ctx) =>
    evalMapMethod(receiver as Extract<RuntimeValue, { kind: "map" }>, method, args, line, ctx),
});
