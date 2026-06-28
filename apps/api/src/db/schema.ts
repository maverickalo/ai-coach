import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    authUserId: uuid("auth_user_id"),
    email: text("email"),
    phoneNumber: text("phone_number"),
    displayName: text("display_name"),
    timezone: text("timezone").default("America/Los_Angeles").notNull(),
    smsOptedIn: boolean("sms_opted_in").default(false).notNull(),
    smsConsentAt: timestamp("sms_consent_at", { withTimezone: true }),
    smsOptedOutAt: timestamp("sms_opted_out_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    uniqueIndex("users_auth_user_id_unique").on(table.authUserId),
    uniqueIndex("users_email_unique").on(table.email),
    uniqueIndex("users_phone_number_unique").on(table.phoneNumber)
  ]
);

export const userProfiles = pgTable(
  "user_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    primaryGoal: text("primary_goal"),
    trainingStyle: text("training_style"),
    dietaryNotes: text("dietary_notes"),
    equipmentNotes: text("equipment_notes"),
    injuryNotes: text("injury_notes"),
    ...timestamps
  },
  (table) => [uniqueIndex("user_profiles_user_unique").on(table.userId)]
);

export const equipment = pgTable(
  "equipment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("equipment_user_name_unique").on(table.userId, table.name),
    index("equipment_user_idx").on(table.userId)
  ]
);

export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    category: text("category"),
    primaryMuscles: text("primary_muscles").array().default([]).notNull(),
    equipment: text("equipment").array().default([]).notNull(),
    instructions: text("instructions"),
    commonSubstitutions: text("common_substitutions").array().default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [uniqueIndex("exercises_name_unique").on(table.name)]
);

export const workoutPlans = pgTable(
  "workout_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    active: boolean("active").default(true).notNull(),
    ...timestamps
  },
  (table) => [index("workout_plans_user_active_idx").on(table.userId, table.active)]
);

export const workoutTemplates = pgTable(
  "workout_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => workoutPlans.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    name: text("name").notNull(),
    focus: text("focus"),
    estimatedMinutes: integer("estimated_minutes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("workout_templates_plan_day_unique").on(
      table.planId,
      table.dayOfWeek
    )
  ]
);

export const workoutTemplateExercises = pgTable(
  "workout_template_exercises",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => workoutTemplates.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").notNull(),
    prescribedSets: integer("prescribed_sets"),
    prescribedReps: text("prescribed_reps"),
    prescribedWeight: text("prescribed_weight"),
    notes: text("notes")
  },
  (table) => [
    uniqueIndex("workout_template_exercises_order_unique").on(
      table.templateId,
      table.sortOrder
    )
  ]
);

export const workouts = pgTable(
  "workouts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").references(() => workoutTemplates.id, {
      onDelete: "set null"
    }),
    scheduledDate: date("scheduled_date").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    status: text("status").default("scheduled").notNull(),
    userSummary: text("user_summary"),
    coachSummary: text("coach_summary"),
    ...timestamps
  },
  (table) => [
    uniqueIndex("workouts_user_date_unique").on(table.userId, table.scheduledDate),
    index("workouts_user_status_idx").on(table.userId, table.status)
  ]
);

export const exerciseLogs = pgTable(
  "exercise_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workoutId: uuid("workout_id")
      .notNull()
      .references(() => workouts.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    status: text("status").notNull(),
    setsCompleted: integer("sets_completed"),
    repsCompleted: text("reps_completed"),
    weight: text("weight"),
    rpe: numeric("rpe", { precision: 3, scale: 1 }),
    painScore: integer("pain_score"),
    skippedReason: text("skipped_reason"),
    notes: text("notes"),
    ...timestamps
  },
  (table) => [
    uniqueIndex("exercise_logs_workout_exercise_unique").on(
      table.workoutId,
      table.exerciseId
    ),
    index("exercise_logs_workout_idx").on(table.workoutId)
  ]
);

export const exerciseSets = pgTable(
  "exercise_sets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    exerciseLogId: uuid("exercise_log_id")
      .notNull()
      .references(() => exerciseLogs.id, { onDelete: "cascade" }),
    setNumber: integer("set_number").notNull(),
    reps: integer("reps"),
    weight: numeric("weight", { precision: 8, scale: 2 }),
    rpe: numeric("rpe", { precision: 3, scale: 1 }),
    notes: text("notes")
  },
  (table) => [
    uniqueIndex("exercise_sets_log_number_unique").on(
      table.exerciseLogId,
      table.setNumber
    )
  ]
);

export const substitutions = pgTable("substitutions", {
  id: uuid("id").defaultRandom().primaryKey(),
  workoutId: uuid("workout_id")
    .notNull()
    .references(() => workouts.id, { onDelete: "cascade" }),
  originalExerciseId: uuid("original_exercise_id")
    .notNull()
    .references(() => exercises.id, { onDelete: "restrict" }),
  substituteExerciseId: uuid("substitute_exercise_id")
    .notNull()
    .references(() => exercises.id, { onDelete: "restrict" }),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
    category: text("category").notNull(),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
    source: text("source").notNull(),
    ...timestamps
  },
  (table) => [
    uniqueIndex("memories_user_key_unique").on(table.userId, table.key),
    index("memories_user_category_idx").on(table.userId, table.category)
  ]
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: text("channel").default("sms").notNull(),
    externalThreadId: text("external_thread_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index("conversations_user_idx").on(table.userId)]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    direction: text("direction").notNull(),
    body: text("body").notNull(),
    intent: text("intent"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index("messages_conversation_time_idx").on(table.conversationId, table.createdAt)]
);

export const coachEvents = pgTable(
  "coach_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workoutId: uuid("workout_id").references(() => workouts.id, {
      onDelete: "set null"
    }),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index("coach_events_user_time_idx").on(table.userId, table.createdAt),
    index("coach_events_workout_idx").on(table.workoutId)
  ]
);

export const weeklyReviews = pgTable(
  "weekly_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    weekEnd: date("week_end").notNull(),
    summary: text("summary").notNull(),
    recommendations: text("recommendations").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("weekly_reviews_user_week_unique").on(table.userId, table.weekStart)
  ]
);

export const processedWebhooks = pgTable(
  "processed_webhooks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("processed_webhooks_provider_external_unique").on(
      table.provider,
      table.externalId
    )
  ]
);
