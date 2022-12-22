# ts-safe-cast
Runtime-safe type casts and checks for TypeScript.

TypeScript is an amazing tool for preventing runtime issues by providing static type checking. It can only check what it knows about though, and a lot of the time we find ourselves interacting with data that comes from untyped contexts, such as JSON data, environment variables, or legacy libraries.

The best option TypeScript provides here is a type-cast - asserting that we as developers know better than the compiler, and _know_ that a certain value is going to be a certain type at runtime.

This can be a dangerous assertion to make; APIs can change over time, and data can be changed intentionally or maliciously to no longer match the expected schema, causing unpredictable failures.

This library aims to solve this problem and soothe developers by providing a simple way to check types at runtime using nothing more than a simple function call.

## Example
```ts
import { cast, is } from "ts-safe-cast";

type Thing = { name: string };

function doSomething(data: unknown): string {
	if(!is<Thing>(data)) return;
	return data.name;
}

function safeLoad(): string {
	const json = window.localStorage.getItem("data-that-could-be-modified");
	const thing: Thing = cast(JSON.parse(json));
	return thing.name;
}
```

## Installation
```shell
yarn install ts-safe-cast
```

`ts-safe-cast` uses a TypeScript transformer that needs to be run at compile time to provide the necessary runtime information. To do this, you can use the [`getCustomTransformers`](https://github.com/TypeStrong/ts-loader#getcustomtransformers) option for `ts-loader` or [ttypescript](https://github.com/cevek/ttypescript).

### Example `ttypescript` configuration

```json
{
  "compilerOptions": {
    ...
    "plugins": [ { "transform": "ts-safe-cast/transform" } ]
  }
}
```

## Considerations
There are a few other libraries out there providing similar solutions. This one aims to be as simple and efficient as possible, using a tiny runtime format rather than generating helper functions inline.

If you test for the same type in multiple locations and your type is complex, it may be more efficient to use the `createCast` or `createIs` functions to only generate the runtime format in one place.  

While the transformer comes pre-transpiled to JS, the runtime library is shipped as TypeScript, as it does not make sense to use outside a TS project, and this way you can compile it with your own settings.

When compiling using file watchers, keep in mind that when you change a type defined in another file, the runtime formats might not be recompiled until you change that file, as well.

## API

```ts
is<T>(data: unknown): data is T
cast<T>(data: unknown): T

createIs<T>(): (data: unknown) => data is T
createCast<T>(): (data: unknown) => T
```

💜
