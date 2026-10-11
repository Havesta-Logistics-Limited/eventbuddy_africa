import { Document, Font, Image, Page, Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
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

/* A clean, light, editorial layout: printer-friendly white pages, one pink
   accent, big section numbers and generous space.

   Every <Text> holds ONE string (template literals, never {a} {b} siblings):
   react-pdf garbles text split into several runs inside a row layout. */

const INK = "#14122b";
const BODY = "#3a3852";
const MUTED = "#7a7891";
const FAINT = "#b9b7c9";
const PINK = "#c21faf";
const VIOLET = "#6d28d9";
const LINE = "#ebe9f2";
const TINT = "#f7f4fd";

const s = StyleSheet.create({
  // ---- cover
  cover: { fontFamily: "Inter", color: BODY, padding: 56, paddingBottom: 48, flexDirection: "column" },
  coverTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  logo: { width: 112, height: 18 },
  accent: { flex: 1, height: 3, flexDirection: "row" },
  docNo: { fontSize: 8.5, color: MUTED, letterSpacing: 0.6 },
  kicker: { marginTop: 70, fontSize: 9, fontWeight: 700, color: PINK, letterSpacing: 3 },
  eventName: { marginTop: 10, fontSize: 36, fontWeight: 700, color: INK, lineHeight: 1.08, letterSpacing: -0.8 },
  docTitle: { marginTop: 12, fontSize: 13.5, color: MUTED, lineHeight: 1.4 },
  shortRule: { marginTop: 22, width: 44, height: 3, backgroundColor: PINK, borderRadius: 2 },
  facts: { marginTop: 22, flexDirection: "row", flexWrap: "wrap" },
  fact: { width: "50%", paddingRight: 16, marginBottom: 14 },
  factK: { fontSize: 7.5, fontWeight: 700, color: MUTED, letterSpacing: 1.4 },
  factV: { marginTop: 3, fontSize: 11, color: INK, lineHeight: 1.35 },
  flyerBox: { marginTop: 10, alignItems: "center", flexGrow: 1, justifyContent: "center" },
  flyer: { maxWidth: 210, maxHeight: 300, objectFit: "contain", borderRadius: 10 },
  coverFoot: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderTopWidth: 1, borderColor: LINE, paddingTop: 14, marginTop: 18 },
  footK: { fontSize: 7.5, fontWeight: 700, color: MUTED, letterSpacing: 1.4 },
  footV: { marginTop: 3, fontSize: 10, color: INK },
  // ---- inner pages
  page: { fontFamily: "Inter", fontSize: 9.6, color: BODY, paddingTop: 62, paddingBottom: 46, paddingHorizontal: 56, lineHeight: 1.55 },
  header: { position: "absolute", top: 26, left: 56, right: 56, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderColor: LINE, paddingBottom: 9 },
  headerBrand: { fontSize: 9, fontWeight: 700, color: PINK, letterSpacing: 0.3 },
  headerText: { fontSize: 7.8, color: MUTED, letterSpacing: 0.3 },
  // pinned from the top (A4 is 842pt tall): a `bottom`-pinned fixed element doesn't render in react-pdf
  footer: { position: "absolute", top: 810, left: 56, right: 56, flexDirection: "row", justifyContent: "space-between", fontSize: 7.8, color: MUTED },
  sectionHead: { flexDirection: "row", alignItems: "flex-end", marginTop: 18, marginBottom: 9 },
  sectionNo: { fontSize: 26, fontWeight: 700, color: PINK, lineHeight: 1, marginRight: 12, letterSpacing: -1 },
  sectionTitle: { fontSize: 17, fontWeight: 700, color: INK, lineHeight: 1.15, paddingBottom: 2, letterSpacing: -0.3 },
  sub: { fontSize: 8, fontWeight: 700, color: VIOLET, letterSpacing: 1.6, marginTop: 11, marginBottom: 6 },
  lead: { fontSize: 10.4, lineHeight: 1.55, color: BODY },
  // scope
  scopeGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
  scopeItem: { width: "50%", flexDirection: "row", paddingRight: 14, marginBottom: 9 },
  tick: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#fbe7f8", alignItems: "center", justifyContent: "center", marginRight: 9, marginTop: 1 },
  itemTitle: { fontSize: 10, fontWeight: 700, color: INK, lineHeight: 1.35 },
  itemText: { marginTop: 1, fontSize: 8.6, color: MUTED, lineHeight: 1.42 },
  // fees
  feeRow: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1, borderColor: LINE },
  feeAmt: { width: 110, textAlign: "right", fontSize: 10.5, fontWeight: 700, color: INK },
  totalCard: { marginTop: 10, borderRadius: 12, backgroundColor: TINT, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totalK: { fontSize: 8, fontWeight: 700, color: VIOLET, letterSpacing: 1.6 },
  totalNote: { marginTop: 4, fontSize: 8.5, color: MUTED, lineHeight: 1.45, maxWidth: 300 },
  totalV: { fontSize: 22, fontWeight: 700, color: VIOLET, letterSpacing: -0.5 },
  noteCard: { marginTop: 10, borderLeftWidth: 3, borderColor: PINK, paddingLeft: 12, paddingVertical: 2 },
  noteTitle: { fontSize: 9.5, fontWeight: 700, color: INK },
  // list with a bold title above its text
  listItem: { flexDirection: "row", marginBottom: 6 },
  dash: { width: 14, fontSize: 10, color: PINK, fontWeight: 700 },
  // timeline
  step: { flexDirection: "row" },
  stepRail: { width: 30, alignItems: "center" },
  stepDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: PINK, alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff" },
  stepNo: { fontSize: 9, fontWeight: 700, color: PINK },
  stepLine: { flexGrow: 1, width: 1.5, backgroundColor: "#f2cdec", marginTop: 2, marginBottom: 2 },
  stepBody: { flex: 1, paddingLeft: 8, paddingBottom: 9 },
  stepTitle: { fontSize: 10.5, fontWeight: 700, color: INK, marginTop: 3 },
  stepText: { marginTop: 2, fontSize: 9.1, color: BODY, lineHeight: 1.45 },
  stepInput: { marginTop: 2, fontSize: 8.5, color: MUTED, lineHeight: 1.45 },
  // responsibilities
  cols: { flexDirection: "row", gap: 22, marginTop: 4 },
  col: { flex: 1 },
  colHead: { fontSize: 10.5, fontWeight: 700, color: INK, paddingBottom: 6, marginBottom: 8, borderBottomWidth: 2, borderColor: PINK },
  colItem: { flexDirection: "row", marginBottom: 3 },
  colText: { flex: 1, fontSize: 8.9, lineHeight: 1.45 },
  assume: { marginTop: 12, borderRadius: 10, backgroundColor: "#f6f6f9", padding: 12 },
  assumeHead: { fontSize: 8, fontWeight: 700, color: MUTED, letterSpacing: 1.6, marginBottom: 5 },
  // confirmations
  confirmRow: { flexDirection: "row", alignItems: "center", paddingVertical: 3.5, borderBottomWidth: 1, borderColor: LINE },
  confirmText: { flex: 1, fontSize: 9.4, color: BODY, paddingRight: 12 },
  pill: { borderRadius: 9, paddingVertical: 3, paddingHorizontal: 8, backgroundColor: "#fdf1dc" },
  pillText: { fontSize: 7.6, fontWeight: 600, color: "#8a5a07" },
  // close
  closing: { marginTop: 8, fontSize: 12, fontWeight: 700, color: INK, lineHeight: 1.4, letterSpacing: -0.2 },
  signRow: { flexDirection: "row", gap: 14, marginTop: 8 },
  signBox: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 10, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8 },
  signHead: { fontSize: 8, fontWeight: 700, color: MUTED, letterSpacing: 1.4 },
  signName: { marginTop: 4, fontSize: 10, fontWeight: 700, color: INK },
  signLine: { marginTop: 12, borderBottomWidth: 1, borderColor: FAINT },
  signLabel: { marginTop: 3, fontSize: 7.5, color: MUTED },
  smallPrint: { marginTop: 6, fontSize: 7.6, color: MUTED, lineHeight: 1.5 },
});

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

