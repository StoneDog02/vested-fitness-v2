# Supabase Password Reset Email Template

To reduce spam flags (e.g. Gmail) and make it clear the email is for **resetting your password** (not "verify email"), customize the **Reset Password** template in Supabase.

## Where to edit

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. Go to **Authentication** → **Email Templates**.
3. Select **Reset Password** (recovery template).

## Redirect URL (required for correct flow)

In **Authentication** → **URL Configuration**:

- **Redirect URLs**: Add your app’s update-password URL(s), for example:
  - `https://kavatraining.com/auth/update-password`
  - `http://localhost:3000/auth/update-password`
- **Site URL**: Your app’s root (e.g. `https://kavatraining.com`).

If the reset URL is not in the allow list, the link in the email may send users to the wrong page (e.g. “Email Verified” instead of “Set new password”).

---

## Subject line

Use a clear, product-specific subject so it’s obvious this is a password reset, not verification:

```
Reset your Kava Training password
```

Avoid generic or vague subjects like “Verify your email” or “Confirm your account.”

---

## Body (HTML)

Use the template below. It:

- Identifies the product (Kava Training).
- States clearly that this is a **password reset**.
- Uses a single, obvious call-to-action: “Reset password.”
- Uses `{{ .ConfirmationURL }}` so the link includes the redirect to your app’s set-new-password page.

Copy and paste into the **Reset Password** template body:

```html
<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
  <p style="font-size: 16px; line-height: 1.5; color: #333;">
    Hi,
  </p>
  <p style="font-size: 16px; line-height: 1.5; color: #333;">
    You requested to reset your password for your <strong>Kava Training</strong> account. Use the button below to choose a new password. This link will expire in 1 hour.
  </p>
  <p style="margin: 24px 0;">
    <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 12px 24px; background-color: #22c55e; color: #fff; text-decoration: none; font-weight: 600; border-radius: 6px;">
      Reset password
    </a>
  </p>
  <p style="font-size: 14px; line-height: 1.5; color: #666;">
    If you didn’t request a password reset, you can ignore this email. Your password will stay the same.
  </p>
  <p style="font-size: 14px; line-height: 1.5; color: #666;">
    — The Kava Training Team
  </p>
</div>
```

Important:

- **Keep `{{ .ConfirmationURL }}`** as the link URL. It already includes the correct redirect to your app’s set-new-password page when you pass `redirectTo` from the app.
- Do **not** replace it with `{{ .SiteURL }}` or a static URL, or the user may not land on the password-reset page.

---

## Tips to reduce spam flags

- **Subject**: Specific and action-oriented (“Reset your Kava Training password”).
- **Sender**: In Supabase → **Project Settings** → **Auth** (or your SMTP/custom sender), use a consistent From name/address (e.g. “Kava Training” / `noreply@yourdomain.com`) and ensure your domain has SPF/DKIM set up if you use custom SMTP.
- **Content**: Plain language, no “click here” only, no urgent/scare wording. One clear button/link (“Reset password”) is enough.
- **Branding**: Mentioning “Kava Training” in the subject and body helps recipients recognize the email.

After saving the template, trigger a new reset email and confirm the link opens your app’s “Set new password” page (e.g. `/auth/update-password`) and that the email is no longer treated as “verify email.”
