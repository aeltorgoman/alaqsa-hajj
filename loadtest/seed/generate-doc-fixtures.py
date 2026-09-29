#!/usr/bin/env python3
"""Deterministic synthetic Storage fixtures for the document-cohort scenario.

Writes 60 files under <outdir>/loadtest/LD######/ - one photo, one permit and
one ticket for each of the 20 document-cohort pilgrims - plus a manifest.

The keys match `loadtest/seed/generate.py` exactly: that generator seeds the
LD passengers with photo/permit/ticket keys under `loadtest/<passport>/`, and
these are the objects those keys point at. Nothing here invents a path.

Every file is a real file of its extension (a valid PNG, a valid PDF) so that
Storage stores real bytes and a signed URL can actually be downloaded - a
metadata-only row would let signing succeed while the download returned
nothing, which is exactly the failure this fixture exists to rule out.

Every file carries a banner making it unmistakably synthetic. No real
passport, permit, ticket, photograph or pilgrim data is used anywhere.
"""
import hashlib
import json
import os
import struct
import sys
import zlib

DOCS = 20  # must equal DOCS in loadtest/seed/generate.py
BANNER = ("ALAQSA LOAD TEST - SYNTHETIC FIXTURE - NOT A REAL DOCUMENT "
          "- NO REAL PILGRIM DATA")


def png(passport: str) -> bytes:
    """16x16 truecolour PNG, colour derived from the passport, with a tEXt banner."""
    w = h = 16
    n = int(passport[2:])
    r, g, b = (60 + n * 7) % 200, (90 + n * 11) % 200, (120 + n * 13) % 200
    raw = b"".join(b"\x00" + bytes([r, g, b]) * w for _ in range(h))

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return (struct.pack(">I", len(data)) + body
                + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF))

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"tEXt", b"Comment\x00"
                    + f"{BANNER} | {passport} | photo".encode("ascii"))
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))


def pdf(passport: str, doc_type: str) -> bytes:
    """Single-page PDF whose visible text says what it is."""
    lines = [BANNER,
             f"pilgrim: {passport}",
             f"document: {doc_type}",
             "synthetic fixture generated for the Alaqsa Hajj load test",
             "contains no real passport, permit, ticket, photograph or PII"]
    stream = ("BT /F1 11 Tf 40 760 Td 16 TL\n"
              + "".join(f"({line}) Tj T*\n" for line in lines) + "ET").encode("ascii")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]"
        b" /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, obj in enumerate(objects, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode() + b"0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += (f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref}\n%%EOF\n").encode()
    return bytes(out)


def main() -> int:
    outdir = sys.argv[1] if len(sys.argv) > 1 else "."
    manifest = []
    for i in range(1, DOCS + 1):
        passport = f"LD{i:06d}"
        os.makedirs(os.path.join(outdir, "loadtest", passport), exist_ok=True)
        for name, doc_type, data in (
            ("photo.png", "photo", png(passport)),
            ("permit.pdf", "hajj_permit", pdf(passport, "hajj_permit")),
            ("ticket.pdf", "flight_ticket", pdf(passport, "flight_ticket")),
        ):
            key = f"loadtest/{passport}/{name}"
            with open(os.path.join(outdir, key), "wb") as fh:
                fh.write(data)
            manifest.append({"passport": passport, "doc_type": doc_type, "key": key,
                             "bytes": len(data),
                             "sha256": hashlib.sha256(data).hexdigest()})

    with open(os.path.join(outdir, "manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=1, sort_keys=True)
        fh.write("\n")
    print(f"{len(manifest)} fixtures for {DOCS} document-cohort pilgrims")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
