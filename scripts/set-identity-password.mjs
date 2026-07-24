#!/usr/bin/env node
// Provision or reset a named identity's bcrypt password hash.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
//     node scripts/set-identity-password.mjs ops@maximo-seo.ai 'a-strong-password'
//
// Never commit real passwords or run this against production without a
// secure channel — it prints nothing sensitive, but the shell history will
// contain the password argument unless you disable history for the command.
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

const [, , email, password] = process.argv;

if (!email || !password) {
  console.error("Usage: node scripts/set-identity-password.mjs <email> <password>");
  process.exit(1);
}
if (password.length < 12) {
  console.error("Password must be at least 12 characters.");
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_KEY (service role) must be set.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const passwordHash = await bcrypt.hash(password, 12);

const { data, error } = await supabase
  .from("brain_identities")
  .update({ password_hash: passwordHash })
  .ilike("email", email.trim())
  .select("id, email, role")
  .maybeSingle();

if (error) {
  console.error(`Failed to update identity: ${error.message}`);
  process.exit(1);
}
if (!data) {
  console.error(`No identity found for ${email}. Insert a row into brain_identities first.`);
  process.exit(1);
}

console.log(`Password hash set for ${data.email} (role: ${data.role}, id: ${data.id}).`);
