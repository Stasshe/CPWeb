import type {
  ArrayDeclNode,
  AssignTargetNode,
  ExprNode,
  ForInitNode,
  PrimitiveTypeNode,
  RangeForStmtNode,
  Token,
  TypeNode,
  VarDeclNode,
  VectorDeclNode,
} from "../types";
import {
  arrayType,
  isPrimitiveType,
  pairType,
  pointerType,
  primitiveType,
  referenceType,
  tupleType,
  vectorType,
} from "../types";
import { BaseParserCore } from "./base-parser-core";

const TYPE_KEYWORDS = new Set<string>(["int", "long", "double", "bool", "string", "void"]);
const UNSUPPORTED_TEMPLATE_TYPES = new Set<string>([
  "unordered_map",
  "priority_queue",
  "map",
  "set",
  "unordered_set",
]);

export abstract class BaseParserSupport extends BaseParserCore {
  protected parseForInit(): ForInitNode {
    if (this.checkSymbol(";")) {
      this.advance();
      return { kind: "none" };
    }

    if (this.peekPrimitiveTypeKeyword()) {
      const decls = this.parseVarDeclListNoSemicolon();
      if (decls === null || decls.length === 0) {
        return { kind: "none" };
      }
      if (!this.consumeSymbol(";", "expected ';' after for initializer declaration")) {
        return { kind: "none" };
      }
      if (decls.length === 1) {
        return { kind: "varDecl", value: decls[0] as VarDeclNode };
      }
      return { kind: "declGroup", value: decls as VarDeclNode[] };
    }

    const value = this.parseExpression();
    if (!this.consumeSymbol(";", "expected ';' after for initializer")) {
      return { kind: "none" };
    }
    return { kind: "expr", value };
  }

  protected parseVarDeclNoSemicolon(): VarDeclNode | null {
    const type = this.parsePrimitiveType();
    if (type === null) {
      return null;
    }
    return this.parseSingleVarDeclaratorFromBaseType(type);
  }

  protected parseVarDeclListNoSemicolon(): VarDeclNode[] | null {
    const type = this.parsePrimitiveType();
    if (type === null) {
      return null;
    }
    return this.parseVarDeclaratorList(type);
  }

  protected parseDeclarationList(
    type: TypeNode,
  ): Array<VarDeclNode | ArrayDeclNode | VectorDeclNode> | null {
    const declarations = this.parseDeclaratorList(type);
    if (declarations === null) {
      return null;
    }
    if (!this.consumeSymbol(";", "expected ';' after declaration")) {
      return null;
    }
    return declarations;
  }

  protected parseDeclaratorList(
    type: TypeNode,
  ): Array<VarDeclNode | ArrayDeclNode | VectorDeclNode> | null {
    const declarations: Array<VarDeclNode | ArrayDeclNode | VectorDeclNode> = [];
    const first = this.parseSingleDeclarator(type);
    if (first === null) {
      return null;
    }
    declarations.push(first);

    while (this.matchSymbol(",")) {
      const next = this.parseSingleDeclarator(type);
      if (next === null) {
        return null;
      }
      declarations.push(next);
    }

    return declarations;
  }

  protected parseVarDeclaratorList(
    type: Extract<TypeNode, { kind: "PrimitiveType" }>,
  ): VarDeclNode[] | null {
    const declarations: VarDeclNode[] = [];
    const first = this.parseSingleVarDeclaratorFromBaseType(type);
    if (first === null) {
      return null;
    }
    declarations.push(first);

    while (this.matchSymbol(",")) {
      const next = this.parseSingleVarDeclaratorFromBaseType(type);
      if (next === null) {
        return null;
      }
      declarations.push(next);
    }

    return declarations;
  }

