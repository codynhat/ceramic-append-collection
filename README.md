# Ceramic Append Collection

This guide describes how to create, update, and query an Append Collection based on [CIP-85](https://github.com/ceramicnetwork/CIP/blob/main/CIPs/CIP-85/CIP-85.md).

## Installation

	npm install @cbj/ceramic-append-collection

## Basic Use

	import { AppendCollection } from '@cbj/ceramic-append-collection'

	const collection = await AppendCollection.create(ceramic, { sliceMaxItems })
	/* or */
	const collection = await AppendCollection.load(ceramic, streamId)
	const streamId = collection.id.toString()
	
	const cursor = await collection.insert({ foo: 'bar' })
	const cursor2 = await collection.insert({ foo: 'baz' })
	const item1 = await collection.getItem(cursor)
	const item2 = await collection.getItem(cursor2)
	console.log(item1.value) // { foo: 'bar' }
	console.log(item2.value) // { foo: 'baz' }
		
	let firstItems = await collection.getFirstN(1) 
	console.log(firstItems) // [ { foo: 'bar' } ]
	firstItems = await collection.getFirstN(2)
	console.log(firstItems) // [ { foo: 'baz' }, { foo: 'baz' } ]
	let lastItems = await collection.getLastN(1) 
	console.log(lastItems) // [ { foo: 'baz' } ]
	lastItems = await collection.getLastN(2)
	console.log(lastItems) // [ { foo: 'baz' }, { foo: 'bar' } ]
	
	await collection.remove(item1.cursor)
	firstItems = await collection.getFirstN(2)
	console.log(firstItems) // [ { foo: 'baz' } ]
	await collection.remove(item2.cursor)
	firstItems = await collection.getFirstN(2)
	console.log(firstItems) // []
	

## Query a Collection

	getFirstN(N: number, fromCursor?: Cursor | null): Promise<Item[]>;

	getLastN(N: number, fromCursor?: Cursor | null): Promise<Item[]>;

	getItem(cursor: Cursor): Promise<Item | null>;

	getHeadCursor(): Promise<Cursor | null>;

	getTailCursor(): Promise<Cursor | null>;

	getNextCursor(cursor: Cursor): Promise<Cursor | null>;

	getPreviousCursor(cursor: Cursor): Promise<Cursor | null>;

	getSlicesCount(): Promise<number>;
