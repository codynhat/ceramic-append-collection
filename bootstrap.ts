import { writeFile } from 'fs/promises'
import { CeramicClient } from '@ceramicnetwork/http-client'
import { ModelManager } from '@glazed/devtools'
import { DID } from 'dids'
import { Ed25519Provider } from 'key-did-provider-ed25519'
import { getResolver } from 'key-did-resolver'

require('dotenv').config()

const ceramic = new CeramicClient()

const AppendCollectionSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $comment: "appendCollection:<CollectionSliceSchemaId>",
  title: "Collection",
  type: "object",
  properties: {
    sliceMaxItems: { type: "integer", minimum: 10, maximum: 256 },
    slicesCount: { type: "integer", minimum: 1 },
  },
  required: ["sliceMaxItems", "slicesCount"]
}

const CollectionSliceSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $comment: "collectionSlice",
  title: "CollectionSlice",
  type: "object",
  properties: {
    // collection: { type: "string", maxLength: 150 },
    // sliceIndex: { type: "integer", minimum: 0 },
    contents: {
      type: "array",
      maxItems: 256,
      minItems: 0,
      items: {
        oneOf: [{ type: "object", "additionalProperties": true }, { type: "null" }, { type: 'string' }],
      },
    },
  },
  // required: ["collection", "sliceIndex", "contents"],
}

async function bootstrap() {
  const seed: any = process.env.PRIVATE_KEY
  const key: Buffer = Buffer.from(seed, 'base64')
  const provider = new Ed25519Provider(key)
  const resolver = getResolver()
  ceramic.did = new DID({ provider, resolver })
  await ceramic.did.authenticate()

  const manager = new ModelManager(ceramic)
  const collectionSliceSchemaId: any = await manager.createSchema('CollectionSlice', CollectionSliceSchema)
  AppendCollectionSchema.$comment = "appendCollection:"+collectionSliceSchemaId
  const appendCollectionSchemaId: string = await manager.createSchema('AppendCollection', AppendCollectionSchema)
  if(appendCollectionSchemaId === null) return
  
  const schema = manager.getSchemaURL(appendCollectionSchemaId)
  if(schema === null) return
  await manager.createDefinition('appendCollection', {
    name: 'Append Collection',
    description: 'An collection of items',
    schema: schema,
  })

  // Publish model to Ceramic node
  const model = await manager.toPublished()
  // Write published model to JSON file
  await writeFile('./src/model.json', JSON.stringify(model))
  console.log('Schemas written to ./src/model.json file:', model)
}

bootstrap().catch(console.error)