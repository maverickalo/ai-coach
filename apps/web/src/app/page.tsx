import { redirect } from "next/navigation";
import { hasAuthenticatedSession } from "@/lib/auth";

export default async function HomePage() {
  redirect((await hasAuthenticatedSession()) ? "/coach" : "/login");
}
