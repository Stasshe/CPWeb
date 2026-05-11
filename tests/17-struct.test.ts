import { describe, expect, it } from "vitest";
import { compile, compileAndRun } from "./test-helper";

describe("Struct", () => {
  it("basic struct declaration and member access", () => {
    const source = `
struct Point {
  int x;
  int y;
};

int main() {
  Point p;
  p.x = 3;
  p.y = 4;
  cout << p.x << " " << p.y << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("3 4\n");
  });

  it("struct aggregate initialization", () => {
    const source = `
struct Point {
  int x;
  int y;
};

int main() {
  Point p = {10, 20};
  cout << p.x << " " << p.y << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("10 20\n");
  });

  it("struct default initialization (zero-init)", () => {
    const source = `
struct Foo {
  int a;
  double b;
  bool c;
};

int main() {
  Foo f;
  cout << f.a << " " << f.b << " " << f.c << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("0 0 0\n");
  });

  it("struct passed by value (no side effects on caller)", () => {
    const source = `
struct Counter {
  int n;
};

void increment(Counter c) {
  c.n = c.n + 1;
}

int main() {
  Counter c;
  c.n = 5;
  increment(c);
  cout << c.n << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("5\n");
  });

  it("struct passed by reference (modifies caller)", () => {
    const source = `
struct Counter {
  int n;
};

void increment(Counter& c) {
  c.n = c.n + 1;
}

int main() {
  Counter c;
  c.n = 5;
  increment(c);
  cout << c.n << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("6\n");
  });

  it("struct returned from function", () => {
    const source = `
struct Point {
  int x;
  int y;
};

Point makePoint(int x, int y) {
  Point p;
  p.x = x;
  p.y = y;
  return p;
}

int main() {
  Point p = makePoint(7, 8);
  cout << p.x << " " << p.y << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("7 8\n");
  });

  it("struct assignment copies value", () => {
    const source = `
struct Point {
  int x;
  int y;
};

int main() {
  Point a;
  a.x = 1;
  a.y = 2;
  Point b = a;
  b.x = 99;
  cout << a.x << " " << b.x << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("1 99\n");
  });

  it("struct with pointer member via ->", () => {
    const source = `
struct Node {
  int val;
};

int main() {
  Node n;
  n.val = 42;
  Node* p = &n;
  cout << p->val << "\\n";
  p->val = 100;
  cout << n.val << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("42\n100\n");
  });

  it("vector of structs", () => {
    const source = `
struct Point {
  int x;
  int y;
};

int main() {
  vector<Point> pts;
  Point p1;
  p1.x = 1; p1.y = 2;
  Point p2;
  p2.x = 3; p2.y = 4;
  pts.push_back(p1);
  pts.push_back(p2);
  for (int i = 0; i < pts.size(); i++) {
    cout << pts[i].x << " " << pts[i].y << "\\n";
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("1 2\n3 4\n");
  });

  it("nested struct", () => {
    const source = `
struct Inner {
  int v;
};

struct Outer {
  Inner inner;
  int extra;
};

int main() {
  Outer o;
  o.inner.v = 7;
  o.extra = 3;
  cout << o.inner.v << " " << o.extra << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("7 3\n");
  });

  it("struct in array", () => {
    const source = `
struct Pt {
  int x;
  int y;
};

int main() {
  Pt arr[3];
  arr[0].x = 10; arr[0].y = 11;
  arr[1].x = 20; arr[1].y = 21;
  arr[2].x = 30; arr[2].y = 31;
  for (int i = 0; i < 3; i++) {
    cout << arr[i].x << " " << arr[i].y << "\\n";
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("10 11\n20 21\n30 31\n");
  });

  it("struct partial aggregate init fills rest with defaults", () => {
    const source = `
struct Foo {
  int a;
  int b;
  int c;
};

int main() {
  Foo f = {1, 2};
  cout << f.a << " " << f.b << " " << f.c << "\\n";
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("1 2 0\n");
  });

  it("unknown struct type compile error", () => {
    const source = `
int main() {
  Unknown u;
  return 0;
}
`;
    const result = compile(source);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("range-for over vector of structs", () => {
    const source = `
struct Point {
  int x;
  int y;
};

int main() {
  vector<Point> pts;
  Point p;
  p.x = 5; p.y = 6;
  pts.push_back(p);
  p.x = 7; p.y = 8;
  pts.push_back(p);
  for (Point pt : pts) {
    cout << pt.x << " " << pt.y << "\\n";
  }
  return 0;
}
`;
    const result = compileAndRun(source);
    expect(result.status).toBe("done");
    expect(result.output.stdout).toBe("5 6\n7 8\n");
  });
});
