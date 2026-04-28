import type { CheckCtx } from "@/stdlib/check-context";
import { registerMemberHandler, registerMethodHandler } from "@/stdlib/check-registry";
import { getMapMethodSpec } from "@/stdlib/map-methods";
import { getPairMemberSpec } from "@/stdlib/pair-members";
import { pairFirstType, pairSecondType } from "@/stdlib/template-types";
import type { ExprNode, TypeNode } from "@/types";
import { isMapType, isPairType } from "@/types";

export function checkPairMember(
  receiverType: TypeNode,
  member: string,
  line: number,
  col: number,
  ctx: CheckCtx,
): TypeNode | null {
  if (!isPairType(receiverType)) return null;
  const spec = getPairMemberSpec(member);
  if (spec === null) {
    ctx.pushError(line, col, `unknown pair member '${member}'`);
    return null;
  }
  return spec.name === "first" ? pairFirstType(receiverType) : pairSecondType(receiverType);
}

export function checkMapMethod(
  receiverType: TypeNode,
  method: string,
  args: ExprNode[],
  line: number,
  col: number,
  ctx: CheckCtx,
): TypeNode | null {
  if (!isMapType(receiverType)) return null;
  const mapSpec = getMapMethodSpec(method);
  if (mapSpec === null) {
    ctx.pushError(line, col, `unknown map method '${method}'`);
    for (const arg of args) ctx.validateExpr(arg);
    return null;
  }
  if (args.length < mapSpec.minArgs || args.length > mapSpec.maxArgs) {
    ctx.pushError(line, col, `${method} requires no arguments`);
  }
  return { kind: "PrimitiveType", name: "int" };
}

registerMemberHandler({
  matches: isPairType,
  handle: (receiverType, member, line, col, ctx) =>
    checkPairMember(receiverType, member, line, col, ctx),
});

registerMethodHandler({
  matches: isMapType,
  handle: (receiverType, method, args, line, col, ctx) =>
    checkMapMethod(receiverType, method, args, line, col, ctx),
});