  protected parseSingleDeclarator(
    type: TypeNode,
  ): VarDeclNode | ArrayDeclNode | VectorDeclNode | null {
    const declarator = this.parseNamedDeclarator(type, { allowUnsizedArrays: false });
    if (declarator === null) {
      return null;
    }
    if (declarator.dimensions.length > 0) {
      return this.finishArrayDecl(
        declarator.type,
        declarator.nameToken,
        declarator.dimensions,
        false,
      );
    }
    if (declarator.type.kind === "VectorType") {
      return this.finishVectorDecl(declarator.type, declarator.nameToken, false);
    }
    return this.parseSingleVarDeclarator(declarator.type, declarator.nameToken);
  }

  protected parseSingleVarDeclarator(type: TypeNode, nameToken: Token): VarDeclNode | null {
    const initializer = this.matchSymbol("=") ? this.parseExpression() : null;
    return {
      kind: "VarDecl",
      type,
      name: nameToken.text,
      initializer,
      ...(initializer === null
        ? this.rangeFrom(nameToken, nameToken)
        : this.rangeFromNode(nameToken, initializer)),
    };
  }

  protected finishArrayDecl(
    type: TypeNode,
    nameToken: Token,
    dimensions: bigint[],
    consumeTerminator = true,
  ): ArrayDeclNode | null {
    if (this.isVoidTypeNode(type)) {
      this.errorAt(nameToken, "array element type cannot be void");
      return null;
    }
    if (dimensions.length === 0) {
      this.errorAt(nameToken, "expected array size integer literal");
      return null;
    }

    const initializers: ExprNode[] = [];
    if (this.matchSymbol("=")) {
      if (!this.consumeSymbol("{", "expected '{' for array initializer")) {
        return null;
      }
      if (!this.checkSymbol("}")) {
        while (true) {
          initializers.push(this.parseExpression());
          if (!this.matchSymbol(",")) {
            break;
          }
        }
      }
      if (!this.consumeSymbol("}", "expected '}' after array initializer")) {
        return null;
      }
    }

    if (consumeTerminator && !this.consumeSymbol(";", "expected ';' after array declaration")) {
      return null;
    }

    return {
      kind: "ArrayDecl",
      type: this.wrapArrayDimensions(type, dimensions.length),
      name: nameToken.text,
      dimensions,
      initializers,
      ...this.rangeToPrevious(nameToken),
    };
  }

  protected finishVectorDecl(
    type: VectorDeclNode["type"],
    nameToken: Token,
    consumeTerminator = true,
  ): VectorDeclNode | null {
    const constructorArgs: ExprNode[] = [];
    if (this.matchSymbol("(")) {
      if (!this.matchSymbol(")")) {
        constructorArgs.push(this.parseExpression());
        if (this.matchSymbol(",")) {
          constructorArgs.push(this.parseExpression());
        }
        if (!this.consumeSymbol(")", "expected ')' after vector constructor args")) {
          return null;
        }
      }
    }

    if (consumeTerminator && !this.consumeSymbol(";", "expected ';' after vector declaration")) {
      return null;
    }

    return {
      kind: "VectorDecl",
      type,
      name: nameToken.text,
      constructorArgs,
      ...this.rangeToPrevious(nameToken),
    };
  }

  protected parseType(): TypeNode | null {
    if (this.checkKeyword("vector")) {
      return this.parseVectorType();
    }
    if (this.isPairTypeStart()) {
      return this.parsePairType();
    }
    if (this.isTupleTypeStart()) {
      return this.parseTupleType();
    }
    return this.parsePrimitiveType();
  }

  protected parseTypeSpecifier(): TypeNode | null {
    return this.parseType();
  }

  protected parseVectorType(): VectorDeclNode["type"] | null {
    if (!this.consumeKeyword("vector", "expected 'vector'")) {
      return null;
    }
    if (!this.consumeSymbol("<", "expected '<' after vector")) {
      return null;
    }
    const elementType = this.parseType();
    if (elementType === null) {
      return null;
    }
    if (this.isVoidTypeNode(elementType)) {
      this.errorAtCurrent("vector element type cannot be void");
      return null;
    }
    if (!this.consumeTypeClose("expected '>' after vector element type")) {
      return null;
    }
    return vectorType(elementType);
  }

