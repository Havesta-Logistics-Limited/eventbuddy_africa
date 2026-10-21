import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { PlatformDocument } from "@/lib/types";
import { PAYMENT_METHOD_LABELS, documentSubtotal, documentTotal, documentVat, lineItemTotal } from "@/lib/platform-documents";
import { registerFonts } from "./platform-proposal-pdf";

/* Quotes and invoices in the same clean, light, editorial style as proposals:
   white page, one pink accent, Inter (it has the ₦ sign), fixed-width
   columns so long emails and addresses wrap inside their own column.

   Every <Text> holds ONE string (template literals, never {a} {b} siblings):
   react-pdf garbles text split into several runs inside a row layout. */

const INK = "#14122b";
const BODY = "#3a3852";
const MUTED = "#7a7891";
const PINK = "#c21faf";
const VIOLET = "#6d28d9";
const LINE = "#ebe9f2";
const TINT = "#f7f4fd";

const s = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 9.6, color: BODY, paddingTop: 48, paddingBottom: 56, paddingHorizontal: 56, lineHeight: 1.5 },
  top: { flexDirection: "row", alignItems: "center", gap: 14 },
  logo: { width: 112, height: 18 },
  accent: { flex: 1, height: 3, flexDirection: "row" },
  docNo: { fontSize: 8.5, color: MUTED, letterSpacing: 0.6 },
  kicker: { marginTop: 44, fontSize: 9, fontWeight: 700, color: PINK, letterSpacing: 3 },
  title: { marginTop: 8, fontSize: 28, fontWeight: 700, color: INK, lineHeight: 1.1, letterSpacing: -0.6 },
  subtitle: { marginTop: 6, fontSize: 11.5, color: MUTED },
  shortRule: { marginTop: 18, width: 44, height: 3, backgroundColor: PINK, borderRadius: 2 },
  parties: { marginTop: 26, flexDirection: "row", gap: 18 },
  partyTo: { flex: 1.45 },
  partyFrom: { flex: 1 },
  partyDates: { width: 118 },
  k: { fontSize: 7.5, fontWeight: 700, color: MUTED, letterSpacing: 1.4, marginBottom: 4 },
  name: { fontSize: 11, fontWeight: 700, color: INK, lineHeight: 1.35 },
  line: { fontSize: 9, color: BODY, lineHeight: 1.45 },
  date: { fontSize: 10.5, color: INK, marginBottom: 10 },
  table: { marginTop: 30 },
  thead: { flexDirection: "row", paddingBottom: 7, borderBottomWidth: 1.5, borderColor: INK },
  th: { fontSize: 7.5, fontWeight: 700, color: MUTED, letterSpacing: 1.2 },
  row: { flexDirection: "row", paddingVertical: 10, borderBottomWidth: 1, borderColor: LINE },
  cDesc: { flex: 1, paddingRight: 14 },
  cQty: { width: 34, textAlign: "right" },
  cUnit: { width: 92, textAlign: "right" },
  cAmt: { width: 96, textAlign: "right" },
  desc: { fontSize: 10, color: INK, lineHeight: 1.45 },
  num: { fontSize: 10, color: INK },
  numBold: { fontSize: 10, fontWeight: 700, color: INK },
  sums: { marginTop: 12, marginLeft: "auto", width: 260 },
  sumRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, paddingHorizontal: 16 },
  sumK: { fontSize: 9.4, color: MUTED },
  sumV: { fontSize: 9.4, color: INK },
  totalCard: { marginTop: 16, marginLeft: "auto", width: 260, borderRadius: 12, backgroundColor: TINT, paddingVertical: 14, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totalK: { fontSize: 8, fontWeight: 700, color: VIOLET, letterSpacing: 1.6 },
  totalV: { fontSize: 20, fontWeight: 700, color: VIOLET, letterSpacing: -0.4 },
  paid: { marginTop: 10, marginLeft: "auto", borderRadius: 9, paddingVertical: 3, paddingHorizontal: 9, backgroundColor: "#dcfce7" },
  paidText: { fontSize: 8, fontWeight: 700, color: "#166534", letterSpacing: 1 },
  notes: { marginTop: 28, borderLeftWidth: 3, borderColor: PINK, paddingLeft: 12, paddingVertical: 2 },
  notesK: { fontSize: 7.5, fontWeight: 700, color: MUTED, letterSpacing: 1.4, marginBottom: 4 },
  notesText: { fontSize: 9.4, color: BODY, lineHeight: 1.55 },
  // pinned from the top (A4 is 842pt tall): a `bottom`-pinned fixed element doesn't render in react-pdf
  footer: { position: "absolute", top: 806, left: 56, right: 56, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderColor: LINE, paddingTop: 8, fontSize: 7.8, color: MUTED },
});

