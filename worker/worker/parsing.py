"""Document extraction — .pdf / .docx / .doc / .txt → clause-level chunks."""
from __future__ import annotations
import io
import re
from typing import Iterable
from unstructured.partition.auto import partition


def parse_document(filename: str, data: bytes) -> tuple[str, list[str]]:
    """Return (full_text, chunks). Chunks approximate clauses (~500 tokens)."""
    if filename.lower().endswith(".txt"):
        text = data.decode("utf-8", errors="replace")
    else:
        elements = partition(file=io.BytesIO(data), metadata_filename=filename)
        text = "\n\n".join(str(e).strip() for e in elements if str(e).strip())
    chunks = list(_chunk_by_clause(text))
    return text, chunks


_CLAUSE_HEADING = re.compile(r"(?:^|\n)\s*(?:§|Section|Article|Clause|Appendix|App\.)\s*\d+[.\d]*", re.I)


def _chunk_by_clause(text: str, max_chars: int = 2400) -> Iterable[str]:
    if not text:
        return
    positions = [m.start() for m in _CLAUSE_HEADING.finditer(text)]
    if not positions or positions[0] > 0:
        positions = [0] + positions
    positions.append(len(text))
    for i in range(len(positions) - 1):
        chunk = text[positions[i] : positions[i + 1]].strip()
        if not chunk:
            continue
        # further split oversized clauses on paragraph boundary
        while len(chunk) > max_chars:
            cut = chunk.rfind("\n\n", 0, max_chars)
            if cut < max_chars // 2:
                cut = max_chars
            yield chunk[:cut].strip()
            chunk = chunk[cut:].strip()
        if chunk:
            yield chunk
