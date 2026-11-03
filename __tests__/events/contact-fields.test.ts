import { contactFields } from "@/lib/contacts/access";

describe("contactFields", () => {
  it("moves an address typed into the name box to where it can be used", () => {
    expect(contactFields({ name: "gturner.assistant@wmeagency.com", role: "assistant" }).fields).toMatchObject({
      name: null,
      email: "gturner.assistant@wmeagency.com",
    });
  });

  it("leaves a name and a real email alone", () => {
    expect(contactFields({ name: "Sam Ng", email: "sam@x.com", role: "tour_manager" }).fields).toMatchObject({ name: "Sam Ng", email: "sam@x.com" });
  });
});
