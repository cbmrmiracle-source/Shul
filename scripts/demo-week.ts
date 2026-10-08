/**
 * Development helper: fill the Ki Savo 5786 week with the content of the
 * sample newsletter, to check layouts with a realistic amount of text.
 * Skips if the week already has newsletter content from this script.
 *   npm run demo
 */
import "dotenv/config";
import { db, schema } from "@/db";
import { approveItems, createItem, listPublications, togglePlacement } from "@/lib/content/service";
import type { ContentTypeKey } from "@/lib/content/types";
import { previewPaste } from "@/lib/people/import";
import { replacePeople } from "@/lib/people/service";
import { createWeek } from "@/lib/weeks";
import { and, eq } from "drizzle-orm";

const DATE = "2026-08-29";

const blank = {
  title: "",
  body: "",
  fields: {} as Record<string, string>,
  imageAssetId: null,
  linkUrl: "",
  linkLabel: "",
  eventDate: null as string | null,
  eventTime: "",
  hebrewDate: "",
  recurring: false,
  recurringUntil: null,
};

async function main() {
  const week = await createWeek(DATE);
  const existing = await db
    .select()
    .from(schema.contentItem)
    .where(and(eq(schema.contentItem.weekId, week.id), eq(schema.contentItem.type, "jewish_history")));
  if (existing.length) {
    console.log("Demo content already present.");
    process.exit(0);
  }
  const add = (type: ContentTypeKey, over: Partial<typeof blank>) => createItem(week, type, { ...blank, ...over });

  await add("sponsor", { title: "Rabbi Ellie & Chaya Rochel Estrin", body: "In honor of the upcoming wedding of their daughter **Shayna to Shmuli Andrusier** & in deep appreciation to the community." });
  await add("sponsor", { title: "Rabbi Yitzchok & Mimi Rosenfeld", body: "In honor of the Yartzeit of", fields: { dedicationHe: "יוסף חיים בן חנוך העניך הכהן" } });
  await add("event", { title: "Chai Elul Farbrengen for men", eventDate: "2026-08-31", eventTime: "8:30PM", fields: { speaker: "Rabbi Yossi Hodakov", sponsoredBy: "Mordechai & Mirel Rosenfeld" } });
  for (const [title, occasion] of [
    ["Rabbi and Mrs. Chaim & Dina Lieberman", "on the engagement of their daughter Goldie to Mendy Stern"],
    ["the Zaidy Rabbi Lieberman & his wife Fajgi", ""],
    ["Yitzi and Sara Leah Field", "on the birth of a boy!"],
    ["Zevi & Rykal Posner", "on the birth of a boy!"],
    ["Donny and Russi Arkush", "on the engagement of their son Yisroel to Matti Zaklikovsky"],
    ["Rabbi Chezky and Rivkie Unsdorfer", "on the marriage of their daughter Sheva to Arale Raskin from Crown Heights"],
  ]) {
    await add("mazal_tov", { title, fields: occasion ? { occasion } : {} });
  }
  for (const [title, time, location, status] of [
    ["0-5 Year old program", "10:30-12:30PM", "EC3 Classroom", "running"],
    ["Girls 5+", "10:30-12:30PM", "Blue Bus", "running"],
    ["Girls Grades 5-8", "10:00AM", "Women's Section", "back"],
    ["Father & Son Minyan", "10:00AM", "Cheder Classroom", "back"],
    ["Mesibos Shabbos", "5:30PM", "Blvd Woods Park in Estates of Inverrary", "running"],
  ]) {
    await add("kids_program", { title, eventTime: time, fields: { location, status } });
  }
  await add("parsha_nutshell", {
    body: `The name of the Parshah, "Ki Tavo," means "When you come," and it is found in Devarim 26:1.

Moshe instructs the Bnei Yisrael: When you enter Eretz Yisrael, the land that Hashem is giving you as an eternal inheritance, and you settle and cultivate it, bring the first-ripened fruits (Bikkurim) of your orchard to the Beit HaMikdash, and declare your gratitude for all that Hashem has done for you.

The Parshah also includes the laws of the ma'aserot (tithes) given to the Leviim and to the poor, as well as detailed instructions on how to proclaim the brachot and kelalot (blessings and curses) on Har Gerizim and Har Eival, as discussed in the beginning of Parshas Re'eh. Moshe reminds the Bnei Yisrael that they are Hashem's chosen people, and that they, in turn, have chosen Hashem.

The latter part of Ki Tavo consists of the Tochachah ("Rebuke"). After listing the blessings with which Hashem will reward the Bnei Yisrael when they follow the laws of the Torah, Moshe gives a long and solemn account of the hardships—illness, famine, poverty, and galut (exile)—that will befall them if they abandon Hashem's mitzvot.

Moshe concludes by telling the Bnei Yisrael that only now, forty years after their birth as a nation, have they attained "a heart to know, eyes to see, and ears to hear."`,
  });
  await add("shiur", { title: "Shiur in Likutei Sichos", fields: { day: "Shabbos", audience: "For Men" } });
  await add("riddle", {
    body: "In this parsha, which four consecutive verses are read on a Yom Tov - but not in Shul?",
    fields: { answer: 'The verses beginning with the words "Arami Oved Avi" (Deut. 26:5-8) are read at the Passover Seder.' },
  });
  const print = (await listPublications()).find((p) => p.key === "newsletter")!;
  const shana = await add("custom", { title: "Shana Tova Card", body: "Join the Communal Greeting page wishing everyone a Shana Tova\n*$54 Per family*", linkUrl: "https://chabadftlauderdale.com/rhcard" });
  const calendarAd = await add("custom", { title: "Calendar Ad—Let your business be seen!", body: "Calendar Date Box & Business Card options", linkUrl: "https://chabadftlauderdale.com/calendar5787" });
  // As in the sample, these also go in the printed newsletter.
  for (const item of [shana, calendarAd]) await togglePlacement(item.id, print.id, true);
  for (const [day, title, body] of [
    ["Shabbos", "Passing of Simon Wiesenthal (2005)", "Elul 16 is the yahrzeit of Simon Wiesenthal, the world-famous Nazi hunter who dedicated his life to bringing Nazi war criminals to justice."],
    ["Sunday", "Noach Sends the Dove (2105 BCE)", "After the raven failed to return with any indication that the Flood had subsided, Noach sent a dove from the window of the Teivah. The dove found no place to rest and returned to the Teivah. Noach waited another seven days before sending it again."],
    ["Sunday", "Marriage of Rabbi Schneur Zalman's Parents (1743)", "On Elul 17, Rabbi Baruch and Rebbetzin Rivkah, the parents of Rabbi Schneur Zalman of Liadi, were married."],
    ["Sunday", "Outbreak of World War II (1939)", "On September 1, 1939, corresponding to Elul 17, Nazi Germany invaded Poland, beginning World War II. The war resulted in the deaths of approximately 60 million people, including six million Jews murdered in the Holocaust."],
    ["Monday", "Passing of the Maharal of Prague (1609)", "Elul 18 is the yahrzeit of Rabbi Yehudah Loewe, the Maharal of Prague, a great Torah scholar, philosopher, Kabbalist, and Jewish leader. He is popularly associated with the legendary golem of Prague."],
    ["Monday", "Birth of the Baal Shem Tov (1698)", "Elul 18 is the birthday of Rabbi Yisrael Baal Shem Tov, founder of the Chassidic movement. He emphasized serving Hashem with joy, simple faith, and אהבת ישראל, teaching that every Jew possesses a Divine soul."],
    ["Monday", "Chassidic Movement Revealed (1734)", "On his 36th birthday, Elul 18, the Baal Shem Tov was instructed by his teachers to reveal himself and publicly spread the teachings of Chassidism. This day is regarded as the beginning of the public dissemination of Chassidic teachings."],
    ["Monday", "Birth of the Alter Rebbe (1745)", "Rabbi Schneur Zalman of Liadi, founder of Chabad Chassidism, was born on Elul 18, 5505. He later developed the teachings of Chassidism through the intellectual approach of Chabad."],
    ["Tuesday", "Passing of R. Chaim Benveniste (1673)", "R. Chaim Benveniste was a renowned Torah scholar who served as a rav in Turkey. His most famous work, Knesset HaGedolah, is an important collection of halachic material arranged according to the Shulchan Aruch."],
    ["Thursday", "Passing of R. Yonatan Eibeshitz (1764)", "R. Yonatan Eibeshitz was a renowned Torah scholar, darshan, and Kabbalist who served as rav in several major European communities. He authored numerous works on Halachah, Torah commentary, and דרוש, including Kereiti U'Pleiti, Urim VeTumim, and Ya'arot Devash."],
    ["Friday", "Passing of the Maharil (1427)", "R. Yaakov Moelin, known as the Maharil, was the leading halachic authority of Ashkenazic Jewry in his generation. His customs, recorded in Minhagei Maharil, became an important foundation for Ashkenazic minhagim, particularly regarding tefillah and synagogue practice."],
  ]) {
    await add("jewish_history", { title, body, fields: { day } });
  }

  const birthdays = [
    "Name\tHebrew Date",
    ...[
      ["Moshe Azra Drihem", "16 Elul"], ["Yisroel Isser Goldman", "16 Elul"], ["Menachem Mendel Ives", "16 Elul"], ["Yisroel Mochkin", "16 Elul"],
      ["Naomi Brocha Drihem", "17 Elul"], ["Shneur Stern", "17 Elul"], ["Gutman Laine", "19 Elul"], ["Tova Weberman", "19 Elul"],
      ["Chaim Shneur Zalman Marasow", "19 Elul"], ["Chaya Mushka Stern", "20 Elul"], ["Binyomin Feigelstock", "20 Elul"], ["Yehuda Schurder", "20 Elul"],
      ["Adina Pinsky", "20 Elul"], ["Devorah Leah Haller", "20 Elul"], ["Chani Goldman", "21 Elul"], ["Chayale Rimler", "22 Elul"], ["Miriam Gorman", "22 Elul"],
    ].map((r) => r.join("\t")),
  ].join("\n");
  const yahrzeits = [
    "Name\tHebrew Name\tDate\tRelation",
    'Avraham Bachar\tאברהם בן רחמים\tכ"א אלול התשפ"ד\tFather of Roei Bachar',
    'Yosef Chaim Rosenfeld\tיוסף חיים בן חנוך העניך הכהן\tי"ט אלול התשפ"ב\tFather of Yitzchok Rosenfeld',
  ].join("\n");
  await replacePeople("birthday", previewPaste("birthday", birthdays).result.people, {}, 0);
  await replacePeople("yahrzeit", previewPaste("yahrzeit", yahrzeits).result.people, {}, 0);

  const all = await db.select({ id: schema.contentItem.id }).from(schema.contentItem).where(eq(schema.contentItem.weekId, week.id));
  await approveItems(all.map((i) => i.id));
  console.log(`Added demo content to the week of ${DATE}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
