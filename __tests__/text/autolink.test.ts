import { linkSegments, hasLink } from "@/lib/text/autolink";

/**
 * This renders on public pages from text typed in the admin, so the two
 * things these pin hardest are that nothing is ever lost and that nothing
 * but http, https and mailto can become a clickable href.
 */

const joined = (text: string) => linkSegments(text).map((s) => s.text).join("");
const links = (text: string) =>
  linkSegments(text).filter((s) => s.kind === "link").map((s) => ({ text: s.text, href: (s as { href: string }).href }));

describe("nothing is lost", () => {
  test.each([
    "No links here at all.",
    "Visit https://example.com today",
    "Doors at 7 - show at 8",
    "email box@west72ent.com or call",
    "https://example.com/a(b)c and www.x.co.uk, plus a@b.com.",
    "javascript:alert(1)",
    "",
  ])("rejoining the segments reproduces %p", (text) => {
    expect(joined(text)).toBe(text);
  });

  test("empty input gives no segments", () => {
    expect(linkSegments("")).toEqual([]);
    expect(linkSegments(null)).toEqual([]);
    expect(linkSegments(undefined)).toEqual([]);
  });
});

describe("what becomes a link", () => {
  test("an explicit https url", () => {
    expect(links("Tickets at https://west72ent.com/events")).toEqual([
      { text: "https://west72ent.com/events", href: "https://west72ent.com/events" },
    ]);
  });

  test("http is fine too", () => {
    expect(links("http://example.com")[0].href).toBe("http://example.com/");
  });

  test("a bare www host is promoted to https", () => {
    expect(links("see www.example.com for more")).toEqual([
      { text: "www.example.com", href: "https://www.example.com/" },
    ]);
  });

  test("an email becomes mailto", () => {
    expect(links("questions: box@west72ent.com")).toEqual([
      { text: "box@west72ent.com", href: "mailto:box@west72ent.com" },
    ]);
  });

  test("the real one on file — a Google Form", () => {
    const desc = "Sign up here https://docs.google.com/forms/d/e/1FAIpQLSfHtp9YMDy1AFPIxerbGsZvvtc8QHQStwhp/viewform";
    expect(links(desc)).toHaveLength(1);
    expect(links(desc)[0].text).toContain("docs.google.com");
  });

  test("several links in one description", () => {
    expect(links("www.a.com and https://b.com and c@d.com")).toHaveLength(3);
  });

  test("a link on its own line", () => {
    expect(links("Doors at 7\nhttps://example.com\nBe there")).toHaveLength(1);
  });
});

describe("what stays text", () => {
  // Rule 1 in the file header: only http, https and mailto become an href.
  test.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
  ])("%p is not linked", (text) => {
    expect(links(text)).toEqual([]);
    expect(hasLink(text)).toBe(false);
  });

  test("a scheme with no host is not a link", () => {
    expect(links("http://")).toEqual([]);
    expect(links("https://localhost")).toEqual([]); // no dot, so no host to trust
  });

  test("www with nothing after it is not a link", () => {
    expect(links("www.")).toEqual([]);
  });

  test("ordinary prose with a dot is not a link", () => {
    expect(links("Doors at 7. Show at 8.")).toEqual([]);
    expect(links("Must be 21+ | ID verified at each establishment")).toEqual([]);
  });

  test("a bare domain with no scheme and no www is left alone", () => {
    // Deliberate: "Flobama" and "21+" should not become links, and guessing
    // at bare hostnames is how ordinary words get turned into URLs.
    expect(links("find us at west72ent.com")).toEqual([]);
  });
});

describe("where the link ends", () => {
  test("a full stop after the url is not part of it", () => {
    expect(links("see https://example.com.")).toEqual([
      { text: "https://example.com", href: "https://example.com/" },
    ]);
    expect(joined("see https://example.com.")).toBe("see https://example.com.");
  });

  test.each([",", ";", ":", "!", "?", '"', "'"])("a trailing %p is not part of it", (p) => {
    expect(links(`go to https://example.com${p}`)[0].text).toBe("https://example.com");
  });

  test("a closing bracket the url opened is kept", () => {
    expect(links("https://en.wikipedia.org/wiki/Shoals_(Alabama)")[0].text).toBe(
      "https://en.wikipedia.org/wiki/Shoals_(Alabama)"
    );
  });

  test("a closing bracket the sentence opened is not", () => {
    expect(links("(see https://example.com)")[0].text).toBe("https://example.com");
  });

  test("a trailing slash is kept", () => {
    expect(links("https://example.com/")[0].text).toBe("https://example.com/");
  });

  test("query strings and fragments survive", () => {
    const t = "https://example.com/a?b=1&c=2#top";
    expect(links(t)[0].text).toBe(t);
  });
});

describe("an @ inside a url is not an email", () => {
  test("the whole url wins", () => {
    const t = "https://example.com/u/a@b";
    expect(links(t)).toEqual([{ text: t, href: t }]);
  });
});

describe("hasLink", () => {
  test("true only when something actually links", () => {
    expect(hasLink("https://example.com")).toBe(true);
    expect(hasLink("a@b.com")).toBe(true);
    expect(hasLink("no links here")).toBe(false);
    expect(hasLink("")).toBe(false);
  });
});