function Tick() {
  return (
    <View style={s.tick}>
      <Svg width={8} height={8} viewBox="0 0 10 10">
        <Path d="M1.5 5.3 L4 7.8 L8.6 2.4" stroke={PINK} strokeWidth={1.8} fill="none" />
      </Svg>
    </View>
  );
}

function SectionHead({ no, title }: { no: number; title: string }) {
  return (
    <View style={s.sectionHead} minPresenceAhead={90} wrap={false}>
      <Text style={s.sectionNo}>{String(no).padStart(2, "0")}</Text>
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

/** A client proposal as a branded A4 PDF. `feeLabel` is the live platform fee, e.g. "5% + ₦100". */
export function PlatformProposalPdf({ doc, feeLabel, logoUrl }: { doc: PlatformDocument; feeLabel: string; logoUrl?: string }) {
  registerFonts();
  const c = withProposalDefaults(doc.content);
  const total = proposalTotal(c);
  const event = c.eventName || doc.clientName;
  const fees = c.fees.filter((f) => f.item.trim());
  const facts = [
    ["DATE", c.eventDate],
    ["TIME", c.eventTime],
    ["VENUE", c.venue],
    ["ATTENDANCE", c.attendance],
  ].filter(([, v]) => v.trim());
  let no = 0;

  return (
    <Document title={`${doc.docNumber} ${c.title}: ${event}`} author="eventbuddy">
      {/* ================= cover ================= */}
      <Page size="A4" style={s.cover}>
        <View style={s.coverTop}>
          {logoUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={logoUrl} style={s.logo} />
          ) : (
            <Text style={s.headerBrand}>eventbuddy</Text>
          )}
          <View style={s.accent}>
            <View style={{ flex: 1, backgroundColor: PINK }} />
            <View style={{ flex: 1, backgroundColor: "#a43ad1" }} />
            <View style={{ flex: 1, backgroundColor: VIOLET }} />
          </View>
          <Text style={s.docNo}>{doc.docNumber}</Text>
        </View>

        <Text style={s.kicker}>PROPOSAL</Text>
        <Text style={s.eventName}>{event}</Text>
        <Text style={s.docTitle}>{c.title}</Text>
        <View style={s.shortRule} />

        {facts.length > 0 && (
          <View style={s.facts}>
            {facts.map(([k, v]) => (
              <View key={k} style={s.fact}>
                <Text style={s.factK}>{k}</Text>
                <Text style={s.factV}>{v}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={s.flyerBox}>
          {c.coverImage ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={c.coverImage} style={s.flyer} />
          ) : null}
        </View>

        <View style={s.coverFoot}>
          <View style={{ maxWidth: 300 }}>
            <Text style={s.footK}>PREPARED FOR</Text>
            <Text style={s.footV}>{`${c.preparedFor.replace(/\s+of$/i, "")} of ${event}`.replace(/^the /, "The ")}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.footK}>PREPARED BY</Text>
            <Text style={s.footV}>{`eventbuddy · ${day(doc.createdAt)}`}</Text>
            {doc.validUntil ? <Text style={[s.signLabel, { textAlign: "right" }]}>{`Valid until ${day(doc.validUntil)}`}</Text> : null}
          </View>
        </View>
      </Page>

      {/* ================= body ================= */}
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <Text style={s.headerBrand}>eventbuddy</Text>
          <Text style={s.headerText}>{`Proposal  ·  ${event}  ·  ${doc.docNumber}`}</Text>
        </View>
        <View style={s.footer} fixed>
          <Text>eventbuddy.africa</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>

        {/* 01 summary + scope */}
        <SectionHead no={++no} title="Summary" />
        <Text style={s.lead}>{c.summary}</Text>

        {c.scope.length > 0 && (
          <>
            <Text style={s.sub}>WHAT WE&apos;LL DELIVER</Text>
            <View style={s.scopeGrid}>
              {c.scope.map((r, i) => (
                <View key={i} style={s.scopeItem} wrap={false}>
                  <Tick />
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemTitle}>{r.title}</Text>
                    <Text style={s.itemText}>{r.text}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* 02 investment */}
        <SectionHead no={++no} title="Investment" />
        <Text style={s.sub}>FIXED SERVICE FEES</Text>
        {fees.map((f, i) => (
          <View key={i} style={[s.feeRow, i === 0 ? { borderTopWidth: 1 } : {}]} wrap={false}>
            <View style={{ flex: 1, paddingRight: 16 }}>
              <Text style={s.itemTitle}>{f.item}</Text>
              {f.detail.trim() ? <Text style={s.itemText}>{f.detail}</Text> : null}
            </View>
            <Text style={s.feeAmt}>{naira(Number(f.amountNaira) || 0)}</Text>
          </View>
        ))}
        <View style={s.totalCard} wrap={false}>
          <View>
            <Text style={s.totalK}>TOTAL FIXED FEE</Text>
            {c.feesNote.trim() ? <Text style={s.totalNote}>{c.feesNote}</Text> : null}
          </View>
          <Text style={s.totalV}>{naira(total)}</Text>
        </View>

        {c.showTransactionFee && (
          <View style={s.noteCard} wrap={false}>
            <Text style={s.noteTitle}>{`Platform transaction fee: ${feeLabel} per sale`}</Text>
            <Text style={s.itemText}>
              {`Charged on each successful ticket or vendor/exhibitor stand payment made through eventbuddy. It's variable, based on sales, and not part of the ${naira(total)} fixed fee. The final settlement and reporting arrangement will be confirmed before sales go live.`}
            </Text>
          </View>
        )}

        {c.separate.some((x) => x.title.trim() || x.text.trim()) && (
          <>
            <Text style={s.sub} minPresenceAhead={70}>QUOTED SEPARATELY ONCE CONFIRMED</Text>
            {c.separate
              .filter((x) => x.title.trim() || x.text.trim())
              .map((x, i) => (
                <View key={i} style={s.listItem} wrap={false}>
                  <Text style={s.dash}>–</Text>
                  <View style={{ flex: 1 }}>
                    {x.title.trim() ? <Text style={s.itemTitle}>{x.title}</Text> : null}
                    <Text style={s.itemText}>{x.text}</Text>
                  </View>
                </View>
              ))}
          </>
        )}

        {/* 03 delivery plan */}
        {c.plan.length > 0 && (
          <>
            <SectionHead no={++no} title="How we'll deliver it" />
            {c.plan.map((r, i) => (
              <View key={i} style={s.step} wrap={false}>
                <View style={s.stepRail}>
                  <View style={s.stepDot}>
                    <Text style={s.stepNo}>{String(i + 1)}</Text>
                  </View>
                  {i < c.plan.length - 1 ? <View style={s.stepLine} /> : null}
                </View>
                <View style={s.stepBody}>
                  <Text style={s.stepTitle}>{r.stage}</Text>
                  <Text style={s.stepText}>{r.activity}</Text>
                  {r.input.trim() ? <Text style={s.stepInput}>{`From you: ${r.input}`}</Text> : null}
                </View>
              </View>
            ))}
          </>
        )}

        {/* the plan's assumptions sit with the plan */}
        {c.assumptions.trim() ? (
          <View style={s.assume} wrap={false}>
            <Text style={s.assumeHead}>PLANNING ASSUMPTIONS</Text>
            <Text style={{ fontSize: 9, lineHeight: 1.55 }}>{c.assumptions}</Text>
          </View>
        ) : null}

        {/* 04 responsibilities */}
        {/* the two columns move as one, so neither ends up split across pages */}
        <View wrap={false}>
        <SectionHead no={++no} title="Who does what" />
        <View style={s.cols}>
          <View style={s.col}>
            <Text style={s.colHead}>eventbuddy will</Text>
            {c.ebWill.filter((t) => t.trim()).map((t, i) => (
              <View key={i} style={s.colItem} wrap={false}>
                <Text style={s.dash}>–</Text>
                <Text style={s.colText}>{t}</Text>
              </View>
            ))}
          </View>
          <View style={s.col}>
            <Text style={s.colHead}>The organisers will</Text>
            {c.clientWill.filter((t) => t.trim()).map((t, i) => (
              <View key={i} style={s.colItem} wrap={false}>
                <Text style={s.dash}>–</Text>
                <Text style={s.colText}>{t}</Text>
              </View>
            ))}
          </View>
        </View>
        </View>

        {/* 05 next steps */}
        <SectionHead no={++no} title="Next steps" />
        <Text style={s.lead}>{c.approval}</Text>
        {c.confirmations.length > 0 && (
          <>
            <Text style={s.sub}>TO CONFIRM BEFORE WE START</Text>
            {c.confirmations.map((r, i) => (
              <View key={i} style={[s.confirmRow, i === 0 ? { borderTopWidth: 1 } : {}]} wrap={false}>
                <Text style={s.confirmText}>{r.item}</Text>
                {r.status.trim() ? (
                  <View style={s.pill}>
                    <Text style={s.pillText}>{r.status}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </>
        )}

        <View wrap={false}>
          <Text style={s.closing}>{c.closing}</Text>
          <View style={s.signRow}>
            <View style={s.signBox}>
              <Text style={s.signHead}>FOR EVENTBUDDY</Text>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.signName, { marginTop: 9 }]}>eventbuddy</Text>
                  <Text style={s.signLabel}>Name</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={s.signLine} />
                  <Text style={s.signLabel}>Signature and date</Text>
                </View>
              </View>
            </View>
            <View style={s.signBox}>
              <Text style={s.signHead}>ACCEPTED BY THE ORGANISERS</Text>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <View style={s.signLine} />
                  <Text style={s.signLabel}>Name</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={s.signLine} />
                  <Text style={s.signLabel}>Signature and date</Text>
                </View>
              </View>
            </View>
          </View>
          <Text style={s.smallPrint}>{c.note}</Text>
        </View>
      </Page>
    </Document>
  );
}
