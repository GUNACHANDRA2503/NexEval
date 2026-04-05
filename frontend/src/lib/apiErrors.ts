/**
 * Turn FastAPI / fetch error bodies into short, human-readable messages.
 * Never show raw JSON or "401: {...}" to users.
 */

const DETAIL_MAP: Record<string, string> = {
  'Invalid email or password': 'Wrong email or password.',
  'Email already registered': 'That email is already registered. Try signing in.',
  'Current password is incorrect.': 'That is not your current password.',
  'Add an OpenAI API key in Account first.': 'Add your OpenAI API key in Account first.',
};

function genericForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'We could not process that. Check your input and try again.';
    case 401:
      return 'Sign in required, or your session expired.';
    case 402:
      return 'Add your OpenAI API key in Account to continue.';
    case 403:
      return 'You do not have access to that.';
    case 404:
      return 'That was not found.';
    case 409:
      return 'That conflicts with existing data.';
    case 422:
      return 'Please check what you entered and try again.';
    case 429:
      return 'Too many attempts. Wait a moment and try again.';
    case 500:
      return 'Something went wrong on our side. Try again in a moment.';
    case 502:
      return 'The service had trouble connecting. Try again later.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

function mapDetailString(detail: string, status: number): string {
  if (DETAIL_MAP[detail]) return DETAIL_MAP[detail];
  if (detail.includes('Password is too long')) {
    return 'That password is too long. Use a shorter one or fewer emoji.';
  }
  if (detail.includes('Invalid API key') || detail.includes('OpenAI')) {
    return 'OpenAI rejected the request. Check your API key in Account.';
  }
  // Short server messages are OK to show
  if (detail.length <= 220 && !detail.includes('{')) {
    return detail;
  }
  return genericForStatus(status);
}

/** Parse JSON body from a failed fetch and return a user-facing string. */
export function formatHttpError(status: number, bodyText: string): string {
  const raw = bodyText.trim();
  if (!raw) {
    return genericForStatus(status);
  }

  try {
    const data = JSON.parse(raw) as { detail?: unknown };
    const { detail } = data;

    if (typeof detail === 'string') {
      return mapDetailString(detail, status);
    }

    if (Array.isArray(detail)) {
      const msgs = detail
        .map((item: { msg?: string; type?: string }) => {
          if (typeof item?.msg === 'string') return item.msg;
          return null;
        })
        .filter((m): m is string => Boolean(m));
      if (msgs.length) {
        const joined = msgs.join(' ');
        return joined.length <= 280 ? joined : genericForStatus(status);
      }
    }
  } catch {
    // Not JSON — use plain text if it looks safe
    if (raw.length < 160 && !raw.startsWith('{') && !raw.includes('"detail"')) {
      return raw;
    }
  }

  return genericForStatus(status);
}

/** Use in catch blocks when the error may or may not come from `api` request(). */
export function getUserFacingError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof Error && err.message) {
    // Block legacy/raw patterns if any slip through
    if (/^\d{3}:\s*\{/.test(err.message) || /"detail"\s*:/.test(err.message)) {
      return fallback;
    }
    return err.message;
  }
  if (typeof err === 'string') return err;
  return fallback;
}
