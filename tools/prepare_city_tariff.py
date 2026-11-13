"""Prepare the draft tariff and advance notice from the same code as checkout."""
import argparse
from datetime import date
import json
import os
import subprocess
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import LongTable, PageBreak, Paragraph, SimpleDocTemplate, TableStyle

SITE = Path(__file__).resolve().parents[1]
BACKEND = Path(os.environ.get("DUTT_BACKEND_SOURCE", SITE.parent / "backend-git"))
DATA = json.loads(subprocess.check_output(
    ["node", str(BACKEND / "tools/exportCityTariff.js")], text=True, encoding="utf-8"
))
NAMES = {"larisa": ("Λάρισα", "Larissa"), "thessaloniki": ("Θεσσαλονίκη", "Thessaloniki"),
         "athens": ("Αθήνα", "Athens")}
assert list(NAMES) == DATA["cities"]
assert [row["km"] for row in DATA["rows"]] == list(range(1, 41))
pdfmetrics.registerFont(TTFont("Dutt", "C:/Windows/Fonts/arial.ttf"))
pdfmetrics.registerFont(TTFont("DuttBold", "C:/Windows/Fonts/arialbd.ttf"))
OUT = SITE / "documents"
parser = argparse.ArgumentParser()
parser.add_argument("--effective-date", type=date.fromisoformat)
args = parser.parse_args()
effective = args.effective_date
kg = DATA["motorbikeMaxKg"]
TITLE = ParagraphStyle("Title", fontName="DuttBold", fontSize=23, leading=29, spaceAfter=12)
BODY = ParagraphStyle("Body", fontName="Dutt", fontSize=9.5, leading=13, spaceAfter=8)


def money(cents):
    return f"{cents // 100},{cents % 100:02d}"


def footer(canvas, doc):
    canvas.setStrokeColor(colors.HexColor("#C8A200"))
    canvas.line(39, 40, A4[0] - 39, 40)
    canvas.setFont("Dutt", 9)
    status = effective.strftime("%d/%m/%Y") if effective else "ΠΡΟΣΧΕΔΙΟ, ΟΧΙ ΣΕ ΙΣΧΥ"
    canvas.drawString(39, 27, f"DUTT | {status} | info@dutt.gr")
    canvas.drawRightString(A4[0] - 39, 27, str(doc.page))


story = []
for city, (name, _) in NAMES.items():
    if story:
        story.append(PageBreak())
    story.extend([
        Paragraph(f"DUTT | Τιμοκατάλογος: {name}", TITLE),
        Paragraph(f"Έναρξη ισχύος: {effective:%d/%m/%Y}." if effective else
                  "Προτεινόμενες τιμές. Η ημερομηνία έναρξης θα ανακοινωθεί πριν από την εφαρμογή.", BODY),
        Paragraph(f"Δίκυκλο: έως {kg} kg και έως 45 × 45 × 45 cm. Πάνω από {kg} kg ή εκτός διαστάσεων: "
                  "αυτοκίνητο/βαν, εφόσον είναι διαθέσιμο και μπορεί να φορτωθεί με ασφάλεια.", BODY),
        Paragraph("Οδική απόσταση έως 40 km, ελάχιστη τιμή 1 km. Αναλογική χρέωση για ενδιάμεσες "
                  "αποστάσεις, χωρίς προσαύξηση ζήτησης ή ζώνης. Αυτοκίνητο/βαν: +40%. "
                  "Η δεσμευτική προσφορά εμφανίζεται πριν από την αποδοχή.", BODY),
    ])
    rows = [["km", "Δίκυκλο καθαρή", "ΦΠΑ 24%", "Δίκυκλο τελική",
             "Αυτ./βαν καθαρή", "ΦΠΑ 24%", "Αυτ./βαν τελική"]]
    for row in DATA["rows"]:
        group = row["cities"][city]
        rows.append([str(row["km"])] + [
            money(group[vehicle][key]) for vehicle in ("standard", "carOrVan")
            for key in ("netCents", "vatCents", "grossCents")
        ])
    price_table = LongTable(rows, colWidths=[38, 88, 60, 85, 89, 60, 87], repeatRows=1)
    price_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Dutt"),
        ("FONTNAME", (0, 0), (-1, 0), "DuttBold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F3D134")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F5F5")]),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 1.3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.3),
    ]))
    story.append(price_table)

pdf = OUT / (f"DUTT-City-Tariff-{effective.isoformat()}.pdf" if effective else "DUTT-City-Tariff-Draft.pdf")
SimpleDocTemplate(str(pdf), pagesize=A4, leftMargin=39, rightMargin=39, topMargin=34,
                  bottomMargin=50, title="DUTT | Τιμοκατάλογος ανά πόλη (προσχέδιο)").build(
    story, onFirstPage=footer, onLaterPages=footer
)
print(pdf)
print(json.dumps(DATA, ensure_ascii=False))
