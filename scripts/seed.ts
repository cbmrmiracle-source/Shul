/**
 * Seeds the organization and a "Summer 5786" davening profile that reproduces
 * the Ki Savo sample newsletter. Safe to re-run: it skips anything that exists.
 */
import "dotenv/config";
import { seedDefaults } from "@/lib/seed";

seedDefaults()
  .then((summary) => {
    console.log(summary);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
