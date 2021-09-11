import { randomBytes } from '@stablelib/random'
import { writeFileSync } from 'fs'

require('dotenv').config()

const generateSeed = async () => {
  if(!process.env.PRIVATE_KEY) {
    const seed = Buffer.from(randomBytes(32)).toString('base64')
    await writeFileSync('./.env', "PRIVATE_KEY=" + seed)
  }
  else {
    throw new Error('.env.PRIVATE_KEY already exists!')
  }
}

generateSeed()