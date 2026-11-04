import { expect, it } from "vitest";
import {
  displayTitle,
  displayTeachers,
  displayClass,
  matchesTerm,
} from "../../shared/moodle-course-display";
import { createMockMoodleApi } from "../dev-mock";
it("selects localized titles, teachers and classes with fallbacks", async () => {
  const { identity } = (await createMockMoodleApi().overview()).courses[0]!;
  expect(displayTitle(identity, "en")).toBe("Electronics Laboratory");
  expect(displayTitle(identity, "ja")).toBe("電子電路實驗");
  expect(
    displayTitle(
      { ...identity, title: { zh: null, en: "English" } },
      "zh-Hant",
    ),
  ).toBe("English");
  expect(
    displayTitle({ ...identity, title: { zh: null, en: null } }, "en", "Raw"),
  ).toBe("Raw");
  expect(displayTeachers(identity, "en")).toBe("TANG, SONG-NIEN");
  expect(displayClass(identity)).toBe("資訊二乙");
});
it("includes undated unknown courses only in current and all", async () => {
  const course = (await createMockMoodleApi().overview()).courses[0]!;
  const unknown = {
    ...course,
    identity: { ...course.identity, lifecycle: "unknown" as const, term: null },
  };
  expect(
    ["current", "future", "past", "all"].map((filter) =>
      matchesTerm(unknown, filter as "current" | "future" | "past" | "all"),
    ),
  ).toEqual([true, false, false, true]);
  expect(
    matchesTerm(
      { ...unknown, identity: { ...unknown.identity, term: "1142" } },
      "current",
    ),
  ).toBe(false);
});

it("uses the title language for teachers and Chinese class labels across app languages", async () => {
  const {identity} = (await createMockMoodleApi().overview()).courses[0]!;
  const englishOnly = {...identity,title:{zh:null,en:'English'}};
  expect(displayTeachers(englishOnly,'ja')).toBe('TANG, SONG-NIEN');
  const chineseOnly = {...identity,title:{zh:'中文',en:null}};
  expect(displayTeachers(chineseOnly,'en')).toBe('湯松年');
  expect(displayTeachers({...identity,teachers:[{zh:'湯松年',en:null}]},'en')).toBe('湯松年');
  expect(displayClass({...identity,classLabel:{zh:null,en:'CSB'}})).toBe('CSB');
});
