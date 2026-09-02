import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { PlatformDocument } from "@/lib/types";
import { documentTotal, lineItemTotal } from "@/lib/platform-documents";

const BRAND_PINK = "#C21FAF";
const BRAND_PURPLE = "#6D28D9";
const INK = "#170821";
const MUTED = "#64748b";
const BORDER = "#e2e8f0";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: INK, fontFamily: "Helvetica" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 },
  logo: { width: 130, height: 21 },
  docTypeLabel: { fontSize: 20, fontFamily: "Helvetica-Bold", color: BRAND_PINK, textAlign: "right" },
  docNumber: { fontSize: 10, color: MUTED, textAlign: "right", marginTop: 2 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  metaBlock: { flexDirection: "column" },
  metaLabel: { fontSize: 8, textTransform: "uppercase", letterSpacing: 0.5, color: MUTED, marginBottom: 4 },
  metaValue: { fontSize: 10.5, color: INK, marginBottom: 2 },
  metaValueMuted: { fontSize: 9.5, color: MUTED, marginBottom: 2 },
  table: { marginTop: 10, borderTopWidth: 1, borderTopColor: BORDER },
  tableHeaderRow: { flexDirection: "row", backgroundColor: "#faf5ff", paddingVertical: 7, paddingHorizontal: 8 },
  tableRow: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: BORDER },
  colDescription: { flex: 3 },
  colQty: { flex: 0.8, textAlign: "right" },
  colUnitPrice: { flex: 1.3, textAlign: "right" },
  colTotal: { flex: 1.3, textAlign: "right" },
  tableHeaderText: { fontSize: 8, textTransform: "uppercase", letterSpacing: 0.5, color: MUTED, fontFamily: "Helvetica-Bold" },
  totalsBlock: { marginTop: 14, alignItems: "flex-end" },
  totalsRow: { flexDirection: "row", width: 220, justifyContent: "space-between", paddingVertical: 4 },
  grandTotalRow: { flexDirection: "row", width: 220, justifyContent: "space-between", paddingVertical: 8, marginTop: 4, borderTopWidth: 1.5, borderTopColor: INK },
  grandTotalLabel: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  grandTotalValue: { fontSize: 13, fontFamily: "Helvetica-Bold", color: BRAND_PINK },
  notesBlock: { marginTop: 28, paddingTop: 14, borderTopWidth: 1, borderTopColor: BORDER },
  notesLabel: { fontSize: 8, textTransform: "uppercase", letterSpacing: 0.5, color: MUTED, marginBottom: 6 },
  notesText: { fontSize: 9.5, color: INK, lineHeight: 1.5 },
  footer: { position: "absolute", bottom: 32, left: 40, right: 40, textAlign: "center", fontSize: 8.5, color: MUTED },
  accentBar: { height: 3, marginBottom: 24, flexDirection: "row" },
});

function formatNaira(n: number): string {
  return `NGN ${Math.round(n).toLocaleString("en-NG")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function PlatformDocumentPdf({ doc, logoUrl }: { doc: PlatformDocument; logoUrl: string }) {
  const total = documentTotal(doc);
  const docLabel = doc.docType === "quote" ? "QUOTE" : "INVOICE";

  return (
    <Document title={`${docLabel} ${doc.docNumber} — ${doc.clientName}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={logoUrl} style={styles.logo} />
          <View>
            <Text style={styles.docTypeLabel}>{docLabel}</Text>
            <Text style={styles.docNumber}>{doc.docNumber}</Text>
          </View>
        </View>

        <View style={styles.accentBar}>
          <View style={{ flex: 1, backgroundColor: BRAND_PINK }} />
          <View style={{ flex: 1, backgroundColor: BRAND_PURPLE }} />
          <View style={{ flex: 1, backgroundColor: "#E85D0A" }} />
          <View style={{ flex: 1, backgroundColor: "#B8119C" }} />
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>From</Text>
            <Text style={styles.metaValue}>eventbuddy</Text>
            <Text style={styles.metaValueMuted}>info@eventbuddy.africa</Text>
            <Text style={styles.metaValueMuted}>Lagos, Nigeria</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>To</Text>
            <Text style={styles.metaValue}>{doc.clientName}</Text>
            {doc.clientCompany && <Text style={styles.metaValueMuted}>{doc.clientCompany}</Text>}
            {doc.clientEmail && <Text style={styles.metaValueMuted}>{doc.clientEmail}</Text>}
            {doc.clientAddress && <Text style={styles.metaValueMuted}>{doc.clientAddress}</Text>}
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Date issued</Text>
            <Text style={styles.metaValue}>{formatDate(doc.createdAt)}</Text>
            {doc.validUntil && (
              <>
                <Text style={[styles.metaLabel, { marginTop: 8 }]}>Valid until</Text>
                <Text style={styles.metaValue}>{formatDate(doc.validUntil)}</Text>
              </>
            )}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.colDescription, styles.tableHeaderText]}>Description</Text>
            <Text style={[styles.colQty, styles.tableHeaderText]}>Qty</Text>
            <Text style={[styles.colUnitPrice, styles.tableHeaderText]}>Unit price</Text>
            <Text style={[styles.colTotal, styles.tableHeaderText]}>Total</Text>
          </View>
          {doc.lineItems.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.colDescription}>{item.description}</Text>
              <Text style={styles.colQty}>{item.quantity}</Text>
              <Text style={styles.colUnitPrice}>{formatNaira(item.unitPriceNaira)}</Text>
              <Text style={styles.colTotal}>{formatNaira(lineItemTotal(item))}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>{formatNaira(total)}</Text>
          </View>
        </View>

        {doc.notes && (
          <View style={styles.notesBlock}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesText}>{doc.notes}</Text>
          </View>
        )}

        <Text style={styles.footer}>
          eventbuddy — Africa&apos;s #1 event digital infrastructure · eventbuddy.africa
        </Text>
      </Page>
    </Document>
  );
}
