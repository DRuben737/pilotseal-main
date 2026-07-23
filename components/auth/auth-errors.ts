export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_HELP_TEXT =
  "Use at least 8 characters. A unique passphrase is easier to remember and safer.";

type AuthErrorLike = {
  code?: unknown;
  message?: unknown;
  name?: unknown;
};

function getAuthErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") {
    return { code: "", message: "", name: "" };
  }

  const authError = error as AuthErrorLike;
  return {
    code: typeof authError.code === "string" ? authError.code.toLowerCase() : "",
    message: typeof authError.message === "string" ? authError.message.toLowerCase() : "",
    name: typeof authError.name === "string" ? authError.name.toLowerCase() : "",
  };
}

export function getPasswordValidationError(password: string, confirmation?: string) {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }

  if (confirmation !== undefined && password !== confirmation) {
    return "Passwords do not match.";
  }

  return "";
}

export function isWeakPasswordError(error: unknown) {
  const { code, message, name } = getAuthErrorDetails(error);
  return (
    code === "weak_password" ||
    name.includes("weakpassword") ||
    message.includes("weak password") ||
    message.includes("password is known to be weak") ||
    message.includes("password has been exposed") ||
    message.includes("password should be at least")
  );
}

export function getAuthErrorMessage(
  error: unknown,
  fallback: string,
  context: "login" | "password" | "general" = "general"
) {
  if (isWeakPasswordError(error)) {
    return context === "login"
      ? "Your password needs to be updated before you can sign in. Use Forgot password below to create a stronger one."
      : `Choose a stronger password. Use at least ${PASSWORD_MIN_LENGTH} characters and avoid common or previously exposed passwords.`;
  }

  return error instanceof Error && error.message ? error.message : fallback;
}

export function isExistingAccountError(error: unknown) {
  const { message } = getAuthErrorDetails(error);
  return (
    message.includes("already registered") ||
    message.includes("already been registered") ||
    message.includes("user already") ||
    message.includes("already exists")
  );
}
