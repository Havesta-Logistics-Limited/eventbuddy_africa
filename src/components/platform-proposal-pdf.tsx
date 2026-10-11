import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { PlatformDocument } from "@/lib/types";
import { proposalTotal, withProposalDefaults } from "@/lib/proposal";

/* Inter (public/fonts, SIL Open Font License): unlike the PDF built-in
   Helvetica it has the naira sign, so amounts print as ₦250,000 rather than
   a missing-glyph box. Registered once, from this site's own origin. */
let fontsReady = false;
function registerFonts() {
  if (fontsReady || typeof window === "undefined") return;
  const base = window.location.origin;
  Font.register({
    family: "Inter",
    fonts: [
      { src: `${base}/fonts/inter-400.ttf`, fontWeight: 400 },
      { src: `${base}/fonts/inter-600.ttf`, fontWeight: 600 },
      { src: `${base}/fonts/inter-700.ttf`, fontWeight: 700 },
    ],
  });
  // never break words with hyphens
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

const INK = "#11142a";
const BODY = "#2b2f45";
const MUTED = "#636884";
const PURPLE = "#6125b8";
const PINK = "#C21FAF";
const LINE = "#e3e5ee";
const ZEBRA = "#f4f5fa";

const s = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 9.5, color: BODY, paddingTop: 54, paddingBottom: 56, paddingHorizontal: 50, lineHeight: 1.45 },
  cover: { fontFamily: "Inter", fontSize: 10, color: BODY, paddingTop: 58, paddingBottom: 50, paddingHorizontal: 50 },
  brand: { fontSize: 11, fontWeight: 700, color: PURPLE, letterSpacing: 0.4 },
  rule: { height: 2, backgroundColor: PINK, marginTop: 8, marginBottom: 22 },
  coverTitle: { fontSize: 25, fontWeight: 700, color: INK, lineHeight: 1.18 },
  prepared: { fontSize: 12, color: MUTED, marginTop: 10 },
  preparedBold: { fontWeight: 700, color: "#4b5070" },
  flyerWrap: { alignItems: "center", marginTop: 24, marginBottom: 22 },
  flyer: { maxWidth: 230, maxHeight: 330, objectFit: "contain" },
  facts: { borderWidth: 1, borderColor: LINE, flexDirection: "row", flexWrap: "wrap" },
  factCell: { width: "50%", flexDirection: "row", borderBottomWidth: 1, borderColor: LINE },
  factK: { width: "38%", padding: 9, backgroundColor: ZEBRA, fontWeight: 700, color: INK, fontSize: 9.5 },
  factV: { width: "62%", padding: 9, fontSize: 9.5, color: BODY },
  coverFoot: { marginTop: 20, fontSize: 8.5, color: MUTED },
  header: { position: "absolute", top: 24, left: 50, right: 50, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: MUTED, letterSpacing: 0.3 },
  footer: { position: "absolute", bottom: 26, left: 50, right: 50, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: MUTED, borderTopWidth: 1, borderColor: LINE, paddingTop: 7 },
  h1: { fontSize: 17, fontWeight: 700, color: INK, marginTop: 16, marginBottom: 8 },
  h2: { fontSize: 11, fontWeight: 700, color: PURPLE, marginTop: 12, marginBottom: 6 },
  p: { marginBottom: 6 },
  table: { borderWidth: 1, borderColor: LINE, marginBottom: 6 },
  thDark: { flexDirection: "row", backgroundColor: INK },
  thPurple: { flexDirection: "row", backgroundColor: PURPLE },
  th: { padding: 7, color: "#ffffff", fontSize: 8, fontWeight: 700, letterSpacing: 0.4 },
  tr: { flexDirection: "row", borderTopWidth: 1, borderColor: LINE },
  trZebra: { flexDirection: "row", borderTopWidth: 1, borderColor: LINE, backgroundColor: ZEBRA },
  td: { padding: 7, fontSize: 8.8 },
  tdBold: { padding: 7, fontSize: 8.8, fontWeight: 700, color: INK },
  bullet: { flexDirection: "row", marginBottom: 3 },
  dot: { width: 10, color: PURPLE },
  closing: { fontSize: 11, fontWeight: 700, color: INK, marginTop: 16 },
  sign: { marginTop: 14, fontSize: 8.5, color: MUTED },
  signLine: { flexDirection: "row", marginTop: 6, fontSize: 8.5, color: BODY },
  note: { marginTop: 16, fontSize: 7.8, color: MUTED, lineHeight: 1.45 },
});

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

