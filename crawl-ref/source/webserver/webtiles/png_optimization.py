"""Recompress PNG scanline bytes without changing pixels or ancillary chunks."""
import struct
import zlib

SIGNATURE = b'\x89PNG\r\n\x1a\n'


def chunks(data):
    if not data.startswith(SIGNATURE):
        raise ValueError('Invalid PNG signature')
    offset = 8
    result = []
    while offset < len(data):
        size = struct.unpack('>I', data[offset:offset + 4])[0]
        tag = data[offset + 4:offset + 8]
        payload = data[offset + 8:offset + 8 + size]
        original = data[offset:offset + 12 + size]
        if len(original) != size + 12:
            raise ValueError('Truncated PNG chunk')
        if struct.unpack('>I', original[-4:])[0] != zlib.crc32(tag + payload):
            raise ValueError('Invalid PNG chunk checksum')
        result.append((tag, payload, original))
        offset += size + 12
    return result


def optimize(data):
    original = chunks(data)
    if any(tag == b'acTL' for tag, _, _ in original):
        return data
    scanlines = zlib.decompress(b''.join(payload for tag, payload, _ in original if tag == b'IDAT'))
    candidates = []
    for strategy in (zlib.Z_DEFAULT_STRATEGY, zlib.Z_FILTERED, zlib.Z_RLE):
        compressor = zlib.compressobj(9, zlib.DEFLATED, 15, 9, strategy)
        candidates.append(compressor.compress(scanlines) + compressor.flush())
    encoded = min(candidates, key=len)
    assert zlib.decompress(encoded) == scanlines
    replacement = struct.pack('>I', len(encoded)) + b'IDAT' + encoded + struct.pack('>I', zlib.crc32(b'IDAT' + encoded))
    output = [SIGNATURE]
    inserted = False
    for tag, _, raw in original:
        if tag == b'IDAT':
            if not inserted:
                output.append(replacement)
                inserted = True
        else:
            output.append(raw)
    result = b''.join(output)
    if len(result) >= len(data):
        return data
    # Every non-IDAT byte, including ICC, EXIF, gamma and provenance, survives.
    assert [raw for tag, _, raw in chunks(result) if tag != b'IDAT'] == [raw for tag, _, raw in original if tag != b'IDAT']
    return result
