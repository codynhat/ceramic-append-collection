import { TileDocument } from '@ceramicnetwork/stream-tile'
import aliases from './model.json'

export interface Cursor {
  sliceIndex: number;
  contentIndex: number;
}

export interface Item {
  cursor: Cursor;
  value: any;
}

export interface AppendCollection {
  id: any;
  sliceMaxItems: number;
  slicesCount: number;
  insert(item: any): Promise<Cursor>;
  remove(cursor: Cursor): Promise<void>;
  getFirstN(N: number, fromCursor?: Cursor): Promise<Item[]>;
  getLastN(N: number, fromCursor?: Cursor): Promise<Item[]>;
  getItem(cursor: Cursor): Promise<Item | null>;
  getHeadCursor(cursor: Cursor): Cursor;
  getTailCursor(cursor: Cursor): Cursor;
  getNextCursor(cursor: Cursor): Cursor | null;
  getPreviousCursor(cursor: Cursor): Cursor | null;
}

const newSlice = async (ceramic: any, collectionId: string, index: number) => {
  const content = null

  const metadata = { 
    deterministic: true,
    schema: aliases.schemas.CollectionSlice,
    tags: [collectionId, index.toString()]
  }

  const opts = { 
    anchor: true,
    publish: true,
  }

  await TileDocument.create(ceramic, content, metadata, opts)
  const slice = await getSlice(ceramic, collectionId, index)
  return slice
}

const getSlice = async (ceramic: any, collectionId: string, index: number) => {
  const content = null

  const metadata = { 
    deterministic: true,
    schema: aliases.schemas.CollectionSlice,
    tags: [collectionId, index.toString()]
  }

  const opts = { 
    anchor: false, 
    publish: false,
  }

  const doc = await TileDocument.create(ceramic, content, metadata, opts)
  const slice = await TileDocument.load(ceramic, doc.id.toString())
  return slice
}

const create = async (ceramic: any, properties:any): Promise<AppendCollection> => {
  if(!properties?.sliceMaxItems)
    properties = { sliceMaxItems: 64 }
  else if(properties.sliceMaxItems < 10 || properties.sliceMaxItems > 256)
    throw new Error('properties.sliceMaxItems must be between 10 and 256')

  const content = {
    sliceMaxItems: properties.sliceMaxItems,
    slicesCount: 1
  }

  const metadata = {
    schema: aliases.schemas.AppendCollection,
  }

  const opts = {
    anchor: true,
    publish: true
  }

  const collection = await TileDocument.create(ceramic, content, metadata, opts)
  await newSlice(ceramic, collection.id.toString(), 0)
  return load(ceramic, collection.id.toString())
}

