import type { RuntimeLocation, RuntimeValue } from "../runtime/value";
import { stringifyValue } from "../runtime/value";
import type { ArrayTypeNode, DebugValueView, ExprNode, TypeNode } from "../types";
import { isPointerType, isPrimitiveType, isReferenceType, typeToString } from "../types";
import type { Scope } from "./interpreter-runtime-core";
import { InterpreterRuntimeCore } from "./interpreter-runtime-core";

export abstract class InterpreterRuntimeSupport extends InterpreterRuntimeCore {
  protected castToElementType(value: RuntimeValue, type: TypeNode, line: number): RuntimeValue {
    return this.assertType(type, value, line);
  }

  protected defaultValueForType(type: TypeNode, line: number): RuntimeValue {
    if (isPrimitiveType(type)) {
      if (type.name === "int" || type.name === "long long") {
        return { kind: "int", value: 0n };
      }
      if (type.name === "double") {
        return { kind: "double", value: 0 };
      }
      if (type.name === "bool") {
        return { kind: "bool", value: false };
      }
      if (type.name === "string") {
        return { kind: "string", value: "" };
      }
      this.fail("element type cannot be void", line);
    }
    if (type.kind === "VectorType") {
      return this.allocateArray(type, []);
    }
    if (type.kind === "PairType") {
      return {
        kind: "pair",
        type,
        first: this.defaultValueForType(type.firstType, line),
        second: this.defaultValueForType(type.secondType, line),
      };
    }
    if (type.kind === "TupleType") {
      return {
        kind: "tuple",
        type,
        values: type.elementTypes.map((elementType) => this.defaultValueForType(elementType, line)),
      };
    }
    this.fail("fixed array value requires dimensions", line);
  }

  protected override defineInScope(
    scope: Scope,
    name: string,
    value: RuntimeValue,
    line: number,
  ): void {
    if (scope.has(name)) {
      this.fail(`redefinition of '${name}'`, line);
    }
    scope.set(name, value);
  }

  protected define(name: string, value: RuntimeValue): void {
    this.defineInScope(this.currentScope(), name, value, this.currentLine);
  }

  protected resolve(name: string, line: number): RuntimeValue {
    const raw = this.resolveRaw(name, line);
    if (raw.kind === "reference") {
      return this.readLocation(raw.target, line);
    }
    return raw;
  }

  protected resolveRaw(name: string, line: number): RuntimeValue {
    for (let i = this.scopeStack.length - 1; i >= 0; i -= 1) {
      const scope = this.scopeStack[i];
      if (scope === undefined) {
        continue;
      }
      const found = scope.get(name);
      if (found !== undefined) {
        return found;
      }
    }

    const globalValue = this.globals.get(name);
    if (globalValue !== undefined) {
      return globalValue;
    }

    this.fail(`'${name}' was not declared in this scope`, line);
  }

  protected resolveBindingLocation(name: string, line: number): RuntimeLocation {
    for (let i = this.scopeStack.length - 1; i >= 0; i -= 1) {
      const scope = this.scopeStack[i];
      if (scope === undefined || !scope.has(name)) {
        continue;
      }
      const value = scope.get(name);
      if (value === undefined) {
        break;
      }
      if (value.kind === "reference") {
        return value.target;
      }
      return { kind: "binding", scope, name, type: this.runtimeValueToType(value, line) };
    }

    if (this.globals.has(name)) {
      const value = this.globals.get(name);
      if (value === undefined) {
        this.fail(`'${name}' was not declared in this scope`, line);
      }
      if (value.kind === "reference") {
        return value.target;
      }
      return {
        kind: "binding",
        scope: this.globals,
        name,
        type: this.runtimeValueToType(value, line),
      };
    }

    this.fail(`'${name}' was not declared in this scope`, line);
  }

