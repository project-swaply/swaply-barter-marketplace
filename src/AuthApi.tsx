import { useState } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, MailCheck } from 'lucide-react';
import { api } from './api';

type AuthProps = { kind: 'login' | 'register'; go: (page: any) => void; onAuthenticated?: () => void };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const mobilePattern = /^\+?[0-9][0-9\s()-]{7,20}$/;
const checks = [['8+ characters', /.{8,}/], ['Uppercase letter', /[A-Z]/], ['Lowercase letter', /[a-z]/], ['Number', /[0-9]/], ['Special character', /[^A-Za-z0-9]/]] as const;

function Input({ label, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return <label className="field"><span>{label}</span><input {...props} aria-invalid={Boolean(error)}/>{error && <small className="field-error">{error}</small>}</label>;
}

export default function AuthApi({ kind, go, onAuthenticated }: AuthProps) {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState<'form'|'verify'|'forgot'|'reset'>('form');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<Record<string,string>>({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setMessage('');
    const form = e.currentTarget; const data = new FormData(form); const next: Record<string,string> = {};
    const submittedEmail = String(data.get('email') || '').trim();
    if (!emailPattern.test(submittedEmail)) next.email = 'Enter a valid email address.';
    if (kind === 'register') {
      const fullName = String(data.get('fullName') || '').trim(); const mobile = String(data.get('mobile') || '').trim();
      if (fullName.length < 2) next.fullName = 'Enter your full name.';
      if (!mobilePattern.test(mobile)) next.mobile = 'Enter a valid mobile number.';
      if (checks.some(([, rule]) => !rule.test(password))) next.password = 'Use a password that meets every rule.';
      if (String(data.get('confirmPassword')) !== password) next.confirmPassword = 'Passwords do not match.';
      if (!data.get('terms')) next.terms = 'Please accept the Terms and Privacy Policy.';
    } else if (!password) next.password = 'Enter your password.';
    setErrors(next); if (Object.keys(next).length) return;
    setLoading(true);
    try {
      if (kind === 'register') {
        await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ fullName: data.get('fullName'), email: submittedEmail, mobile: data.get('mobile'), password }) });
        setEmail(submittedEmail); setStep('verify');
      } else {
        await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: submittedEmail, password }) });
        onAuthenticated?.();
        go('profile');
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Something went wrong'); }
    finally { setLoading(false); }
  }

  async function verify() { setLoading(true); setMessage(''); try { await api('/api/auth/verify-email', { method:'POST', body:JSON.stringify({ email, code }) }); setMessage('Email verified. Please sign in.'); setTimeout(() => go('login'), 700); } catch(e) { setMessage(e instanceof Error ? e.message : 'Verification failed'); } finally { setLoading(false); } }
  async function forgot(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); const value=String(new FormData(e.currentTarget).get('email')||'').trim(); setLoading(true); try { const result=await api<{message:string}>('/api/auth/forgot-password',{method:'POST',body:JSON.stringify({email:value})}); setEmail(value); setMessage(result.message); setStep('reset'); } catch(e){setMessage(e instanceof Error?e.message:'Request failed')} finally{setLoading(false)} }
  async function reset(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); const data=new FormData(e.currentTarget); setLoading(true); try { await api('/api/auth/reset-password',{method:'POST',body:JSON.stringify({email,code:data.get('code'),password:data.get('password')})}); setMessage('Password reset. Please sign in.'); setTimeout(()=>go('login'),700); } catch(e){setMessage(e instanceof Error?e.message:'Reset failed')} finally{setLoading(false)} }

  if (step === 'verify') return <main className="page"><div className="success"><MailCheck/><h1>Check your inbox</h1><p>Enter the six-digit code sent to {email}.</p><Input label="Verification code" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" autoComplete="one-time-code"/>{message&&<p className="form-message">{message}</p>}<button className="primary" disabled={loading||code.length!==6} onClick={verify}>{loading?'Verifying…':'Verify account'}</button></div></main>;
  if (step === 'forgot') return <main className="page"><div className="success"><MailCheck/><h1>Reset your password</h1><p>We’ll email you a secure reset code.</p><form onSubmit={forgot}><Input label="Email address" name="email" type="email" required/>{message&&<p className="form-message">{message}</p>}<button className="primary wide" disabled={loading}>{loading?'Sending…':'Send reset code'}</button></form></div></main>;
  if (step === 'reset') return <main className="page"><div className="success"><MailCheck/><h1>Enter reset code</h1><p>{message}</p><form onSubmit={reset}><Input label="Six-digit code" name="code" inputMode="numeric" required/><Input label="New password" name="password" type="password" required minLength={8}/><button className="primary wide" disabled={loading}>{loading?'Resetting…':'Reset password'}</button></form></div></main>;

  return <main className="page"><div className="auth"><div className="auth-story"><div className="brand light">Swaply.</div><h1>Good things<br/>deserve another story.</h1><p>Join your local community and exchange more than objects.</p><div className="quote">“I traded a camera I never used for a bike I ride every day.”<b>— Nina, Brooklyn</b></div></div><form noValidate onSubmit={submit}><h1>{kind==='login'?'Welcome back':'Create your account'}</h1><p>{kind==='login'?'Your next great trade is waiting.':'Start swapping with your community.'}</p>{kind==='register'&&<Input label="Full name" name="fullName" autoComplete="name" error={errors.fullName}/>}<Input label="Email address" name="email" type="email" autoComplete="email" error={errors.email}/>{kind==='register'&&<Input label="Mobile number" name="mobile" type="tel" autoComplete="tel" error={errors.mobile}/>}<label className="field"><span>Password</span><div className={`password ${errors.password?'invalid':''}`}><input name="password" value={password} onChange={e=>setPassword(e.target.value)} type={show?'text':'password'} autoComplete={kind==='register'?'new-password':'current-password'}/><button type="button" onClick={()=>setShow(!show)}>{show?<EyeOff/>:<Eye/>}</button></div>{errors.password&&<small className="field-error">{errors.password}</small>}{kind==='register'&&<div className="strength"><div className="strength-bar"><i style={{width:`${checks.filter(([,r])=>r.test(password)).length*20}%`}}/></div><div className="strength-rules">{checks.map(([label,rule])=><span className={rule.test(password)?'met':''} key={label}><CheckCircle2/> {label}</span>)}</div></div>}</label>{kind==='register'?<Input label="Confirm password" name="confirmPassword" type={show?'text':'password'} error={errors.confirmPassword}/>:<div className="auth-options"><label><input type="checkbox"/> Remember me</label><button type="button" className="link-button" onClick={()=>setStep('forgot')}>Forgot password?</button></div>}{kind==='register'&&<><label className={`check ${errors.terms?'invalid-check':''}`}><input name="terms" type="checkbox"/> I agree to the Terms and Privacy Policy</label>{errors.terms&&<small className="field-error terms-error">{errors.terms}</small>}</>}{message&&<p className="form-message">{message}</p>}<button className="primary wide" disabled={loading}>{loading?'Please wait…':kind==='login'?'Sign in':'Create account'} <ArrowRight/></button><p className="switch">{kind==='login'?'New to Swaply? ':'Already have an account? '}<button type="button" onClick={()=>go(kind==='login'?'register':'login')}>{kind==='login'?'Create an account':'Sign in'}</button></p></form></div></main>;
}
