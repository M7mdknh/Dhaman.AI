import { redirect } from "next/navigation";

// The middleware routes "/" by session; this is the no-middleware fallback.
export default function RootPage() {
  redirect("/dashboard");
}
