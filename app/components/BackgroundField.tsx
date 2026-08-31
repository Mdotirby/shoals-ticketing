/**
 * BackgroundField — the ambient orb field the liquid-glass surfaces refract.
 *
 * A `backdrop-filter: blur()` panel over flat black just reads as dark grey;
 * there has to be something bright and colourful behind it to smear. These
 * four large, heavily-blurred orbs (plus a grain layer) are that something,
 * so every `.glass` panel picks up the frosted colour-bleed the mockups show.
 *
 * Mounted once in the root layout, and only for the west72 operator — the
 * VenueCore brand keeps its own navy theme.
 */
export default function BackgroundField() {
  return (
    <div className="bg-field" aria-hidden="true">
      <div className="orb one" />
      <div className="orb blue" />
      <div className="orb rose" />
      <div className="orb white" />
      <div className="grain" />
    </div>
  );
}
