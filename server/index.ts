import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { z } from 'zod';
import { db, transaction } from './db.js';
import { sendAuthEmail } from './email.js';

const app = express();
const port = Number(process.env.PORT || 4000);
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
const production = process.env.NODE_ENV === 'production';
const cookieName = production ? '__Secure-swaply_session' : 'swaply_session';
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const code = () => crypto.randomInt(100000, 1000000).toString();
const normalizeMobile = (value: string) => `+${value.replace(/\D/g, '')}`;
const publicUser = (row: any) => ({ id: row.id, fullName: row.full_name, email: row.email, mobile: row.mobile, emailVerified: Boolean(row.email_verified_at) });

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: frontendUrl, credentials: true, allowedHeaders: ['Content-Type', 'X-Swaply-Client'] }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use('/api/auth', rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }));
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.get('X-Swaply-Client') !== 'web') return res.status(403).json({ error: 'Invalid request' });
  next();
});

type AuthedRequest = Request & { user?: any; sessionHash?: string };
async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const raw = req.cookies[cookieName];
    if (!raw) return res.status(401).json({ error: 'Please sign in' });
    const result = await db.query(`SELECT u.*, p.bio, p.location, p.avatar_url FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN profiles p ON p.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at > now()`, [hash(raw)]);
    if (!result.rowCount) return res.status(401).json({ error: 'Session expired' });
    req.user = result.rows[0]; req.sessionHash = hash(raw); next();
  } catch (error) { next(error); }
}

const password = z.string().min(8).max(72).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/);
const registerSchema = z.object({ fullName: z.string().trim().min(2).max(100), email: z.string().trim().toLowerCase().email().max(254), mobile: z.string().trim().regex(/^\+?[\d\s()-]{8,22}$/), password });
const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(72) });

app.get('/api/health', async (_req, res, next) => { try { await db.query('SELECT 1'); res.json({ status: 'ok' }); } catch (e) { next(e); } });

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const verifyCode = code();
    const user = await transaction(async client => {
      const existing = await client.query('SELECT id FROM users WHERE lower(email)=$1 OR mobile=$2', [input.email, normalizeMobile(input.mobile)]);
      if (existing.rowCount) throw Object.assign(new Error('An account already exists with this email or mobile number'), { status: 409 });
      const inserted = await client.query('INSERT INTO users(full_name,email,mobile,password_hash) VALUES($1,$2,$3,$4) RETURNING *', [input.fullName, input.email, normalizeMobile(input.mobile), passwordHash]);
      await client.query('INSERT INTO profiles(user_id) VALUES($1)', [inserted.rows[0].id]);
      await client.query("INSERT INTO auth_tokens(user_id,kind,token_hash,expires_at) VALUES($1,'verify_email',$2,now()+interval '15 minutes')", [inserted.rows[0].id, hash(verifyCode)]);
      return inserted.rows[0];
    });
    await sendAuthEmail(user.email, 'verify', verifyCode);
    res.status(201).json({ message: 'Verification code sent', email: user.email });
  } catch (e) { next(e); }
});

app.post('/api/auth/verify-email', async (req, res, next) => {
  try {
    const input = z.object({ email: z.string().trim().toLowerCase().email(), code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const result = await db.query(`UPDATE users u SET email_verified_at=now(), updated_at=now() FROM auth_tokens t WHERE t.user_id=u.id AND lower(u.email)=$1 AND t.kind='verify_email' AND t.token_hash=$2 AND t.used_at IS NULL AND t.expires_at>now() RETURNING u.*`, [input.email, hash(input.code)]);
    if (!result.rowCount) return res.status(400).json({ error: 'Invalid or expired verification code' });
    await db.query("UPDATE auth_tokens SET used_at=now() WHERE user_id=$1 AND kind='verify_email' AND used_at IS NULL", [result.rows[0].id]);
    res.json({ message: 'Email verified. You can now sign in.' });
  } catch (e) { next(e); }
});

app.post('/api/auth/resend-verification', async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(req.body);
    const result = await db.query('SELECT id,email,email_verified_at FROM users WHERE lower(email)=$1', [email]);
    if (result.rowCount && !result.rows[0].email_verified_at) {
      const verifyCode = code();
      await db.query("UPDATE auth_tokens SET used_at=now() WHERE user_id=$1 AND kind='verify_email' AND used_at IS NULL", [result.rows[0].id]);
      await db.query("INSERT INTO auth_tokens(user_id,kind,token_hash,expires_at) VALUES($1,'verify_email',$2,now()+interval '15 minutes')", [result.rows[0].id, hash(verifyCode)]);
      await sendAuthEmail(email, 'verify', verifyCode);
    }
    res.json({ message: 'If the account exists, a verification code was sent.' });
  } catch (e) { next(e); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const result = await db.query('SELECT * FROM users WHERE lower(email)=$1', [input.email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(input.password, user.password_hash))) return res.status(401).json({ error: 'Incorrect email or password' });
    if (!user.email_verified_at) return res.status(403).json({ error: 'Verify your email before signing in', code: 'EMAIL_NOT_VERIFIED' });
    const raw = crypto.randomBytes(32).toString('base64url');
    await db.query("INSERT INTO sessions(user_id,token_hash,expires_at,user_agent,ip_address) VALUES($1,$2,now()+interval '30 days',$3,$4)", [user.id, hash(raw), req.get('user-agent') || null, req.ip || null]);
    res.cookie(cookieName, raw, { httpOnly: true, secure: production, sameSite: production ? 'none' : 'lax', maxAge: 30 * 24 * 60 * 60_000, path: '/' });
    res.json({ user: publicUser(user) });
  } catch (e) { next(e); }
});

