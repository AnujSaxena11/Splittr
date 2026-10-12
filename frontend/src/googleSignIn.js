import { SocialLogin } from '@capgo/capacitor-social-login'

let initialization

export async function signInWithGoogle() {
  const webClientId = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID?.trim()
  if (!webClientId) {
    throw new Error('Google sign-in is not configured for Android. Set VITE_GOOGLE_WEB_CLIENT_ID to your Google Web client ID.')
  }

  initialization ||= SocialLogin.initialize({
    google: {
      webClientId,
      mode: 'online',
    },
  }).catch((error) => {
    initialization = undefined
    throw error
  })
  await initialization

  const { result } = await SocialLogin.login({
    provider: 'google',
    options: {},
  })
  if (result.responseType !== 'online' || !result.idToken) {
    throw new Error('Google sign-in did not return a valid ID token. Please try again.')
  }

  return result.idToken
}
