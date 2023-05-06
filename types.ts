export const enum Types {
	String,
	Number,
	Boolean,
	Unknown,
	Bigint,
	Object,
	Array,
	Tuple,
	Literal,
	Union,
	Intersection,
	Date,
	Reference
}

export const enum ObjectMembers {
	Property,
	IndexSignature
}

export const enum TupleElementType {
	Optional = 1,
	Variable = 2,
}

export type Shape =
	Types.String |
	Types.Number |
	Types.Boolean |
	Types.Unknown |
	Types.Bigint |
	Types.Date |
	[Types.Array, Shape] |
	[Types.Tuple, ...([Shape, TupleElementType?][])] |
	[Types.Literal, string | number | bigint | boolean | null | undefined] |
	[Types.Union, ...Shape[]] |
	[Types.Intersection, ...Shape[]] |
	[Types.Object, ...(([ObjectMembers.Property, string, Shape, true?] | [ObjectMembers.IndexSignature, Shape])[])] |
	[Types.Reference, ...number[]];

