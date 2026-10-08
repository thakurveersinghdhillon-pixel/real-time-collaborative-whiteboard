/**
 * Utility to retrieve the JWT Secret securely.
 * Fails fast in production if JWT_SECRET environment variable is missing.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[SECURITY FATAL] JWT_SECRET environment variable must be defined in production!'
      );
    }
    console.warn(
      '[SECURITY WARNING] JWT_SECRET is not set in environment. Using development placeholder key.'
    );
    return 'dev-jwt-secret-key-change-in-production-environment-12345';
  }
  return secret;
}