  protected parsePrimitiveType(): PrimitiveTypeNode | null {
    if (this.matchKeyword("int")) {
      return primitiveType("int");
    }
    if (this.matchKeyword("bool")) {
      return primitiveType("bool");
    }
    if (this.matchKeyword("double")) {
      return primitiveType("double");
    }
    if (this.matchKeyword("string")) {
      return primitiveType("string");
    }
    if (this.matchKeyword("void")) {
      return primitiveType("void");
    }
    if (this.matchKeyword("long")) {
      if (this.matchKeyword("long")) {
        return primitiveType("long long");
      }
      this.errorAtCurrent("expected 'long' after 'long'");
      return null;
    }
    this.errorAtCurrent("expected type name");
    return null;
  }

  protected peekPrimitiveTypeKeyword(): boolean {
    const token = this.peek();
    return token.kind === "keyword" && TYPE_KEYWORDS.has(token.text);
  }

  protected override checkTypeStart(): boolean {
    return (
      this.peekPrimitiveTypeKeyword() ||
      this.checkKeyword("vector") ||
      this.isPairTypeStart() ||
      this.isTupleTypeStart()
    );
  }

  protected parseParams(): import("../types").FunctionDeclNode["params"] {
    const params: import("../types").FunctionDeclNode["params"] = [];

    if (this.matchSymbol(")")) {
      return params;
    }

    while (true) {
      const type = this.parseTypeSpecifier();
      if (type === null) {
        break;
      }
      const declarator = this.parseNamedDeclarator(type, { allowUnsizedArrays: true });
      if (declarator === null) {
        break;
      }
      const paramType =
        declarator.dimensions.length > 0
          ? this.wrapArrayDimensions(declarator.type, declarator.dimensions.length)
          : declarator.type;
      params.push({
        kind: "Param",
        type: paramType,
        name: declarator.nameToken.text,
        ...this.rangeToPrevious(declarator.nameToken),
      });

      if (this.matchSymbol(")")) {
        return params;
      }
      if (!this.consumeSymbol(",", "expected ',' or ')' after parameter")) {
        break;
      }
    }

    this.consumeSymbol(")", "expected ')' after parameter list");
    return params;
  }

  protected isUnsupportedTemplateTypeDeclarationStart(): boolean {
    const token = this.peek();
    if (token.kind !== "identifier" || !UNSUPPORTED_TEMPLATE_TYPES.has(token.text)) {
      return false;
    }
    const next = this.tokens[this.index + 1];
    return next?.kind === "symbol" && next.text === "<";
  }

  protected parseRangeForStatement(forToken: Token): RangeForStmtNode | null {
    const binding = this.parseRangeForBinding();
    if (binding === null) {
      return null;
    }
    if (!this.consumeSymbol(":", "expected ':' in range-based for")) {
      return null;
    }
    const source = this.parseExpression();
    if (!this.consumeSymbol(")", "expected ')' after range-based for")) {
      return null;
    }
    const body = this.parseStmtOrBlock();
    if (body === null) {
      return null;
    }
    return {
      kind: "RangeForStmt",
      itemName: binding.name,
      itemType: binding.type,
      itemByReference: binding.byReference,
      source,
      body,
      ...this.rangeFromNode(forToken, body),
    };
  }

  protected isRangeForClause(): boolean {
    let depth = 0;
    for (let cursor = this.index; cursor < this.tokens.length; cursor += 1) {
      const token = this.tokens[cursor];
      if (token === undefined || token.kind === "eof") {
        return false;
      }
      if (token.kind !== "symbol") {
        continue;
      }
      if (token.text === "(" || token.text === "[" || token.text === "{") {
        depth += 1;
        continue;
      }
      if (token.text === ")" || token.text === "]" || token.text === "}") {
        if (depth === 0 && token.text === ")") {
          return false;
        }
        depth = Math.max(0, depth - 1);
        continue;
      }
      if (depth === 0 && token.text === ":") {
        return true;
      }
      if (depth === 0 && token.text === ";") {
        return false;
      }
    }
    return false;
  }

