import { tierDescriptionLines, TIER_DESCRIPTION_FALLBACK } from "@/lib/tiers/description";

/**
 * The tier description is a textarea — a VIP tier lists what it includes, one
 * benefit per line. These pin what the storefront is handed: which lines
 * survive, what a typed bullet becomes, and that an empty field still reads
 * the way every tier read before the field existed.
 */

describe("splitting a description into lines", () => {
  test("one line stays one line", () => {
    expect(tierDescriptionLines("Standing room, doors at 7")).toEqual(["Standing room, doors at 7"]);
  });

  test("Enter makes the next benefit", () => {
    expect(tierDescriptionLines("Front-row table for four\nEarly entry at 6:30\nMeet & greet")).toEqual([
      "Front-row table for four",
      "Early entry at 6:30",
      "Meet & greet",
    ]);
  });

  test("Windows line endings split the same", () => {
    // A description pasted out of Word or an email arrives with \r\n.
    expect(tierDescriptionLines("Early entry\r\nReserved table")).toEqual(["Early entry", "Reserved table"]);
  });

  test("blank lines are spacing in the editor, not empty bullets on the page", () => {
    expect(tierDescriptionLines("Early entry\n\n\nReserved table\n")).toEqual(["Early entry", "Reserved table"]);
  });

  test("trailing and leading whitespace on a line is trimmed", () => {
    expect(tierDescriptionLines("  Early entry  \n\tReserved table ")).toEqual(["Early entry", "Reserved table"]);
  });
});

describe("a bullet somebody typed", () => {
  // The storefront draws its own marker, so a typed one would double up.
  test.each([
    ["- Early entry", "Early entry"],
    ["* Early entry", "Early entry"],
    ["• Early entry", "Early entry"],
    ["· Early entry", "Early entry"],
    ["– Early entry", "Early entry"],
    ["— Early entry", "Early entry"],
    ["▪ Early entry", "Early entry"],
  ])("%s becomes %s", (typed, expected) => {
    expect(tierDescriptionLines(typed)).toEqual([expected]);
  });

  test("a hyphen that is part of the words is left alone", () => {
    expect(tierDescriptionLines("Front-row table")).toEqual(["Front-row table"]);
    expect(tierDescriptionLines("-5 degrees outside")).toEqual(["-5 degrees outside"]);
  });

  test("a dash mid-sentence is left alone", () => {
    expect(tierDescriptionLines("Doors at 7 - show at 8")).toEqual(["Doors at 7 - show at 8"]);
  });

  test("only the leading bullet goes, one per line", () => {
    expect(tierDescriptionLines("- Early entry\n- Reserved table")).toEqual(["Early entry", "Reserved table"]);
  });

  test("a bare bullet on its own line disappears", () => {
    // What you get typing a list and hitting Enter before writing the next
    // benefit. It used to survive as a literal "-" bullet on the storefront.
    expect(tierDescriptionLines("- Early entry\n-\n- Reserved table")).toEqual(["Early entry", "Reserved table"]);
    expect(tierDescriptionLines("•")).toEqual([]);
  });
});

describe("nothing written", () => {
  test.each([null, undefined, "", "   ", "\n\n"])("%p gives no lines", (v) => {
    expect(tierDescriptionLines(v)).toEqual([]);
  });

  test("no lines means the storefront prints the old hardcoded string", () => {
    // Which is how every tier of every show read before this field existed —
    // so adding the column changed nothing until someone writes something.
    const lines = tierDescriptionLines(null);
    expect(lines[0] ?? TIER_DESCRIPTION_FALLBACK).toBe("Full event access");
  });
});

describe("one line vs several", () => {
  // The storefront renders one line as the plain note and several as a list.
  test("a paragraph with no newlines is a single line and stays a note", () => {
    const para = "Includes a reserved table for four, early entry at 6:30 and a meet and greet after the set.";
    expect(tierDescriptionLines(para)).toHaveLength(1);
  });

  test("the same benefits on their own lines become a list", () => {
    expect(tierDescriptionLines("Reserved table for four\nEarly entry at 6:30\nMeet & greet")).toHaveLength(3);
  });
});
