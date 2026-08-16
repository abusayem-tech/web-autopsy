import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  uuid,
  primaryKey,
  customType,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

export const invites = pgTable("invites", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const apiTokens = pgTable("api_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  name: text("name").notNull().default("Extension"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  revokedAt: timestamp("revoked_at"),
});

export const autopsies = pgTable("autopsies", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  savedBy: text("saved_by")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  pageUrl: text("page_url").notNull(),
  origin: text("origin").notNull(),
  savedAt: timestamp("saved_at").notNull().defaultNow(),
  summary: jsonb("summary").notNull().default({}),
  payload: jsonb("payload").notNull().default({}),
  htmlSnapshot: text("html_snapshot"),
  screenshotPng: bytea("screenshot_png"),
  includesSecrets: boolean("includes_secrets").notNull().default(false),
});

export const findings = pgTable("findings", {
  id: uuid("id").defaultRandom().primaryKey(),
  autopsyId: uuid("autopsy_id")
    .notNull()
    .references(() => autopsies.id, { onDelete: "cascade" }),
  ruleId: text("rule_id").notNull(),
  severity: text("severity").notNull(),
  title: text("title").notNull(),
  plainTitle: text("plain_title").notNull(),
  detail: jsonb("detail"),
});

export const portableApis = pgTable("portable_apis", {
  id: uuid("id").defaultRandom().primaryKey(),
  autopsyId: uuid("autopsy_id")
    .notNull()
    .references(() => autopsies.id, { onDelete: "cascade" }),
  method: text("method").notNull(),
  url: text("url").notNull(),
  replayClass: text("replay_class").notNull(),
  authType: text("auth_type"),
  humanName: text("human_name").notNull(),
  purpose: text("purpose").notNull(),
  redactedCodegen: jsonb("redacted_codegen"),
});

export const briefs = pgTable("briefs", {
  autopsyId: uuid("autopsy_id")
    .primaryKey()
    .references(() => autopsies.id, { onDelete: "cascade" }),
  story: text("story").notNull(),
  health: text("health").notNull(),
  apiCards: jsonb("api_cards").notNull().default([]),
  dangerCards: jsonb("danger_cards").notNull().default([]),
  improveCards: jsonb("improve_cards").notNull().default([]),
  healthyCards: jsonb("healthy_cards").notNull().default([]),
  model: text("model"),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
});

export const advice = pgTable("advice", {
  id: uuid("id").defaultRandom().primaryKey(),
  autopsyId: uuid("autopsy_id")
    .notNull()
    .references(() => autopsies.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  area: text("area").notNull(),
  severity: text("severity").notNull(),
  title: text("title").notNull(),
  whyItMatters: text("why_it_matters").notNull(),
  suggestion: text("suggestion").notNull(),
  relatedFindingId: text("related_finding_id"),
});

export const tags = pgTable("tags", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#0d9488"),
});

export const autopsyTags = pgTable(
  "autopsy_tags",
  {
    autopsyId: uuid("autopsy_id")
      .notNull()
      .references(() => autopsies.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.autopsyId, t.tagId] })],
);

export const collections = pgTable("collections", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
});

export const collectionItems = pgTable(
  "collection_items",
  {
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    autopsyId: uuid("autopsy_id")
      .notNull()
      .references(() => autopsies.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.autopsyId] })],
);

export const comments = pgTable("comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  autopsyId: uuid("autopsy_id")
    .notNull()
    .references(() => autopsies.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const activity = pgTable("activity", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  verb: text("verb").notNull(),
  autopsyId: uuid("autopsy_id").references(() => autopsies.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
