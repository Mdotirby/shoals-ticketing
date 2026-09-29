import { saveDraft, readDraft, clearDraft, draftAge } from "@/lib/admin/draftStore";

/**
 * A localStorage stand-in. This project has no jsdom environment and adding
 * one for six assertions is not worth a dependency — the store only needs
 * getItem/setItem/removeItem, and stubbing them also lets the "storage is
 * unavailable" case be tested honestly, which jsdom makes awkward.
 */
function installStorage() {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
  (globalThis as unknown as { window: unknown }).window = { localStorage: storage };
  return storage;
}

describe("draftStore", () => {
  let storage: ReturnType<typeof installStorage>;
  beforeEach(() => { storage = installStorage(); });

  it("round-trips a draft", () => {
    saveDraft("show", { title: "Bottomland", tiers: [{ price: "20" }] });
    const d = readDraft<{ title: string; tiers: { price: string }[] }>("show");
    expect(d?.data.title).toBe("Bottomland");
    expect(d?.data.tiers[0].price).toBe("20");
    expect(typeof d?.savedAt).toBe("number");
  });

  it("returns null when there is nothing saved", () => {
    expect(readDraft("nothing")).toBeNull();
  });

  it("clears", () => {
    saveDraft("show", { a: 1 });
    clearDraft("show");
    expect(readDraft("show")).toBeNull();
  });

  it("drops a draft older than a week rather than offering it back", () => {
    saveDraft("stale", { a: 1 });
    const key = "vc:draft:stale";
    const raw = JSON.parse(storage.getItem(key)!);
    raw.savedAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
    storage.setItem(key, JSON.stringify(raw));
    expect(readDraft("stale")).toBeNull();
    // and it removes it, so it cannot accumulate
    expect(storage.getItem(key)).toBeNull();
  });

  it("treats corrupt JSON as no draft instead of throwing", () => {
    storage.setItem("vc:draft:bad", "{not json");
    expect(() => readDraft("bad")).not.toThrow();
    expect(readDraft("bad")).toBeNull();
  });

  it("survives storage being unavailable", () => {
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => saveDraft("x", { a: 1 })).not.toThrow();
  });

  it("describes age in words", () => {
    const now = Date.now();
    expect(draftAge(now - 30_000, now)).toBe("just now");
    expect(draftAge(now - 60_000, now)).toBe("1 minute ago");
    expect(draftAge(now - 5 * 60_000, now)).toBe("5 minutes ago");
    expect(draftAge(now - 2 * 3600_000, now)).toBe("2 hours ago");
    expect(draftAge(now - 26 * 3600_000, now)).toBe("yesterday");
    expect(draftAge(now - 3 * 24 * 3600_000, now)).toBe("3 days ago");
  });
});
