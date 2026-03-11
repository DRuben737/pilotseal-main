import { redirect } from "next/navigation";

export const metadata = {
  title: "Account Redirect | PilotSeal",
  description: "Redirecting to the PilotSeal dashboard.",
};

export default function AccountPage() {
  redirect("/dashboard");
}
