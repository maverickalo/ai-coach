import { createClient, type User as SupabaseUser } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { Database } from "../../db/index.js";
import { userProfiles, users } from "../../db/schema.js";
import { env } from "../../env.js";

export interface AuthenticatedUser {
  id: string;
  authUserId: string;
  email: string;
}

export class AuthenticationError extends Error {}

export class SupabaseAuthService {
  private readonly supabase;

  constructor(private readonly db: Database) {
    if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required for web auth"
      );
    }

    this.supabase = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    );
  }

  async authenticate(request: FastifyRequest): Promise<AuthenticatedUser> {
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : null;

    if (!token) {
      throw new AuthenticationError("Missing bearer token");
    }

    const {
      data: { user },
      error
    } = await this.supabase.auth.getUser(token);

    if (error || !user?.email) {
      throw new AuthenticationError("Invalid or expired session");
    }

    return this.resolveAppUser(user);
  }

  private async resolveAppUser(
    authUser: SupabaseUser
  ): Promise<AuthenticatedUser> {
    const email = authUser.email?.toLowerCase();
    if (!email) {
      throw new AuthenticationError("Authenticated user has no email");
    }

    const [byAuthId] = await this.db
      .select()
      .from(users)
      .where(eq(users.authUserId, authUser.id))
      .limit(1);

    if (byAuthId) {
      if (!byAuthId.email) {
        await this.db
          .update(users)
          .set({ email, updatedAt: new Date() })
          .where(eq(users.id, byAuthId.id));
      }
      return {
        id: byAuthId.id,
        authUserId: authUser.id,
        email
      };
    }

    const [byEmail] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (byEmail) {
      const [linked] = await this.db
        .update(users)
        .set({
          authUserId: authUser.id,
          updatedAt: new Date()
        })
        .where(eq(users.id, byEmail.id))
        .returning();

      if (!linked) {
        throw new Error("Failed to link authenticated user");
      }

      return { id: linked.id, authUserId: authUser.id, email };
    }

    if (
      env.COACH_OWNER_EMAIL?.toLowerCase() === email &&
      env.COACH_OWNER_PHONE_NUMBER
    ) {
      const [owner] = await this.db
        .select()
        .from(users)
        .where(eq(users.phoneNumber, env.COACH_OWNER_PHONE_NUMBER))
        .limit(1);

      if (owner) {
        await this.db
          .update(users)
          .set({
            authUserId: authUser.id,
            email,
            updatedAt: new Date()
          })
          .where(eq(users.id, owner.id));
        return { id: owner.id, authUserId: authUser.id, email };
      }
    }

    const metadataName =
      typeof authUser.user_metadata.full_name === "string"
        ? authUser.user_metadata.full_name
        : null;
    const [created] = await this.db
      .insert(users)
      .values({
        authUserId: authUser.id,
        email,
        displayName: metadataName ?? email.split("@")[0] ?? null,
        timezone: env.COACH_TIMEZONE
      })
      .onConflictDoNothing()
      .returning();

    const resolved =
      created ??
      (
        await this.db
          .select()
          .from(users)
          .where(eq(users.authUserId, authUser.id))
          .limit(1)
      )[0] ??
      (
        await this.db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1)
      )[0];

    if (!resolved) {
      throw new Error("Failed to resolve authenticated user");
    }

    await this.db
      .insert(userProfiles)
      .values({ userId: resolved.id })
      .onConflictDoNothing();

    return { id: resolved.id, authUserId: authUser.id, email };
  }
}