function Bullets({ items }: { items: string[] }) {
  return (
    <View>
      {items.filter((t) => t.trim()).map((t, i) => (
        <View key={i} style={s.bullet} wrap={false}>
          <Text style={s.dot}>•</Text>
          <Text style={{ flex: 1 }}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

/** A client proposal as a branded A4 PDF. `feeLabel` is the live platform fee, e.g. "5% + ₦100". */
export function PlatformProposalPdf({ doc, feeLabel, logoUrl }: { doc: PlatformDocument; feeLabel: string; logoUrl?: string }) {
  registerFonts();
  const c = withProposalDefaults(doc.content);
  const total = proposalTotal(c);
  const eventLabel = (c.eventName || doc.clientName).toUpperCase();
  const facts = [
    ["Event date", c.eventDate],
    ["Event time", c.eventTime],
    ["Venue", c.venue],
    ["Attendance target", c.attendance],
  ].filter(([, v]) => v.trim());
  let section = 0;
  const n = () => `${++section}. `;

  return (
    <Document title={`${doc.docNumber} ${c.title} — ${c.eventName || doc.clientName}`} author="eventbuddy">
      {/* ---------------- cover ---------------- */}
      <Page size="A4" style={s.cover}>
        {logoUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image src={logoUrl} style={{ width: 120, height: 19 }} />
        ) : (
          <Text style={s.brand}>EVENTBUDDY.AFRICA</Text>
        )}
        <View style={s.rule} />
        <Text style={s.coverTitle}>{c.title}</Text>
        <Text style={s.prepared}>
          Prepared for {c.preparedFor} <Text style={s.preparedBold}>{c.eventName || doc.clientName}</Text>
        </Text>
        {c.coverImage && (
          <View style={s.flyerWrap}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={c.coverImage} style={s.flyer} />
          </View>
        )}
        {facts.length > 0 && (
          <View style={[s.facts, c.coverImage ? {} : { marginTop: 28 }]}>
            {facts.map(([k, v]) => (
              <View key={k} style={s.factCell}>
                <Text style={s.factK}>{k}</Text>
                <Text style={s.factV}>{v}</Text>
              </View>
            ))}
          </View>
        )}
        <Text style={s.coverFoot}>
          {doc.docNumber} · Prepared for review and approval · {day(doc.createdAt)}
          {doc.validUntil ? ` · valid until ${day(doc.validUntil)}` : ""}
        </Text>
      </Page>

      {/* ---------------- body ---------------- */}
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <Text>EVENTBUDDY.AFRICA  |  {eventLabel}</Text>
          <Text>{doc.docNumber}</Text>
        </View>
        <View style={s.footer} fixed>
          <Text>EVENTBUDDY.AFRICA  |  {eventLabel}</Text>
          <Text render={({ pageNumber }) => `Page ${pageNumber}`} />
        </View>

        <Text style={s.h1}>{n()}Proposal Summary</Text>
        <Text style={s.p}>{c.summary}</Text>

        {c.scope.length > 0 && (
          <>
            <Text style={s.h2}>Proposed scope at a glance</Text>
            <View style={s.table}>
              <View style={s.thDark}>
                <Text style={[s.th, { width: "30%" }]}>WORKSTREAM</Text>
                <Text style={[s.th, { width: "70%" }]}>PROPOSED DELIVERY</Text>
              </View>
              {c.scope.map((r, i) => (
                <View key={i} style={i % 2 ? s.trZebra : s.tr} wrap={false}>
                  <Text style={[s.tdBold, { width: "30%" }]}>{r.title}</Text>
                  <Text style={[s.td, { width: "70%" }]}>{r.text}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <Text style={s.h1} minPresenceAhead={80}>{n()}Commercial Quote</Text>
        <Text style={s.h2}>A. Fixed service fee</Text>
        <View style={s.table}>
          <View style={s.thPurple}>
            <Text style={[s.th, { width: "28%" }]}>ITEM</Text>
            <Text style={[s.th, { width: "52%" }]}>DESCRIPTION</Text>
            <Text style={[s.th, { width: "20%", textAlign: "right" }]}>FEE</Text>
          </View>
          {c.fees.filter((f) => f.item.trim()).map((f, i) => (
            <View key={i} style={i % 2 ? s.trZebra : s.tr} wrap={false}>
              <Text style={[s.tdBold, { width: "28%" }]}>{f.item}</Text>
              <Text style={[s.td, { width: "52%" }]}>{f.detail}</Text>
              <Text style={[s.tdBold, { width: "20%", textAlign: "right" }]}>{naira(Number(f.amountNaira) || 0)}</Text>
            </View>
          ))}
          <View style={[s.tr, { backgroundColor: "#efe9fb" }]} wrap={false}>
            <Text style={[s.tdBold, { width: "28%" }]}>Fixed service-fee subtotal</Text>
            <Text style={[s.td, { width: "52%" }]}>{c.feesNote}</Text>
            <Text style={[s.tdBold, { width: "20%", textAlign: "right", color: PURPLE }]}>{naira(total)}</Text>
          </View>
        </View>

        {c.showTransactionFee && (
          <View wrap={false}>
            <Text style={s.h2}>B. Platform transaction fees</Text>
            <Text style={s.p}>
              eventbuddy charges <Text style={{ fontWeight: 700 }}>{feeLabel} per successful transaction</Text> processed through the platform, for both ticket
              sales and vendor/exhibitor stand sales. These are variable, transaction-based charges and are not included in the {naira(total)} fixed service
              fee. The final settlement and reporting arrangement will be confirmed before sales go live.
            </Text>
          </View>
        )}

        {c.separate.length > 0 && (
          <>
            <Text style={s.h2} minPresenceAhead={40}>{c.showTransactionFee ? "C" : "B"}. Items to be confirmed and quoted separately</Text>
            {c.separate.filter((x) => x.title.trim() || x.text.trim()).map((x, i) => (
              <View key={i} style={s.bullet} wrap={false}>
                <Text style={s.dot}>•</Text>
                <Text style={{ flex: 1 }}>
                  <Text style={{ fontWeight: 700, color: INK }}>{x.title}: </Text>
                  {x.text}
                </Text>
              </View>
            ))}
          </>
        )}

        {c.plan.length > 0 && (
          <>
            <Text style={s.h1} minPresenceAhead={80}>{n()}Proposed Delivery Plan</Text>
            <View style={s.table}>
              <View style={s.thDark}>
                <Text style={[s.th, { width: "22%" }]}>STAGE</Text>
                <Text style={[s.th, { width: "44%" }]}>ACTIVITY</Text>
                <Text style={[s.th, { width: "34%" }]}>ORGANISER INPUT / OUTPUT</Text>
              </View>
              {c.plan.map((r, i) => (
                <View key={i} style={i % 2 ? s.trZebra : s.tr} wrap={false}>
                  <Text style={[s.tdBold, { width: "22%" }]}>
                    {i + 1}. {r.stage}
                  </Text>
                  <Text style={[s.td, { width: "44%" }]}>{r.activity}</Text>
                  <Text style={[s.td, { width: "34%" }]}>{r.input}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <Text style={s.h1} minPresenceAhead={80}>{n()}Responsibilities & Assumptions</Text>
        {c.ebWill.some((t) => t.trim()) && (
          <>
            <Text style={s.h2}>eventbuddy will</Text>
            <Bullets items={c.ebWill} />
          </>
        )}
        {c.clientWill.some((t) => t.trim()) && (
          <>
            <Text style={s.h2}>The organisers will</Text>
            <Bullets items={c.clientWill} />
          </>
        )}
        {c.assumptions.trim() && (
          <View wrap={false}>
            <Text style={s.h2}>Planning assumptions</Text>
            <Text style={s.p}>{c.assumptions}</Text>
          </View>
        )}

        <Text style={s.h1} minPresenceAhead={80}>{n()}Approval & Next Steps</Text>
        <Text style={s.p}>{c.approval}</Text>
        {c.confirmations.length > 0 && (
          <View style={[s.table, { marginTop: 6 }]}>
            <View style={s.thPurple}>
              <Text style={[s.th, { width: "68%" }]}>CONFIRMATION REQUIRED</Text>
              <Text style={[s.th, { width: "32%" }]}>STATUS</Text>
            </View>
            {c.confirmations.map((r, i) => (
              <View key={i} style={i % 2 ? s.trZebra : s.tr} wrap={false}>
                <Text style={[s.td, { width: "68%" }]}>{r.item}</Text>
                <Text style={[s.td, { width: "32%" }]}>{r.status}</Text>
              </View>
            ))}
          </View>
        )}

        <View wrap={false}>
          <Text style={s.closing}>{c.closing}</Text>
          <Text style={[s.sign, { fontWeight: 700, color: "#4b5070" }]}>eventbuddy</Text>
          <Text style={{ fontSize: 8.5, color: MUTED }}>Event technology, ticketing and attendee operations · eventbuddy.africa</Text>
          <Text style={[s.sign, { fontWeight: 700, color: "#4b5070", marginTop: 20 }]}>Acceptance (for the organisers)</Text>
          <Text style={s.signLine}>Name: ______________________________________     Signature: ____________________________</Text>
          <Text style={s.signLine}>Date: ______________________________________</Text>
          <Text style={s.note}>Commercial note: {c.note}</Text>
        </View>
      </Page>
    </Document>
  );
}
