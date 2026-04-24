import { strict as assert } from "node:assert";
import { compile, compileAndRun, DebugSession } from "../dist/index.esm.js";

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test("compile minimal main", () => {
  const source = `
int main() {
  return 0;
}
`;
  const result = compile(source);
  assert.equal(result.ok, true);
});

test("arithmetic and cout", () => {
  const source = `
int main() {
  int a = 10;
  int b = 3;
  cout << a + b << "\\n";
  cout << a / b << "\\n";
  return 0;
}
`;
  const result = compileAndRun(source);
  assert.equal(result.status, "done");
  assert.equal(result.output.stdout, "13\n3\n");
});

test("if while and function call", () => {
  const source = `
int sumTo(int n) {
  int i = 1;
  int s = 0;
  while (i <= n) {
    s += i;
    i++;
  }
  return s;
}

int main() {
  int x = sumTo(5);
  if (x == 15) {
    cout << "ok" << "\\n";
  } else {
    cout << "ng" << "\\n";
  }
  return 0;
}
`;
  const result = compileAndRun(source);
  assert.equal(result.status, "done");
  assert.equal(result.output.stdout, "ok\n");
});

test("cin reads integers", () => {
  const source = `
int main() {
  int a;
  int b;
  cin >> a >> b;
  cout << a * b << "\\n";
  return 0;
}
`;
  const result = compileAndRun(source, "6 7");
  assert.equal(result.status, "done");
  assert.equal(result.output.stdout, "42\n");
});

test("uninitialized read is runtime error", () => {
  const source = `
int main() {
  int x;
  cout << x << "\\n";
  return 0;
}
`;
  const result = compileAndRun(source);
  assert.equal(result.status, "error");
  assert.ok(result.error?.message.includes("Runtime Error:"));
  assert.ok(result.error?.message.includes("uninitialized"));
});

test("fixed array declaration and index access", () => {
  const source = `
int main() {
  int a[5] = {1, 2};
  a[2] = 7;
  cout << a[0] + a[1] + a[2] + a[3] << "\\n";
  return 0;
}
`;
  const result = compileAndRun(source);
  assert.equal(result.status, "done");
  assert.equal(result.output.stdout, "10\n");
});

test("vector methods push_back size back pop_back", () => {
  const source = `
int main() {
  vector<int> v;
  v.push_back(5);
  v.push_back(8);
  cout << v.size() << " " << v.back() << "\\n";
  v.pop_back();
  cout << v.size() << " " << v.back() << "\\n";
  return 0;
}
`;
  const result = compileAndRun(source);
  assert.equal(result.status, "done");
  assert.equal(result.output.stdout, "2 8\n1 5\n");
});

test("vector resize and empty", () => {
  const source = `
int main() {
  vector<int> v(3, 4);
  cout << v[0] + v[1] + v[2] << "\\n";
  v.resize(5);
  cout << v[3] << " " << v[4] << "\\n";
  v.clear();
  cout << v.empty() << "\\n";
  return 0;
}
`;
  const result = compileAndRun(source);
  assert.equal(result.status, "done");
  assert.equal(result.output.stdout, "12\n0 0\n1\n");
});

test("debug session skeleton returns terminal state", () => {
  const source = `
int main() {
  int x = 1;
  x += 2;
  cout << x << "\\n";
  return 0;
}
`;
  const session = new DebugSession(source);
  const state = session.stepInto();
  assert.equal(state.status, "done");
  assert.equal(state.output.stdout, "3\n");
  assert.ok(state.currentLine >= 1);
});
