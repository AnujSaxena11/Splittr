import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('API client', () => {
  afterEach(() => {
    api.clearCsrfToken()
    vi.unstubAllGlobals()
  })

  it('sends JSON with cookies and parses the backend response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ csrfToken: 'signed-token' }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Expense added successfully' }, 201))
    vi.stubGlobal('fetch', fetchMock)

    const result = await api.createExpense({
      amount: 8.5,
      category: 'Food',
      paid_to: 'Corner Market',
    })

    expect(result.message).toBe('Expense added successfully')
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/self/expense', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      headers: expect.any(Headers),
      body: JSON.stringify({ amount: 8.5, category: 'Food', paid_to: 'Corner Market' }),
    }))
    expect(fetchMock.mock.calls[1][1].headers.get('X-CSRF-Token')).toBe('signed-token')
  })

  it('refreshes an expired session once and retries the protected request', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'Invalid or expired token' }, 401))
      .mockResolvedValueOnce(jsonResponse({ csrfToken: 'signed-token' }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Token refreshed' }))
      .mockResolvedValueOnce(jsonResponse({ user: { id: 4, name: 'Sam' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.me()).resolves.toEqual({ user: { id: 4, name: 'Sam' } })
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls[2][0]).toBe('/api/auth/refresh')
    expect(fetchMock.mock.calls[2][1]).toEqual({
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': 'signed-token' },
    })
  })

  it('surfaces backend validation messages and network failures', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ csrfToken: 'signed-token' }))
      .mockResolvedValueOnce(jsonResponse({
        message: 'Amount should be positive',
        details: ['Amount should be positive'],
      }, 400)))
    await expect(api.createExpense({ amount: -1 })).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      message: 'Amount should be positive',
    })

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(api.me()).rejects.toMatchObject({ status: 0, message: 'offline' })
  })

  it('explains Vite proxy failures as an unavailable API instead of a generic request error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      '<html>connect ECONNREFUSED</html>',
      { status: 502, headers: { 'Content-Type': 'text/html' } },
    )))
    await expect(api.me()).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining('Start the backend'),
    })
  })

  it('does not expose an HTML error page as an API error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      '<!DOCTYPE html><html><body><pre>Cannot GET /missing</pre></body></html>',
      { status: 404, headers: { 'Content-Type': 'text/html' } },
    )))
    await expect(api.me()).rejects.toMatchObject({
      status: 404,
      message: 'The server returned an unexpected response (HTTP 404).',
    })
  })

  it('requests settlement actions with the expected authenticated payloads', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ csrfToken: 'signed-token' }))
      .mockResolvedValueOnce(jsonResponse({ message: 'Payment marked as paid' }, 201))
      .mockResolvedValueOnce(jsonResponse({ message: 'Payment confirmed' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.requestGroupSettlement(42, { receiverId: 7, amount: 25 }))
      .resolves.toMatchObject({ message: 'Payment marked as paid' })
    await expect(api.respondToGroupSettlement(12, true))
      .resolves.toMatchObject({ message: 'Payment confirmed' })

    expect(fetchMock.mock.calls[1][0]).toBe('/api/expense-splitter/settle/42')
    expect(fetchMock.mock.calls[1][1].body).toBe(JSON.stringify({ receiverId: 7, amount: 25 }))
    expect(fetchMock.mock.calls[2][0]).toBe('/api/expense-splitter/settlements/12/respond')
    expect(fetchMock.mock.calls[2][1].body).toBe(JSON.stringify({ accept: true }))
  })
})
