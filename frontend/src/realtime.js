import { io } from 'socket.io-client'
import { API_BASE } from './api'

export function connectRealtime() {
  const apiUrl = new URL(API_BASE, window.location.origin)
  const path = `${apiUrl.pathname.replace(/\/$/, '')}/socket.io`
  return io(apiUrl.origin, {
    path,
    withCredentials: true,
  })
}
