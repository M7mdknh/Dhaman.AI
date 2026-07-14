/**
 * Remounts on every route change inside the app shell, giving each page a
 * soft fade-and-rise entrance (motion-safe; see globals.css). Keeping this a
 * plain server component costs nothing at runtime.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
