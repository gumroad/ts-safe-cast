import * as path from 'path';
import * as ts from 'typescript';
import {ObjectMembers, TupleElementType, Types} from './types';

const handleCall = (checker: ts.TypeChecker, node: ts.CallExpression) => {
	const f = ts.factory;
	const simpleFormat = f.createNumericLiteral;
	const format = (method: Types, ...args: ts.Expression[]) => f.createArrayLiteralExpression([f.createNumericLiteral(method), ...args]);
	const objectMember = (type: ObjectMembers, ...args: ts.Expression[]) => f.createArrayLiteralExpression([f.createNumericLiteral(type), ...args]);
	const path: number[] = [];
	const seenTypes = new Map<ts.Type, number[]>();
	const walkWithPath = (type: ts.Type, ...newPath: number[]) => {
		path.push(...newPath);
		const def = walkType(type);
		path.splice(path.length - newPath.length, newPath.length);
		return def;
	}
	const walkTypes = (types: readonly ts.Type[]) => types.map((type, i) => walkWithPath(type, i + 1));
	const walkType = (type: ts.Type): ts.Expression => {
		const ref = seenTypes.get(type);
		if(ref)
			return format(Types.Reference, ...ref.map(f.createNumericLiteral));
		if(type.isIntersection())
			return format(Types.Intersection, ...walkTypes(type.types));
		const symbol = type.symbol ?? type.aliasSymbol;
		if(symbol?.declarations) {
			// @ts-expect-error TS does not expose this, but `Ambient` nodes are those in `declare` blocks or .d.ts files
			if(symbol.declarations.some((node) => node.flags & ts.NodeFlags.Ambient)) {
				if(symbol.name === 'Date') return simpleFormat(Types.Date);
			}
		}
		if(checker.isArrayType(type)) {
			const argument = (type as ts.TypeReference).typeArguments?.[0];
			return format(Types.Array, argument ? walkWithPath(argument, 1) : simpleFormat(Types.Unknown));
		}
		if(checker.isTupleType(type)) {
			const elementFlags = ((type as ts.TypeReference).target as ts.TupleType).elementFlags;
			return format(Types.Tuple, ...((type as ts.TupleType).typeArguments ?? []).map((type, i) => {
				const array = [walkWithPath(type, i + 1, 1)];
				const flags = elementFlags[i]!;
				if(!(flags & ts.ElementFlags.Required))
					array.push(f.createNumericLiteral((flags & ts.ElementFlags.Variable) ? TupleElementType.Variable : TupleElementType.Optional));
				return f.createArrayLiteralExpression(array);
			}));
		}
		if(type.flags & ts.TypeFlags.StringLiteral)
			return format(Types.Literal, f.createStringLiteral((type as ts.StringLiteralType).value));
		if(type.flags & ts.TypeFlags.NumberLiteral)
			return format(Types.Literal, f.createNumericLiteral((type as ts.NumberLiteralType).value));
		if(type.flags & ts.TypeFlags.BigIntLiteral)
			return format(Types.Literal, f.createBigIntLiteral((type as ts.BigIntLiteralType).value));
		if(type.flags & ts.TypeFlags.BooleanLiteral)
			// @ts-expect-error TS does not expose this, but `intrinsicName` is the only way to distinguish between boolean types
			return format(Types.Literal, type.intrinsicName === 'true' ? f.createTrue() : f.createFalse());
		if(type.flags & ts.TypeFlags.Number)
			return simpleFormat(Types.Number);
		if(type.flags & ts.TypeFlags.String)
			return simpleFormat(Types.String);
		if(type.flags & ts.TypeFlags.Boolean)
			return simpleFormat(Types.Boolean);
		if(type.flags & ts.TypeFlags.Unknown)
			return simpleFormat(Types.Unknown);
		if(type.isUnion()) {
			// The checker flattens union types, including booleans and enums. This handles those "base types".
			// Adapted from `formatUnionTypes` in https://github.com/microsoft/TypeScript/blob/main/src/compiler/checker.ts
			const types = [];
			for(let i = 0; i < type.types.length; ++i) {
				const part = type.types[i]!;
				const baseType = checker.getBaseTypeOfLiteralType(part);
				if(baseType.isUnion()) {
					const count = baseType.types.length;
					if (i + count <= type.types.length && type.types[i + count - 1] === baseType.types[count - 1]) {
						types.push(baseType);
						i += count - 1;
						continue;
					}
				}
				types.push(part);
			}
			return format(Types.Union, ...walkTypes(types));
		}
		if(type.flags & ts.TypeFlags.Null)
			return format(Types.Literal, f.createNull());
		if(type.flags & ts.TypeFlags.Undefined)
			// @ts-expect-error TS does not expose a way to create an `undefined` Expression
			return format(Types.Literal, f.createToken(ts.SyntaxKind.UndefinedKeyword));
		if(type.flags & ts.TypeFlags.Object) {
			seenTypes.set(type, path.slice());
			const stringIndexType = type.getStringIndexType();
			if(stringIndexType) {
				if(stringIndexType.flags & ts.TypeFlags.Never)
					return format(Types.Object);
				return format(Types.Object, objectMember(ObjectMembers.IndexSignature, walkWithPath(stringIndexType, 1, 1)));
			}
			const properties = checker.getPropertiesOfType(type);
			return format(Types.Object, ...properties.map((member, i) => {
				const args = [f.createStringLiteral(member.name), walkWithPath(checker.getTypeOfSymbolAtLocation(member, node), i + 1, 2)];
				if(member.flags & ts.SymbolFlags.Optional) args.push(f.createTrue());
				return objectMember(ObjectMembers.Property, ...args);
			}));
		}
		if(type.flags & ts.TypeFlags.NonPrimitive)
			return format(Types.Object);
		throw new Error(`Cannot parse a ${checker.typeToString(type)}`);
	};
	// @ts-expect-error TS does not expose a general way to get a call expression's type parameters
	const type = checker.getResolvedSignature(node)?.mapper?.target;
	if(!type) throw new Error(`Unable to get type for ${node.getText()}`);
	return walkType(type);
};

export default function(program: ts.Program): ts.TransformerFactory<ts.SourceFile> {
	return (context) => (file) => {
		if(path.dirname(file.fileName) === __dirname || file.isDeclarationFile || path.extname(file.fileName) === ".js") return file;
		const f = context.factory;
		const checker = program.getTypeChecker();

		const visitor: ts.Visitor = (node) => {
			node = ts.visitEachChild(node, visitor, context);
			if(ts.isCallExpression(node)) {
				const type = checker.getTypeAtLocation(node.expression);
				if(type?.symbol?.declarations?.[0]?.getSourceFile().fileName.endsWith("node_modules/ts-safe-cast/index.ts")) {
					try {
						const format = handleCall(checker, node);
						return f.updateCallExpression(node, node.expression, node.typeArguments, [...node.arguments, format]);
					} catch(e) {
						if(!(e instanceof Error)) throw e;
						const location = file.getLineAndCharacterOfPosition(node.pos);
						throw new Error(`ts-safe-cast transformer error: ${e.message} at ${file.fileName}:${location.line + 1}:${location.character + 1}`);
					}
				}
			}
			return node;
		};
		return ts.visitEachChild(file, visitor, context);
	};
}
