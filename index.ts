import {ObjectMembers, type Shape, TupleElementType, Types} from './types';

class ParserError extends Error {}

function fail(path: string, expected: string, data: unknown) {
	return new ParserError(`Expected ${path} to be ${expected}, got ${data}`);
}

function validate(data: unknown, root: Shape) {
	if(root == null) throw new Error('Please ensure that the ts-safe-cast transformer is run.');

	function walk(data: unknown, shape: Shape, path: string): ParserError | undefined {
		switch(shape) {
			case Types.String: {
				return typeof data === 'string' ? undefined : fail(path, 'a string', data);
			}
			case Types.Number: {
				return typeof data === 'number' ? undefined : fail(path, 'a number', data);
			}
			case Types.Boolean: {
				return typeof data === 'boolean' ? undefined : fail(path, 'a boolean', data);
			}
			case Types.Unknown: {
				return;
			}
			case Types.Bigint: {
				return typeof data === 'bigint' ? undefined : fail(path, 'a bigint', data);
			}
			case Types.Date: {
				return data instanceof Date ? undefined : fail(path, 'a date', data);
			}
		}
		switch(shape[0]) {
			case Types.Object: {
				if(!data || typeof data !== 'object') return fail(path, 'an object', data);
				let object = data as Record<string, unknown>;
				const [_, ...properties] = shape;
				for(const property of properties) {
					switch(property[0]) {
						case ObjectMembers.Property:
							const key = property[1];
							const newPath = `${path}.${key}`;
							if(!(key in object)) {
								if(property[3]) break;
								return fail(newPath, 'defined', 'undefined');
							}
							const error = walk(object[key], property[2], newPath);
							if(error) return error;
							break;
						case ObjectMembers.IndexSignature:
							for(const key in object) {
								const error = walk(object[key], property[1], `${path}.${key}`);
								if(error) return error;
							}
					}
				}
				return;
			}
			case Types.Array: {
				if(!Array.isArray(data)) return fail(path, 'an array', data);
				for(let i = 0; i < data.length; ++i) {
					const error = walk(data[i], shape[1], `${path}.${i}`);
					if(error) return error;
				}
				return;
			}
			case Types.Tuple: {
				const [_, ...items] = shape;
				if(!Array.isArray(data)) return fail(path, `a tuple`, data);
				let min = 0, max = 0;
				for(const [shape, type] of items) {
					if(type) {
						for(; max < data.length;) {
							const error = walk(data[max], shape, `${path}.${max}`);
							if(!error) ++max;
							if(error || type === TupleElementType.Optional) break;
						}
					} else {
						for(;;) {
							const error = walk(data[min], shape, `${path}.${min}`);
							++min;
							if(!error) {
								if(min >= max) max = min;
								break;
							}
							else if(min > max) return error;
						}
					}
				}
				if(max < data.length) return fail(path, `a tuple`, data);
				return;
			}
			case Types.Literal: {
				return data === shape[1] ? undefined : fail(path, `${shape[1]}`, data);
			}
			case Types.Union: {
				const [_, ...options] = shape;
				const errors: ParserError[] = [];
				for(const option of options) {
					const error = walk(data, option, path);
					if(!error) return;
					errors.push(error);
				}
				return new ParserError(`Expected ${path} to be a union, but no branches matched: ${errors.map(error => `\n\t• ${error}`).join('')}`);
			}
			case Types.Intersection: {
				const [_, ...members] = shape;
				for(const member of members) {
					const error = walk(data, member, path);
					if(error) return error;
				}
				return;
			}
			case Types.Reference: {
				const [_, ...rootPath] = shape;
				let target = root;
				for(let i = 0; i < rootPath.length; ++i)
					// @ts-expect-error This is unsafe, but we trust the transformer here.
					target = target[rootPath[i]];
				return walk(data, target, path);
			}
		}
	}

	return walk(data, root, 'root');
}

export function is<T>(data: unknown, shape?: never): data is T {
	return !validate(data, shape as unknown as Shape);
}

export function createIs<T>(shape?: never): (data: unknown) => data is T {
	return (data): data is T => is(data, shape);
}

export function cast<T>(data: unknown, shape?: never): T {
	const error = validate(data, shape as unknown as Shape);
	if(error) throw error;
	return data as T;
}

export function createCast<T>(shape?: never): (data: unknown) => T {
	return (data) => cast(data, shape);
}
