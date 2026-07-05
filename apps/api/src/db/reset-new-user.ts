import { eq } from "drizzle-orm";
import { env } from "../env.js";
import { createDatabase } from "./index.js";
import {
  memories,
  processedWebhooks,
  userProfiles,
  users
} from "./schema.js";

async function resetNewUser() {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to reset the database");
  }

  const ownerEmail = env.COACH_OWNER_EMAIL?.toLowerCase();
  const ownerPhoneNumber = env.COACH_OWNER_PHONE_NUMBER ?? null;
  if (!ownerEmail && !ownerPhoneNumber) {
    throw new Error(
      "COACH_OWNER_EMAIL or COACH_OWNER_PHONE_NUMBER is required to reset the owner user"
    );
  }

  const database = createDatabase(env.DATABASE_URL);

  try {
    await database.db.delete(processedWebhooks);
    await database.db.delete(users);
  } finally {
    await database.close();
  }

  await import("./seed.js");

  const seededDatabase = createDatabase(env.DATABASE_URL);
  try {
    const ownerWhere = ownerEmail
      ? eq(users.email, ownerEmail)
      : eq(users.phoneNumber, ownerPhoneNumber as string);

    const [owner] = await seededDatabase.db
      .select()
      .from(users)
      .where(ownerWhere)
      .limit(1);

    if (!owner) {
      throw new Error("Seeded owner user could not be found after reset");
    }

    await seededDatabase.db
      .delete(memories)
      .where(eq(memories.userId, owner.id));

    await seededDatabase.db
      .update(userProfiles)
      .set({
        primaryGoal:
          "Start fresh as a new gym user: learn the plan, establish consistent lifting habits, and build baseline strength safely.",
        trainingStyle:
          "Beginner reset. Use conservative starting weights, prioritize form, ask simple follow-up questions, and progress only from newly logged performance.",
        dietaryNotes: null,
        equipmentNotes:
          "Home gym equipment is available, but Coach AI should treat training history, working weights, preferences, and conditioning tolerance as unknown until newly logged.",
        injuryNotes: null,
        updatedAt: new Date()
      })
      .where(eq(userProfiles.userId, owner.id));

    await seededDatabase.db
      .update(users)
      .set({
        displayName: "Sean",
        timezone: env.COACH_TIMEZONE,
        updatedAt: new Date()
      })
      .where(eq(users.id, owner.id));

    console.log(
      `Reset Coach AI to a brand-new user baseline for ${owner.email ?? owner.phoneNumber}`
    );
  } finally {
    await seededDatabase.close();
  }
}

await resetNewUser();
