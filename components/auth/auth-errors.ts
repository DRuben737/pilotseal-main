export function isExistingAccountError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("already registered") ||
    message.includes("already been registered") ||
    message.includes("user already") ||
    message.includes("already exists")
  );
}