  private parseArrayDimensions(
    contextName: "array" | "parameter",
    requireSize: boolean,
  ): bigint[] | null {
    const dimensions: bigint[] = [];

    while (this.matchSymbol("[")) {
      if (this.checkSymbol("]")) {
        if (requireSize) {
          this.errorAtCurrent(`expected ${contextName} size integer literal`);
          return null;
        }
        this.advance();
        dimensions.push(0n);
        continue;
      }

      const sizeToken = this.consume("number", `expected ${contextName} size integer literal`);
      if (sizeToken === null) {
        return null;
      }
      dimensions.push(BigInt(sizeToken.text));
      if (!this.consumeSymbol("]", "expected ']' after array size")) {
        return null;
      }
    }

    return dimensions;
  }

  private wrapArrayDimensions(type: TypeNode, dimensions: number): ArrayDeclNode["type"] {
    let wrapped: TypeNode = type;
    for (let i = 0; i < dimensions; i += 1) {
      wrapped = arrayType(wrapped);
    }
    return wrapped as ArrayDeclNode["type"];
  }

  private isVoidTypeNode(type: TypeNode): boolean {
    if (isPrimitiveType(type)) {
      return type.name === "void";
    }
    if (type.kind === "PointerType") {
      return this.isVoidTypeNode(type.pointeeType);
    }
    if (type.kind === "ReferenceType") {
      return this.isVoidTypeNode(type.referredType);
    }
    if (type.kind === "PairType") {
      return this.isVoidTypeNode(type.firstType) || this.isVoidTypeNode(type.secondType);
    }
    if (type.kind === "TupleType") {
      return type.elementTypes.some((elementType) => this.isVoidTypeNode(elementType));
    }
    return this.isVoidTypeNode(type.elementType);
  }

  private consumeTypeClose(message: string): boolean {
    this.splitShiftCloseToken();
    return this.consumeSymbol(">", message);
  }

  private splitShiftCloseToken(): void {
    const token = this.peek();
    if (token.kind !== "symbol" || token.text !== ">>") {
      return;
    }
    (this.tokens as Token[]).splice(
      this.index,
      1,
      { ...token, text: ">", endCol: token.col + 1 },
      { ...token, col: token.col + 1, endCol: token.endCol, text: ">" },
    );
  }

  private parseSingleVarDeclaratorFromBaseType(
    type: Extract<TypeNode, { kind: "PrimitiveType" }>,
  ): VarDeclNode | null {
    const declarator = this.parseNamedDeclarator(type, { allowUnsizedArrays: false });
    if (declarator === null) {
      return null;
    }
    if (declarator.dimensions.length > 0) {
      this.errorAt(declarator.nameToken, "for-loop initializer variable cannot be array");
      return null;
    }
    return this.parseSingleVarDeclarator(declarator.type, declarator.nameToken);
  }

  private parseNamedDeclarator(
    baseType: TypeNode,
    options: { allowUnsizedArrays: boolean },
  ): { nameToken: Token; type: TypeNode; dimensions: bigint[] } | null {
    let declaredType: TypeNode = baseType;
    while (this.matchSymbol("*")) {
      declaredType = pointerType(declaredType);
    }
    if (this.matchSymbol("&")) {
      declaredType = referenceType(declaredType);
    }
    const nameToken = this.consumeIdentifier("expected variable name");
    if (nameToken === null) {
      return null;
    }
    const dimensions = this.checkSymbol("[")
      ? this.parseArrayDimensions(
          options.allowUnsizedArrays ? "parameter" : "array",
          !options.allowUnsizedArrays,
        )
      : [];
    if (dimensions === null) {
      return null;
    }
    return { nameToken, type: declaredType, dimensions };
  }

