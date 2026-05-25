# PilotSeal Supabase Auth Email Templates

Configure these in Supabase Dashboard under Authentication > Emails.

For local development and production, add these redirect URLs in Authentication > URL Configuration:

- `http://localhost:3000/reset-password`
- `http://localhost:3000/login`
- `https://your-production-domain/reset-password`
- `https://your-production-domain/login`

Keep `{{ .ConfirmationURL }}` in the button link. Supabase replaces it with the secure action URL.

## Reset Password

Subject:

```text
Reset your PilotSeal password
```

HTML:

```html
<h2>Reset your PilotSeal password</h2>
<p>We received a request to reset the password for your PilotSeal account.</p>
<p>
  <a href="{{ .ConfirmationURL }}">Reset password</a>
</p>
<p>If you did not request this, you can ignore this email.</p>
<p>This link may expire shortly for your account security.</p>
```

## Confirm Signup

Subject:

```text
Confirm your PilotSeal account
```

HTML:

```html
<h2>Confirm your PilotSeal account</h2>
<p>Welcome to PilotSeal. Confirm your email address to finish setting up your account.</p>
<p>
  <a href="{{ .ConfirmationURL }}">Confirm email</a>
</p>
<p>If you did not create this account, you can ignore this email.</p>
```
