'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, ArrowRight, Bot, Eye, EyeOff } from 'lucide-react';
import { Brand, Button, Copyright, Field, Notice, useAction, useT, api } from '@/components/ui';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthForm({
  configured,
  initialMode,
  initialError,
}: {
  configured: boolean;
  initialMode: string;
  initialError?: string;
}) {
  const router = useRouter(),
    t = useT(),
    [mode, setMode] = useState(initialMode),
    [signup, setSignup] = useState({
      fullName: '',
      email: '',
      password: '',
      confirmPassword: '',
    }),
    [showPassword, setShowPassword] = useState(false),
    [showConfirmation, setShowConfirmation] = useState(false),
    [mismatchTouched, setMismatchTouched] = useState(false),
    [customNotice, setCustomNotice] = useState<{ message: string; error: boolean } | null>(
      initialError ? { message: initialError, error: true } : null,
    ),
    action = useAction();

  const passwordsMismatch =
    signup.confirmPassword.length > 0 && signup.password !== signup.confirmPassword;
  const signupReady =
    signup.fullName.trim().length > 0 &&
    emailPattern.test(signup.email) &&
    signup.password.length >= 12 &&
    signup.confirmPassword.length > 0 &&
    !passwordsMismatch;

  function passwordField(
    name: 'password' | 'confirmPassword',
    label: string,
    visible: boolean,
    setVisible: (visible: boolean) => void,
  ) {
    const isSignup = mode === 'signup';
    const value = isSignup ? signup[name] : undefined;
    return (
      <div className="field">
        <label htmlFor={name}>{label}</label>
        <span className="password-input">
          <input
            id={name}
            type={visible ? 'text' : 'password'}
            name={name}
            value={value}
            onChange={
              isSignup
                ? (event) => {
                    setSignup({ ...signup, [name]: event.target.value });
                    if (name === 'confirmPassword') setMismatchTouched(true);
                  }
                : undefined
            }
            minLength={mode === 'login' ? 1 : 12}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            aria-invalid={name === 'confirmPassword' && mismatchTouched && passwordsMismatch}
            required
          />
          <button
            type="button"
            className="password-toggle"
            aria-label={t(visible ? 'hidePassword' : 'showPassword')}
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
          >
            {visible ? <EyeOff size={19} /> : <Eye size={19} />}
          </button>
        </span>
        {name === 'password' && mode !== 'login' ? <small>{t('passwordHint')}</small> : null}
      </div>
    );
  }

  return (
    <div className="auth-layout">
      <section className="auth-story">
        <Brand />
        <div>
          <span className="eyebrow">{t('authEyebrow')}</span>
          <h1>{t('authIntro')}</h1>
          <div className="auth-orbit">
            <Bot size={92} />
          </div>
        </div>
        <p>
          <ShieldCheck size={18} /> {t('company')} · {t('memory')} · {t('approvalRequired')}
        </p>
      </section>
      <section className="auth-panel">
        <div className="auth-form">
          <h2>
            {t(
              configured
                ? mode === 'signup'
                  ? 'signup'
                  : mode === 'reset'
                    ? 'newPassword'
                    : mode === 'forgot'
                      ? 'forgot'
                      : 'login'
                : 'setupTitle',
            )}
          </h2>
          {!configured ? (
            <>
              <p className="muted">{t('setupInfo')}</p>
              <div className="setup-code">
                <code>
                  NEXT_PUBLIC_SUPABASE_URL
                  <br />
                  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
                  <br />
                  SUPABASE_SERVICE_ROLE_KEY
                </code>
              </div>
              <p className="muted">{t('setupNote')}</p>
            </>
          ) : (
            <>
              <form
                key={mode}
                onSubmit={(event) => {
                  event.preventDefault();
                  setCustomNotice(null);
                  const form = new FormData(event.currentTarget);
                  if (mode === 'signup' && passwordsMismatch) {
                    setMismatchTouched(true);
                    return;
                  }
                  void action.act(
                    async () => {
                      const result = await api('auth', 'POST', {
                        action: mode,
                        fullName: mode === 'signup' ? form.get('fullName') : undefined,
                        email: form.get('email'),
                        password: form.get('password'),
                        confirmPassword:
                          mode === 'signup' ? form.get('confirmPassword') : undefined,
                      });
                      if (mode === 'signup' && result.signedIn) {
                        router.push('/onboarding');
                        router.refresh();
                      }
                      if (mode === 'login') {
                        router.push('/dashboard');
                        router.refresh();
                      }
                      if (mode === 'reset') {
                        setMode('login');
                      }
                    },
                    mode === 'signup'
                      ? 'emailSent'
                      : mode === 'forgot'
                        ? 'forgotInstructionsSent'
                        : mode === 'reset'
                          ? 'password_updated'
                          : 'saved',
                  );
                }}
              >
                {mode === 'signup' ? (
                  <Field label={t('fullName')}>
                    <input
                      type="text"
                      name="fullName"
                      value={signup.fullName}
                      onChange={(event) => setSignup({ ...signup, fullName: event.target.value })}
                      autoComplete="name"
                      required
                    />
                  </Field>
                ) : null}
                {mode !== 'reset' ? (
                  <Field label={t('email')}>
                    <input
                      type="email"
                      name="email"
                      value={mode === 'signup' ? signup.email : undefined}
                      onChange={
                        mode === 'signup'
                          ? (event) => setSignup({ ...signup, email: event.target.value })
                          : undefined
                      }
                      autoComplete="email"
                      required
                    />
                  </Field>
                ) : null}
                {mode !== 'forgot'
                  ? passwordField('password', t('password'), showPassword, setShowPassword)
                  : null}
                {mode === 'signup'
                  ? passwordField(
                      'confirmPassword',
                      t('confirmPassword'),
                      showConfirmation,
                      setShowConfirmation,
                    )
                  : null}
                {mode === 'signup' && mismatchTouched && passwordsMismatch ? (
                  <p className="field-error" role="alert">
                    {t('passwordMismatch')}
                  </p>
                ) : null}
                <Button
                  busy={action.busy}
                  disabled={mode === 'signup' && !signupReady}
                  type="submit"
                >
                  {t(
                    mode === 'signup'
                      ? 'signup'
                      : mode === 'forgot'
                        ? 'forgot'
                        : mode === 'reset'
                          ? 'save'
                          : 'login',
                  )}
                  <ArrowRight size={18} />
                </Button>
              </form>
              <Notice {...(customNotice || action)} />
              <div className="auth-links">
                {mode === 'login' ? (
                  <>
                    <button type="button" onClick={() => setMode('signup')}>
                      {t('signup')}
                    </button>
                    <button type="button" onClick={() => setMode('forgot')}>
                      {t('forgot')}
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => setMode('login')}>
                    {t('login')}
                  </button>
                )}
              </div>
            </>
          )}
          <div className="locale-picker">
            {['pt-BR', 'en-US', 'es-ES'].map((locale) => (
              <button
                key={locale}
                onClick={() => {
                  document.cookie = `locale=${locale};path=/;SameSite=Lax`;
                  location.reload();
                }}
              >
                {locale}
              </button>
            ))}
          </div>
        </div>
        <Copyright className="auth-copyright" />
      </section>
    </div>
  );
}
