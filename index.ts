import {ObjectMembers, Shape, Types} from './types';

class ParserError extends Error {}

function fail(path: string, expected: string, data: unknown) {
	return new ParserError(`Expected ${path} to be ${expected}, got ${data}`);
}

function validate(data: unknown, shape: Shape, path: string): ParserError | undefined {
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
						const error = validate(object[key], property[2], newPath);
						if(error) return error;
						break;
					case ObjectMembers.IndexSignature:
						for(const key in object) {
							const error = validate(object[key], property[1], `${path}.${key}`);
							if(error) return error;
						}
				}
			}
			return;
		}
		case Types.Array: {
			if(!Array.isArray(data)) return fail(path, 'an array', data);
			for(let i = 0; i < data.length; ++i) {
				const error = validate(data[i], shape[1], `${path}.${i}`);
				if(error) return error;
			}
			return;
		}
		case Types.Tuple: {
			const [_, ...items] = shape;
			if(!Array.isArray(data) || data.length !== items.length) return fail(path, `a ${items.length}-tuple`, data);
			for(const [i, shape] of items.entries()) {
				const error = validate(data[i], shape, `${path}.${i}`);
				if(error) return error;
			}
			return;
		}
		case Types.Literal: {
			return data === shape[1] ? undefined : fail(path, `${shape[1]}`, data);
		}
		case Types.Union: {
			const [_, ...options] = shape;
			const errors: ParserError[] = [];
			for(const option of options) {
				const error = validate(data, option, path);
				if(!error) return;
				errors.push(error);
			}
			return new ParserError(`Expected ${path} to be a union, but no branches matched: ${errors.map(error => `\n\t• ${error}`).join('')}`);
		}
		case Types.Intersection: {
			const [_, ...members] = shape;
			for(const member of members) {
				const error = validate(data, member, path);
				if(error) return error;
			}
		}
	}
}

export function is<T>(data: unknown, shape?: never): data is T {
	if(shape == null) throw new Error('Please ensure that the ts-safe-cast transformer is run.');
	return !validate(data, shape as Shape, 'root');
}

export function createIs<T>(shape?: never): (data: unknown) => data is T {
	return (data): data is T => is(data, shape);
}

export function cast<T>(data: unknown, shape?: never): T {
	if(shape == null) throw new Error('Please ensure that the ts-safe-cast transformer is run.');
	const error = validate(data, shape as Shape, 'root');
	if(error) throw error;
	return data as T;
}

export function createCast<T>(shape?: never): (data: unknown) => T {
	return (data) => cast(data, shape);
}
