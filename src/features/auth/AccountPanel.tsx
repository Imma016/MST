import { useState, type FormEvent } from 'react';
import { OwnerOverview } from '../profile/OwnerOverview';
import { useAuth } from './AuthProvider';

type Mode = 'signin' | 'signup' | 'forgot' | 'recovery';

export function AccountPanel() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const activeMode = auth.passwordRecovery ? 'recovery' : mode;

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setPassword('');
    setError('');
    setMessage('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');

    try {
      let result: { error: string | null; message?: string };
      if (activeMode === 'signup') result = await auth.signUp(email, password, displayName);
      else if (activeMode === 'forgot') result = await auth.requestPasswordReset(email);
      else if (activeMode === 'recovery') result = await auth.updatePassword(password);
      else result = await auth.signIn(email, password);

      if (result.error) setError(result.error);
      else {
        if (activeMode === 'recovery') {
          setMode('signin');
          setPassword('');
          setMessage(result.message ?? 'Your password has been updated.');
        } else if (result.message) setMessage(result.message);
      }
    } catch {
      setError('Something went wrong. Please try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setError('');
    try {
      const result = await auth.signOut();
      if (result.error) setError(result.error);
    } catch {
      setError('Could not sign out just now. Please try again.');
    }
  }

  async function signInWithGoogle() {
    setError('');
    try {
      const result = await auth.signInWithGoogle();
      if (result.error) setError(result.error);
    } catch {
      setError('Could not start Google sign-in. Please try again.');
    }
  }

  if (!auth.configured) {
    return (
      <section className="account-panel" aria-labelledby="account-title">
        <p className="eyebrow">YOUR ACCOUNT</p>
        <h2 id="account-title">Accounts are being connected</h2>
        <p className="account-intro">The sign-in screen is ready. Add your free Supabase project details locally to turn on accounts; your keys stay out of the code and out of GitHub.</p>
        <div className="setup-note">
          <strong>Next setup step</strong>
          <span>Follow <code>docs/supabase-setup.md</code>, then put the project URL and publishable key in <code>.env.local</code>.</span>
        </div>
      </section>
    );
  }

  if (auth.loading) {
    return <div className="account-panel" role="status">Loading your account…</div>;
  }

  if (auth.session && !auth.passwordRecovery) {
    return (
      <section className="account-panel" aria-labelledby="account-title">
        <p className="eyebrow">YOUR ACCOUNT</p>
        <h2 id="account-title">You’re signed in</h2>
        <p className="signed-in-email">{auth.session.user.email}</p>
        <button className="account-secondary-button" type="button" onClick={signOut}>Sign out</button>
        {error && <p className="form-error" role="alert">{error}</p>}
        <OwnerOverview />
      </section>
    );
  }

  const title = activeMode === 'signup' ? 'Create your account'
    : activeMode === 'forgot' ? 'Reset your password'
      : activeMode === 'recovery' ? 'Choose a new password'
        : 'Welcome back';

  return (
    <section className="account-panel" aria-labelledby="account-title">
      <p className="eyebrow">YOUR ACCOUNT</p>
      <h2 id="account-title">{title}</h2>
      <p className="account-intro">
        {activeMode === 'signup' && 'Create a private account for your MST library.'}
        {activeMode === 'signin' && 'Sign in to keep your library with you across devices.'}
        {activeMode === 'forgot' && 'We’ll send a reset link if an account uses that email.'}
        {activeMode === 'recovery' && 'Choose a new password for your MST account.'}
      </p>

      {auth.googleAuthEnabled && activeMode === 'signin' && (
        <button className="google-button" type="button" disabled={busy} onClick={signInWithGoogle}>
          <span aria-hidden="true">G</span> Continue with Google
        </button>
      )}

      {auth.googleAuthEnabled && activeMode === 'signin' && <div className="form-divider"><span>or use email</span></div>}

      <form className="account-form" onSubmit={submit}>
        {activeMode === 'signup' && (
          <label>
            <span>Display name</span>
            <input autoComplete="name" maxLength={60} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="How should MST greet you?" />
          </label>
        )}
        {activeMode !== 'recovery' && (
          <label>
            <span>Email</span>
            <input autoComplete="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
          </label>
        )}
        {activeMode !== 'forgot' && (
          <label>
            <span>{activeMode === 'recovery' ? 'New password' : 'Password'}</span>
            <input autoComplete={activeMode === 'recovery' ? 'new-password' : activeMode === 'signup' ? 'new-password' : 'current-password'} type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" />
          </label>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="form-message" role="status">{message}</p>}

        <button className="account-primary-button" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : activeMode === 'signup' ? 'Create account'
            : activeMode === 'forgot' ? 'Send reset link'
              : activeMode === 'recovery' ? 'Save new password' : 'Sign in'}
        </button>
      </form>

      {activeMode === 'signin' && <button className="account-text-button" type="button" onClick={() => switchMode('forgot')}>Forgot password?</button>}
      {activeMode === 'signin' && <p className="account-switch">New to MST? <button type="button" onClick={() => switchMode('signup')}>Create an account</button></p>}
      {activeMode === 'signup' && <p className="account-switch">Already have an account? <button type="button" onClick={() => switchMode('signin')}>Sign in</button></p>}
      {(activeMode === 'forgot' || activeMode === 'recovery') && <p className="account-switch"><button type="button" onClick={() => { auth.clearPasswordRecovery(); switchMode('signin'); }}>Back to sign in</button></p>}
      <p className="privacy-note">Your library is private by default. You control what you share.</p>
    </section>
  );
}
