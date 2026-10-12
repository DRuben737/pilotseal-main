import { permanentRedirect } from "next/navigation";

export const metadata = { title: "Organization Activity" };

export default function Page() {
  permanentRedirect("/console/organization/aircraft?view=history");
}
