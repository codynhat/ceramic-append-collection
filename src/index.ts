import { TileDocument, TileMetadataArgs } from '@ceramicnetwork/stream-tile'
import aliases from './model.json'

export interface Cursor {
  sliceIndex: number;
  contentIndex: number;
}

export interface Item {
  cursor: Cursor;
  value: any;
}

export interface ViewableCollection {
  id: any;
  getFirstN(N: number, fromCursor?: Cursor | null): Promise<Item[]>;
  getLastN(N: number, fromCursor?: Cursor | null): Promise<Item[]>;
  getItem(cursor: Cursor): Promise<Item | null>;
  getHeadCursor(): Promise<Cursor | null>;
  getTailCursor(): Promise<Cursor | null>;
  getNextCursor(cursor: Cursor): Promise<Cursor | null>;
  getPreviousCursor(cursor: Cursor): Promise<Cursor | null>;
  pin(shouldBePinned: boolean): Promise<void>;
  isPinned(): Promise<boolean>;
}

export interface Collection extends ViewableCollection {
  insert(item: any): Promise<Cursor>;
  remove(cursor: Cursor): Promise<void>;
}

const isPinned = async (ceramic: any, streamId: string): Promise<boolean> => {
  const pinnedStreams = await ceramic.pin.ls(streamId)
  const pinned = [];
  for await (const item of pinnedStreams) {
    pinned.push(item);
  }
  return pinned.includes(streamId)
}

const newSlice = async (ceramic: any, controller: string, collectionId: string, index: number) => {
  const content = null

  const metadata = { 
    deterministic: true,
    schema: aliases.schemas.CollectionSlice,
    tags: [collectionId, index.toString()],
    controllers: [controller]
  }

  const opts = { 
    anchor: true,
    publish: true,
  }

  await TileDocument.create(ceramic, content, metadata, opts)
  const slice = await getSlice(ceramic, controller, collectionId, index)
  if(await isPinned(ceramic, collectionId)) ceramic.pin.add(slice.id.toString())

  return slice
}

const getSlice = async (ceramic: any, controller: string, collectionId: string, index: number) => {
  const content = null

  const metadata: TileMetadataArgs = { 
    deterministic: true,
    schema: aliases.schemas.CollectionSlice,
    tags: [collectionId, index.toString()],
    controllers: [controller]
  }

  const opts = { 
    anchor: false, 
    publish: false,
  }

  const doc = await TileDocument.create(ceramic, content, metadata, opts)
  const slice = await TileDocument.load(ceramic, doc.id.toString())
  return slice
}

const create = async (ceramic: any, properties:any): Promise<ViewableCollection | Collection> => {
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
  const controller = ceramic.did.id.toString()
  await newSlice(ceramic, controller, collection.id.toString(), 0)
  return load(ceramic, collection.id.toString())
}