  private parseRangeForBinding(): {
    name: string;
    type: TypeNode | null;
    byReference: boolean;
  } | null {
    if (this.matchKeyword("auto")) {
      const byReference = this.matchSymbol("&");
      if (this.checkSymbol("[")) {
        this.errorAtCurrent("this feature is not supported in this interpreter");
        return null;
      }
      const nameToken = this.consumeIdentifier("expected loop variable name");
      if (nameToken === null) {
        return null;
      }
      return { name: nameToken.text, type: null, byReference };
    }
    const baseType = this.parseTypeSpecifier();
    if (baseType === null) {
      return null;
    }
    const declarator = this.parseNamedDeclarator(baseType, { allowUnsizedArrays: true });
    if (declarator === null) {
      return null;
    }
    if (declarator.dimensions.length > 0) {
      this.errorAt(declarator.nameToken, "range-based for variable cannot be array");
      return null;
    }
    return {
      name: declarator.nameToken.text,
      type:
        declarator.type.kind === "ReferenceType" ? declarator.type.referredType : declarator.type,
      byReference: declarator.type.kind === "ReferenceType",
    };
  }

  private isPairTypeStart(): boolean {
    const token = this.peek();
    const next = this.tokens[this.index + 1];
    return (
      token.kind === "identifier" &&
      token.text === "pair" &&
      next?.kind === "symbol" &&
      next.text === "<"
    );
  }

  private isTupleTypeStart(): boolean {
    const token = this.peek();
    const next = this.tokens[this.index + 1];
    return (
      token.kind === "identifier" &&
      token.text === "tuple" &&
      next?.kind === "symbol" &&
      next.text === "<"
    );
  }

  private parsePairType(): TypeNode | null {
    if (!(this.peek().kind === "identifier" && this.peek().text === "pair")) {
      this.errorAtCurrent("expected 'pair'");
      return null;
    }
    this.advance();
    if (!this.consumeSymbol("<", "expected '<' after pair")) {
      return null;
    }
    const firstType = this.parseType();
    if (firstType === null) {
      return null;
    }
    if (!this.consumeSymbol(",", "expected ',' in pair type")) {
      return null;
    }
    const secondType = this.parseType();
    if (secondType === null) {
      return null;
    }
    if (this.isVoidTypeNode(firstType) || this.isVoidTypeNode(secondType)) {
      this.errorAtCurrent("pair element type cannot be void");
      return null;
    }
    if (!this.consumeTypeClose("expected '>' after pair type")) {
      return null;
    }
    return pairType(firstType, secondType);
  }

  private parseTupleType(): TypeNode | null {
    if (!(this.peek().kind === "identifier" && this.peek().text === "tuple")) {
      this.errorAtCurrent("expected 'tuple'");
      return null;
    }
    this.advance();
    if (!this.consumeSymbol("<", "expected '<' after tuple")) {
      return null;
    }

    const elementTypes: TypeNode[] = [];
    while (true) {
      const elementType = this.parseType();
      if (elementType === null) {
        return null;
      }
      if (this.isVoidTypeNode(elementType)) {
        this.errorAtCurrent("tuple element type cannot be void");
        return null;
      }
      elementTypes.push(elementType);

      this.splitShiftCloseToken();
      if (this.checkSymbol(">")) {
        break;
      }
      if (!this.consumeSymbol(",", "expected ',' in tuple type")) {
        return null;
      }
    }

    if (elementTypes.length === 0) {
      this.errorAtCurrent("tuple must have at least one element type");
      return null;
    }

    if (!this.consumeTypeClose("expected '>' after tuple type")) {
      return null;
    }
    return tupleType(elementTypes);
  }
}

export function isAssignTarget(expr: ExprNode): expr is AssignTargetNode {
  return (
    expr.kind === "Identifier" ||
    expr.kind === "IndexExpr" ||
    expr.kind === "DerefExpr" ||
    expr.kind === "TupleGetExpr"
  );
}
