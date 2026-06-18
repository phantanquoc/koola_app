/**
 * App configuration — reads Vite env variables.
 * VITE_API_URL must be set (see .env.example).
 */
export const config = {
  apiUrl: import.meta.env.VITE_API_URL as string ?? 'http://localhost:3000',
};
