import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { now } from "@nuxvel/nuxt/database";

export const userTable = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role").notNull().default("user"),
  locale: text("locale"),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow().$defaultFn(now),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$defaultFn(now)
    .$onUpdate(now),
});

export const sessionTable = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow().$defaultFn(now),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$onUpdate(now),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  twoFactorVerified: boolean("two_factor_verified").notNull().default(false),
  userId: text("user_id")
    .notNull()
    .references(() => userTable.id, { onDelete: "cascade" }),
}, (table) => [index("session_user_id_idx").on(table.userId)]);

export const accountTable = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => userTable.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow().$defaultFn(now),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$onUpdate(now),
}, (table) => [index("account_user_id_idx").on(table.userId)]);

export const verificationTable = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow().$defaultFn(now),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$defaultFn(now)
    .$onUpdate(now),
});

export const twoFactorTable = pgTable("two_factor", {
  id: text("id").primaryKey(),
  secret: text("secret").notNull(),
  backupCodes: text("backup_codes").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => userTable.id, { onDelete: "cascade" }),
  verified: boolean("verified").notNull().default(true),
  failedVerificationCount: integer("failed_verification_count").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
}, (table) => [index("two_factor_user_id_idx").on(table.userId)]);
