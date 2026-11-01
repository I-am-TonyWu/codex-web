import { PassThrough } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import { expect, it } from 'vitest'
import { isRequestOriginAllowed, readRequestBody } from './requestPolicy'
import { isDirectLocalRequest } from './authMiddleware'
it('limits development access to a direct loopback host, including IPv6', () => {
  const local = (host: string, remoteAddress = '127.0.0.1') => isDirectLocalRequest({ headers: { host }, socket: { remoteAddress } } as unknown as IncomingMessage)
  expect(local('localhost:5173')).toBe(true)
  expect(local('[::1]:5173', '::1')).toBe(true)
  expect(local('localhost.evil:5173')).toBe(false)
  expect(local('remote.example')).toBe(false)
  expect(local('localhost:5173', '192.0.2.1')).toBe(false)
})
it('fails closed for opaque origins, sibling sites, wrong schemes and malformed origins', () => {
  for (const origin of ['null', 'broken', 'http://elsewhere', 'https://localhost:3000']) {
    expect(isRequestOriginAllowed({ headers: { host: 'localhost:3000', origin }, socket: {} } as unknown as IncomingMessage)).toBe(false)
  }
  expect(isRequestOriginAllowed({ headers: { host: 'remote.example', origin: 'https://remote.example', 'x-forwarded-proto': 'https' }, socket: {} } as unknown as IncomingMessage)).toBe(true)
  expect(isRequestOriginAllowed({ headers: { host: 'localhost:3000', 'sec-fetch-site': 'cross-site' }, socket: {} } as unknown as IncomingMessage)).toBe(false)
})
it('rejects an interrupted stream and removes body listeners', async () => {
  const req = Object.assign(new PassThrough(), { headers: {}, aborted: false }) as unknown as IncomingMessage
  const read = readRequestBody(req, 1024)
  req.emit('data', Buffer.from('partial'))
  req.emit('aborted')
  await expect(read).rejects.toMatchObject({ statusCode: 400 })
  expect(req.listenerCount('data')).toBe(0); expect(req.listenerCount('aborted')).toBe(0)
})
