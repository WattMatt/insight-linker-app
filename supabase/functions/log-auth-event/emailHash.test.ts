import { describe, expect, it } from "vitest";
import { emailSha256 } from "./emailHash.ts";

describe("emailSha256", () => {
  it("matches the SQL hash admin_user_sign_in_history uses", async () => {
    // From the local Postgres run of the migration:
    //   encode(sha256(convert_to(lower(btrim('  Mixed.Case@Example.com ')), 'UTF8')), 'hex')
    expect(await emailSha256("  Mixed.Case@Example.com ")).toBe(
      "7a126a993c9ece5663288f1e48a453a6b4b12656af38d84103cb6beb8a5862b9",
    );
  });

  it("is the same for any case or surrounding spaces", async () => {
    expect(await emailSha256("ALICE@example.com")).toBe(await emailSha256(" alice@example.com"));
  });

  it("returns null for anything that isn't a plausible address", async () => {
    expect(await emailSha256(undefined)).toBeNull();
    expect(await emailSha256(42)).toBeNull();
    expect(await emailSha256("not-an-email")).toBeNull();
    expect(await emailSha256(`${"a".repeat(320)}@x.co`)).toBeNull();
  });
});
