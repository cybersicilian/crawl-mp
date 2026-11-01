"""Inspect canonical PNG recompression and decode identity without changing source."""
from pathlib import Path
import hashlib, importlib.util, io, json, sys
from PIL import Image

source, optimizer, output = map(Path, sys.argv[1:4])
spec = importlib.util.spec_from_file_location('png_optimizer_probe', optimizer)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
original = source.read_bytes()
encoded = module.optimize(original)

def digest(data):
    return hashlib.sha256(data).hexdigest()

with Image.open(io.BytesIO(original)) as before, Image.open(io.BytesIO(encoded)) as after:
    assert before.size == after.size
    assert before.convert('RGBA').tobytes() == after.convert('RGBA').tobytes()
    assert before.info.get('icc_profile') == after.info.get('icc_profile')
    assert before.getexif().get(274, 1) == after.getexif().get(274, 1)
    dimensions = before.size
chunks_before, chunks_after = module.chunks(original), module.chunks(encoded)
assert [raw for tag, _, raw in chunks_before if tag != b'IDAT'] == [raw for tag, _, raw in chunks_after if tag != b'IDAT']
assert source.read_bytes() == original
output.parent.mkdir(parents=True, exist_ok=True)
candidate = output.with_suffix('.png') if len(encoded) < len(original) else None
if candidate:
    assert not candidate.exists()
    candidate.write_bytes(encoded)
report = {'passed': True, 'source': str(source), 'sourceSha256': digest(original),
          'candidateSha256': digest(encoded), 'originalBytes': len(original), 'optimizedBytes': len(encoded),
          'savedBytes': len(original) - len(encoded),
          'savingPercent': round(100 * (1 - len(encoded) / len(original)), 4),
          'decodedRGBAExact': True, 'ancillaryBytesExact': True, 'dimensions': dimensions,
          'candidateFile': str(candidate) if candidate else None, 'sourceModified': False}
output.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
