"""Render current Greek legal documents from their canonical HTML and checked prices."""
import hashlib
import json
from html import escape
from pathlib import Path
from urllib.parse import urljoin

from lxml.html import fromstring
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import LongTable, Paragraph, SimpleDocTemplate, Spacer, TableStyle
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "documents"
DATA = json.loads((OUT / "tariff-2026-11-07.json").read_text(encoding="utf-8"))
assert len(DATA["rows"]) == 40
pdfmetrics.registerFont(TTFont("Dutt", "C:/Windows/Fonts/arial.ttf"))
pdfmetrics.registerFont(TTFont("DuttBold", "C:/Windows/Fonts/arialbd.ttf"))
pdfmetrics.registerFontFamily("Dutt", normal="Dutt", bold="DuttBold")
WIDTH = A4[0] - 100
BODY = ParagraphStyle("Body", fontName="Dutt", fontSize=9.5, leading=13.5, spaceAfter=8)
TITLE = ParagraphStyle("Title", parent=BODY, fontName="DuttBold", fontSize=21, leading=26, spaceAfter=15)
HEADING = ParagraphStyle("Heading", parent=BODY, fontName="DuttBold", fontSize=12.5, leading=17, spaceBefore=12, spaceAfter=8, keepWithNext=True)
CELL = ParagraphStyle("Cell", parent=BODY, fontSize=8.5, leading=12, spaceAfter=0)
HEADER = ParagraphStyle("Header", parent=CELL, fontName="DuttBold")


def clean(text):
    return " ".join((text or "").split())


def rich(element):
    result = escape(element.text or "")
    for child in element:
        content = rich(child)
        if child.tag in ("strong", "b"):
            content = "<b>" + content + "</b>"
        elif child.tag == "a":
            target = urljoin("https://dutt.gr/", child.get("href", ""))
            content = '<link href="' + escape(target, quote=True) + '">' + content + "</link>"
        elif child.tag == "br":
            content = "<br/>"
        result += content + escape(child.tail or "")
    return result


def para(text, style=BODY):
    return Paragraph(text, style)


def money(value):
    return f"{value:.2f}".replace(".", ",") + " €"


def table(rows, widths):
    return LongTable(rows, colWidths=widths, repeatRows=1, hAlign="LEFT", style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eeeef0")),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#b8bcc1")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))


def blocks(parent):
    result = []
    for element in parent:
        if element.tag in ("h2", "h3"):
            result.append(para(rich(element), HEADING))
        elif element.tag == "p":
            result.append(para(rich(element)))
        elif element.tag in ("ul", "ol"):
            for item in element.findall("li"):
                result.append(Paragraph(rich(item), BODY, bulletText="-"))
        elif element.tag == "div" and "table-wrap" in element.get("class", "").split():
            source = element.find("table")
            headings = source.xpath("./thead/tr/th")
            rows = [[para(rich(cell), HEADER) for cell in headings]]
            if "price-table" in source.get("class", "").split():
                for row in DATA["rows"]:
                    p = row["standard"]
                    rows.append([para(str(row["km"]) + " km", CELL)] + [para(money(p[key]), CELL) for key in ("net", "vat", "gross")])
                widths = [WIDTH * x for x in (0.18, 0.28, 0.25, 0.29)]
            else:
                for row in source.xpath("./tbody/tr"):
                    rows.append([para(rich(cell), CELL) for cell in row.findall("td")])
                widths = [WIDTH / len(headings)] * len(headings)
            result.extend([table(rows, widths), Spacer(1, 10)])
        elif element.tag == "div" and any(name in element.get("class", "").split() for name in ("identity-grid", "rate-grid")):
            for item in element:
                result.append(para(rich(item)))
    return result


def footer(canvas, document):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#d1aa00"))
    canvas.line(50, 42, A4[0] - 50, 42)
    canvas.setFont("Dutt", 8)
    canvas.drawString(50, 28, "DUTT | Έναρξη ισχύος 07/11/2026 | info@dutt.gr")
    canvas.drawRightString(A4[0] - 50, 28, f"Σελίδα {document.page}")
    canvas.restoreState()


def build(filename, title, subtitle, content):
    target = OUT / filename
    story = [para("DUTT", TITLE), para(escape(title), TITLE), para(escape(subtitle)),
             para("Πάροχος: ΣΟΥΡΡΑΣ ΔΗΜΗΤΡΙΟΣ | ΑΦΜ 103922076 | Α.Μ. ΕΕΤΤ 26-109"),
             para("Έδρα: ΚΟΥΤΛΙΜΠΑΝΑ 5, ΛΑΡΙΣΑ 41222 | info@dutt.gr | 241 400 5377"),
             para('Δημόσια έκδοση: <link href="https://dutt.gr/service-terms.html#pricing">https://dutt.gr/service-terms.html#pricing</link>'),
             Spacer(1, 8), *content]
    doc = SimpleDocTemplate(str(target), pagesize=A4, leftMargin=50, rightMargin=50, topMargin=40, bottomMargin=55, title=title, author="ΣΟΥΡΡΑΣ ΔΗΜΗΤΡΙΟΣ - DUTT")
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    reader = PdfReader(target)
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    assert all(len(page.extract_text() or "") > 80 for page in reader.pages)
    assert "103922076" in text and "20 kg" in text
    assert "6,52" in text and "9,13" in text
    assert "\ufffd" not in text
    return {"file": filename, "pages": len(reader.pages), "bytes": target.stat().st_size, "sha256": hashlib.sha256(target.read_bytes()).hexdigest()}


terms = fromstring((ROOT / "service-terms.html").read_text(encoding="utf-8"))
charter = fromstring((ROOT / "consumer-charter.html").read_text(encoding="utf-8"))
records = [build("DUTT-Timokatalogos-2026-11-07.pdf", "Τιμοκατάλογος υπηρεσιών", "Επαναφορά προηγούμενων βασικών τιμών και σαφείς όροι βάρους, διαστάσεων και αυτοκινήτου", blocks(terms.get_element_by_id("pricing")))]
for tree, filename, title, version in [(terms, "DUTT-Service-Terms-v1.6-2026-11-07.pdf", "Σύμβαση Όρων Παροχής", "1.6"), (charter, "DUTT-Consumer-Charter-v1.5-2026-11-07.pdf", "Χάρτης Υποχρεώσεων προς τον Χρήστη-Καταναλωτή", "1.5")]:
    content = []
    for section in tree.xpath('//article[@data-language="el"]/section'):
        content.extend(blocks(section))
    records.append(build(filename, title, "Έκδοση " + version + " | 07/11/2026 | Χωρίς αναδρομική μεταβολή υφιστάμενων συμφωνιών", content))

(OUT / "document-manifest-2026-11-07.json").write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(records, ensure_ascii=False, indent=2))
