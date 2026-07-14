import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="rise-in w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        {children}
        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          AI-powered underwriting. The final decision always rests with the
          bank&apos;s Risk Officer.
        </p>
      </div>
    </div>
  );
}
