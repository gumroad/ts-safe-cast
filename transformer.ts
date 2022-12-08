import * as path from 'path';
import * as ts from 'typescript';
import {ObjectMembers, Types} from './types';

const objectFlags = (type: ts.Type) => (type as ts.ObjectType).objectFlags ?? 0;
const isReference = (type: ts.Type): type is ts.TypeReference => !!(objectFlags(type) & ts.ObjectFlags.Reference);

const handleCall = (checker: ts.TypeChecker, node: ts.CallExpression) => {
	const f = ts.factory;
	const simpleFormat = f.createNumericLiteral;
	const format = (method: Types, ...args: Array<ts.Expression>) => f.createArrayLiteralExpression([f.createNumericLiteral(method), ...args]);
	const objectMember = (type: ObjectMembers, ...args: Array<ts.Expression>) => f.createArrayLiteralExpression([f.createNumericLiteral(type), ...args]);
	const walkType = (type: ts.Type): ts.Expression => {
		if(type.isIntersection())
			return format(Types.Intersection, ...type.types.map(walkType));
		const symbol = type.symbol ?? type.aliasSymbol;
		if(symbol?.declarations) {
			// @ts-expect-error TS does not expose this, but `Ambient` nodes are those in `declare` blocks or .d.ts files
			if(symbol.declarations.some((node) => node.flags & ts.NodeFlags.Ambient)) {
				if(symbol.name === 'Date') return simpleFormat(Types.Date);
				if(symbol.name === 'Array' || symbol.name === 'ReadonlyArray') {
					const argument = (type as ts.TypeReference).typeArguments?.[0];
					return format(Types.Array, argument ? walkType(argument) : simpleFormat(Types.Unknown));
				}
			}
		}
		if(isReference(type) && objectFlags(type.target) & ts.ObjectFlags.Tuple)
			return format(Types.Tuple, ...((type as ts.TupleType).typeArguments ?? []).map(walkType));
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
			return format(Types.Union, ...types.map(walkType));
		}
		if(type.flags & ts.TypeFlags.Null)
			return format(Types.Literal, f.createNull());
		if(type.flags & ts.TypeFlags.Undefined)
			// @ts-expect-error TS does not expose a way to create an `undefined` Expression
			return format(Types.Literal, f.createToken(ts.SyntaxKind.UndefinedKeyword));
		if(type.flags & ts.TypeFlags.Object) {
			const stringIndexType = type.getStringIndexType();
			if(stringIndexType) {
				if(stringIndexType.flags & ts.TypeFlags.Never)
					return format(Types.Object);
				return format(Types.Object, objectMember(ObjectMembers.IndexSignature, walkType(stringIndexType)));
			}
			const properties = checker.getPropertiesOfType(type);
			return format(Types.Object, ...properties.map((member) => {
				const args = [f.createStringLiteral(member.name), walkType(checker.getTypeOfSymbolAtLocation(member, node))];
				if(member.flags & ts.SymbolFlags.Optional) args.push(f.createTrue());
				return objectMember(ObjectMembers.Property, ...args);
			}));
		}
		throw new Error(`Cannot parse a ${checker.typeToString(type)}`);
	};
	// @ts-expect-error TS does not expose a general way to get a call expression's type parameters
	const type = checker.getResolvedSignature(node)?.mapper?.target;
	if(!type) throw new Error(`Unable to get type for ${node.getText()}`);
	return walkType(type);
};

export default function(program: ts.Program): ts.TransformerFactory<ts.SourceFile> {
	return (context) => (file) => {
		if(path.dirname(file.fileName) === __dirname) return file;
		const f = context.factory;
		const checker = program.getTypeChecker();

		const visitor: ts.Visitor = (node) => {
			if(ts.isCallExpression(node)) {
				const type = checker.getTypeAtLocation(node.expression);
				if(type?.symbol?.declarations?.[0]?.getSourceFile().fileName === path.join(__dirname, 'index.ts')) {
					try {
						const format = handleCall(checker, node);
						return f.updateCallExpression(node, node.expression, node.typeArguments, [...node.arguments, format]);
					} catch(e) {
						if(!(e instanceof Error)) throw e;
						const location = file.getLineAndCharacterOfPosition(node.pos);
						throw new Error(`ts-safe-cast transformer error: ${e.message}  at ${file.fileName}:${location.line + 1}:${location.character + 1}`);
					}
				}
			}
			return ts.visitEachChild(node, visitor, context);
		};
		return ts.visitEachChild(file, visitor, context);
	};
}
