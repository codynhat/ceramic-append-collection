
  

# Ceramic Append Collection

This guide describes how to create, update, and query an Append Collection.

## Installation

	npm install @cbj/ceramic-append-collection

## Basic Use

	import { AppendCollection } from '@cbj/cermic-append-collection'

	const collection = await AppendCollection.create(ceramic, { sliceMaxItems })
	const cursor = await collection.insert({ foo: 'bar' })
	const item = await collection.getItem(cursor)
	console.log(item.value) // { foo: 'bar' }
	await collection.remove(item.cursor)

	...

	const collection = await AppendCollection.load(ceramic, streamId)
	const firstItems = await collection.getFirstN(N)
	const lastItems = await collection.getLastN(N)

## Query a Collection

	getFirstN(N: number, fromCursor?: Cursor): Promise<Item[]>;

	getLastN(N: number, fromCursor?: Cursor): Promise<Item[]>;

	getItem(cursor: Cursor): Promise<Item | null>;

	getHeadCursor(cursor: Cursor): Cursor;

	getTailCursor(cursor: Cursor): Cursor;

	getNextCursor(cursor: Cursor): Cursor | null;

	getPreviousCursor(cursor: Cursor): Cursor | null;