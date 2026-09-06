import struct, zlib, os
d = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'icons')
os.makedirs(d, exist_ok=True)
def png(w, h, px):
    rows = []
    for y in range(h):
        row = b'\x00'
        for p in px[y * w:(y + 1) * w]:
            row += bytes(p)
        rows.append(row)
    raw = b''.join(rows)
    def chunk(t, b): return struct.pack('>I', len(b)) + t + b + struct.pack('>I', zlib.crc32(t + b) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))
def icon(s):
    px = []
    for y in range(s):
        row = []
        for x in range(s):
            # rounded red square
            r = s * 0.16; cx, cy = min(max(x, r), s - r), min(max(y, r), s - r)
            inside = (x - cx) ** 2 + (y - cy) ** 2 <= r * r if (x < r or x > s - r) and (y < r or y > s - r) else True
            # white play triangle
            tx0, tx1, ty0 = s * 0.36, s * 0.72, s * 0.28
            ty1 = s * 0.72; tyc = s * 0.50
            rel = (x - tx0) / max(tx1 - tx0, 1)
            half = (ty1 - ty0) / 2 * rel
            tri = tx0 <= x <= tx1 and abs(y - tyc) <= half
            row += [255, 255, 255, 255] if tri and inside else ([200, 30, 30, 255] if inside else [0, 0, 0, 0])
        px += row
    # flatten rows of RGBA quads
    flat = []
    for y in range(s):
        for x in range(s):
            flat.append(px[(y * s + x) * 4:(y * s + x) * 4 + 4])
    return png(s, s, flat)
for s in (16, 48, 128):
    open(os.path.join(d, f'icon{s}.png'), 'wb').write(icon(s))
print('icons-ok')
