"""Build a preview of the new terms/charter; never overwrite the current pages."""
import argparse
from datetime import date
import json
import os
import subprocess
from pathlib import Path

from lxml.html import Element, fromstring, tostring

ROOT = Path(__file__).resolve().parents[1]
BACKEND = Path(os.environ.get("DUTT_BACKEND_SOURCE", ROOT.parent / "backend-git"))
DATA = json.loads(subprocess.check_output(
    ["node", str(BACKEND / "tools/exportCityTariff.js")], encoding="utf-8"
))
parser = argparse.ArgumentParser()
parser.add_argument("--effective-date", type=date.fromisoformat)
args = parser.parse_args()
effective = args.effective_date
date_label = effective.strftime("%d / %m / %Y") if effective else None
kg = DATA["motorbikeMaxKg"]
NAMES = {"larisa": ("Λάρισα", "Larissa"), "thessaloniki": ("Θεσσαλονίκη", "Thessaloniki"),
         "athens": ("Αθήνα", "Athens")}


def add(parent, tag, text=None, **attrs):
    element = Element(tag, **attrs)
    element.text = text
    parent.append(element)
    return element


for file in ("service-terms", "consumer-charter"):
    document = fromstring((ROOT / f"{file}.html").read_text(encoding="utf-8"))
    version = "1.7" if file == "service-terms" else "1.6"
    suffix = f"v{version}-{effective.isoformat()}" if effective else "city-tariff-preview"
    for logo in document.xpath("//img[@src='logo_white1.png']"):
        logo.set("src", "/logo_white1.png")
    for article in document.xpath("//article[@data-language]"):
        el = article.get("data-language") == "el"
        status = article.xpath("./header//span[@class='status-value']")
        status[0].text = version if effective else ("Προσχέδιο" if el else "Draft")
        status[1].text = date_label if effective else ("Δεν έχει οριστεί" if el else "Not yet set")
        article.xpath("./header/p[@class='eyebrow']")[0].text = (
            ("Νέα έκδοση" if el else "New edition") if effective else
            ("Προσχέδιο, όχι σε ισχύ" if el else "Draft, not in effect")
        )
    for section_id, lang in (("pricing", 0), ("pricing-en", 1)):
        el = lang == 0
        section = document.get_element_by_id(section_id)
        section.set("data-pricing-policy-version", DATA["version"])
        for child in list(section)[1:]:
            if child.tag == "h3" and ("ακύρωσης" in child.text_content() or "Cancellation" in child.text_content()):
                break
            section.remove(child)
        tail = list(section)[1:]
        for child in tail:
            section.remove(child)
        add(section, "p", (f"Έναρξη ισχύος: {date_label}." if el else f"Effective date: {date_label}.")
            if effective else ("Προσχέδιο, όχι σε ισχύ. Η ημερομηνία εφαρμογής θα ανακοινωθεί πριν από την έναρξη."
            if el else "Draft, not in effect. The effective date will be announced in advance."))
        add(section, "p", (f"Δίκυκλο: έως {kg} kg και έως 45 × 45 × 45 cm. Πάνω από {kg} kg ή πάνω από 45 cm σε οποιαδήποτε πλευρά "
            "απαιτείται αυτοκίνητο/βαν, εφόσον υπάρχει κατάλληλο διαθέσιμο όχημα και είναι εφικτή η ασφαλής φόρτωση.")
            if el else (f"Two-wheeler: up to {kg} kg and 45 × 45 × 45 cm. A car or van is required above {kg} kg or above "
                        "45 cm on any side, subject to availability and safe loading."))
        add(section, "p", ("Τιμή ανά πόλη παραλαβής, οδική απόσταση 1–40 km και όχημα. Ελάχιστη χρέωση 1 km. "
            "Αναλογική χρέωση ενδιάμεσων αποστάσεων, χωρίς προσαύξηση ζήτησης ή ζώνης. "
            "Αυτοκίνητο/βαν: +40%. Για άλλες πόλεις δεν αλλάζει ο τιμοκατάλογος.")
            if el else ("Prices vary by pickup city, road distance (1–40 km) and vehicle. Minimum 1 km fare. "
                        "Intermediate distances are prorated, with no demand or zone surcharge. "
                        "Car/van: +40%. The tariff in other cities is unchanged."))
        add(add(section, "p"), "a", "Τιμοκατάλογος PDF" if el else "Tariff PDF",
            href=f"/documents/DUTT-City-Tariff-{effective.isoformat() if effective else 'Draft'}.pdf")
        document_name = "DUTT-Service-Terms" if file == "service-terms" else "DUTT-Consumer-Charter"
        add(add(section, "p"), "a", "Πλήρες έγγραφο PDF" if el else "Full document PDF (Greek)",
            href=f"/documents/{document_name}-{suffix}.pdf")
        add(add(section, "p"), "a", "Προηγούμενος τιμοκατάλογος και λοιπές πόλεις" if el else
            "Previous tariff and other cities", href="/documents/DUTT-Timokatalogos-2026-11-07.pdf")
        for city in DATA["cities"]:
            add(section, "h3", NAMES[city][lang])
            table = add(add(section, "div", **{"class": "table-wrap"}), "table")
            header = add(add(table, "thead"), "tr")
            for title in (("km", "Δίκυκλο καθαρή", "ΦΠΑ", "Δίκυκλο τελική", "Αυτ./βαν καθαρή", "ΦΠΑ", "Αυτ./βαν τελική") if el
                          else ("km", "Bike net", "VAT", "Bike total", "Car/van net", "VAT", "Car/van total")):
                add(header, "th", title)
            body = add(table, "tbody", **{"data-city-tariff": city})
            for row in DATA["rows"]:
                tr = add(body, "tr")
                add(tr, "td", str(row["km"]))
                for vehicle in ("standard", "carOrVan"):
                    for key in ("netCents", "vatCents", "grossCents"):
                        cents = row["cities"][city][vehicle][key]
                        add(tr, "td", f"{cents // 100}{',' if el else '.'}{cents % 100:02d} €")
            assert len(body) == 40
        section.extend(tail)
    out = ROOT / "documents" / f"{file}-{suffix}.html"
    out.write_text(tostring(document, encoding="unicode", doctype="<!doctype html>"), encoding="utf-8")
    print(out)
