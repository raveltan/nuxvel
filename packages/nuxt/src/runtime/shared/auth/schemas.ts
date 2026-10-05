import { z } from "zod";

/**
 * The fields of the sign-up form: a name, an email address and a
 * password of at least 12 characters.
 *
 * Auto-imported in the app. `<AuthForm mode="sign-up">` validates with
 * it. Use it for a sign-up form of your own with `useActionForm()`.
 */
export const signUpSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(12),
});

/**
 * The fields of the sign-in form: an email address and a password.
 *
 * Auto-imported in the app. `<AuthForm mode="sign-in">` validates with
 * it. Use it for a sign-in form of your own with `useActionForm()`.
 */
export const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

/**
 * The field of the forgot-password form: the email address to send the
 * reset link to.
 *
 * Auto-imported in the app. `<AuthForm mode="forgot-password">`
 * validates with it.
 */
export const forgotPasswordSchema = z.object({
  email: z.email(),
});

/**
 * The field of the reset-password form: a new password of at least 12
 * characters.
 *
 * Auto-imported in the app. `<AuthForm mode="reset-password">`
 * validates with it.
 */
export const resetPasswordSchema = z.object({
  password: z.string().min(12),
});
