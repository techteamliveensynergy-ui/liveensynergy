/**
 * Password rules (GitHub #55). NCSC guidance: length over complexity — a
 * minimum length and a block on the most common choices, no forced symbols
 * or capitals. Applied wherever a password is set (sign-up, reset), never on
 * sign-in, so existing 8–9 character passwords keep working until changed.
 *
 * Keep Supabase Auth's own minimum (Authentication → Policies) at the same
 * value so the API can't be used to get round the form.
 */
export const MIN_PASSWORD_LENGTH = 10;

export const PASSWORD_HINT = `At least ${MIN_PASSWORD_LENGTH} characters. A short phrase is easier to remember than symbols.`;

// The commonest passwords that are long enough to pass the length rule,
// from public breach lists. Compared case-insensitively.
const COMMON_PASSWORDS = new Set([
  "0123456789",
  "1234567890",
  "12345678910",
  "123456789a",
  "1q2w3e4r5t",
  "1qaz2wsx3edc",
  "q1w2e3r4t5",
  "qwertyuiop",
  "qwerty1234",
  "qwerty12345",
  "asdfghjkl1",
  "zxcvbnm123",
  "abcdefghij",
  "abc1234567",
  "password12",
  "password123",
  "password1234",
  "password!1",
  "passw0rd123",
  "changeme12",
  "letmein123",
  "welcome123",
  "iloveyou12",
  "sunshine12",
  "princess12",
  "football12",
  "baseball12",
  "monkey1234",
  "dragon1234",
  "superman12",
  "starwars12",
  "computer12",
  "michael123",
  "trustno123",
  "liverpool1",
  "chelsea123",
  "arsenal123",
  "manchester",
  "administrator",
  "liveensynergy",
]);

/** Why a new password isn't acceptable, or null when it is. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Your password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower) || /^(.)\1+$/.test(password)) {
    return "That password is too common and easy to guess. Please choose another — a short phrase works well.";
  }
  return null;
}
