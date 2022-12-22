import {ObjectMembers, Shape, Types} from './types';

class ParserError extends Error {}

function fail(path: string, expected: string, data: unknown) {
	return new ParserError(`Expected ${path} to be ${expected}, got ${data}`);
}

function validateSet<T, K extends keyof T>(object: T, key: K, shape: Shape, path: string) {
	const result = validate(object[key], shape, `${path}`);
	if(result instanceof ParserError) return result;
	object[key] = result as T[K];
}

function validate(data: unknown, shape: Shape, path: string): ParserError | unknown {
	switch(shape) {
		case Types.String: {
			return typeof data === 'string' ? data : fail(path, 'a string', data);
		}
		case Types.Number: {
			return typeof data === 'number' ? data : fail(path, 'a number', data);
		}
		case Types.Boolean: {
			return typeof data === 'boolean' ? data : fail(path, 'a boolean', data);
		}
		case Types.Unknown: {
			return data;
		}
		case Types.Bigint: {
			return typeof data === 'bigint' ? data : fail(path, 'a bigint', data);
		}
		case Types.Date: {
			if(data instanceof Date) return data;
			if(typeof data === 'number') return new Date(data);
			if(typeof data === 'string') {
				const parsed = Date.parse(data);
				if(!isNaN(parsed)) return new Date(data);
			}
			return fail(path, 'a date, a date string, or a timestamp', data);
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
						const error = validateSet(object, key, property[2], newPath);
						if(error) return error;
						break;
					case ObjectMembers.IndexSignature:
						for(const key in object) {
							const error = validateSet(object, key, property[1], `${path}.${key}`);
							if(error) return error;
						}
				}
			}
			return data;
		}
		case Types.Array: {
			if(!Array.isArray(data)) return fail(path, 'an array', data);
			for(let i = 0; i < data.length; ++i) {
				const error = validateSet(data, i, shape[1], `${path}.${i}`);
				if(error) return error;
			}
			return data;
		}
		case Types.Tuple: {
			const [_, ...items] = shape;
			if(!Array.isArray(data) || data.length !== items.length) return fail(path, `a ${items.length}-tuple`, data);
			for(const [i, shape] of items.entries()) {
				const error = validateSet(data, i, shape, `${path}.${i}`);
				if(error) return error;
			}
			return data;
		}
		case Types.Literal: {
			return data === shape[1] ? data : fail(path, `${shape[1]}`, data);
		}
		case Types.Union: {
			const [_, ...options] = shape;
			const errors: ParserError[] = [];
			for(const option of options) {
				const result = validate(data, option, path);
				if(!(result instanceof ParserError)) return result;
				errors.push(result);
			}
			return new ParserError(`Expected ${path} to be a union, but no branches matched: ${errors.map(error => `\n\t• ${error}`).join('')}`);
		}
		case Types.Intersection: {
			const [_, ...members] = shape;
			for(const member of members) {
				const result = validate(data, member, path);
				if(result instanceof ParserError) return result;
				data = result;
			}
			return data;
		}
	}
}

export function is<T>(data: unknown, shape?: never): data is T {
	if(shape == null) throw new Error('Please ensure that the ts-safe-cast transformer is run.');
	return !(validate(data, shape as Shape, 'root') instanceof ParserError);
}

export function createIs<T>(shape?: never): (data: unknown) => data is T {
	return (data): data is T => is(data, shape);
}

export function cast<T>(data: unknown, shape?: never): T {
	if(shape == null) throw new Error('Please ensure that the ts-safe-cast transformer is run.');
	const result = validate(data, shape as Shape, 'root');
	if(result instanceof ParserError) throw result;
	return result as T;
}

export function createCast<T>(shape?: never): (data: unknown) => T {
	return (data) => cast(data, shape);
}