  protected assign(name: string, value: RuntimeValue, line: number): void {
    const raw = this.resolveRaw(name, line);
    if (raw.kind === "reference") {
      this.writeLocation(raw.target, value, line);
      return;
    }
    for (let i = this.scopeStack.length - 1; i >= 0; i -= 1) {
      const scope = this.scopeStack[i];
      if (scope === undefined) {
        continue;
      }
      if (scope.has(name)) {
        const current = scope.get(name);
        if (current !== undefined) {
          scope.set(name, this.assignWithCurrentType(current, value, line));
          return;
        }
      }
    }

    if (this.globals.has(name)) {
      const current = this.globals.get(name);
      if (current !== undefined) {
        this.globals.set(name, this.assignWithCurrentType(current, value, line));
        return;
      }
    }

    this.fail(`'${name}' was not declared in this scope`, line);
  }

  protected assignWithCurrentType(
    current: RuntimeValue,
    value: RuntimeValue,
    line: number,
  ): RuntimeValue {
    if (current.kind === "uninitialized") {
      return this.assertType(current.expectedType, value, line);
    }
    if (current.kind === "array") {
      this.fail("cannot assign to array value directly", line);
    }
    if (current.kind === "pointer") {
      return this.assertType(
        { kind: "PointerType", pointeeType: current.pointeeType },
        value,
        line,
      );
    }
    if (current.kind === "reference") {
      this.writeLocation(current.target, value, line);
      return current;
    }
    if (current.kind === "pair") {
      return this.assertType(current.type, value, line);
    }
    if (current.kind === "tuple") {
      return this.assertType(current.type, value, line);
    }
    if (current.kind === "void") {
      this.fail("cannot assign to void", line);
    }
    return this.coerceRuntimeValue(current.kind, value, line);
  }

  protected assertPrimitiveType(type: TypeNode, value: RuntimeValue, line: number): RuntimeValue {
    const normalizedType = this.normalizePrimitiveType(type, line);
    if (normalizedType === "void") {
      return { kind: "void" };
    }
    const runtimeType = normalizedType === "long long" ? "int" : normalizedType;

    if (value.kind === "uninitialized") {
      const expectedType = value.expectedType;
      if (!isPrimitiveType(expectedType)) {
        return this.assertType(type, value, line);
      }
      const expectedRuntimeType = expectedType.name === "long long" ? "int" : expectedType.name;
      if (expectedRuntimeType !== runtimeType) {
        return this.coerceRuntimeValue(runtimeType, value, line);
      }
      return value;
    }
    return this.coerceRuntimeValue(runtimeType, value, line);
  }

  protected assertType(type: TypeNode, value: RuntimeValue, line: number): RuntimeValue {
    if (isReferenceType(type)) {
      this.fail("reference values require a bound location", line);
    }
    if (isPrimitiveType(type)) {
      return this.assertPrimitiveType(type, value, line);
    }
    if (isPointerType(type)) {
      if (value.kind === "pointer") {
        if (!this.sameType(type.pointeeType, value.pointeeType)) {
          this.fail(
            `cannot convert '${this.typeToRuntimeString({ kind: "PointerType", pointeeType: value.pointeeType })}' to '${this.typeToRuntimeString(type)}'`,
            line,
          );
        }
        return value;
      }
      if (value.kind === "int" && value.value === 0n) {
        return { kind: "pointer", pointeeType: type.pointeeType, target: null };
      }
      if (value.kind === "uninitialized") {
        return { kind: "uninitialized", expectedType: type };
      }
      this.fail(`cannot convert '${value.kind}' to '${this.typeKindName(type)}'`, line);
    }

    if (type.kind === "PairType") {
      if (value.kind === "uninitialized") {
        return { kind: "uninitialized", expectedType: type };
      }
      if (value.kind !== "pair") {
        this.fail(`cannot convert '${value.kind}' to '${this.typeKindName(type)}'`, line);
      }
      return {
        kind: "pair",
        type,
        first: this.assertType(type.firstType, value.first, line),
        second: this.assertType(type.secondType, value.second, line),
      };
    }

    if (type.kind === "TupleType") {
      if (value.kind === "uninitialized") {
        return { kind: "uninitialized", expectedType: type };
      }
      if (value.kind !== "tuple") {
        this.fail(`cannot convert '${value.kind}' to '${this.typeKindName(type)}'`, line);
      }
      if (value.values.length !== type.elementTypes.length) {
        this.fail(
          `cannot convert '${this.typeToRuntimeString(value.type)}' to '${this.typeToRuntimeString(type)}'`,
          line,
        );
      }
      return {
        kind: "tuple",
        type,
        values: type.elementTypes.map((elementType, index) =>
          this.assertType(elementType, value.values[index] as RuntimeValue, line),
        ),
      };
    }

    if (value.kind !== "array") {
      this.fail(`cannot convert '${value.kind}' to '${this.typeKindName(type)}'`, line);
    }

    if (type.kind === "VectorType" && value.type.kind !== "VectorType") {
      this.fail("cannot convert 'array' to 'vector'", line);
    }

    if (type.kind === "ArrayType" && value.type.kind !== "ArrayType") {
      this.fail("cannot convert 'vector' to 'array'", line);
    }

    if (
      (type.kind === "ArrayType" || type.kind === "VectorType") &&
      (value.type.kind === "ArrayType" || value.type.kind === "VectorType") &&
      !this.sameType(type.elementType, value.type.elementType)
    ) {
      this.fail(
        `cannot convert '${this.typeToRuntimeString(value.type)}' to '${this.typeToRuntimeString(type)}'`,
        line,
      );
    }

    return value;
  }

