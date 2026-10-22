import {
  tierDescriptionBlocks,
  isSingleLineDescription,
  TIER_DESCRIPTION_FALLBACK,
} from "@/lib/tiers/description";

/**
 * A dash makes a bullet and nothing else does; a blank line is a blank line.
 *
 * It used to bullet every line and drop the blanks, which is what made the
 * two real descriptions below come out as one undifferentiated list.
 */

describe("the descriptions actually on file", () => {
  test("the Downtown Florence pass: heading, list, gap, footnote", () => {
    const written = [
      "Applies to the following places: FLOBAMA | LAVA ROOM | ON THE ROCKS | CHICAGO CAFE | WILDWOOD TAVERN",
      "- Waived Cover",
      "- Skip the entry line (N/A at Chicago Cafe)",
      "- 20% off all food items",
      "- Satin Wristband",
      "",
      "Must be 21+ | ID to be verified at each establishment",
    ].join("\n");

    expect(tierDescriptionBlocks(written)).toEqual([
      { kind: "text", text: "Applies to the following places: FLOBAMA | LAVA ROOM | ON THE ROCKS | CHICAGO CAFE | WILDWOOD TAVERN" },
      {
        kind: "bullets",
        items: ["Waived Cover", "Skip the entry line (N/A at Chicago Cafe)", "20% off all food items", "Satin Wristband"],
      },
      { kind: "space" },
      { kind: "text", text: "Must be 21+ | ID to be verified at each establishment" },
    ]);
  });

  test("the wristband: plain lines either side of a gap, no bullets at all", () => {
    const written = [
      "Works at Flobama, Lava Room, On the Rocks, Wildwood, Chicago Cafe",
      "Skip the Line (N/A at Chicago Cafe)",
      "waived cover",
      "20% all food",
      "",
      "pickup your wristband on Mobile Plaza starting at 5pm Saturday",
      "MUST BE 21+ TO PURCHASE",
    ].join("\n");

    const blocks = tierDescriptionBlocks(written);
    // Nothing was dashed, so nothing is a bullet.
    expect(blocks.filter((b) => b.kind === "bullets")).toHaveLength(0);
    expect(blocks.filter((b) => b.kind === "space")).toHaveLength(1);
    expect(blocks.filter((b) => b.kind === "text")).toHaveLength(6);
  });

  test("a one-liner stays the plain note it always was", () => {
    const blocks = tierDescriptionBlocks("Each ticket comes with a surprise at the door");
    expect(isSingleLineDescription(blocks)).toBe(true);
    expect(blocks).toEqual([{ kind: "text", text: "Each ticket comes with a surprise at the door" }]);
  });
});

describe("a dash makes a bullet", () => {
  test.each(["-", "–", "—", "*", "•", "·", "▪"])("%s with a space opens a bullet", (marker) => {
    expect(tierDescriptionBlocks(`${marker} Early entry`)).toEqual([
      { kind: "bullets", items: ["Early entry"] },
    ]);
  });

  test("consecutive bullets group into one list", () => {
    expect(tierDescriptionBlocks("- One\n- Two\n- Three")).toEqual([
      { kind: "bullets", items: ["One", "Two", "Three"] },
    ]);
  });

  test("a plain line between two bullets breaks the list in two", () => {
    expect(tierDescriptionBlocks("- One\nAnd also\n- Two")).toEqual([
      { kind: "bullets", items: ["One"] },
      { kind: "text", text: "And also" },
      { kind: "bullets", items: ["Two"] },
    ]);
  });

  test("a blank line between bullets breaks the list and keeps the gap", () => {
    expect(tierDescriptionBlocks("- One\n\n- Two")).toEqual([
      { kind: "bullets", items: ["One"] },
      { kind: "space" },
      { kind: "bullets", items: ["Two"] },
    ]);
  });
});

describe("a dash that is not a bullet", () => {
  test("no space after it means it is part of the word", () => {
    expect(tierDescriptionBlocks("-5 degrees outside")).toEqual([{ kind: "text", text: "-5 degrees outside" }]);
    expect(tierDescriptionBlocks("Front-row table")).toEqual([{ kind: "text", text: "Front-row table" }]);
  });

  test("mid-sentence it is left alone", () => {
    expect(tierDescriptionBlocks("Doors at 7 - show at 8")).toEqual([
      { kind: "text", text: "Doors at 7 - show at 8" },
    ]);
  });

  test("a marker alone on a line is air, not an empty bullet", () => {
    // What you get hitting Enter after a dash before typing the benefit.
    expect(tierDescriptionBlocks("- One\n-\n- Two")).toEqual([
      { kind: "bullets", items: ["One"] },
      { kind: "space" },
      { kind: "bullets", items: ["Two"] },
    ]);
  });
});

describe("blank lines are kept", () => {
  test("one blank line is one gap", () => {
    expect(tierDescriptionBlocks("Above\n\nBelow")).toEqual([
      { kind: "text", text: "Above" },
      { kind: "space" },
      { kind: "text", text: "Below" },
    ]);
  });

  test("two blank lines are two gaps — what is typed is what is shown", () => {
    expect(tierDescriptionBlocks("Above\n\n\nBelow")).toEqual([
      { kind: "text", text: "Above" },
      { kind: "space" },
      { kind: "space" },
      { kind: "text", text: "Below" },
    ]);
  });

  test("adjacent lines with no blank between them stay tight", () => {
    expect(tierDescriptionBlocks("One\nTwo")).toEqual([
      { kind: "text", text: "One" },
      { kind: "text", text: "Two" },
    ]);
  });

  test("space at either end is trimmed", () => {
    // A trailing newline, or a paste that began with one — not a gap anybody
    // asked for, and it would push the price row out of line.
    expect(tierDescriptionBlocks("\n\nOne\n\n")).toEqual([{ kind: "text", text: "One" }]);
  });

  test("a line of only whitespace counts as blank", () => {
    expect(tierDescriptionBlocks("One\n   \nTwo")).toEqual([
      { kind: "text", text: "One" },
      { kind: "space" },
      { kind: "text", text: "Two" },
    ]);
  });

  test("Windows line endings split the same", () => {
    expect(tierDescriptionBlocks("One\r\n\r\nTwo")).toEqual([
      { kind: "text", text: "One" },
      { kind: "space" },
      { kind: "text", text: "Two" },
    ]);
  });
});

describe("nothing written", () => {
  test.each([null, undefined, "", "   ", "\n\n"])("%p gives no blocks", (v) => {
    expect(tierDescriptionBlocks(v)).toEqual([]);
  });

  test("no blocks means the storefront prints the old hardcoded string", () => {
    const blocks = tierDescriptionBlocks(null);
    expect(blocks).toHaveLength(0);
    expect(TIER_DESCRIPTION_FALLBACK).toBe("Full event access");
  });

  test("the fallback is not treated as a single typed line", () => {
    expect(isSingleLineDescription(tierDescriptionBlocks(null))).toBe(false);
  });
});

describe("isSingleLineDescription", () => {
  test("one plain line, yes", () => {
    expect(isSingleLineDescription(tierDescriptionBlocks("Standing room"))).toBe(true);
  });

  test("one bullet, no — a list is a list even with one item", () => {
    expect(isSingleLineDescription(tierDescriptionBlocks("- Standing room"))).toBe(false);
  });

  test("two lines, no", () => {
    expect(isSingleLineDescription(tierDescriptionBlocks("One\nTwo"))).toBe(false);
  });
});