// whole naira, or kobo when VAT leaves a fraction
const naira = (n: number) =>
  `₦${Number.isInteger(Math.round(n * 100) / 100) ? Math.round(n).toLocaleString("en-NG") : n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export function PlatformDocumentPdf({ doc, logoUrl, source = null }: { doc: PlatformDocument; logoUrl: string; source?: PlatformDocument | null }) {
  registerFonts();
  const subtotal = documentSubtotal(doc);
  const vat = documentVat({ lineItems: doc.lineItems, vatRate: doc.vatRate ?? null });
  const total = documentTotal(doc);
  if (doc.docType === "receipt") return <ReceiptPdf doc={doc} logoUrl={logoUrl} source={source} subtotal={subtotal} vat={vat} total={total} />;
  const isQuote = doc.docType === "quote";
  const label = isQuote ? "QUOTE" : "INVOICE";
  const client = doc.clientCompany?.trim() || doc.clientName;

  return (
    <Document title={`${label} ${doc.docNumber} — ${doc.clientName}`}>
      <Page size="A4" style={s.page}>
        <View style={s.top}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={logoUrl} style={s.logo} />
          <View style={s.accent}>
            <View style={{ flex: 3, backgroundColor: PINK }} />
            <View style={{ flex: 1, backgroundColor: VIOLET }} />
          </View>
          <Text style={s.docNo}>{doc.docNumber}</Text>
        </View>

        <Text style={s.kicker}>{label}</Text>
        <Text style={s.title}>{client}</Text>
        <Text style={s.subtitle}>{isQuote ? `Quote from eventbuddy · ${naira(total)}` : `Invoice from eventbuddy · ${naira(total)}`}</Text>
        <View style={s.shortRule} />

        <View style={s.parties}>
          <View style={s.partyTo}>
            <Text style={s.k}>{isQuote ? "PREPARED FOR" : "BILLED TO"}</Text>
            <Text style={s.name}>{doc.clientName}</Text>
            {doc.clientCompany?.trim() && doc.clientCompany.trim() !== doc.clientName ? <Text style={s.line}>{doc.clientCompany.trim()}</Text> : null}
            {doc.clientEmail ? <Text style={s.line}>{doc.clientEmail}</Text> : null}
            {doc.clientAddress ? <Text style={s.line}>{doc.clientAddress}</Text> : null}
          </View>
          <View style={s.partyFrom}>
            <Text style={s.k}>FROM</Text>
            <Text style={s.name}>eventbuddy</Text>
            <Text style={s.line}>info@eventbuddy.africa</Text>
            <Text style={s.line}>Lagos, Nigeria</Text>
          </View>
          <View style={s.partyDates}>
            <Text style={s.k}>DATE ISSUED</Text>
            <Text style={s.date}>{fmtDate(doc.createdAt)}</Text>
            {doc.validUntil ? <Text style={s.k}>{isQuote ? "VALID UNTIL" : "PAYMENT DUE"}</Text> : null}
            {doc.validUntil ? <Text style={s.date}>{fmtDate(doc.validUntil)}</Text> : null}
          </View>
        </View>

        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.th, s.cDesc]}>DESCRIPTION</Text>
            <Text style={[s.th, s.cQty]}>QTY</Text>
            <Text style={[s.th, s.cUnit]}>UNIT PRICE</Text>
            <Text style={[s.th, s.cAmt]}>AMOUNT</Text>
          </View>
          {doc.lineItems.map((item, i) => (
            <View key={i} style={s.row} wrap={false}>
              <View style={s.cDesc}>
                <Text style={s.desc}>{item.description}</Text>
              </View>
              <Text style={[s.num, s.cQty]}>{String(item.quantity)}</Text>
              <Text style={[s.num, s.cUnit]}>{naira(item.unitPriceNaira)}</Text>
              <Text style={[s.numBold, s.cAmt]}>{naira(lineItemTotal(item))}</Text>
            </View>
          ))}
        </View>

        {vat > 0 ? (
          <View style={s.sums} wrap={false}>
            <View style={s.sumRow}>
              <Text style={s.sumK}>Subtotal</Text>
              <Text style={s.sumV}>{naira(subtotal)}</Text>
            </View>
            <View style={s.sumRow}>
              <Text style={s.sumK}>{`VAT (${doc.vatRate}%)`}</Text>
              <Text style={s.sumV}>{naira(vat)}</Text>
            </View>
          </View>
        ) : null}
        <View style={[s.totalCard, vat > 0 ? { marginTop: 6 } : {}]} wrap={false}>
          <Text style={s.totalK}>{isQuote ? "TOTAL" : doc.status === "paid" ? "TOTAL PAID" : "AMOUNT DUE"}</Text>
          <Text style={s.totalV}>{naira(total)}</Text>
        </View>
        {!isQuote && doc.status === "paid" ? (
          <View style={s.paid}>
            <Text style={s.paidText}>PAID</Text>
          </View>
        ) : null}

        {doc.notes ? (
          <View style={s.notes} wrap={false}>
            <Text style={s.notesK}>NOTES</Text>
            <Text style={s.notesText}>{doc.notes}</Text>
          </View>
        ) : null}

        <View style={s.footer} fixed>
          <Text>{"eventbuddy · eventbuddy.africa · info@eventbuddy.africa"}</Text>
          <Text>{`${label} ${doc.docNumber}`}</Text>
        </View>
      </Page>
    </Document>
  );
}

const r = StyleSheet.create({
  payCard: { marginTop: 16, marginLeft: "auto", width: 260, borderRadius: 12, backgroundColor: "#ecfdf5", paddingVertical: 14, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  payK: { fontSize: 8, fontWeight: 700, color: "#047857", letterSpacing: 1.6 },
  payV: { fontSize: 20, fontWeight: 700, color: "#047857", letterSpacing: -0.4 },
  balRow: { marginTop: 8, marginLeft: "auto", width: 260, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16 },
  balK: { fontSize: 9.6, fontWeight: 700, color: INK },
  balV: { fontSize: 9.6, fontWeight: 700, color: "#b45309" },
  fullTag: { marginTop: 10, marginLeft: "auto", borderRadius: 9, paddingVertical: 3, paddingHorizontal: 9, backgroundColor: "#dcfce7" },
  fullText: { fontSize: 8, fontWeight: 700, color: "#166534", letterSpacing: 1 },
});

/** A receipt: money received against a quote, invoice or proposal (migration 0134). */
function ReceiptPdf({ doc, logoUrl, source, subtotal, vat, total }: { doc: PlatformDocument; logoUrl: string; source: PlatformDocument | null; subtotal: number; vat: number; total: number }) {
  const paid = doc.paidAmountNaira ?? 0;
  const balance = doc.balanceDueNaira ?? 0;
  const client = doc.clientCompany?.trim() || doc.clientName;
  const forLabel = source ? `${source.docType === "quote" ? "Quote" : source.docType === "proposal" ? "Proposal" : "Invoice"} ${source.docNumber}` : null;
  return (
    <Document title={`RECEIPT ${doc.docNumber} — ${doc.clientName}`}>
      <Page size="A4" style={s.page}>
        <View style={s.top}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={logoUrl} style={s.logo} />
          <View style={s.accent}>
            <View style={{ flex: 3, backgroundColor: PINK }} />
            <View style={{ flex: 1, backgroundColor: VIOLET }} />
          </View>
          <Text style={s.docNo}>{doc.docNumber}</Text>
        </View>

        <Text style={s.kicker}>RECEIPT</Text>
        <Text style={s.title}>{client}</Text>
        <Text style={s.subtitle}>{`Payment received · ${naira(paid)}${forLabel ? ` · for ${forLabel}` : ""}`}</Text>
        <View style={s.shortRule} />

        <View style={s.parties}>
          <View style={s.partyTo}>
            <Text style={s.k}>RECEIVED FROM</Text>
            <Text style={s.name}>{doc.clientName}</Text>
            {doc.clientCompany?.trim() && doc.clientCompany.trim() !== doc.clientName ? <Text style={s.line}>{doc.clientCompany.trim()}</Text> : null}
            {doc.clientEmail ? <Text style={s.line}>{doc.clientEmail}</Text> : null}
            {doc.clientAddress ? <Text style={s.line}>{doc.clientAddress}</Text> : null}
          </View>
          <View style={s.partyFrom}>
            <Text style={s.k}>PAYMENT</Text>
            <Text style={s.name}>{doc.paymentMethod ? PAYMENT_METHOD_LABELS[doc.paymentMethod] : "Payment"}</Text>
            {doc.paymentReference ? <Text style={s.line}>{`Ref: ${doc.paymentReference}`}</Text> : null}
            {forLabel ? <Text style={s.line}>{`For ${forLabel}`}</Text> : null}
          </View>
          <View style={s.partyDates}>
            <Text style={s.k}>DATE PAID</Text>
            <Text style={s.date}>{doc.paidOn ? fmtDate(doc.paidOn) : fmtDate(doc.createdAt)}</Text>
            <Text style={s.k}>ISSUED</Text>
            <Text style={s.date}>{fmtDate(doc.createdAt)}</Text>
          </View>
        </View>

        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.th, s.cDesc]}>DESCRIPTION</Text>
            <Text style={[s.th, s.cQty]}>QTY</Text>
            <Text style={[s.th, s.cUnit]}>UNIT PRICE</Text>
            <Text style={[s.th, s.cAmt]}>AMOUNT</Text>
          </View>
          {doc.lineItems.map((item, i) => (
            <View key={i} style={s.row} wrap={false}>
              <View style={s.cDesc}>
                <Text style={s.desc}>{item.description}</Text>
              </View>
              <Text style={[s.num, s.cQty]}>{String(item.quantity)}</Text>
              <Text style={[s.num, s.cUnit]}>{naira(item.unitPriceNaira)}</Text>
              <Text style={[s.numBold, s.cAmt]}>{naira(lineItemTotal(item))}</Text>
            </View>
          ))}
        </View>

        <View style={s.sums} wrap={false}>
          {vat > 0 ? (
            <View style={s.sumRow}>
              <Text style={s.sumK}>Subtotal</Text>
              <Text style={s.sumV}>{naira(subtotal)}</Text>
            </View>
          ) : null}
          {vat > 0 ? (
            <View style={s.sumRow}>
              <Text style={s.sumK}>{`VAT (${doc.vatRate}%)`}</Text>
              <Text style={s.sumV}>{naira(vat)}</Text>
            </View>
          ) : null}
          <View style={s.sumRow}>
            <Text style={s.sumK}>{forLabel ? `${forLabel} total` : "Total"}</Text>
            <Text style={s.sumV}>{naira(total)}</Text>
          </View>
        </View>
        <View style={r.payCard} wrap={false}>
          <Text style={r.payK}>AMOUNT PAID</Text>
          <Text style={r.payV}>{naira(paid)}</Text>
        </View>
        {balance > 0 ? (
          <View style={r.balRow}>
            <Text style={r.balK}>Balance still due</Text>
            <Text style={r.balV}>{naira(balance)}</Text>
          </View>
        ) : (
          <View style={r.fullTag}>
            <Text style={r.fullText}>PAID IN FULL</Text>
          </View>
        )}

        <View style={s.notes} wrap={false}>
          <Text style={s.notesK}>THANK YOU</Text>
          <Text style={s.notesText}>{"This receipt confirms eventbuddy has received the payment above. Keep it for your records."}</Text>
        </View>

        <View style={s.footer} fixed>
          <Text>{"eventbuddy · eventbuddy.africa · info@eventbuddy.africa"}</Text>
          <Text>{`RECEIPT ${doc.docNumber}`}</Text>
        </View>
      </Page>
    </Document>
  );
}
