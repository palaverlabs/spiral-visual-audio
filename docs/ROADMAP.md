# Spiral Roadmap

Product and business items we've agreed to pursue. Each item says what it is, why we're doing it, and what to watch out for. Framing note for everything here: Spiral is digital vinyl for collectors. Avoid crypto, NFT, or "investment" language.

## Pilot

A small, hand-held launch to prove that people will collect, play, and resell Spiral records.

- **Users:** 100 pilot users, each given 3 months of free credits (100 credits/month, roughly $3k of total buying power, funded by Spiral).
- **Anchor artist:** one established artist to lead the catalog, possibly compensated with equity tied to milestones.
- **Artist circle:** 10 to 20 artists from the anchor's scene.
- **Resales:** seed resale activity during the pilot so the resale commission loop is visible to artists and collectors from the start.
- **Catalog:** the first releases come through the Spiral label (below).

## Spiral label (in-house record label)

Spiral starts its own label to release songs independently, mainly to supply the pilot.

### Why

- **Licensing control from day one.** Spiral holds the rights it needs for its own releases, which removes the biggest legal risk of launching a music marketplace.
- **An owned catalog** that Spiral can build on and promote.
- **A clear offer for new artists:** release on Spiral, keep your masters, earn on every resale.

### Model

- **Artists keep their masters.** Spiral takes a license, not ownership.
- **Exclusivity window:** exclusive on Spiral for 6 to 12 months, then non-exclusive.
- **Artist-generous splits,** for example 70 to 80% of primary sales to the artist, plus the standard resale commission.
- **Starting slate:** 5 to 10 releases from the anchor artist and their scene.

### Watch-outs

- **Operational load:** contracts, metadata, and royalty accounting all land on us. Budget time or tooling for it.
- **Songwriting rights are separate.** A mechanical/publishing license is still needed for the composition, even when the artist licenses the master to us.
- **Keep the label separate from the open marketplace.** Outside artists must not see the marketplace as rigged in favor of Spiral's own releases (ranking, placement, fees, and data access should be the same for everyone).
- **Legal setup:** work with a music lawyer to set the label up either as its own entity or as an imprint under the main company.

### Next steps

1. Engage a music lawyer; decide entity vs. imprint.
2. Draft the standard artist license (term, exclusivity window, splits, resale commission).
3. Sort out the mechanical/publishing licensing path.
4. Sign the anchor artist and line up the first 5 to 10 releases.

## Ownership and rights

Collectors should truly own their Spirals. US first sale doctrine doesn't cover digital resale (*Capitol Records v. ReDigi*, 2d Cir. 2018), so ownership has to be granted by contract. These terms go into the buyer agreement and the artist license.

### Buyer rights

- **Perpetual and irrevocable:** a buyer can keep, play, and resell their copy forever. Spiral can't revoke it.
- **You hold the file:** every purchase includes the downloadable Spiral SVG, which plays without a Spiral account.
- **Seller-set resale pricing,** with one owner at a time. A resale transfers the copy; the seller doesn't keep a playable one in their Spiral library.
- **Plain wording:** the terms say "you own this copy" in plain language, not license jargon.

### If Spiral shuts down

- Buyers keep their SVGs and the right to play them.
- The resale license and the artist's resale commission survive, passing to the artist or a named successor, so copies stay resellable and artists keep earning.

### Per-copy serialization

- Each copy's SVG embeds unique identifiers: pressing number (e.g. 12 of 500), a copy ID, and a signature from Spiral so it can be verified.
- Each copy ID links to a provenance record: who has owned it, when, and the resale history.
- The signature proves which copy is the authentic, current one, so the resale market and artist commission stay intact even though SVGs can be copied.

### Next steps

1. Have a lawyer review and draft the buyer terms (perpetual rights, transfer, shutdown survival, plain "you own this copy" wording).
2. Add matching terms to the artist license so the resale license and commission survive a shutdown.
3. Design the serialization format (fields embedded in the SVG, signing scheme) and the provenance/ownership history store.
