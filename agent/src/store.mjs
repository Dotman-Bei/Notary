import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// The receipt store: every claim's plaintext and nonce, encrypted at rest with AES-256-GCM under a key
// derived from NOTARY_STORE_KEY (scrypt). The chain only ever sees the hash until the reveal.
//
// Entry states: pending (saved, seal not confirmed) → sealed (has an on-chain id) → revealed.
// An entry is written before its seal is sent, so a crash never loses a sealed claim's plaintext.

const VERSION = 1

export function openStore(path, passphrase, agent) {
  let salt
  let data
  if (existsSync(path)) {
    const file = JSON.parse(readFileSync(path, 'utf8'))
    if (file.v !== VERSION) throw new Error(`Unknown store version ${file.v} in ${path}`)
    salt = Buffer.from(file.salt, 'hex')
    const key = derive(passphrase, salt)
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(file.iv, 'hex'))
    decipher.setAuthTag(Buffer.from(file.tag, 'hex'))
    try {
      data = JSON.parse(Buffer.concat([decipher.update(Buffer.from(file.data, 'base64')), decipher.final()]).toString('utf8'))
    } catch {
      throw new Error(`Cannot decrypt ${path}: NOTARY_STORE_KEY is wrong or the file is damaged.`)
    }
    if (data.agent.toLowerCase() !== agent.toLowerCase()) {
      throw new Error(`${path} belongs to agent ${data.agent}, not ${agent}. Point NOTARY_STORE at this agent's own store.`)
    }
  } else {
    salt = randomBytes(16)
    data = { agent, receipts: [] }
  }
  const key = derive(passphrase, salt)

  const save = () => {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const body = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()])
    const file = { v: VERSION, salt: salt.toString('hex'), iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), data: body.toString('base64') }
    mkdirSync(dirname(path), { recursive: true })
    const tmp = `${path}.tmp`
    writeFileSync(tmp, JSON.stringify(file), { mode: 0o600 })
    renameSync(tmp, path) // atomic on the same volume, so a crash leaves the old store or the new one
  }

  return {
    data,
    save,
    byId: (id) => data.receipts.find((r) => r.id === id),
    add(entry) {
      data.receipts.push(entry)
      save()
      return entry
    },
  }
}

const derive = (passphrase, salt) => scryptSync(passphrase, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
