import { compile, formatCompileErrors } from "../compiler";
import { buildDebugState, runProgram } from "../interpreter/interpreter";
import type { DebugState, FrameView, RunResult } from "../types";

export class DebugSession {
  private readonly source: string;

  private readonly input: string;

  private latestLine = 1;

  private latestCallStack: FrameView[] = [];

  private state: DebugState = {
    status: "ready",
    currentLine: 1,
    callStack: [],
    output: { stdout: "", stderr: "" },
    error: null,
  };

  constructor(source: string, input = "") {
    this.source = source;
    this.input = input;
  }

  stepInto(): DebugState {
    return this.runToEndAsSkeleton();
  }

  stepOver(): DebugState {
    return this.runToEndAsSkeleton();
  }

  stepOut(): DebugState {
    return this.runToEndAsSkeleton();
  }

  run(): DebugState {
    return this.runToEndAsSkeleton();
  }

  pause(): DebugState {
    if (this.state.status === "running") {
      this.state = {
        ...this.state,
        status: "paused",
      };
    }
    return this.state;
  }

  getState(): DebugState {
    return this.state;
  }

  private runToEndAsSkeleton(): DebugState {
    const compiled = compile(this.source);
    if (!compiled.ok) {
      this.state = {
        status: "error",
        currentLine: compiled.errors[0]?.line ?? 1,
        callStack: [],
        output: { stdout: "", stderr: "" },
        error: {
          message: formatCompileErrors("<input>", compiled.errors),
          line: compiled.errors[0]?.line ?? 1,
          functionName: "<compile>",
        },
      };
      return this.state;
    }

    this.state = { ...this.state, status: "running" };

    const result: RunResult = runProgram(compiled.program, this.input, {
      onStep: (step) => {
        this.latestLine = step.line;
        this.latestCallStack = step.callStack;
      },
    });

    this.state = buildDebugState(result, this.latestLine, this.latestCallStack);
    return this.state;
  }
}