const load = async (ceramic: any, streamId: string): Promise<AppendCollection> => {
  const collection: any = await TileDocument.load(ceramic, streamId)
  let { sliceMaxItems, slicesCount } = collection.content
  
  const insert = async (item: any): Promise<Cursor> => {
    let currentSlice: any = await getSlice(ceramic, collection.id.toString(), slicesCount-1)
    let contents: any[] = currentSlice.content.contents || []
    if(contents.length === sliceMaxItems) {
      currentSlice = await newSlice(ceramic, collection.id.toString(), slicesCount)
      slicesCount = slicesCount + 1
      await collection.update({ sliceMaxItems, slicesCount })
      await currentSlice.update({ contents: [item] })
    }
    else {
      await currentSlice.update({ contents: [...contents, item] })
    }

    const slice: any = await getSlice(ceramic, collection.id.toString(), slicesCount-1)
    return { sliceIndex: slice.metadata.tags[1], contentIndex: slice.content.contents?.length - 1 }
  }
  
  const remove = async (cursor: Cursor) => {
    if(cursor.sliceIndex >= slicesCount) throw new Error('invalid cursor.sliceIndex')
    
    const slice: any = await getSlice(ceramic, collection.id.toString(), cursor.sliceIndex)
    const contents = slice.content.contents
    if(cursor.contentIndex >= contents.length) throw new Error('invalid cursor.contentIndex')

    contents[cursor.contentIndex] = null
    await slice.update({ contents: contents })
  }

  const getFirstN = async (N: number, fromCursor: Cursor = getHeadCursor()): Promise<Item[]> => {
    
    async function recursiveSearch(items: any[], cursor: Cursor): Promise<any[]> {
      let { sliceIndex, contentIndex } = cursor
      if(sliceIndex < 0 || sliceIndex >= slicesCount) 
        throw new Error('Invalid sliceIndex: must be between 0 and slicesCount-1')

      const slice: any = await getSlice(ceramic, collection.id.toString(), sliceIndex)
      const contents: any[] = slice.content.contents
      if(!contents) return []
      
      if(contentIndex < 0)
        throw new Error('Invalid contentIndex: must be greater than 0')
      if(contentIndex >= contents.length) 
        throw new Error('Invalid contentIndex: must be lower than contents.length')

      for (let index = contentIndex; index < contents.length; index++) {
        const item = contents[index];
        if(item) {
          items.push({
            cursor: { sliceIndex, contentIndex: index },
            value: item
          })
        }

        if(items.length === N) break;
      }

      sliceIndex = sliceIndex + 1
      if(items.length === N || sliceIndex === slicesCount)
        return items
      else
        return await recursiveSearch(items, { sliceIndex, contentIndex: 0 })
    }

    let items: any[] = await recursiveSearch([], fromCursor)
    return items
  }

  const getLastN = async (N: number, fromCursor: Cursor = getTailCursor()): Promise<Item[]> => {
    
    async function recursiveSearch(items: any[], cursor: Cursor): Promise<any[]> {
      let { sliceIndex, contentIndex } = cursor
      if(contentIndex < 0) throw new Error('Invalid contentIndex: cannot be less than 0')
      if(sliceIndex < 0 || sliceIndex >= slicesCount) throw new Error('Invalid sliceIndex: must be between 0 and slicesCount-1')
      const slice: any = await getSlice(ceramic, collection.id.toString(), sliceIndex)
      const contents: any[] = slice.content.contents
      if(!contents) return []

      if(contentIndex >= 256) contentIndex = contents.length
      if(contentIndex !== 0) {
        for (let index = contentIndex; index >= 0; index--) {
          const item = contents[index];
          if(item) {
            items.push({
              cursor: { sliceIndex, contentIndex: index },
              value: item
            })
          }
  
          if(items.length === N) break;
        }
      }

      sliceIndex = sliceIndex - 1
      if(items.length === N || sliceIndex < 0)
        return items
      else
        return await recursiveSearch(items, { sliceIndex, contentIndex: 256 })
    }

    let items: any[] = await recursiveSearch([], fromCursor)
    return items
  }

  const getItem = async (cursor: Cursor): Promise<Item | null> => {
    if(cursor.sliceIndex >=  slicesCount) return null
    if(cursor.contentIndex >=  sliceMaxItems) return null

    const slice: any = await getSlice(ceramic, collection.id.toString(), cursor.sliceIndex)
    return {
      cursor,
      value: slice?.content.contents[cursor.contentIndex]
    }
  }

  const getNextCursor = (cursor: Cursor): Cursor | null => {
    const { sliceIndex, contentIndex } = cursor
    const nextContentIndex = contentIndex + 1
    const getNextSlice = nextContentIndex === sliceMaxItems
    if(getNextSlice) {
      if(sliceIndex >= slicesCount) return null
      return { sliceIndex: sliceIndex + 1, contentIndex: 0 }
    }
    else {
      return { sliceIndex: sliceIndex, contentIndex: contentIndex + 1 }
    }
  }

  const getPreviousCursor = (cursor: Cursor): Cursor | null => {
    const { sliceIndex, contentIndex } = cursor
    const prevContentIndex = contentIndex - 1
    const getPrevSlice = prevContentIndex < 0
    if(getPrevSlice) {
      if(sliceIndex <= 0) return null
      return { sliceIndex: sliceIndex - 1, contentIndex: sliceMaxItems - 1 }
    }
    else {
      return { sliceIndex: sliceIndex, contentIndex: contentIndex - 1 }
    }
  }

  const getHeadCursor = (): Cursor => {
    return { sliceIndex: 0, contentIndex: 0 }
  }

  const getTailCursor = (): Cursor => {
    return { sliceIndex: slicesCount - 1, contentIndex: 256 }
  }

  return {
    id: collection.id,
    sliceMaxItems,
    slicesCount,
    insert,
    remove,
    getFirstN,
    getLastN,
    getItem,
    getNextCursor,
    getPreviousCursor,
    getHeadCursor,
    getTailCursor,
  }
}

export {
  create,
  load,
}