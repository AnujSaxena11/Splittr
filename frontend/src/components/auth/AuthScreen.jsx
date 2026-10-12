import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { api } from '../../api'
import { signInWithGoogle } from '../../googleSignIn'
import { Brand, Field, GoogleMark, Icon, PasswordField } from '../shared'
import { getErrorMessage } from '../../utils/formatting'

export function AuthScreen({ onAuthenticated, androidDownloadUrl }) {
  const [mode, setMode] = useState('login')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(() => {
    const oauthResult = new URL(window.location.href).searchParams.get('oauth')
    if (oauthResult === 'failed') return 'Google sign-in could not be completed. Please try again.'
    if (oauthResult === 'unavailable') return 'Google sign-in is not configured yet.'
    return ''
  })
  const [notice, setNotice] = useState('')
  const [email, setEmail] = useState('')

  useEffect(() => {
    const url = new URL(window.location.href)
    const oauthResult = url.searchParams.get('oauth')
    if (oauthResult) {
      url.searchParams.delete('oauth')
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    }
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    const form = new FormData(event.currentTarget)
    const body = Object.fromEntries(form.entries())
    try {
      if (mode === 'login') {
        await api.login({ email: body.email, password: body.password })
        await onAuthenticated()
      } else if (mode === 'signup') {
        await api.signup(body)
        await onAuthenticated()
      } else if (mode === 'forgot') {
        await api.requestPasswordReset({ email: body.email })
        setEmail(body.email)
        setMode('reset')
        setNotice('If your account is registered and email is configured, a reset code will be sent.')
      } else {
        await api.resetPassword({ ...body, email })
        setMode('login')
        setNotice('Password updated successfully. You can sign in now.')
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  async function handleGoogleSignIn() {
    setError('')
    setNotice('')
    if (Capacitor.getPlatform() !== 'android') {
      window.location.assign(api.googleLoginUrl)
      return
    }

    setBusy(true)
    try {
      const idToken = await signInWithGoogle()
      await api.googleNativeSignIn({ idToken })
      await onAuthenticated()
    } catch (signInError) {
      setError(getErrorMessage(signInError))
    } finally {
      setBusy(false)
    }
  }

  const isReset = mode === 'reset'
  const isSignup = mode === 'signup'
  const isForgot = mode === 'forgot'

  return (
    <main className="auth-screen">
      <div className="auth-brand">
        <Brand />
      </div>
      <div className="auth-layout">
        <section className="auth-story">
          <div className="eyebrow">
            <span className="eyebrow__dot" />
            LESS MATH, MORE LIFE
          </div>
          <h1>
            Good company.
            <br />
            <span>Clear accounts.</span>
          </h1>
          <p>Keep shared spending simple, so the moments together stay the main thing.</p>
          <div className="auth-note">
            <div className="avatar-stack">
              <span>J</span>
              <span>M</span>
              <span>A</span>
            </div>
            <span>Everyone stays on the same page.</span>
          </div>
          {Capacitor.getPlatform() === 'web' && (
            <div className="auth-download">
              <div className="auth-download__copy">
                <span>Get EzSplittr for Android</span>
                <small>Take your shared expenses with you.</small>
              </div>
              {androidDownloadUrl ? (
                <a
                  className="button button--quiet auth-download__button"
                  href={androidDownloadUrl}
                  download="EzSplittr.apk"
                >
                  <Icon name="download" size={16} />
                  Download
                </a>
              ) : (
                <button
                  className="button button--quiet auth-download__button"
                  type="button"
                  disabled
                >
                  <Icon name="download" size={16} />
                  Coming soon
                </button>
              )}
            </div>
          )}
          <div className="auth-orbit auth-orbit--one" />
          <div className="auth-orbit auth-orbit--two" />
        </section>
        <section className="auth-card">
          <div className="auth-card__top">
            <span className="section-kicker">
              {isSignup
                ? 'YOUR ACCOUNT'
                : isForgot || isReset
                  ? 'ACCOUNT RECOVERY'
                  : 'WELCOME BACK'}
            </span>
            <h2>
              {isSignup
                ? 'Create your account'
                : isForgot
                  ? 'Reset your password'
                  : isReset
                    ? 'Enter your reset code'
                    : 'Sign in to EzSplittr'}
            </h2>
            <p>
              {isSignup
                ? 'Start sharing expenses with your people.'
                : isForgot
                  ? 'We’ll send a one-time code to your email.'
                  : isReset
                    ? `Use the six-digit code sent to ${email}.`
                    : 'Your groups and expenses are right where you left them.'}
            </p>
          </div>
          <form className="form-stack" onSubmit={handleSubmit}>
            {isSignup && (
              <Field
                name="name"
                label="Your name"
                placeholder="e.g. Jenny Wilson"
                autoComplete="name"
                minLength={2}
                maxLength={100}
                required
              />
            )}
            {!isReset && (
              <Field
                name="email"
                label="Email address"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            )}
            {isReset && (
              <Field
                name="otp"
                label="6-digit reset code"
                placeholder="000000"
                inputMode="numeric"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                required
              />
            )}
            {!isForgot && (
              <PasswordField
                name={isReset ? 'newPassword' : 'password'}
                label={isReset ? 'New password' : 'Password'}
                hint={isSignup || isReset
                  ? '12–72 characters; include uppercase and lowercase letters, a number, and _, $ or @.'
                  : ''}
                placeholder={isReset ? 'Choose a new password' : 'Enter your password'}
                autoComplete={isSignup || isReset ? 'new-password' : 'current-password'}
                minLength={isSignup || isReset ? 12 : 3}
                maxLength={72}
                pattern={isSignup || isReset
                  ? '(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[_$@])[a-zA-Z0-9_$@]{12,72}'
                  : '[a-zA-Z0-9_$@]{3,72}'}
                required
              />
            )}
            {(isSignup || isReset) && (
              <PasswordField
                name={isReset ? 'cnewPassword' : 'cpassword'}
                label="Confirm password"
                placeholder="Enter it once more"
                autoComplete="new-password"
                minLength={12}
                maxLength={72}
                pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[_$@])[a-zA-Z0-9_$@]{12,72}"
                required
              />
            )}
            {error && <p className="form-alert" role="alert">{error}</p>}
            {notice && <p className="form-notice" role="status">{notice}</p>}
            <button className="button button--primary button--full" type="submit" disabled={busy}>
              {busy ? <span className="button-loader" /> : null}
              {busy
                ? 'Please wait…'
                : isSignup
                  ? 'Create account'
                  : isForgot
                    ? 'Send reset code'
                    : isReset
                      ? 'Update password'
                      : 'Sign in'}
              {!busy && <Icon name="arrow" size={17} />}
            </button>
          </form>
          {(mode === 'login' || isSignup) && (
            <div className="auth-oauth">
              <span>or continue with</span>
              <button
                className="button button--quiet button--full google-button"
                type="button"
                onClick={handleGoogleSignIn}
                disabled={busy}
              >
                <GoogleMark />
                {busy ? 'Connecting to Google…' : 'Continue with Google'}
              </button>
            </div>
          )}
          <div className="auth-links">
            {mode === 'login' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot')
                    setError('')
                    setNotice('')
                  }}
                >
                  Forgot password?
                </button>
                <span>
                  New around here?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signup')
                      setError('')
                      setNotice('')
                    }}
                  >
                    Create an account
                  </button>
                </span>
              </>
            )}
            {mode === 'signup' && (
              <span>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login')
                    setError('')
                    setNotice('')
                  }}
                >
                  Sign in
                </button>
              </span>
            )}
            {(isForgot || isReset) && (
              <button
                type="button"
                onClick={() => {
                  setMode('login')
                  setError('')
                  setNotice('')
                }}
              >
                Back to sign in
              </button>
            )}
          </div>
          <div className="auth-privacy">
            <span className="privacy-lock">⌑</span>
            Your account is private and secure
          </div>
        </section>
      </div>
      <footer className="auth-footer">
        A little less owing. A lot more enjoying.
      </footer>
    </main>
  )
}
