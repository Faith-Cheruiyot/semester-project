import type { User } from "@supabase/supabase-js";
import { UserHeaderMenu } from "./user-header-menu";

export default function AuthButton({ user }: { user: User | null }) {
  const isAuthenticated = !!user && !user.is_anonymous;

  return (
    <UserHeaderMenu
      key={isAuthenticated ? user.id : "guest"}
      email={isAuthenticated ? user.email || "" : ""}
      isAuthenticated={isAuthenticated}
    />
  );
}
