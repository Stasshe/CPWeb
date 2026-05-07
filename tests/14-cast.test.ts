import { describe, expect, it } from "vitest";
import { compile, compileAndRun } from "./test-helper";

describe("Cast expressions", () => {
  it("C-style cast double to int", () => {
    const result = compileAndRun(`
int main() {
  double d = 3.7;
  int x = (int)d;
  cout << x << "\\n";
  return 0;
}
`);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("3\n");
  });

  it("C-style cast int to double", () => {
    const result = compileAndRun(`
int main() {
  int good = 5;
  double ans = (double)good / 216.0;
  cout << ans << "\\n";
  return 0;
}
`);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toContain("0.023");
  });

  it("functional cast int to double", () => {
    const result = compileAndRun(`
int main() {
  int good = 5;
  double ans = double(good) / 216.0;
  cout << ans << "\\n";
  return 0;
}
`);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toContain("0.023");
  });

  it("functional cast double to int", () => {
    const result = compileAndRun(`
int main() {
  double d = 2.9;
  int x = int(d);
  cout << x << "\\n";
  return 0;
}
`);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("2\n");
  });

  it("C-style cast char to int", () => {
    const result = compileAndRun(`
int main() {
  char c = 'A';
  int n = (int)c;
  cout << n << "\\n";
  return 0;
}
`);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("65\n");
  });

  it("C-style cast int to char", () => {
    const result = compileAndRun(`
int main() {
  int n = 65;
  char c = (char)n;
  cout << c << "\\n";
  return 0;
}
`);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("A\n");
  });

  it("C-style cast int to bool", () => {
    const result = compileAndRun(`
int main() {
  int x = 5;
  bool b = (bool)x;
  cout << b << "\\n";
  int y = 0;
  bool c = (bool)y;
  cout << c << "\\n";
  return 0;
}
`);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("1\n0\n");
  });

  it("C-style cast bool to int", () => {
    const result = compileAndRun(`
int main() {
  bool b = true;
  int n = (int)b;
  cout << n << "\\n";
  return 0;
}
`);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("1\n");
  });

  it("cast in expression context", () => {
    const result = compileAndRun(`
int main() {
  int a = 1, b = 3;
  double ratio = (double)a / b;
  cout << ratio << "\\n";
  return 0;
}
`);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toContain("0.333");
  });

  it("C-style cast long long", () => {
    const result = compileAndRun(`
int main() {
  double d = 100.9;
  long long n = (long long)d;
  cout << n << "\\n";
  return 0;
}
`);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("100\n");
  });

  it("cast compile error: invalid target void", () => {
    const result = compile(`
int main() {
  int x = 5;
  (void)x;
  return 0;
}
`);
    expect(result.ok).toBe(false);
  });
});