  protected override typeKindName(type: TypeNode): string {
    switch (type.kind) {
      case "PrimitiveType":
        return type.name;
      case "ArrayType":
        return "array";
      case "VectorType":
        return "vector";
      case "PairType":
        return "pair";
      case "TupleType":
        return "tuple";
      case "PointerType":
        return "pointer";
      case "ReferenceType":
        return "reference";
    }
  }

  protected serializeScope(scope: Scope): DebugValueView[] {
    return Array.from(scope.entries())
      .map(([name, value]) => this.serializeNamedValue(name, value))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  protected serializeNamedValue(name: string, value: RuntimeValue): DebugValueView {
    if (value.kind === "reference") {
      return {
        name,
        kind: "reference",
        value: this.serializeValue(this.readLocation(value.target, this.currentLine)),
      };
    }
    return {
      name,
      kind: value.kind,
      value: this.serializeValue(value),
    };
  }

  protected serializeValue(value: RuntimeValue): string {
    switch (value.kind) {
      case "array":
        return `<${value.type.kind === "VectorType" ? "vector" : "array"}#${value.ref}>`;
      case "pointer":
        return value.target === null ? "nullptr" : `<pointer:${typeToString(value.pointeeType)}>`;
      case "reference":
        return this.serializeValue(this.readLocation(value.target, this.currentLine));
      case "uninitialized":
        return `<uninitialized:${typeToString(value.expectedType)}>`;
      case "pair":
        return `(${this.serializeValue(value.first)}, ${this.serializeValue(value.second)})`;
      case "tuple":
        return `(${value.values.map((element) => this.serializeValue(element)).join(", ")})`;
      default:
        return stringifyValue(value);
    }
  }

  protected coerceRuntimeValue(
    expected: "int" | "double" | "bool" | "string",
    value: RuntimeValue,
    line: number,
  ): RuntimeValue {
    const initialized = this.ensureInitialized(value, line, "value");
    if (initialized.kind === expected) {
      return initialized;
    }
    if (initialized.kind === "reference") {
      return this.coerceRuntimeValue(expected, this.readLocation(initialized.target, line), line);
    }
    if (expected === "double" && initialized.kind === "int") {
      return { kind: "double", value: Number(initialized.value) };
    }
    if (expected === "int" && initialized.kind === "double") {
      if (!Number.isFinite(initialized.value) || !Number.isInteger(initialized.value)) {
        this.fail("cannot convert 'double' to 'int'", line);
      }
      return { kind: "int", value: BigInt(initialized.value) };
    }
    this.fail(`cannot convert '${initialized.kind}' to '${expected}'`, line);
  }

  protected createFixedArrayValue(
    type: ArrayTypeNode,
    dimensions: bigint[],
    line: number,
  ): RuntimeValue {
    const size = dimensions[0];
    if (size === undefined) {
      this.fail("missing array dimension", line);
    }
    const values = Array.from({ length: Number(size) }, () => {
      if (type.elementType.kind === "ArrayType") {
        return this.createFixedArrayValue(type.elementType, dimensions.slice(1), line);
      }
      return this.defaultValueForType(type.elementType, line);
    });
    return this.allocateArray(type, values);
  }

  protected applyArrayInitializers(
    target: RuntimeValue,
    initializers: ExprNode[],
    line: number,
  ): void {
    const flatTargets = this.flattenArrayElements(target, line);
    if (initializers.length > flatTargets.length) {
      this.fail("too many initializers for array", line);
    }
    for (let i = 0; i < initializers.length; i += 1) {
      const init = initializers[i];
      const targetSlot = flatTargets[i];
      if (init === undefined || targetSlot === undefined) {
        continue;
      }
      targetSlot.assign(this.evaluateExpr(init), init.line);
    }
  }

  protected flattenArrayElements(
    target: RuntimeValue,
    line: number,
  ): Array<{ assign: (value: RuntimeValue, assignLine: number) => void }> {
    const arrayValue = this.expectArray(target, line);
    const store = this.arrays.get(arrayValue.ref);
    if (store === undefined) {
      this.fail("invalid array reference", line);
    }
    const slots: Array<{ assign: (value: RuntimeValue, assignLine: number) => void }> = [];
    for (let i = 0; i < store.values.length; i += 1) {
      if (store.type.elementType.kind === "ArrayType") {
        const nested = store.values[i];
        if (nested !== undefined) {
          slots.push(...this.flattenArrayElements(nested, line));
        }
        continue;
      }
      slots.push({
        assign: (value: RuntimeValue, assignLine: number) => {
          store.values[i] = this.castToElementType(value, store.type.elementType, assignLine);
        },
      });
    }
    return slots;
  }

  protected sameType(left: TypeNode, right: TypeNode): boolean {
    if (left.kind !== right.kind) {
      return false;
    }
    switch (left.kind) {
      case "PrimitiveType":
        return right.kind === "PrimitiveType" && left.name === right.name;
      case "ArrayType":
        return right.kind === "ArrayType" && this.sameType(left.elementType, right.elementType);
      case "VectorType":
        return right.kind === "VectorType" && this.sameType(left.elementType, right.elementType);
      case "PointerType":
        return right.kind === "PointerType" && this.sameType(left.pointeeType, right.pointeeType);
      case "PairType":
        return (
          right.kind === "PairType" &&
          this.sameType(left.firstType, right.firstType) &&
          this.sameType(left.secondType, right.secondType)
        );
      case "TupleType":
        return (
          right.kind === "TupleType" &&
          left.elementTypes.length === right.elementTypes.length &&
          left.elementTypes.every((elementType, index) => {
            const rightElementType = right.elementTypes[index];
            return rightElementType !== undefined && this.sameType(elementType, rightElementType);
          })
        );
      case "ReferenceType":
        return (
          right.kind === "ReferenceType" && this.sameType(left.referredType, right.referredType)
        );
    }
  }

  protected typeToRuntimeString(type: TypeNode): string {
    return typeToString(type);
  }

  protected readLocation(location: RuntimeLocation, line: number): RuntimeValue {
    switch (location.kind) {
      case "binding": {
        const value = location.scope.get(location.name);
        if (value === undefined) {
          this.fail(`'${location.name}' was not declared in this scope`, line);
        }
        if (value.kind === "reference") {
          return this.readLocation(value.target, line);
        }
        return value;
      }
      case "array": {
        const store = this.arrays.get(location.ref);
        if (store === undefined) {
          this.fail("invalid array reference", line);
        }
        if (location.index < 0 || location.index >= store.values.length) {
          this.fail(
            `index ${location.index.toString()} out of range for array of size ${store.values.length}`,
            line,
          );
        }
        const value = store.values[location.index];
        if (value === undefined) {
          this.fail("invalid index access", line);
        }
        return value.kind === "reference" ? this.readLocation(value.target, line) : value;
      }
      case "tuple": {
        const parent = this.readLocation(location.parent, line);
        if (parent.kind !== "tuple") {
          this.fail("type mismatch: expected tuple", line);
        }
        const value = parent.values[location.index];
        if (value === undefined) {
          this.fail(
            `tuple index ${location.index.toString()} out of range for tuple of size ${parent.values.length}`,
            line,
          );
        }
        return value.kind === "reference" ? this.readLocation(value.target, line) : value;
      }
      case "string": {
        const parent = this.readLocation(location.parent, line);
        if (parent.kind !== "string") {
          this.fail("type mismatch: expected string", line);
        }
        if (location.index < 0 || location.index >= parent.value.length) {
          this.fail(
            `index ${location.index.toString()} out of range for string of size ${parent.value.length}`,
            line,
          );
        }
        return { kind: "string", value: parent.value[location.index] ?? "" };
      }
    }
  }

  protected writeLocation(location: RuntimeLocation, value: RuntimeValue, line: number): void {
    switch (location.kind) {
      case "binding": {
        const current = location.scope.get(location.name);
        if (current === undefined) {
          this.fail(`'${location.name}' was not declared in this scope`, line);
        }
        if (current.kind === "reference") {
          this.writeLocation(current.target, value, line);
          return;
        }
        location.scope.set(location.name, this.assignWithCurrentType(current, value, line));
        return;
      }
      case "array": {
        const store = this.arrays.get(location.ref);
        if (store === undefined) {
          this.fail("invalid array reference", line);
        }
        if (location.index < 0 || location.index >= store.values.length) {
          this.fail(
            `index ${location.index.toString()} out of range for array of size ${store.values.length}`,
            line,
          );
        }
        store.values[location.index] = this.castToElementType(value, location.type, line);
        return;
      }
      case "tuple": {
        const current = this.readLocation(location.parent, line);
        if (current.kind !== "tuple") {
          this.fail("type mismatch: expected tuple", line);
        }
        if (location.index < 0 || location.index >= current.values.length) {
          this.fail(
            `tuple index ${location.index.toString()} out of range for tuple of size ${current.values.length}`,
            line,
          );
        }
        const nextValues = [...current.values];
        nextValues[location.index] = this.assertType(location.type, value, line);
        this.writeLocation(
          location.parent,
          {
            kind: "tuple",
            type: current.type,
            values: nextValues,
          },
          line,
        );
        return;
      }
      case "string": {
        const current = this.readLocation(location.parent, line);
        if (current.kind !== "string") {
          this.fail("type mismatch: expected string", line);
        }
        const assigned = this.assertType({ kind: "PrimitiveType", name: "string" }, value, line);
        if (assigned.kind !== "string" || assigned.value.length !== 1) {
          this.fail("string element assignment requires a single character", line);
        }
        const next =
          current.value.slice(0, location.index) +
          assigned.value +
          current.value.slice(location.index + 1);
        this.writeLocation(location.parent, { kind: "string", value: next }, line);
        return;
      }
    }
  }

  protected runtimeValueToType(value: RuntimeValue, _line: number): TypeNode {
    switch (value.kind) {
      case "int":
        return { kind: "PrimitiveType", name: "int" };
      case "double":
        return { kind: "PrimitiveType", name: "double" };
      case "bool":
        return { kind: "PrimitiveType", name: "bool" };
      case "string":
        return { kind: "PrimitiveType", name: "string" };
      case "pair":
        return value.type;
      case "tuple":
        return value.type;
      case "array":
        return value.type;
      case "pointer":
        return { kind: "PointerType", pointeeType: value.pointeeType };
      case "reference":
        return value.type;
      case "uninitialized":
        return value.expectedType;
      case "void":
        return { kind: "PrimitiveType", name: "void" };
    }
  }
}
