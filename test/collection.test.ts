import { randomBytes } from '@stablelib/random'
import { Ed25519Provider } from 'key-did-provider-ed25519'
import { DID } from 'dids'

import { AppendCollection, Collection, ViewableCollection, Item } from '../src/index';

const CeramicClient = require('@ceramicnetwork/http-client').default
const KeyDidResolver = require('key-did-resolver').default
const ceramic = new CeramicClient()

const oneMinute = 60000
jest.setTimeout(oneMinute / 2);

describe("test AppendCollection correctness", () => {
  
  beforeAll(async () => {
    const provider = new Ed25519Provider(randomBytes(32))
    const resolver = KeyDidResolver.getResolver()
    ceramic.did = new DID({ provider, resolver })
    await ceramic.did.authenticate()
  });

  it("create an append collection", async () => {
    const sliceMaxItems = 10
    const collection = await AppendCollection.create(ceramic, { sliceMaxItems })
    expect(collection).toBeTruthy()

    let firstItems = await collection.getFirstN(1)
    expect(firstItems.length).toEqual(0)
    let lastItems = await collection.getLastN(1)
    expect(lastItems.length).toEqual(0)

    const viewable = await AppendCollection.load(ceramic, collection.id)
    firstItems = await viewable.getFirstN(1)
    expect(firstItems.length).toEqual(0)
    lastItems = await viewable.getLastN(1)
    expect(lastItems.length).toEqual(0)
  });
  
  it("load an append collection", async () => {  
    const sliceMaxItems = 10
    const created = await AppendCollection.create(ceramic, { sliceMaxItems })
    const collection = await AppendCollection.load(ceramic, created.id.toString())
    expect(collection).toBeTruthy()

    const firstItems = await collection.getFirstN(1)
    expect(firstItems.length).toEqual(0)
    const lastItems = await collection.getLastN(1)
    expect(lastItems.length).toEqual(0)
  });

  it("add and remove items from an append collection", async () => {
    const sliceMaxItems = 10
    const inputArraySize = 31
    let collection = await AppendCollection.create(ceramic, { sliceMaxItems }) as Collection
    await runTest(collection, inputArraySize)
  });

  async function runTest(collection: Collection, inputArraySize: number) {
    let expected: string[] = []

    async function insert(item: string, inputArraySize: number, collection: any, expected: string[]) {
      await collection.insert(item)
      expected.push(item)
      const actual = await collection.getFirstN(inputArraySize)
      actual.forEach((item: Item, index: number) => {
        expect(item.value).toEqual(expected[index])
      });
    }
    
    const inputPromises = []
    for(let i = 0; i < inputArraySize; i++) {
      inputPromises.push(await insert('input ' + i, inputArraySize, collection, expected))
    }
    await Promise.all(inputPromises)
  
    while(expected.length > 0) {
      let actual = await collection.getFirstN(inputArraySize)
      const index = getRandomIndex(expected)
      const item: Item = actual[index]
      await collection.remove(item.cursor)
      expected.splice(index, 1)
  
      const writeable = await AppendCollection.load(ceramic, collection.id) as Collection
      const readonly = await AppendCollection.load(ceramic, collection.id) as ViewableCollection
    
      const promises = await Promise.all([
        writeable.getFirstN(inputArraySize),
        readonly.getFirstN(inputArraySize)
      ])
      const editable = promises[0]
      const viewable = promises[1]
      for(let i = 0; i < editable.length; i++) {
        const item: Item = await editable[i]
        const view: Item = await viewable[i]
        expect(item?.value).toEqual(expected[i])
        expect(item?.value).toEqual(view?.value)
      }
    }

  }

  function getRandomInt(min: number, max: number) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min); //The maximum is exclusive and the minimum is inclusive
  }

  function getRandomIndex(array: any[]) {
    return getRandomInt(0, array.length-1)
  }

});
