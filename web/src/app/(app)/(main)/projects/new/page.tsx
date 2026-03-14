import { redirect } from "next/navigation";

// Redirected — new projects are created via the sidebar "New Project" button
export default function NewProjectPage() {
  redirect("/dashboard");
}