app.post('/api/auth/logout', requireAuth, async (req: AuthedRequest, res, next) => { try { await db.query('DELETE FROM sessions WHERE token_hash=$1', [req.sessionHash]); res.clearCookie(cookieName, { secure: production, sameSite: production ? 'none' : 'lax', path: '/' }); res.status(204).end(); } catch (e) { next(e); } });
app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => res.json({ user: publicUser(req.user), profile: { bio: req.user.bio || '', location: req.user.location || '', avatarUrl: req.user.avatar_url || null } }));

app.post('/api/auth/forgot-password', async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(req.body);
    const found = await db.query('SELECT id,email FROM users WHERE lower(email)=$1', [email]);
    if (found.rowCount) { const resetCode = code(); await db.query("UPDATE auth_tokens SET used_at=now() WHERE user_id=$1 AND kind='reset_password' AND used_at IS NULL", [found.rows[0].id]); await db.query("INSERT INTO auth_tokens(user_id,kind,token_hash,expires_at) VALUES($1,'reset_password',$2,now()+interval '15 minutes')", [found.rows[0].id, hash(resetCode)]); await sendAuthEmail(email, 'reset', resetCode); }
    res.json({ message: 'If the account exists, a reset code was sent.' });
  } catch (e) { next(e); }
});

app.post('/api/auth/reset-password', async (req, res, next) => {
  try {
    const input = z.object({ email: z.string().trim().toLowerCase().email(), code: z.string().regex(/^\d{6}$/), password }).parse(req.body);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const result = await transaction(async client => { const updated = await client.query(`UPDATE users u SET password_hash=$3,updated_at=now() FROM auth_tokens t WHERE t.user_id=u.id AND lower(u.email)=$1 AND t.kind='reset_password' AND t.token_hash=$2 AND t.used_at IS NULL AND t.expires_at>now() RETURNING u.id`, [input.email, hash(input.code), passwordHash]); if (!updated.rowCount) return null; await client.query("UPDATE auth_tokens SET used_at=now() WHERE user_id=$1 AND kind='reset_password' AND used_at IS NULL", [updated.rows[0].id]); await client.query('DELETE FROM sessions WHERE user_id=$1', [updated.rows[0].id]); return updated.rows[0]; });
    if (!result) return res.status(400).json({ error: 'Invalid or expired reset code' });
    res.json({ message: 'Password reset. You can now sign in.' });
  } catch (e) { next(e); }
});

app.get('/api/profile', requireAuth, (req: AuthedRequest, res) => res.json({ user: publicUser(req.user), bio: req.user.bio || '', location: req.user.location || '', avatarUrl: req.user.avatar_url || null }));
app.put('/api/profile', requireAuth, async (req: AuthedRequest, res, next) => { try { const input = z.object({ fullName: z.string().trim().min(2).max(100), bio: z.string().trim().max(500), location: z.string().trim().max(120) }).parse(req.body); await transaction(async client => { await client.query('UPDATE users SET full_name=$1,updated_at=now() WHERE id=$2', [input.fullName, req.user.id]); await client.query('UPDATE profiles SET bio=$1,location=$2,updated_at=now() WHERE user_id=$3', [input.bio, input.location, req.user.id]); }); res.json({ message: 'Profile updated' }); } catch (e) { next(e); } });

app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) return res.status(400).json({ error: 'Please check the submitted fields', fields: error.flatten().fieldErrors });
  console.error(error);
  res.status(error.status || 500).json({ error: error.status ? error.message : 'Something went wrong' });
});

app.listen(port, () => console.log(`Swaply API listening on ${port}`));
