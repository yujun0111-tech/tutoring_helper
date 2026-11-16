"""Independent reference for the supplied, SHA-pinned RPM PDF only.

Remove the manually inspected background XObject (11), its ASCII contact stamp,
and named optional watermark layer at PDF syntax level. No raster/opacity or
question-cropping heuristics from the application are used here.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

import fitz

source, output = map(Path, sys.argv[1:3])
expected = json.loads((Path(__file__).parent / 'fixtures/rpm-pages.json').read_text())
assert hashlib.sha256(source.read_bytes()).hexdigest() == expected['sourceHash']
doc = fitz.open(source)
assert len(doc) == 165
# Independently inspected source objects: the repeated transparent publisher
# lettering and its 0..13 alpha mask, separate from every question/diagram.
assert doc.xref_get_key(11, 'SMask')[1] == '19 0 R'
assert max(fitz.Pixmap(doc, 19).samples) == 13
image_paints = stamps = 0
for page in doc:
    names = {image[7] for image in page.get_images() if image[0] == 11}
    for xref in page.get_contents():
        content = doc.xref_stream(xref)
        for name in names:
            content, count = re.subn(rb'/' + re.escape(name.encode()) + rb'\s+Do\b', b' ', content)
            image_paints += count
        content, count = re.subn(rb'\([A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\)\s*Tj\s*ET\b', b'() Tj\nET', content)
        stamps += count
        doc.update_stream(xref, content)
assert image_paints == 164 and stamps == 164, (image_paints, stamps)
doc.set_layer(-1, off=[key for key, group in doc.get_ocgs().items() if group['name'] == 'Watermark'])
output.parent.mkdir(parents=True, exist_ok=True)
doc.save(output, deflate=True)
print(json.dumps({'imagePaints': image_paints, 'contactStamps': stamps, 'pages': len(doc)}))
