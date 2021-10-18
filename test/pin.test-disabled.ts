import { randomBytes } from '@stablelib/random'
import { Ed25519Provider } from 'key-did-provider-ed25519'
import { DID } from 'dids'

import { AppendCollection, Item } from '../src/index';

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

  async function removeAllPinnedStreams() {
    const pinnedStreams = await ceramic.pin.ls()
    for await (const item of pinnedStreams) {
      await ceramic.pin.rm(item);
    }
  }

  async function getPinnedStream() {
    const pinnedStreams = await ceramic.pin.ls()
    const pinned = [];
    for await (const item of pinnedStreams) {
      pinned.push(item);
    }
    return pinned
  }

  it("pin and unpin an append collection", async () => {
    await removeAllPinnedStreams()

    const sliceMaxItems = 10
    const collection = await AppendCollection.create(ceramic, { sliceMaxItems })

    await collection.pin(true)
    let isPinned = await collection.isPinned()
    let pinnedStreams = await getPinnedStream()
    // console.log(pinnedStreams)
    expect(pinnedStreams.length).toEqual(2)
    expect(isPinned).toEqual(true)

    const inputPromises = []
    for(let i = 0; i < sliceMaxItems+1; i++) {
      inputPromises.push(await collection.insert('item ' + i))
    }
    await Promise.all(inputPromises)
    pinnedStreams = await getPinnedStream()
    // console.log(pinnedStreams)
    expect(pinnedStreams.length).toEqual(3)
    expect(isPinned).toEqual(true)

    await collection.pin(false)
    isPinned = await collection.isPinned()
    expect(isPinned).toEqual(false)

    pinnedStreams = await getPinnedStream()
    // console.log(pinnedStreams)
    expect(pinnedStreams.length).toEqual(0)
  });

});
