// Route control traffic separately so business assertions still inspect real RPC payloads.
export function withControlRequests(business: typeof fetch): typeof fetch {
  return (input, init) => {
    const url = String(input)
    if (!url.startsWith('/codex-api/control/')) return business(input, init)
    const threadId = new URL(url, 'http://localhost').searchParams.get('threadId') || JSON.parse(String(init?.body || '{}')).threadId
    const claimed = url.endsWith('/claim')
    const data = url.endsWith('/register') ? { id: 'fixture-client', key: 'fixture-key' }
      : { threadId, epoch: 'fixture-epoch', version: claimed ? 1 : 0, revision: 0, activity: 'idle', turnId: null, transferring: false,
        owner: claimed ? { id: 'fixture-client', label: 'Test' } : null, proof: claimed ? { epoch: 'fixture-epoch', version: 1, token: 'fixture-token' } : null }
    return Promise.resolve(new Response(JSON.stringify({ data })))
  }
}