const load = async (ceramic: any, streamId: string): Promise<ViewableCollection | Collection> => {
  const collection: any = await TileDocument.load(ceramic, streamId)
  const controller: string = collection.metadata.controllers[0]
  let { sliceMaxItems, slicesCount } = collection.content
  
  const insert = async (item: any): Promise<Cursor> => {
    let currentSlice: any = await getSlice(ceramic, controller, collection.id.toString(), slicesCount-1)
    let contents: any[] = currentSlice.content.contents || []
    if(contents.length === sliceMaxItems) {
      const controller = ceramic.did.id.toString()
      currentSlice = await newSlice(ceramic, controller, collection.id.toString(), slicesCount)
      slicesCount = slicesCount + 1
      await collection.update({ sliceMaxItems, slicesCount })
      await currentSlice.update({ contents: [item] })
    }
    else {
      await currentSlice.update({ contents: [...contents, item] })
    }

    const slice: any = await getSlice(ceramic, controller, collection.id.toString(), slicesCount-1)
    return { sliceIndex: slice.metadata.tags[1], contentIndex: slice.content.contents?.length - 1 }
  }
  
  const remove = async (cursor: Cursor) => {
    if(cursor.sliceIndex >= slicesCount) throw new Error('invalid cursor.sliceIndex')
    
    const slice: any = await getSlice(ceramic, controller, collection.id.toString(), cursor.sliceIndex)
    const contents = slice.content.contents
    if(cursor.contentIndex >= contents.length) throw new Error('invalid cursor.contentIndex')

    contents[cursor.contentIndex] = null
    await slice.update({ contents: contents })
  }
  
  const getFirstN = async (N: number, fromCursor?: Cursor | null): Promise<Item[]> => {
    if(!fromCursor) fromCursor = { sliceIndex: 0, contentIndex: 0 }
    if(!fromCursor) return []

    async function recursiveSearch (items: any[], cursor: Cursor): Promise<any[]> {
      let { sliceIndex, contentIndex } = cursor
      if(sliceIndex < 0 || sliceIndex >= slicesCount) 
        throw new Error('Invalid sliceIndex: must be between 0 and slicesCount-1')
  
      const slice: any = await getSlice(ceramic, controller, collection.id.toString(), sliceIndex)
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

  const getLastN = async (N: number, fromCursor?: Cursor | null): Promise<Item[]> => {
    if(!fromCursor) fromCursor = { sliceIndex: await getSlicesCount() - 1, contentIndex: sliceMaxItems - 1}
    if(!fromCursor) return []
    
    async function recursiveSearch(items: any[], cursor: Cursor): Promise<any[]> {
      let { sliceIndex, contentIndex } = cursor
      if(contentIndex < 0) throw new Error('Invalid contentIndex: cannot be less than 0')
      if(sliceIndex < 0 || sliceIndex >= slicesCount) throw new Error('Invalid sliceIndex: must be between 0 and slicesCount-1')
      const slice: any = await getSlice(ceramic, controller, collection.id.toString(), sliceIndex)
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
    if(cursor.sliceIndex >= slicesCount) return null
    if(cursor.contentIndex >= sliceMaxItems) return null
    
    const slice: any = await getSlice(ceramic, controller, collection.id.toString(), cursor.sliceIndex)
    if(slice.content?.contents.length <= cursor.contentIndex) return null
    
    return {
      cursor,
      value: slice?.content.contents[cursor.contentIndex]
    }
  }

  const getNextCursor = async (cursor: Cursor): Promise<Cursor | null> => {
    const { sliceIndex, contentIndex } = cursor
    const nextContentIndex = contentIndex + 1
    const getNextSlice = nextContentIndex === sliceMaxItems
    if(getNextSlice) {
      const slicesCount = await getSlicesCount()
      if(sliceIndex >= slicesCount) return null
      return { sliceIndex: sliceIndex + 1, contentIndex: 0 }
    }
    else {
      return { sliceIndex: sliceIndex, contentIndex: contentIndex + 1 }
    }
  }

  const getPreviousCursor = async (cursor: Cursor): Promise<Cursor | null> => {
    const { sliceIndex, contentIndex } = cursor
    const prevContentIndex = contentIndex - 1
    const getPrevSlice = prevContentIndex < 0
    if(getPrevSlice) {
      if(sliceIndex <= 0) return null
      return { sliceIndex: sliceIndex - 1, contentIndex: sliceMaxItems - 1 }
    }
    else {
      return { sliceIndex: sliceIndex, contentIndex: prevContentIndex }
    }
  }

  const getHeadCursor = async (): Promise<Cursor | null> => {
    const [ item ]  = await getFirstN(1)
    return item.cursor
  }

  const getTailCursor = async (): Promise<Cursor | null> => {
    const [ item ]  = await getLastN(1)
    return item.cursor
  }

  const getSlicesCount = async (): Promise<number> => {
    const collection: any = await TileDocument.load(ceramic, streamId)
    return collection.content.slicesCount
  }

  const isPinned = async (): Promise<boolean> => {
    const pinnedStreams = await ceramic.pin.ls(streamId)
    const pinned = [];
    for await (const item of pinnedStreams) {
      pinned.push(item);
    }
    return pinned.includes(streamId)
  }

  const pin = async (shouldBePinned: boolean): Promise<void> => {
    const alreadyPinned = await isPinned()
    if(shouldBePinned && !alreadyPinned) {
      await ceramic.pin.add(streamId)
      let promises: Promise<any>[] = []
      for(let i = 0; i < slicesCount; i++) {
        promises.push(getSlice(ceramic, controller, streamId, i))
      }
      const slices = await Promise.all(promises)
      promises = []
      slices.forEach((slice) => {
        promises.push(ceramic.pin.add(slice.id.toString()))
      })
      await Promise.all(promises)
    }
    else {
      await ceramic.pin.rm(streamId)
      let promises: Promise<any>[] = []
      for(let i = 0; i < slicesCount; i++) {
        promises.push(getSlice(ceramic, controller, streamId, i))
      }
      const slices = await Promise.all(promises)
      promises = []
      slices.forEach((slice) => {
        promises.push(ceramic.pin.rm(slice.id.toString()))
      })
      await Promise.all(promises)
    }
  }

  const viewable: ViewableCollection = {
    id: collection.id,
    getFirstN,
    getLastN,
    getItem,
    getNextCursor,
    getPreviousCursor,
    getHeadCursor,
    getTailCursor,
    isPinned,
    pin,
  }

  if(ceramic?.did?.id.toString() !== controller) {
    return viewable
  }
  else {
    return {
      ...viewable,
      insert,
      remove,
    }
  }

}

export const AppendCollection = {
  create,
  load,
}