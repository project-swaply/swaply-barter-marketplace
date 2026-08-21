type EmailKind = 'verify' | 'reset';

export async function sendAuthEmail(to: string, kind: EmailKind, token: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error('Email service is not configured');
  const isVerify = kind === 'verify';
  const subject = isVerify ? 'Verify your Swaply account' : 'Reset your Swaply password';
  const message = isVerify
    ? `Your Swaply verification code is: ${token}. It expires in 15 minutes.`
    : `Your Swaply password reset code is: ${token}. It expires in 15 minutes.`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text: message }),
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
}
